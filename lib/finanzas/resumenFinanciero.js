// lib/finanzas/resumenFinanciero.js
//
// LAS MÉTRICAS DEL PERÍODO. Puro: recibe filas ya leídas y devuelve números.
//
// No consulta la base, no conoce Prisma y no sabe de HTTP, así que cada regla se
// puede ejercer sin levantar nada. Mismo criterio que `lib/caja/efectivoEsperado.js`,
// que además es de donde salen las piezas que clasifican un tender.
//
// ── LO QUE ESTE MÓDULO SUMA, Y CON QUÉ FECHA ─────────────────────────────
//
// Las ventas y sus cobros, por `Venta.fecha`. Los gastos DEVENGADOS, por
// `Gasto.fecha` —el día al que corresponden—. Los pagos de gastos y a
// proveedores, por la `fecha` de cada pago —el día en que salió la plata—. Los
// cobros de cuenta corriente, por `MovimientoCuenta.createdAt`. Y las deudas
// que siguen abiertas AL CIERRE del período, reconstruidas a esa fecha.
//
// Son cinco hechos distintos y se informan separados. Un gasto no es su pago,
// un pago no es su retiro de caja, una compra no es un gasto y el resultado
// económico no es la plata disponible.
//
// ── LO QUE ESTE MÓDULO NO INVENTA ────────────────────────────────────────
//
// DÓNDE QUEDÓ LA PLATA. ERP Azul no tiene cuentas de banco, de Mercado Pago ni
// de tesorería con saldo: sabe cuánto se cobró por cada medio, no cuánto queda
// en él. No hay un "quedó $X" en cero ni aproximado: viaja como ausencia, con
// su motivo, en `METRICAS_NO_DISPONIBLES`.
//
// Y los cobros de cuenta corriente se suman SIN medio ni destino, porque el
// sistema no los registra: no se atribuyen a efectivo ni a ningún otro medio.
//
// ── ARITMÉTICA EN CENTAVOS ENTEROS ───────────────────────────────────────
//
// Todo se acumula en centavos y se convierte una sola vez al final, con las
// mismas dos puertas que usa caja. Sumar floats de dos decimales arrastra
// residuo binario y acá el residuo se leería como plata que no cierra.

import {
  MEDIOS_SIN_COBRO,
  MEDIO_EFECTIVO,
  aCentavos,
  desdeCentavos,
  desglosarMovimientos,
  desglosarVentas,
} from "@/lib/caja/efectivoEsperado";
import { MEDIO_LABEL, ORDEN_MEDIO, tendersParaAgregar } from "@/lib/pos-ventas/pagos";
import { resumirExactitud } from "@/lib/pos-ventas/comisionPendiente";
import {
  MEDIOS_PAGO_PROVEEDOR,
  ROTULO_MEDIO_PAGO,
  desdeFechaDeBase,
  estadoDeCuenta,
} from "@/lib/finanzas/pagosProveedores";
import { MEDIOS_PAGO_GASTO, ROTULO_MEDIO_GASTO } from "@/lib/finanzas/gastos";

/**
 * LAS MÉTRICAS QUE TODAVÍA NO SE PUEDEN CALCULAR, con el motivo de cada una.
 *
 * Van al payload y la pantalla las dibuja como "Todavía no disponible". Viajan
 * como DATO y no como texto escrito en el JSX por el mismo motivo por el que
 * viaja el título del período: quien sabe qué falta es el que fue a buscarlo.
 *
 * `motivo` no es decoración: es lo que dice qué falta para que exista.
 *
 * Gastos, pagos a proveedores y resultado salieron de esta lista cuando el
 * resumen pasó a sumarlos. Lo que queda es lo que el MODELO no permite saber.
 */
export const METRICAS_NO_DISPONIBLES = Object.freeze([
  Object.freeze({
    clave: "dineroQueQuedo",
    rotulo: "Dinero que quedó",
    motivo:
      "ERP Azul registra lo que entra y lo que sale, pero no tiene cuentas de banco, de Mercado Pago ni de tesorería con saldo: no puede decir cuánto dinero queda ni dónde está.",
  }),
]);

/**
 * LOS TEXTOS QUE ACOMPAÑAN A LOS NÚMEROS NUEVOS.
 *
 * Juntos y congelados por la misma razón que la lista de arriba: viajan como
 * dato y no se escriben en la pantalla. Y juntos por una razón más: el candado
 * R14 recorta este bloque para seguir comprobando que ningún RÓTULO DE
 * MOVIMIENTO de caja se llama gasto; acá la palabra aparece porque estos textos
 * hablan de los gastos de verdad.
 */
export const TEXTOS_DEL_RESUMEN = Object.freeze({
  cobrosCuentaCorriente: "Cobros de cuenta corriente — medio/destino desconocido",
  // Cada limitación con su clave adentro, para que el código no escriba la
  // clave suelta como literal.
  limitaciones: Object.freeze({
    GASTOS_REGISTRADOS: Object.freeze({
      clave: "GASTOS_REGISTRADOS",
      motivo:
        "Solo resta los gastos cargados en Finanzas. Lo que no se cargó —o salió como retiro de caja sin registrar el gasto— no está.",
    }),
    COMISIONES_PENDIENTES: Object.freeze({
      clave: "COMISIONES_PENDIENTES",
      motivo:
        "Hay ventas cobradas con un medio cuya comisión no estaba configurada: la comisión real es mayor y el resultado puede ser menor.",
    }),
    VENTAS_SIN_COSTO: Object.freeze({
      clave: "VENTAS_SIN_COSTO",
      motivo: "Hay ventas sin costo cargado: su costo cuenta como cero y el resultado puede ser menor.",
    }),
    RETIROS_SIN_CLASIFICAR: Object.freeze({
      clave: "RETIROS_SIN_CLASIFICAR",
      motivo: "Hay retiros manuales de caja que nadie clasificó: si alguno fue un gasto, no está restado.",
    }),
  }),
});

/** De dónde sale el costo vendido del resultado. Uno solo, a propósito. */
export const FUENTE_COSTO_VENDIDO = "VENTA_COSTO_TOTAL";

/**
 * EL MARGEN BRUTO SALE DE LA RESTA, Y LA SUMA DE `gananciaBruta` NO ES LO MISMO.
 *
 * Está medido en el código que las escribe, no deducido:
 *
 *   · `app/api/pos-ventas/crear/route.js`   → `totalAntesRecargo - costoTotal`
 *   · `venta/[id]/corregir/route.js`        → `subtotalNuevo - costoTotal`
 *   · `lib/transferencias/aplicarCorreccionEconomica.js` → `totalNuevo - costoTotal`
 *
 * O sea que el campo persistido NO es `total - costoTotal`: al crear excluye el
 * recargo de pago —a propósito, porque el recargo no es margen de mercadería— y
 * los dos caminos de corrección usan bases distintas entre sí.
 *
 * Finanzas muestra tres números juntos —ventas, costo, margen— y la resta es lo
 * único que hace que los tres cierren en la pantalla. Un margen que no da la
 * resta de los dos de arriba se lee como un error de la pantalla, no como una
 * definición distinta de margen.
 *
 * Por eso el campo persistido igual se suma y viaja: sirve de control, y cuando
 * difiere la pantalla lo dice en vez de esconderlo. El candado
 * `margenNoSeInventa` ejerce el caso con recargo y prueba que difieren.
 */
export function calcularMargen({ ventasCentavos, costoCentavos, gananciaBrutaCentavos }) {
  const margenCentavos = ventasCentavos - costoCentavos;
  return {
    margenBruto: desdeCentavos(margenCentavos),
    control: {
      sumaGananciaBrutaPersistida: desdeCentavos(gananciaBrutaCentavos),
      // La diferencia es real cuando hay un centavo o más. Comparar centavos
      // enteros y no importes: dos importes iguales pueden diferir en el bit.
      difiere: margenCentavos !== gananciaBrutaCentavos,
      diferencia: desdeCentavos(margenCentavos - gananciaBrutaCentavos),
    },
  };
}

/**
 * EL DESGLOSE DEL COBRO, MEDIO POR MEDIO.
 *
 * Sale de `tendersParaAgregar`, que es la puerta canónica: usa `VentaPago`
 * cuando la venta tiene tenders y solo cae a `formaPago + total` en las ventas
 * históricas que no los tienen. Reconstruir desde `formaPago` teniendo
 * `VentaPago` sería perder el pago dividido entero.
 *
 * La clasificación —qué es efectivo, qué es digital y qué no es cobro— NO se
 * vuelve a escribir: `MEDIO_EFECTIVO` y `MEDIOS_SIN_COBRO` se importan de
 * `efectivoEsperado.js`. Si mañana un medio cambia de bando, cambia en los dos
 * lugares a la vez porque es el mismo dato. El candado `cobrosCierranContraCaja`
 * lo ejerce comparando los totales de las dos funciones sobre el mismo insumo.
 *
 * @param {Array} ventas  ventas del período, con `pagos` incluido en el select.
 */
export function desglosarCobros(ventas = []) {
  const porMedio = new Map();

  for (const v of ventas || []) {
    for (const t of tendersParaAgregar(v)) {
      const clave = t.medio;
      if (!porMedio.has(clave)) {
        porMedio.set(clave, { montoCentavos: 0, comisionCentavos: 0, netoCentavos: 0 });
      }
      const acc = porMedio.get(clave);
      acc.montoCentavos += aCentavos(t.monto);
      // El fiado no cobra comisión y no tiene neto: no entró plata. Sumar el
      // `neto` que trae el tender lo contaría como cobrado.
      if (MEDIOS_SIN_COBRO.has(clave)) continue;
      acc.comisionCentavos += aCentavos(t.comision);
      acc.netoCentavos += aCentavos(t.neto);
    }
  }

  // En el orden con el que el resto del ERP muestra el desglose. Los medios que
  // no aparecieron en el período NO se dibujan: una fila "Crédito $0,00" ocupa
  // un renglón para decir que no pasó nada.
  const medios = ORDEN_MEDIO.filter((m) => porMedio.has(m)).map((m) => {
    const a = porMedio.get(m);
    return {
      medio: m,
      rotulo: MEDIO_LABEL[m] || m,
      monto: desdeCentavos(a.montoCentavos),
      comision: desdeCentavos(a.comisionCentavos),
      neto: desdeCentavos(a.netoCentavos),
      esEfectivo: m === MEDIO_EFECTIVO,
      // Fiado NO es un cobro: es una venta a cuenta corriente. Se muestra para
      // que el total de medios cierre contra las ventas, marcado como lo que es.
      esCobro: !MEDIOS_SIN_COBRO.has(m),
    };
  });

  // Un medio desconocido —una fila vieja con un `formaPago` que no mapea— no se
  // pierde en silencio: cae acá y el total lo sigue incluyendo.
  for (const [m, a] of porMedio) {
    if (ORDEN_MEDIO.includes(m)) continue;
    medios.push({
      medio: m,
      rotulo: MEDIO_LABEL[m] || String(m),
      monto: desdeCentavos(a.montoCentavos),
      comision: desdeCentavos(a.comisionCentavos),
      neto: desdeCentavos(a.netoCentavos),
      esEfectivo: false,
      esCobro: !MEDIOS_SIN_COBRO.has(m),
    });
  }

  // Los agregados salen de la MISMA función que usa el cierre de caja, no de
  // volver a sumar el mapa de arriba. Dos sumas del mismo hecho es cómo se
  // desincronizan.
  const { efectivoCentavos, digitalCentavos, fiadoCentavos, comisionCentavos, netoDigitalCentavos } =
    desglosarVentas(ventas);

  return {
    medios,
    efectivo: desdeCentavos(efectivoCentavos),
    digital: desdeCentavos(digitalCentavos),
    fiado: desdeCentavos(fiadoCentavos),
    comisiones: desdeCentavos(comisionCentavos),
    netoDigital: desdeCentavos(netoDigitalCentavos),
  };
}

/**
 * LOS MOVIMIENTOS DE CAJA DEL PERÍODO.
 *
 * SE LLAMAN INGRESOS Y RETIROS, NO GASTOS. Hoy un retiro manual de caja es un
 * `CajaMovimiento` de tipo RETIRO con un motivo escrito a mano: puede ser un
 * pago a un proveedor, un adelanto, plata que se llevó el dueño o el cambio que
 * se fue a buscar. El sistema sabe que salió del cajón y nada más. Llamarlo
 * gasto sería afirmar algo que nadie registró.
 *
 * ── LOS MANUALES Y LA RECAUDACIÓN VAN SEPARADOS ──────────────────────────
 *
 * Y es la misma regla, una vuelta más arriba: **mover plata no es gastarla**. Un
 * retiro de recaudación es la venta que ya se contó, saliendo del cajón. Sumarlo
 * con los manuales daría un renglón que se lee como plata que se fue del
 * negocio. Se informa aparte, con su nombre, y no se esconde.
 *
 * Quién es quién lo decide `clasificarMovimientos` por los vínculos que ya
 * existen, no por el texto del motivo.
 *
 * La suma la hace `desglosarMovimientos`, de caja, que ya sabe ignorar un tipo
 * desconocido en vez de suponerlo ingreso.
 *
 * @param {object} args
 * @param {Array} args.manuales     los de "Caja +/−".
 * @param {Array} args.recaudacion  los retiros con conteo.
 */
export function desglosarCaja({ manuales = [], recaudacion = [] } = {}) {
  const { ingresosCentavos, retirosCentavos } = desglosarMovimientos(manuales);
  const deRecaudacion = desglosarMovimientos(recaudacion);

  return {
    ingresos: desdeCentavos(ingresosCentavos),
    retiros: desdeCentavos(retirosCentavos),
    cantidadIngresos: manuales.filter((m) => m?.tipo === "INGRESO").length,
    cantidadRetiros: manuales.filter((m) => m?.tipo === "RETIRO").length,
    retirosDeRecaudacion: desdeCentavos(deRecaudacion.retirosCentavos),
    cantidadRetirosDeRecaudacion: recaudacion.length,
  };
}

/**
 * LOS PAGOS DEL PERÍODO, MEDIO POR MEDIO. Sirve para los dos tipos de pago.
 *
 * ── UN PAGO EN EFECTIVO ES UNA SOLA SALIDA ───────────────────────────────
 *
 * Un `PagoProveedor` o un `PagoGasto` en efectivo tiene además su
 * `CajaMovimiento` RETIRO. Es el MISMO peso visto desde la caja. Acá se cuenta
 * el pago, y el retiro queda fuera de los retiros manuales porque
 * `clasificarMovimientos` lo reconoce por su vínculo —PAGO_PROVEEDOR o
 * PAGO_GASTO— y `soloManuales` no lo deja pasar. Esta función no mira
 * movimientos de caja, así que no tiene cómo volver a sumarlo.
 *
 * Los medios salen del catálogo de cada tipo, en su orden; uno desconocido no
 * se pierde: va al final con su nombre, como en el desglose de cobros.
 *
 * @param {Array<{medio:string, monto:string|number}>} pagos  los del período.
 * @param {{ orden: string[], rotulos: object }} catalogo
 */
export function desglosarPagos(pagos = [], { orden = [], rotulos = {} } = {}) {
  const porMedio = new Map();
  let totalCentavos = 0;

  for (const p of pagos || []) {
    const c = aCentavos(p?.monto);
    totalCentavos += c;
    const acc = porMedio.get(p?.medio) || { centavos: 0, cantidad: 0 };
    acc.centavos += c;
    acc.cantidad += 1;
    porMedio.set(p?.medio, acc);
  }

  const claves = [
    ...orden.filter((m) => porMedio.has(m)),
    ...[...porMedio.keys()].filter((m) => !orden.includes(m)),
  ];

  return {
    total: desdeCentavos(totalCentavos),
    cantidad: (pagos || []).length,
    porMedio: claves.map((m) => ({
      medio: m,
      rotulo: rotulos[m] || String(m),
      monto: desdeCentavos(porMedio.get(m).centavos),
      cantidad: porMedio.get(m).cantidad,
      // Solo el efectivo tiene además un RETIRO en la caja: el mismo peso.
      esEfectivo: m === MEDIO_EFECTIVO,
    })),
  };
}

const instanteDe = (fecha) => {
  const t = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime();
  return Number.isFinite(t) ? t : null;
};

/** ¿Pasó a más tardar en el instante del corte? Una fecha ilegible no pasó. */
const hastaElCorte = (fecha, corte) => {
  const t = instanteDe(fecha);
  return t !== null && t <= corte;
};

/**
 * LO QUE SE DEBÍA AL CIERRE DEL PERÍODO, reconstruido a esa fecha.
 *
 * No es el saldo de hoy. Es lo que había nacido hasta el corte menos lo que se
 * había pagado hasta el corte: un pago del mes siguiente no achica la deuda del
 * mes anterior. La cuenta de cada fila es la ÚNICA que existe, `estadoDeCuenta`,
 * alimentada solo con los pagos de hasta el corte.
 *
 * Sirve para las deudas con proveedores y para los gastos: las dos tienen
 * `total` y una lista de `pagos` con `fecha` y `monto`. Lo que cambia es qué
 * fecha dice que la obligación ya existía, y eso lo decide quien llama con
 * `nacio`.
 *
 * La consulta ya filtra lo mismo. Se vuelve a filtrar acá para que la regla
 * —qué entra al corte— sea una función que se puede ejercer sin base.
 *
 * @param {Array<{ total, pagos: Array<{monto, fecha}> }>} filas
 * @param {{ instante: number, nacio: (fila) => boolean }} args
 */
export function saldoAlCorte(filas = [], { instante, nacio } = {}) {
  let saldoCentavos = 0;
  let conSaldo = 0;
  for (const f of filas || []) {
    if (!nacio(f)) continue;
    const pagos = (f?.pagos || []).filter((p) => hastaElCorte(p?.fecha, instante));
    const { saldo } = estadoDeCuenta({ total: f?.total, pagos });
    const c = aCentavos(saldo);
    if (c <= 0) continue;
    saldoCentavos += c;
    conSaldo += 1;
  }
  return { saldo: desdeCentavos(saldoCentavos), cantidad: conSaldo };
}

/**
 * LAS DEUDAS Y LOS GASTOS QUE SEGUÍAN ABIERTOS AL CIERRE DEL PERÍODO.
 *
 * ── CUÁNDO NACE CADA UNA ─────────────────────────────────────────────────
 *
 *   · La deuda con un proveedor nace al cerrar la recepción de la compra, que
 *     es cuando se crea la cuenta: `CuentaPorPagarProveedor.createdAt`.
 *   · El gasto existe desde el día al que corresponde, `Gasto.fecha`. La luz de
 *     septiembre cargada en octubre se debía al cierre de septiembre.
 *
 * ── DE QUIÉN ES ──────────────────────────────────────────────────────────
 *
 * De la ubicación que la originó y de ninguna otra: el filtro es la columna de
 * propiedad —`localGastoId` y `Gasto.localId`— y lo aplica la consulta. El
 * depósito no carga con la deuda de un local ni un local con la del depósito.
 *
 * Una deuda pendiente NO es plata que salió: se informa acá y no en las salidas.
 *
 * @param {object} args
 * @param {Array} args.cuentasProveedor  `{ total, createdAt, pagos: [{monto, fecha}] }`
 * @param {Array} args.gastos            `{ total, fecha, pagos: [{monto, fecha}] }`
 * @param {{ hasta: string, instanteFin: Date }} args.periodo
 */
export function obligacionesAlCierre({ cuentasProveedor = [], gastos = [], periodo } = {}) {
  const instante = instanteDe(periodo?.instanteFin);
  if (instante === null || !periodo?.hasta) return null;

  return {
    corte: periodo.hasta,
    proveedores: saldoAlCorte(cuentasProveedor, {
      instante,
      nacio: (c) => hastaElCorte(c?.createdAt, instante),
    }),
    gastos: saldoAlCorte(gastos, {
      instante,
      // Un día contra un día: `Gasto.fecha` es DATE y se compara como texto
      // "AAAA-MM-DD", sin pasar por una zona horaria.
      nacio: (g) => {
        const dia = desdeFechaDeBase(g?.fecha);
        return dia !== null && dia <= periodo.hasta;
      },
    }),
  };
}

/**
 * LOS GASTOS DEVENGADOS DEL PERÍODO: los que CORRESPONDEN a sus días, se hayan
 * pagado o no. Por `Gasto.fecha`, que es un día. No es lo que salió: eso son
 * los pagos.
 *
 * @param {Array<{ total, fecha }>} gastos
 * @param {{ desde: string, hasta: string }} periodo
 */
export function gastosDevengados(gastos = [], periodo) {
  if (!periodo?.desde || !periodo?.hasta) return null;
  let totalCentavos = 0;
  let cantidad = 0;
  for (const g of gastos || []) {
    const dia = desdeFechaDeBase(g?.fecha);
    if (dia === null || dia < periodo.desde || dia > periodo.hasta) continue;
    totalCentavos += aCentavos(g?.total);
    cantidad += 1;
  }
  return { devengados: desdeCentavos(totalCentavos), cantidad };
}

/**
 * LOS COBROS DE CUENTA CORRIENTE DEL PERÍODO: plata que entró por un fiado
 * anterior.
 *
 * ── SIN MEDIO Y SIN DESTINO, PORQUE EL SISTEMA NO LOS GUARDA ─────────────
 *
 * `MovimientoCuenta` PAGO no tiene medio, ni turno, ni movimiento de caja. No
 * se sabe si fue efectivo al cajón, una transferencia o Mercado Pago. Se suma
 * como lo que es —una entrada de medio desconocido— y NO se le atribuye ningún
 * medio: ni el efectivo esperado ni el desglose de cobros lo ven.
 *
 * Solo PAGO con dirección CREDITO. Un AJUSTE no es plata que entró.
 *
 * @param {Array<{ tipo, direccion, monto }>} movimientos
 */
export function cobrosDeCuentaCorriente(movimientos = []) {
  let totalCentavos = 0;
  let cantidad = 0;
  for (const m of movimientos || []) {
    if (m?.tipo !== "PAGO" || m?.direccion !== "CREDITO") continue;
    totalCentavos += aCentavos(m?.monto);
    cantidad += 1;
  }
  return {
    rotulo: TEXTOS_DEL_RESUMEN.cobrosCuentaCorriente,
    total: desdeCentavos(totalCentavos),
    cantidad,
    medioConocido: false,
    destinoConocido: false,
  };
}

/**
 * LAS COMISIONES DEL PERÍODO Y SI EL NÚMERO ESTÁ CERRADO.
 *
 * El importe es el MISMO que ya trae el desglose de cobros —se toma de ahí, no
 * se vuelve a sumar—. La exactitud la decide la pieza canónica,
 * `resumirExactitud`, que falla cerrado: una venta sin la bandera
 * `comisionPendiente` en la consulta cuenta como pendiente.
 */
export function comisionesDelPeriodo({ ventas = [], cobros }) {
  const exactitud = resumirExactitud(ventas || []);
  return {
    total: cobros.comisiones,
    exacta: exactitud.exacto,
    ventasConComisionPendiente: exactitud.pendientes,
  };
}

/**
 * LO QUE ENTRÓ AL VENDER: bruto, comisión y neto.
 *
 * Bruto es efectivo más digital. El neto descuenta la comisión UNA vez, y es
 * la que ya trae cada tender. El fiado no está: no entró plata. Los cobros de
 * cuenta corriente tampoco: van aparte, sin medio.
 *
 * Con comisiones pendientes el neto está SOBREESTIMADO —se descontó de menos—,
 * y lo dice `netaPuedeSerMenor`.
 */
export function recaudacionAlVender({ cobros, comisiones }) {
  const efectivo = aCentavos(cobros.efectivo);
  const digital = aCentavos(cobros.digital);
  return {
    bruta: desdeCentavos(efectivo + digital),
    comisiones: cobros.comisiones,
    neta: desdeCentavos(efectivo + aCentavos(cobros.netoDigital)),
    netaPuedeSerMenor: !comisiones.exacta,
  };
}

/**
 * EL RESULTADO ECONÓMICO DEL PERÍODO. No es la plata disponible.
 *
 *   resultado = ventas − costo vendido − gastos devengados − comisiones
 *
 * ── CON QUÉ NÚMEROS ──────────────────────────────────────────────────────
 *
 *   · Ventas: `Venta.total`, el mismo de arriba. INCLUYE el recargo por medio
 *     de pago, que el cliente pagó y es del comercio. Es la base que ya usa
 *     `margenBruto`, así que `resultado = margenBruto − gastos − comisiones`.
 *   · Costo vendido: `Venta.costoTotal`, congelado al vender. Uno solo: el costo
 *     derivado de los Libros de Stock y de Costos NO entra, y no se suma con
 *     éste. Los Libros valorizan el stock; no son el costo de este resultado.
 *   · Gastos: los devengados por `Gasto.fecha`, no los pagados.
 *   · Comisiones: las de `VentaPago`. El recargo SUBE la venta y la comisión la
 *     cobra el procesador: son dos números distintos y ninguno se deduce del otro.
 *
 * Una compra NO entra: es mercadería que pasa a stock y una deuda. Lo que entra
 * al resultado es el costo de lo que se vendió.
 *
 * ── LO QUE PUEDE FALTAR SE DICE ──────────────────────────────────────────
 *
 * `limitaciones` lista, con su motivo, lo que hace que el número pueda ser
 * distinto del real. La de gastos va siempre: el sistema no tiene cómo saber
 * si se cargaron todos.
 */
export function resultadoEconomico({ ventasCentavos, costoCentavos, ventasSinCosto, gastos, comisiones, caja }) {
  const gastosCentavos = aCentavos(gastos?.devengados);
  const comisionCentavos = aCentavos(comisiones.total);
  const t = TEXTOS_DEL_RESUMEN.limitaciones;

  const limitaciones = [{ ...t.GASTOS_REGISTRADOS }];
  if (!comisiones.exacta) {
    limitaciones.push({ ...t.COMISIONES_PENDIENTES, cantidad: comisiones.ventasConComisionPendiente });
  }
  if (ventasSinCosto > 0) {
    limitaciones.push({ ...t.VENTAS_SIN_COSTO, cantidad: ventasSinCosto });
  }
  if (aCentavos(caja.retiros) > 0) {
    limitaciones.push({ ...t.RETIROS_SIN_CLASIFICAR, cantidad: caja.cantidadRetiros, importe: caja.retiros });
  }

  return {
    ventas: desdeCentavos(ventasCentavos),
    costoVendido: desdeCentavos(costoCentavos),
    fuenteCostoVendido: FUENTE_COSTO_VENDIDO,
    gastosDevengados: desdeCentavos(gastosCentavos),
    comisiones: desdeCentavos(comisionCentavos),
    resultado: desdeCentavos(ventasCentavos - costoCentavos - gastosCentavos - comisionCentavos),
    limitaciones,
  };
}

/**
 * EL RESUMEN ENTERO DEL PERÍODO.
 *
 * Los campos de siempre —ventas, costo, margen, cobros, caja, noDisponible—
 * conservan su forma y su significado. Lo nuevo se AGREGA al lado.
 *
 * @param {object} args
 * @param {Array} args.ventas       ventas COMERCIALES del período. El filtro lo
 *                                  aplicó la consulta con `whereVentaComercial`:
 *                                  esta función no vuelve a decidir qué entra,
 *                                  porque no puede — no tiene la relación.
 * @param {Array} args.manuales     `CajaMovimiento` de "Caja +/−" del período.
 * @param {Array} args.recaudacion  los retiros con conteo del período.
 * @param {Array} [args.pagosAProveedores]  `PagoProveedor` del período, de la ubicación.
 * @param {Array} [args.pagosDeGastos]      `PagoGasto` del período, de la ubicación.
 * @param {Array} [args.gastos]             `Gasto` de la ubicación con fecha hasta el
 *                                          cierre, cada uno con sus pagos hasta el corte.
 * @param {Array} [args.cuentasProveedor]   `CuentaPorPagarProveedor` de la ubicación
 *                                          nacidas hasta el corte, con sus pagos.
 * @param {Array} [args.cobrosCuentaCorriente]  `MovimientoCuenta` PAGO del período.
 * @param {{ desde, hasta, instanteFin }} [args.periodo]  sin él, los bloques que
 *        dependen de una fecha —gastos devengados y obligaciones— vuelven `null`:
 *        no se sabe de qué días se habla.
 */
export function resumenDelPeriodo({
  ventas = [],
  manuales = [],
  recaudacion = [],
  pagosAProveedores = [],
  pagosDeGastos = [],
  gastos = [],
  cuentasProveedor = [],
  cobrosCuentaCorriente = [],
  periodo = null,
} = {}) {
  let ventasCentavos = 0;
  let costoCentavos = 0;
  let gananciaBrutaCentavos = 0;
  let ventasSinCosto = 0;

  // UN SOLO RECORRIDO PARA LOS TRES. Es lo que garantiza que el costo se sume
  // sobre EXACTAMENTE el mismo universo que el total: no hay forma de que una
  // fila entre en una suma y no en la otra, porque es la misma iteración.
  for (const v of ventas || []) {
    const totalC = aCentavos(v?.total);
    const costoC = aCentavos(v?.costoTotal);
    ventasCentavos += totalC;
    costoCentavos += costoC;
    gananciaBrutaCentavos += aCentavos(v?.gananciaBruta);
    if (costoC === 0 && totalC > 0) ventasSinCosto += 1;
  }

  const { margenBruto, control } = calcularMargen({
    ventasCentavos,
    costoCentavos,
    gananciaBrutaCentavos,
  });

  const cobros = desglosarCobros(ventas);
  const caja = desglosarCaja({ manuales, recaudacion });
  const comisiones = comisionesDelPeriodo({ ventas, cobros });

  const pagosProveedor = desglosarPagos(pagosAProveedores, {
    orden: MEDIOS_PAGO_PROVEEDOR,
    rotulos: ROTULO_MEDIO_PAGO,
  });
  const pagosGasto = desglosarPagos(pagosDeGastos, {
    orden: MEDIOS_PAGO_GASTO,
    rotulos: ROTULO_MEDIO_GASTO,
  });
  const devengados = gastosDevengados(gastos, periodo);

  return {
    cantidadVentas: (ventas || []).length,
    ventas: desdeCentavos(ventasCentavos),
    costoVendido: desdeCentavos(costoCentavos),
    margenBruto,
    controlMargen: control,
    cobros,
    caja,
    noDisponible: METRICAS_NO_DISPONIBLES,

    // ── FLUJO DE FONDOS ────────────────────────────────────────────────────
    comisiones,
    recaudacionAlVender: recaudacionAlVender({ cobros, comisiones }),
    cobrosCuentaCorriente: cobrosDeCuentaCorriente(cobrosCuentaCorriente),
    pagosAProveedores: pagosProveedor,
    pagosDeGastos: pagosGasto,
    // Lo que salió con un motivo registrado. Los RETIROS de esos mismos pagos
    // en efectivo no están en `caja.retiros`: la clasificación por vínculo los
    // sacó. Los retiros manuales sin clasificar siguen en `caja.retiros`, y los
    // de recaudación y cierre no son salidas: es plata que cambia de lugar.
    salidas: {
      pagosAProveedores: pagosProveedor.total,
      pagosDeGastos: pagosGasto.total,
      total: desdeCentavos(aCentavos(pagosProveedor.total) + aCentavos(pagosGasto.total)),
    },

    // ── OBLIGACIONES ───────────────────────────────────────────────────────
    obligaciones: obligacionesAlCierre({ cuentasProveedor, gastos, periodo }),

    // ── RESULTADO ECONÓMICO ────────────────────────────────────────────────
    gastos: devengados,
    // Sin período no hay gastos devengados que restar, y un resultado con los
    // gastos en cero afirmaría que no hubo. Se devuelve null.
    resultadoEconomico:
      devengados === null
        ? null
        : resultadoEconomico({ ventasCentavos, costoCentavos, ventasSinCosto, gastos: devengados, comisiones, caja }),
  };
}
