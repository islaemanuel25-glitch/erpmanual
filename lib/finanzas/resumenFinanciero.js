// lib/finanzas/resumenFinanciero.js
//
// LAS MÉTRICAS DEL PERÍODO. Puro: recibe filas ya leídas y devuelve números.
//
// No consulta la base, no conoce Prisma y no sabe de HTTP, así que cada regla se
// puede ejercer sin levantar nada. Mismo criterio que `lib/caja/efectivoEsperado.js`,
// que además es de donde salen las piezas que clasifican un tender.
//
// ── LO QUE ESTE MÓDULO NO INVENTA ────────────────────────────────────────
//
// No hay gastos, no hay sueldos y no hay resultado del negocio. No están en
// cero: **no existen**, y la diferencia importa. Un "Gastos $0" se lee como que
// no hubo gastos, y lo que pasa es que el sistema no los conoce. Lo que se
// informa es la ausencia, con `METRICAS_NO_DISPONIBLES`.
//
// Los pagos a proveedores son otro caso y hay que decirlo distinto: SÍ se
// registran —`CuentaPorPagarProveedor` y `PagoProveedor`, en su submódulo— pero
// este resumen todavía no los suma. Siguen en la misma lista, con un motivo que
// dice eso y no que no existen.
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

/**
 * LAS MÉTRICAS QUE TODAVÍA NO SE PUEDEN CALCULAR, con el motivo de cada una.
 *
 * Van al payload y la pantalla las dibuja como "Todavía no disponible". Viajan
 * como DATO y no como texto escrito en el JSX por el mismo motivo por el que
 * viaja el título del período: quien sabe qué falta es el que fue a buscarlo.
 *
 * `motivo` no es decoración. Dentro de tres meses, cuando exista el modelo de
 * gastos, esta lista es la que dice qué hay que sacar de acá.
 */
export const METRICAS_NO_DISPONIBLES = Object.freeze([
  // Gastos operativos y el Resultado del período YA están implementados: los
  // gastos se suman por su fecha económica y el Resultado los resta del margen
  // (ver `resumenDelPeriodo`). Por eso salieron de esta lista.
  Object.freeze({
    clave: "pagosAProveedores",
    rotulo: "Pagos a proveedores",
    // DICE LA VERDAD DE HOY: los pagos EXISTEN —tienen su tabla y su
    // submódulo— y lo que falta es sumarlos al período. Decir que el sistema
    // no los registra sería falso desde que entró Pagos a proveedores.
    //
    // Y NO van en el Resultado del período: pagar a un proveedor es movimiento
    // de dinero, no costo económico del período —el costo de la mercadería ya
    // está en el CMV cuando se vende—. Entran en el futuro bloque de dinero.
    motivo:
      "Los pagos a proveedores ya se registran en su submódulo, pero todavía no están incorporados al resumen por período.",
  }),
]);

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
 * EL RESUMEN ENTERO DEL PERÍODO.
 *
 * @param {object} args
 * @param {Array} args.ventas       ventas COMERCIALES del período. El filtro lo
 *                                  aplicó la consulta con `whereVentaComercial`:
 *                                  esta función no vuelve a decidir qué entra,
 *                                  porque no puede — no tiene la relación.
 * @param {Array} args.manuales     `CajaMovimiento` de "Caja +/−" del período.
 * @param {Array} args.recaudacion  los retiros con conteo del período.
 * @param {object|null} [args.pagoADeposito]  el contrato de `armarPagoADeposito`.
 *        Viaja TAL CUAL: este módulo no lo recalcula, no lo resta de nada y no lo
 *        mezcla con la caja. El número es de Transferencias; acá solo se agrega
 *        al resumen para que la pantalla lo reciba junto con el resto.
 * @param {number} [args.gastos]  total ECONÓMICO de gastos del período, como
 *        importe, ya sumado por la base con `totalEconomicoDeGastos` (por
 *        `Gasto.fecha`, sin importar el estado de pago). Viaja como importe igual
 *        que `pagoADeposito`: esta función no consulta.
 */
export function resumenDelPeriodo({
  ventas = [],
  manuales = [],
  recaudacion = [],
  pagoADeposito = null,
  // El total ECONÓMICO de gastos del período, ya sumado por la base con
  // `totalEconomicoDeGastos` (por `Gasto.fecha`, todos los estados de pago).
  // Viaja como importe, igual que `pagoADeposito`: esta función es pura y no
  // consulta. Default 0 para que un llamador que no lo pase no rompa.
  gastos = 0,
  // El enlace "Ver gastos" al módulo de Gastos, ya armado afuera (como el
  // `verDetalle` del pago a depósito). `null` cuando no hay a dónde ir.
  verGastos = null,
} = {}) {
  let ventasCentavos = 0;
  let costoCentavos = 0;
  let gananciaBrutaCentavos = 0;
  let hayComisionPendiente = false;
  let ventasSinCosto = 0;

  // UN SOLO RECORRIDO PARA LOS TRES. Es lo que garantiza que el costo se sume
  // sobre EXACTAMENTE el mismo universo que el total: no hay forma de que una
  // fila entre en una suma y no en la otra, porque es la misma iteración.
  for (const v of ventas || []) {
    const totalCentavos = aCentavos(v?.total);
    const costoDeLaVenta = aCentavos(v?.costoTotal);
    ventasCentavos += totalCentavos;
    costoCentavos += costoDeLaVenta;
    gananciaBrutaCentavos += aCentavos(v?.gananciaBruta);
    // Una comisión que todavía no se pudo determinar deja el total de comisiones
    // subestimado. No se estima: se avisa.
    if (v?.comisionPendiente) hayComisionPendiente = true;
    // Una venta con total pero costo cero puede ser costo real cero o costo no
    // cargado, y no se distinguen. No cambia el margen: solo se cuenta para
    // poder advertir que el número puede estar sobreestimado.
    if (totalCentavos > 0 && costoDeLaVenta === 0) ventasSinCosto += 1;
  }

  const { margenBruto, control } = calcularMargen({
    ventasCentavos,
    costoCentavos,
    gananciaBrutaCentavos,
  });

  const cobros = desglosarCobros(ventas);
  // LAS COMISIONES SON LAS DE COBROS, NO UNA TERCERA SUMA. `cobros.comisiones`
  // ya salió de `desglosarVentas`, la misma puerta que usa el cierre de caja, y
  // es el agregado canónico por venta (`Venta.comisionBancaria` = suma de los
  // tenders, `lib/pos-ventas/pagos.js`). Reconvertir su importe a centavos es
  // exacto —es un entero de centavos dividido por 100—, así el número que se
  // muestra en Cobros y el que se resta acá son el mismo, sin doble conteo.
  const comisionesCentavos = aCentavos(cobros.comisiones);
  const gastosCentavos = aCentavos(gastos);

  // Resultado = margen bruto − gastos económicos − comisiones de cobro conocidas.
  // Todo en centavos enteros, sin flotante. NO resta pagos a proveedores, pago a
  // depósito, retiros ni recaudación: eso es movimiento de dinero, no costo
  // económico del período.
  const resultadoCentavos = ventasCentavos - costoCentavos - gastosCentavos - comisionesCentavos;

  return {
    cantidadVentas: (ventas || []).length,
    ventas: desdeCentavos(ventasCentavos),
    costoVendido: desdeCentavos(costoCentavos),
    margenBruto,
    controlMargen: control,
    // ── EL BLOQUE ECONÓMICO: GASTOS, COMISIONES Y RESULTADO ──────────────
    gastos: desdeCentavos(gastosCentavos),
    verGastos,
    comisionesDeCobro: desdeCentavos(comisionesCentavos),
    resultado: desdeCentavos(resultadoCentavos),
    // Señales de confiabilidad: el resultado SIEMPRE se muestra; estas avisan
    // cuando puede estar sobre/subestimado, sin convertir ausencia en cero ni
    // inventar un número.
    comisionesPendientes: hayComisionPendiente,
    ventasSinCosto,
    cobros,
    caja: desglosarCaja({ manuales, recaudacion }),
    pagoADeposito,
    noDisponible: METRICAS_NO_DISPONIBLES,
  };
}
