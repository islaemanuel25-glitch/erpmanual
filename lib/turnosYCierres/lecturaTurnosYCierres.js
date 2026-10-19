// lib/turnosYCierres/lecturaTurnosYCierres.js
//
// LA LECTURA DEL MÓDULO "TURNOS Y CIERRES". Pura: recibe filas ya leídas
// (lecturaTurnosYCierresServer.js) y devuelve números. No consulta la base.
//
// ── NINGUNA FÓRMULA PROPIA ─────────────────────────────────────────────────
//
// Cada número sale de la pieza que ya lo decide en otra pantalla:
//   · tenía que haber ........ `calcularEfectivoEsperado` (lib/caja/efectivoEsperado.js)
//     sobre `paraElEsperado` —todo menos el retiro de cierre, que ocurre
//     después del conteo—, igual que la ficha y el cierre;
//   · diferencia ............. `calcularDiferencia` del mismo archivo, contra lo
//     contado al cerrar;
//   · efectivo, digital, fiado `desglosarVentas`: el fiado va aparte y nunca
//     suma como dinero;
//   · digital por medio ...... `desglosarPorMedio` del reporte de ventas;
//   · bruto, neto, ganancia, tickets `resumirVentas`, la misma de Reportes →
//     Ventas, sobre ventas comerciales (sin anuladas ni internas: el filtro es
//     de consulta y lo pone el lector con `whereVentaComercial`);
//   · grupo y orden .......... `grupoDeTesoreria` y `compararGrupos`: fecha
//     operativa + turno operativo, "Sin turno asignado" al final;
//   · clase de cada salida ... la clasificación canónica por vínculo
//     (`clasificarMovimientos`), nunca por el texto del motivo;
//   · estado de la caja ...... `estadoDelTurno`.
//
// Lo único que se suma acá son totales de VENTAS de varias cajas de un turno.
// Las diferencias de caja NO se suman nunca: se cuentan cuántas faltan y
// cuántas sobran, y cada caja conserva la suya. Tampoco se suman entre sí las
// de los arqueos: cada una es la acumulada hasta su corte y se muestra tal cual.

import {
  aCentavos,
  calcularDiferencia,
  calcularEfectivoEsperado,
  desdeCentavos,
  MEDIO_EFECTIVO,
  MEDIOS_SIN_COBRO,
} from "../caja/efectivoEsperado.js";
import { estadoDelTurno, ESTADO_TURNO } from "../caja/cierreRelevo.js";
import { ROTULO_SIN_TURNO, rotuloDeTurno } from "../caja/turnoOperativo.js";
import { CLASE_MOVIMIENTO, paraElEsperado } from "../finanzas/movimientosDeCaja.js";
import { ORDEN_MEDIO, etiquetaMedio, lineasPagoTicket, normalizarMedio, tendersParaAgregar } from "../pos-ventas/pagos.js";
import { comisionEsExacta } from "../pos-ventas/comisionPendiente.js";
import { desglosarPorMedio, resumirVentas } from "../reportes-ventas/resumenVentas.js";
import { compararGrupos, grupoDeTesoreria } from "../tesoreria/turnoComercial.js";
import {
  MARCA_EGRESO,
  esPagoDesdeCaja,
  marcaDeTipo,
  restaEnLaGanancia,
  sePuedeClasificar,
  tipoDeEgreso,
} from "../caja/tipoEgreso.js";

/** Cómo terminó una caja, en una palabra. */
export const RESULTADO_CAJA = Object.freeze({
  ABIERTA: "ABIERTA",
  EN_CIERRE: "EN_CIERRE",
  SIN_DIFERENCIA: "SIN_DIFERENCIA",
  FALTA: "FALTA",
  SOBRA: "SOBRA",
  /** Cerrada sin contar: la diferencia no se conoce. No es cero. */
  SIN_CONTEO: "SIN_CONTEO",
});

/** La etiqueta de una salida de efectivo, por su clase. */
export const ETIQUETA_SALIDA = Object.freeze({
  [CLASE_MOVIMIENTO.RECAUDACION]: "Arqueo",
  [CLASE_MOVIMIENTO.CIERRE]: "Cierre",
  [CLASE_MOVIMIENTO.PAGO_PROVEEDOR]: "Pago",
  [CLASE_MOVIMIENTO.PAGO_GASTO]: "Pago",
  [CLASE_MOVIMIENTO.MANUAL]: "Retiro",
});

/** La pestaña que muestra todos los grupos, y la de las cajas sin turno. */
export const PESTANA_TODOS = "todos";
export const PESTANA_SIN_TURNO = "sin-turno";

const num = (v) => (v == null ? null : Number(v));

/** Quién responde por la caja: el operador del PIN, o la cuenta. */
export function nombreDeCaja(caja) {
  return caja?.operadorNombre || caja?.vendedorNombre || `Caja #${caja?.id}`;
}

/** Cómo terminó la caja, con la diferencia ya calculada. */
export function resultadoDeCaja(estado, diferencia) {
  if (estado === ESTADO_TURNO.ABIERTO) return RESULTADO_CAJA.ABIERTA;
  if (estado === ESTADO_TURNO.CIERRE_EN_PREPARACION) return RESULTADO_CAJA.EN_CIERRE;
  if (diferencia == null) return RESULTADO_CAJA.SIN_CONTEO;
  const c = aCentavos(diferencia);
  if (c === 0) return RESULTADO_CAJA.SIN_DIFERENCIA;
  return c < 0 ? RESULTADO_CAJA.FALTA : RESULTADO_CAJA.SOBRA;
}

/**
 * Qué dice una salida, solo con lo que su fuente sabe: el proveedor de la
 * cuenta, el concepto del gasto, o —en un Caja − manual— el motivo que escribió
 * la persona. La clase decide; el motivo no clasifica nada.
 */
export function descripcionDeSalida(m) {
  switch (m?.clase) {
    case CLASE_MOVIMIENTO.RECAUDACION:
      return { corta: "Retiro de recaudación", larga: "Retiro de recaudación" };
    case CLASE_MOVIMIENTO.CIERRE:
      return { corta: "Entregado al cerrar", larga: "Entregado al cerrar" };
    case CLASE_MOVIMIENTO.PAGO_PROVEEDOR: {
      const quien = m.proveedorNombre || null;
      return { corta: quien || "Pago a proveedor", larga: quien ? `Pago a proveedor · ${quien}` : "Pago a proveedor" };
    }
    case CLASE_MOVIMIENTO.PAGO_GASTO: {
      const que = m.gastoConcepto || m.gastoCategoria || null;
      return { corta: que || "Gasto", larga: que ? `Gasto · ${que}` : "Gasto" };
    }
    default: {
      const motivo = m?.motivo ? String(m.motivo).trim() : "";
      return { corta: motivo || "Retiro de caja", larga: motivo ? `Retiro · ${motivo}` : "Retiro de caja" };
    }
  }
}

/** Lo cobrado de una caja: efectivo, digital por medio, y el fiado aparte. */
function cobradoDe(ventas, calculo) {
  const porMedio = desglosarPorMedio(ventas)
    .map((d) => ({ medio: normalizarMedio(d.formaPago) || String(d.formaPago).toUpperCase(), monto: d.total }))
    .filter((d) => d.medio !== MEDIO_EFECTIVO && !MEDIOS_SIN_COBRO.has(d.medio))
    .sort((a, b) => ORDEN_MEDIO.indexOf(a.medio) - ORDEN_MEDIO.indexOf(b.medio))
    .map((d) => ({ ...d, etiqueta: etiquetaMedio(d.medio), monto: desdeCentavos(aCentavos(d.monto)) }));
  return {
    efectivo: calculo.ventasEfectivo,
    digital: calculo.ventasDigital,
    porMedio,
    medios: mediosCobrados(ventas),
    // Lo que entró de verdad: efectivo + digital. El fiado no es cobro.
    total: desdeCentavos(aCentavos(calculo.ventasEfectivo) + aCentavos(calculo.ventasDigital)),
    // Lo que queda de lo cobrado después de la comisión de cada medio: el
    // efectivo entero más el NETO digital de `desglosarVentas`.
    netoDespuesDeComisiones: desdeCentavos(aCentavos(calculo.ventasEfectivo) + aCentavos(calculo.netoDigital)),
    comisiones: calculo.comisionDigital,
    // Si alguna venta digital todavía no tiene su comisión, el neto de arriba
    // está sobreestimado: la pantalla no lo presenta como cerrado.
    comisionesConocidas: mediosCobrados(ventas).every((m) => m.comisionConocida),
    fiado: calculo.ventasFiado,
  };
}

/**
 * TODOS LOS MEDIOS DE LO VENDIDO, con su monto y su comisión: efectivo,
 * digitales y fiado, en el orden de siempre (`ORDEN_MEDIO`). Por tender
 * (`desglosarPorMedio`), así un pago mixto reparte.
 *
 * `comisionConocida` es false cuando alguna venta con un tender de ese medio
 * todavía no tiene su comisión (`comisionEsExacta`): ahí la comisión del medio
 * no es un cero, es un dato que falta, y la pantalla dice "Comisión sin
 * calcular". El efectivo y el fiado no cobran comisión: siempre conocida.
 */
export function mediosCobrados(ventas = []) {
  const sinExacta = new Set();
  for (const v of ventas) {
    if (comisionEsExacta(v)) continue;
    for (const t of tendersParaAgregar(v)) {
      if (t.medio !== MEDIO_EFECTIVO && !MEDIOS_SIN_COBRO.has(t.medio)) sinExacta.add(t.medio);
    }
  }
  return desglosarPorMedio(ventas)
    .map((d) => {
      const medio = normalizarMedio(d.formaPago) || String(d.formaPago).toUpperCase();
      const cobraComision = medio !== MEDIO_EFECTIVO && !MEDIOS_SIN_COBRO.has(medio);
      return {
        medio,
        etiqueta: etiquetaMedio(medio),
        monto: desdeCentavos(aCentavos(d.total)),
        comision: cobraComision ? desdeCentavos(aCentavos(d.comision)) : 0,
        comisionConocida: !sinExacta.has(medio),
        esFiado: MEDIOS_SIN_COBRO.has(medio),
      };
    })
    .sort((a, b) => ORDEN_MEDIO.indexOf(a.medio) - ORDEN_MEDIO.indexOf(b.medio));
}

/** La suma de los medios de varias cajas, medio por medio. */
export function sumarMedios(listas = []) {
  const acc = new Map();
  for (const lista of listas) {
    for (const m of lista || []) {
      const a = acc.get(m.medio) || { ...m, monto: 0, comision: 0, comisionConocida: true };
      a.monto = desdeCentavos(aCentavos(a.monto) + aCentavos(m.monto));
      a.comision = desdeCentavos(aCentavos(a.comision) + aCentavos(m.comision));
      a.comisionConocida = a.comisionConocida && m.comisionConocida;
      acc.set(m.medio, a);
    }
  }
  return [...acc.values()].sort((a, b) => ORDEN_MEDIO.indexOf(a.medio) - ORDEN_MEDIO.indexOf(b.medio));
}

/**
 * EL RESULTADO: lo que dejaron las ventas después de la comisión y del costo de
 * la mercadería, menos los sueldos y los gastos.
 *
 *   resultado = neto después de comisiones − costo de la mercadería − sueldos y gastos
 *               − consumo del personal − faltantes de caja + sobrantes de caja
 *
 * El neto y el costo son los de `resumirVentas` (Reportes → Ventas). De lo que
 * salió de la caja, SOLO restan los sueldos y los gastos (`sueldosYGastos`): un
 * pago a proveedor o al depósito es mercadería —su costo ya está en el costo de
 * lo vendido— y un retiro del dueño no es gasto. Un egreso sin clasificar no
 * resta. Regla de Emanuel, 2026-10-15. En centavos.
 *
 * Y el consumo del personal, al costo, en su propia fila. No cuenta dos veces:
 * su gasto no tiene movimiento de caja —no salió plata—, así que
 * `sueldosYGastos`, que suma movimientos, nunca lo ve.
 *
 * Y LAS DIFERENCIAS DE CAJA (regla de Emanuel, 2026-10-17): lo que faltó en el
 * cajón resta y lo que sobró suma. `faltantes` y `sobrantes` van sin signo y por
 * separado, como los muestra la pantalla —nunca netos entre sí—; solo la
 * cuenta los junta. Una caja abierta o cerrada sin contar no aporta: su
 * diferencia no se conoce.
 */
export function resultadoDelTurno({
  neto = 0,
  costo = 0,
  sueldosYGastos = 0,
  consumoPersonal = 0,
  faltantes = 0,
  sobrantes = 0,
} = {}) {
  return desdeCentavos(
    aCentavos(neto) -
      aCentavos(costo) -
      aCentavos(sueldosYGastos) -
      aCentavos(consumoPersonal) -
      aCentavos(faltantes) +
      aCentavos(sobrantes)
  );
}

/** Lo que faltó y lo que sobró en UNA caja, sin signo. Solo con conteo. */
export function diferenciasParaElResultado(resultado, diferencia) {
  const d = Math.abs(Number(diferencia) || 0);
  return {
    faltantes: resultado === RESULTADO_CAJA.FALTA ? d : 0,
    sobrantes: resultado === RESULTADO_CAJA.SOBRA ? d : 0,
  };
}

/**
 * EL CONSUMO DEL PERSONAL DE UNA CAJA: quién consumió y cuánto, al costo, en
 * el orden en que se registró. Las filas son las de `ConsumoPersonal`.
 */
export function consumosDeCaja(consumos = []) {
  return [...(consumos || [])]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id)
    .map((c) => ({
      id: c.id,
      quien: c.empleado?.nombre ?? c.operador?.nombre ?? "—",
      productos: Array.isArray(c.lineas) ? c.lineas.length : 0,
      costo: desdeCentavos(aCentavos(c.totalCosto)),
      instante: c.createdAt,
    }));
}

/**
 * SUELDOS Y GASTOS: los pagos desde la caja cuyo tipo resta en la ganancia
 * (`restaEnLaGanancia`). Es la mirada de la GANANCIA; la de la plata es
 * `pagosDesdeCaja`, que resta todo igual.
 */
export function sueldosYGastos(movimientos = []) {
  return desdeCentavos(
    (movimientos || [])
      .filter((m) => esPagoDesdeCaja(m) && restaEnLaGanancia(tipoDeEgreso(m)))
      .reduce((s, m) => s + aCentavos(m.monto), 0)
  );
}

/**
 * PAGOS DESDE LA CAJA: todo egreso de efectivo de la caja que no es retiro de
 * recaudación (arqueo) ni el retiro de cierre. Sueldos, insumos, compras, pagos
 * a proveedor y gastos. La clase sale de la clasificación canónica por vínculo
 * (`clasificarMovimientos`); un Caja − manual es MANUAL y entra.
 */
export function pagosDesdeCaja(movimientos = []) {
  return desdeCentavos(
    (movimientos || [])
      .filter(esPagoDesdeCaja)
      .reduce((s, m) => s + aCentavos(m.monto), 0)
  );
}

/**
 * UNA CAJA, CON TODO LO QUE LAS PANTALLAS MUESTRAN DE ELLA.
 *
 * @param {object} args
 * @param {object} args.caja         la fila de Turno, con nombres y turno operativo
 * @param {Array}  args.ventas       sus ventas comerciales
 * @param {Array}  args.movimientos  sus CajaMovimiento, ya clasificados y con la presentación del pago
 * @param {Array}  [args.consumos]   sus ConsumoPersonal: no tocan la plata, solo el resultado
 * @param {Array}  [args.arqueos]    sus ArqueoCaja, tal como salen de la base: arman `cajon`
 */
export function resumenDeCaja({ caja, ventas = [], movimientos = [], consumos = [], arqueos = [] }) {
  const estado = estadoDelTurno(caja);
  const propias = movimientos.filter((m) => m.turnoId == null || m.turnoId === caja.id);
  const delCajon = paraElEsperado(propias);
  const calculo = calcularEfectivoEsperado({ montoInicial: caja.montoInicial, ventas, movimientos: delCajon });

  const cerrada = estado === ESTADO_TURNO.CERRADO;
  const contado = cerrada ? num(caja.montoRealEfectivo) : null;
  const diferencia = cerrada && contado != null ? calcularDiferencia(contado, calculo.efectivoEsperado) : null;
  const diferenciaGuardada = num(caja.diferenciaEfectivo);

  // Lo que salió del cajón, de a una salida y en orden. Los ingresos no salen.
  const salidas = propias
    .filter((m) => m.tipo === "RETIRO")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id)
    .map((m) => {
      const tipoEgreso = tipoDeEgreso(m);
      return {
        id: m.id,
        clase: m.clase,
        etiqueta: ETIQUETA_SALIDA[m.clase] || ETIQUETA_SALIDA[CLASE_MOVIMIENTO.MANUAL],
        instante: m.createdAt,
        ...descripcionDeSalida(m),
        monto: desdeCentavos(aCentavos(m.monto)),
        // La mirada de la ganancia: qué fue, y qué le hace al resultado.
        esPago: esPagoDesdeCaja(m),
        tipoEgreso,
        marca: marcaDeTipo(tipoEgreso),
        clasificable: sePuedeClasificar(m),
      };
    });

  // El desglose del "tenía que haber": los pagos desde la caja y lo retirado en
  // arqueos, por separado. Entre los dos son `calculo.retiros`.
  const retiradoArqueosC = delCajon
    .filter((m) => m.tipo === "RETIRO" && m.clase === CLASE_MOVIMIENTO.RECAUDACION)
    .reduce((s, m) => s + aCentavos(m.monto), 0);
  const pagos = pagosDesdeCaja(propias);
  const sueldosYGastosC = sueldosYGastos(propias);
  const consumosC = consumosDeCaja(consumos);
  const consumoPersonalC = desdeCentavos(consumosC.reduce((s, c) => s + aCentavos(c.costo), 0));

  const resumen = resumirVentas(ventas);
  const neto = desdeCentavos(aCentavos(resumen.totalNeto));
  const costo = desdeCentavos(aCentavos(resumen.totalCostos));
  const turno = caja.turnoOperativoId != null ? rotuloDeTurno(caja.turnoOperativoNombre) : ROTULO_SIN_TURNO;
  const resultadoCaja = resultadoDeCaja(estado, diferencia);
  const dif = diferenciasParaElResultado(resultadoCaja, diferencia);

  const efectivo = {
    cambioInicial: calculo.montoInicial,
    ventasEfectivo: calculo.ventasEfectivo,
    ingresos: calculo.ingresos,
    pagosDesdeCaja: pagos,
    retiradoArqueos: desdeCentavos(retiradoArqueosC),
    teniaQueHaber: calculo.efectivoEsperado,
    contado,
  };

  return {
    id: caja.id,
    nombre: nombreDeCaja(caja),
    turno,
    turnoOperativoId: caja.turnoOperativoId ?? null,
    estado,
    resultado: resultadoCaja,
    apertura: caja.apertura,
    cierre: caja.cierre ?? null,
    metricas: {
      bruto: desdeCentavos(aCentavos(resumen.totalBruto)),
      neto,
      comisiones: desdeCentavos(aCentavos(resumen.totalComisiones)),
      costo,
      ganancia: desdeCentavos(aCentavos(resumen.gananciaNeta)),
      pagosDesdeCaja: pagos,
      sueldosYGastos: sueldosYGastosC,
      consumoPersonal: consumoPersonalC,
      faltantes: dif.faltantes,
      sobrantes: dif.sobrantes,
      resultado: resultadoDelTurno({ neto, costo, sueldosYGastos: sueldosYGastosC, consumoPersonal: consumoPersonalC, ...dif }),
      tickets: resumen.cantidadVentas,
    },
    consumos: consumosC,
    // Cuándo vendió: primera y última venta, y cuántas. Ver `horarioDeVentas`.
    horarioDeVentas: horarioDeVentas(ventas),
    cobrado: cobradoDe(ventas, calculo),
    efectivo,
    // La lectura del cajón que dibuja "EFECTIVO DE LA CAJA": entró, salió con
    // cada retiro y su tramo, y la diferencia. Ver `efectivoDelCajon`.
    cajon: efectivoDelCajon({ efectivo, arqueos: arqueosDeCaja(arqueos), cerrada, diferencia, cierre: caja.cierre ?? null }),
    diferencia,
    // Lo que el cierre guardó, para comparar. La pantalla no lo muestra: si no
    // coincide con el calculado, gana el calculado y se avisa en el informe.
    diferenciaGuardada,
    coincideConGuardada:
      diferencia == null || diferenciaGuardada == null ? null : aCentavos(diferencia) === aCentavos(diferenciaGuardada),
    salidas,
  };
}

/**
 * Los arqueos y el cierre, tal como se guardaron. `diferencia` es la ACUMULADA
 * hasta ese corte, tal como se guardó; `tramo` es la de ESE tramo solo: la
 * acumulada menos la del arqueo anterior (el primero, contra cero).
 *
 * ── POR QUÉ EL TRAMO ──────────────────────────────────────────────────────
 *
 * Mostrada en cada renglón, la acumulada hacía parecer que faltó plata en
 * todos los retiros: la #951 decía "Falta $34.500 / $24.800 / $29.700 /
 * $29.700" cuando en el segundo tramo SOBRARON 9.700 y en el último no hubo
 * diferencia. El tramo se saca de las acumuladas guardadas y nada más: no se
 * recalcula el arqueo. Sin acumulada en este corte o en el anterior, el tramo
 * no se conoce y va en null.
 */
export function arqueosDeCaja(arqueos = []) {
  let anteriorC = 0;
  return [...arqueos]
    .sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora) || a.id - b.id)
    .map((a) => {
      const esCierre = a.tipo === "FINAL";
      const retirado = num(a.efectivoRetirado);
      const diferencia = num(a.diferencia);
      const acumuladaC = diferencia == null ? null : aCentavos(diferencia);
      const tramo = acumuladaC == null || anteriorC == null ? null : desdeCentavos(acumuladaC - anteriorC);
      anteriorC = acumuladaC;
      return {
        id: a.id,
        tipo: esCierre ? "Cierre" : "Arqueo",
        instante: a.fechaHora,
        // Un cierre dice lo que se contó; un arqueo, lo que se retiró. Un
        // conteo histórico sin retiro registrado dice lo que se contó.
        accion: esCierre || retirado == null ? "Contó" : "Retiró",
        monto: esCierre || retirado == null ? num(a.efectivoContado) : retirado,
        diferencia,
        tramo,
      };
    });
}

/**
 * CUÁNDO VENDIÓ LA CAJA: la hora de la primera y de la última venta y cuántos
 * tickets. Con las ventas COMERCIALES de la caja —las mismas que arman el
 * efectivo y lo cobrado—, así la cantidad es la de `metricas.tickets`.
 *
 * Existe por la #951: abierta de 00:06 a 16:05 y con el primer retiro a las
 * 10:14, no había forma de saber si se vendió de madrugada.
 */
export function horarioDeVentas(ventas = []) {
  const instantes = (ventas || [])
    .map((v) => (v?.fecha ? new Date(v.fecha).getTime() : NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    cantidad: (ventas || []).length,
    primera: instantes.length ? new Date(instantes[0]).toISOString() : null,
    ultima: instantes.length ? new Date(instantes[instantes.length - 1]).toISOString() : null,
  };
}

/**
 * LAS VENTAS DE UNA CAJA, TODAS, en orden de hora: también las anuladas y las
 * internas (las que generaron una transferencia), marcadas, porque la pregunta
 * es qué pasó en esa caja y una anulada también pasó. El medio sale de los
 * tenders, como en el ticket (`lineasPagoTicket`); un pago mixto los nombra
 * a todos.
 *
 * Recibe las filas de `SELECT_VENTA_DE_LA_LISTA`. No suma nada: los totales
 * del pie son los de la caja (`pieDeVentasDeLaCaja`).
 */
export function listaDeVentasDeLaCaja(ventas = []) {
  return [...(ventas || [])]
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.id - b.id)
    .map((v) => ({
      id: v.id,
      numero: v.numero,
      instante: v.fecha,
      medio: lineasPagoTicket(v).map((l) => l.label).join(" + "),
      total: desdeCentavos(aCentavos(v.total)),
      anulada: v.anuladaEn != null,
      interna: v.transferencia != null,
    }));
}

/**
 * EL PIE DE LA LISTA: cuántos tickets y cuánto por medio. Sale del resumen de
 * la MISMA caja que dibuja la tarjeta —`metricas.tickets`, `cobrado.efectivo`
 * (que es "Ventas en efectivo"), `cobrado.porMedio` y el fiado—, así que
 * coincide por construcción: el criterio comercial es uno solo.
 */
export function pieDeVentasDeLaCaja(resumen) {
  const cobrado = resumen?.cobrado || {};
  const medios = [
    { medio: MEDIO_EFECTIVO, etiqueta: etiquetaMedio(MEDIO_EFECTIVO), monto: cobrado.efectivo ?? 0 },
    ...(cobrado.porMedio || []).map((m) => ({ medio: m.medio, etiqueta: m.etiqueta, monto: m.monto })),
  ];
  if (aCentavos(cobrado.fiado ?? 0) !== 0) medios.push({ medio: "FIADO", etiqueta: etiquetaMedio("FIADO"), monto: cobrado.fiado });
  return { tickets: resumen?.metricas?.tickets ?? 0, medios };
}

/**
 * LA ÚNICA LECTURA DEL CAJÓN: lo que entró, lo que salió —pagos, retiros y, al
 * final, lo contado al cierre— y la diferencia. EL CIERRE ES UN ARQUEO MÁS: el
 * último retiro del cajón (decisión de Emanuel, 2026-10-18).
 *
 * No calcula plata nueva: lee `efectivo` (lo que ya arma `resumenDeCaja` con
 * `calcularEfectivoEsperado`) y los arqueos de `arqueosDeCaja`. La diferencia
 * es la de la caja, la misma de la cabecera del trabajador; "salió" está armado
 * para que entró − salió sea exactamente esa: lo que tenía que haber es lo que
 * entró menos pagos y retiros, y la diferencia es lo contado menos eso.
 *
 * @param {object} args
 * @param {object} args.efectivo     el `efectivo` de `resumenDeCaja`
 * @param {Array}  args.arqueos      la salida de `arqueosDeCaja`
 * @param {boolean} args.cerrada
 * @param {number|null} args.diferencia  la de la caja (null abierta o sin conteo)
 * @param {string|Date|null} [args.cierre]  cuándo cerró la caja
 *
 * ── LA LISTA SUMA LO MISMO QUE "SALIÓ" ────────────────────────────────────
 *
 * Los renglones salen de los arqueos y el total, de `efectivo`. Para que nunca
 * digan cosas distintas:
 *   · el cierre muestra lo contado de la caja —lo mismo que guarda su arqueo
 *     FINAL— y, si una caja vieja no tiene arqueo FINAL, el renglón igual está,
 *     sin tramo, porque no hay acumulada de dónde sacarlo;
 *   · un arqueo que solo CONTÓ (sin retiro) se muestra con su tramo pero no es
 *     una salida: `esConteo`, y no suma;
 *   · si los retiros de arqueos no suman lo retirado en el cajón, la diferencia
 *     va en un renglón "Retiros sin arqueo", sin tramo. Con los flujos de hoy no
 *     pasa —cada retiro escribe su arqueo y su movimiento en la misma
 *     transacción—, pero si pasara se ve en vez de esconderse.
 */
export function efectivoDelCajon({ efectivo, arqueos = [], cerrada, diferencia, cierre = null }) {
  const e = efectivo || {};
  const c = (n) => aCentavos(n ?? 0);
  const entroC = c(e.cambioInicial) + c(e.ventasEfectivo) + c(e.ingresos);
  const conContado = Boolean(cerrada) && e.contado != null;
  const contadoC = conContado ? c(e.contado) : 0;
  const salioC = c(e.pagosDesdeCaja) + c(e.retiradoArqueos) + contadoC;

  const renglones = arqueos
    .filter((a) => a.tipo !== "Cierre")
    .map((a) => ({
      id: a.id,
      instante: a.instante,
      rotulo: a.accion === "Retiró" ? "Retiro" : "Conteo",
      esConteo: a.accion !== "Retiró",
      monto: a.monto,
      tramo: a.tramo,
    }));
  const retirosC = renglones.filter((r) => !r.esConteo).reduce((s, r) => s + c(r.monto), 0);
  const sinArqueoC = c(e.retiradoArqueos) - retirosC;
  if (sinArqueoC !== 0) {
    renglones.push({ id: "retiros-sin-arqueo", instante: null, rotulo: "Retiros sin arqueo", esConteo: false, monto: desdeCentavos(sinArqueoC), tramo: null });
  }
  if (conContado) {
    const final = arqueos.find((a) => a.tipo === "Cierre");
    renglones.push({
      id: final?.id ?? "cierre",
      instante: final?.instante ?? cierre,
      rotulo: "Cierre",
      esConteo: false,
      monto: desdeCentavos(contadoC),
      tramo: final ? final.tramo : null,
    });
  }

  return {
    entro: {
      cambioInicial: desdeCentavos(c(e.cambioInicial)),
      ventasEfectivo: desdeCentavos(c(e.ventasEfectivo)),
      ingresos: desdeCentavos(c(e.ingresos)),
      total: desdeCentavos(entroC),
    },
    salio: {
      pagosDesdeCaja: desdeCentavos(c(e.pagosDesdeCaja)),
      // Todos los retiros juntos, en orden de hora, con el cierre como último.
      retiros: renglones,
      total: desdeCentavos(salioC),
    },
    cerrada: Boolean(cerrada),
    diferencia: cerrada ? diferencia ?? null : null,
  };
}

function horarioDe(cajas) {
  const aperturas = cajas.map((c) => new Date(c.apertura).getTime()).filter(Number.isFinite);
  const cierres = cajas.map((c) => (c.cierre ? new Date(c.cierre).getTime() : NaN)).filter(Number.isFinite);
  const abiertas = cajas.filter((c) => c.estado !== ESTADO_TURNO.CERRADO).length;
  return {
    desde: aperturas.length ? new Date(Math.min(...aperturas)).toISOString() : null,
    hasta: !abiertas && cierres.length ? new Date(Math.max(...cierres)).toISOString() : null,
  };
}

/** Los pagos desde la caja de varias cajas, en el orden en que salieron. */
export function pagosDelGrupo(cajas = []) {
  return cajas
    .flatMap((c) => (c.salidas || []).filter((s) => s.esPago).map((s) => ({ ...s, cajaId: c.id })))
    .sort((a, b) => new Date(a.instante) - new Date(b.instante) || a.id - b.id);
}

/**
 * UN TURNO (un grupo de Tesorería) con sus cajas. Se suman las VENTAS de sus
 * cajas; las diferencias se cuentan, no se suman.
 */
export function resumenDeGrupo(grupo, cajas) {
  const suma = (f) => desdeCentavos(cajas.reduce((s, c) => s + aCentavos(f(c)), 0));
  const cerradas = cajas.filter((c) => c.estado === ESTADO_TURNO.CERRADO);
  const pagos = pagosDelGrupo(cajas);
  return {
    clave: grupo.clave,
    titulo: grupo.sinTurno ? ROTULO_SIN_TURNO : rotuloDeTurno(grupo.etiqueta),
    dia: grupo.dia,
    sinTurno: grupo.sinTurno,
    turnoOperativoId: grupo.turnoOperativoId,
    horario: horarioDe(cajas),
    cantidadCajas: cajas.length,
    abiertas: cajas.filter((c) => c.estado !== ESTADO_TURNO.CERRADO).length,
    // Las filas de la tarjeta, cada una la suma de las de sus cajas.
    vendido: suma((c) => c.metricas.bruto),
    // "Total cobrado" del desglose: lo vendido por todos los medios menos sus
    // comisiones. Es el `neto` de `resumirVentas`, el mismo que usa el resultado.
    neto: suma((c) => c.metricas.neto),
    comisiones: suma((c) => c.metricas.comisiones),
    costo: suma((c) => c.metricas.costo),
    ganancia: suma((c) => c.metricas.ganancia),
    pagosDesdeCaja: suma((c) => c.metricas.pagosDesdeCaja),
    sueldosYGastos: suma((c) => c.metricas.sueldosYGastos),
    consumoPersonal: suma((c) => c.metricas.consumoPersonal),
    resultado: resultadoDelTurno({
      neto: suma((c) => c.metricas.neto),
      costo: suma((c) => c.metricas.costo),
      sueldosYGastos: suma((c) => c.metricas.sueldosYGastos),
      consumoPersonal: suma((c) => c.metricas.consumoPersonal),
      faltantes: suma((c) => c.metricas.faltantes),
      sobrantes: suma((c) => c.metricas.sobrantes),
    }),
    // Quién consumió y cuánto, de todas sus cajas.
    consumos: cajas
      .flatMap((c) => c.consumos || [])
      .sort((a, b) => new Date(a.instante) - new Date(b.instante) || a.id - b.id),
    // La plata que salió de la caja, pago por pago, de todas sus cajas: cada
    // uno con su tipo y su marca en la ganancia.
    pagos,
    sinClasificar: pagos.filter((p) => p.marca === MARCA_EGRESO.SIN_CLASIFICAR).length,
    medios: sumarMedios(cajas.map((c) => c.cobrado.medios)),
    tickets: cajas.reduce((s, c) => s + c.metricas.tickets, 0),
    diferencias: {
      cerradas: cerradas.length,
      faltan: cerradas.filter((c) => c.resultado === RESULTADO_CAJA.FALTA).length,
      sobran: cerradas.filter((c) => c.resultado === RESULTADO_CAJA.SOBRA).length,
      sinConteo: cerradas.filter((c) => c.resultado === RESULTADO_CAJA.SIN_CONTEO).length,
    },
    cajas,
  };
}

/** El grupo de una caja: el de Tesorería, por su fecha operativa y su turno. */
export function grupoDeCaja(localId, caja) {
  return grupoDeTesoreria(localId, {
    caja: {
      turnoOperativoId: caja.turnoOperativoId,
      fechaOperativa: caja.fechaOperativa,
      turnoOperativoNombre: caja.turnoOperativoNombre,
      turnoOperativoOrden: caja.turnoOperativoOrden,
    },
    instante: caja.apertura,
  });
}

/**
 * Las pestañas: Todos, un turno operativo del local por pestaña en su orden, y
 * Sin turno asignado. Un turno inactivo entra solo si tiene cajas en el período.
 */
export function pestanasDelLocal(turnosDelLocal = [], grupos = []) {
  const conCajas = new Set(grupos.map((g) => g.turnoOperativoId).filter((id) => id != null));
  const turnos = [...turnosDelLocal]
    .filter((t) => t.activo !== false || conCajas.has(t.id))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id);
  return [
    { valor: PESTANA_TODOS, texto: "Todos" },
    ...turnos.map((t) => ({ valor: `t${t.id}`, texto: String(t.nombre) })),
    { valor: PESTANA_SIN_TURNO, texto: "Sin turno" },
  ];
}

/** ¿El grupo va en esta pestaña? */
export function grupoEnPestana(grupo, pestana) {
  if (!pestana || pestana === PESTANA_TODOS) return true;
  if (pestana === PESTANA_SIN_TURNO) return grupo.sinTurno === true;
  return !grupo.sinTurno && `t${grupo.turnoOperativoId}` === pestana;
}

/**
 * LA LECTURA DEL LOCAL EN EL PERÍODO.
 *
 * @param {object} args
 * @param {number} args.localId
 * @param {Array}  args.cajas        filas de Turno del período (ya en el alcance de quien mira)
 * @param {Array}  args.ventas       ventas comerciales de esas cajas, con `turnoId`
 * @param {Array}  args.movimientos  movimientos de esas cajas, clasificados
 * @param {Array}  args.turnosDelLocal  el catálogo de turnos operativos
 */
export function armarTurnosYCierres({ localId, cajas = [], ventas = [], movimientos = [], consumos = [], arqueos = [], turnosDelLocal = [] }) {
  const ventasPorCaja = agruparPor(ventas, "turnoId");
  const movsPorCaja = agruparPor(movimientos, "turnoId");
  const consumosPorCaja = agruparPor(consumos, "turnoId");
  const arqueosPorCaja = agruparPor(arqueos, "turnoId");

  const porGrupo = new Map();
  for (const caja of cajas) {
    const grupo = grupoDeCaja(localId, caja);
    if (!grupo) continue;
    const r = resumenDeCaja({
      caja,
      ventas: ventasPorCaja.get(caja.id) || [],
      movimientos: movsPorCaja.get(caja.id) || [],
      consumos: consumosPorCaja.get(caja.id) || [],
      arqueos: arqueosPorCaja.get(caja.id) || [],
    });
    if (!porGrupo.has(grupo.clave)) porGrupo.set(grupo.clave, { grupo, cajas: [] });
    porGrupo.get(grupo.clave).cajas.push(r);
  }

  const grupos = [...porGrupo.values()]
    .sort((a, b) => compararGrupos(a.grupo, b.grupo))
    .map(({ grupo, cajas: cs }) =>
      resumenDeGrupo(
        grupo,
        cs.sort((a, b) => new Date(a.apertura) - new Date(b.apertura) || a.id - b.id)
      )
    );

  return { grupos, pestanas: pestanasDelLocal(turnosDelLocal, grupos) };
}

/**
 * LO QUE RECIBE EL COMPROBANTE Z (`components/turnos/imprimirZReport.js`), con
 * la forma que ya le daba la ficha del turno: la fila del turno, el resumen
 * que arma `/api/pos-ventas/turnos/resumen` —cantidad, efectivo, digital y el
 * desglose por medio— y los movimientos con `id`, `tipo` y `monto`. Los números
 * salen de las mismas piezas que ese resumen: `calcularEfectivoEsperado` y los
 * tenders de las ventas comerciales.
 */
export function datosDelComprobanteZ({ caja, ventas = [], movimientos = [], local = null }) {
  const calculo = calcularEfectivoEsperado({ montoInicial: caja.montoInicial, ventas, movimientos: paraElEsperado(movimientos) });
  const desglose = { mercadopago: 0, debito: 0, credito: 0, fiado: 0 };
  for (const d of desglosarPorMedio(ventas)) if (desglose[d.formaPago] !== undefined) desglose[d.formaPago] += d.total;
  return {
    turno: {
      id: caja.id,
      local: { nombre: local ?? caja.local?.nombre ?? null },
      vendedor: { nombre: caja.vendedorNombre ?? null },
      apertura: caja.apertura,
      cierre: caja.cierre ?? null,
      montoInicial: num(caja.montoInicial),
      montoEsperadoEfectivo: num(caja.montoEsperadoEfectivo),
      montoRealEfectivo: num(caja.montoRealEfectivo),
      diferenciaEfectivo: num(caja.diferenciaEfectivo),
      retiroCierreMovimientoId: caja.retiroCierreMovimientoId ?? null,
      efectivoRetiradoCierre: num(caja.efectivoRetiradoCierre),
      fondoDejadoCierre: num(caja.fondoDejadoCierre),
      destinoRetiroCierre: caja.destinoRetiroCierre ?? null,
      recibidoPorCierre: caja.recibidoPorCierre ?? null,
      observaciones: caja.observaciones ?? null,
    },
    resumen: {
      cantidadVentas: calculo.cantidadVentas,
      totalEfectivo: calculo.ventasEfectivo,
      totalDigital: calculo.ventasDigital,
      desglose,
    },
    movimientos: movimientos.map((m) => ({ id: m.id, tipo: m.tipo, monto: num(m.monto) })),
  };
}

/** Las ventas sin caja: cuántas y cuánto. Comerciales: el filtro lo pone el lector. */
export function resumenVentasSinCaja(ventas = []) {
  return {
    cantidad: ventas.length,
    total: desdeCentavos(ventas.reduce((s, v) => s + aCentavos(v.total), 0)),
    items: ventas.map((v) => ({ id: v.id, numero: v.numero ?? null, fecha: v.fecha, total: num(v.total) })),
  };
}

/**
 * LAS CAJAS DE UN CAJERO: la abierta o las de hoy arriba, las anteriores abajo.
 * Cada una con su esperado de ahora (abierta) o su diferencia (cerrada).
 */
export function armarMisCajas({ cajas = [], ventas = [], movimientos = [], consumos = [], arqueos = [], hoy }) {
  const ventasPorCaja = agruparPor(ventas, "turnoId");
  const movsPorCaja = agruparPor(movimientos, "turnoId");
  const consumosPorCaja = agruparPor(consumos, "turnoId");
  const arqueosPorCaja = agruparPor(arqueos, "turnoId");
  const lista = cajas
    .map((caja) => ({
      caja,
      r: resumenDeCaja({
        caja,
        ventas: ventasPorCaja.get(caja.id) || [],
        movimientos: movsPorCaja.get(caja.id) || [],
        consumos: consumosPorCaja.get(caja.id) || [],
        arqueos: arqueosPorCaja.get(caja.id) || [],
      }),
    }))
    .sort((a, b) => new Date(b.caja.apertura) - new Date(a.caja.apertura) || b.caja.id - a.caja.id)
    .map(({ caja, r }) => ({ ...r, dia: diaDeCaja(caja) }));
  const esDeHoy = (c) => c.estado !== ESTADO_TURNO.CERRADO || c.dia === hoy;
  return { hoy: lista.filter(esDeHoy), anteriores: lista.filter((c) => !esDeHoy(c)) };
}

/** El día de una caja: su fecha operativa, o el de su apertura si no tiene turno. */
export function diaDeCaja(caja) {
  const g = grupoDeCaja(caja?.localId ?? 0, caja);
  return g?.dia ?? null;
}

function agruparPor(filas, campo) {
  const m = new Map();
  for (const f of filas || []) {
    const k = f?.[campo];
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
}
