// lib/integraciones/azul-chat/cajasResumen.js
//
// LA CAPACIDAD `cajas_resumen`: LA CAJA DE UN LOCAL EN UN DÍA, POR TURNO
// OPERATIVO. Lo que se vendió y con qué, los retiros con su motivo y a quién, y
// si cada caja cerró correcta o con diferencia. Esta parte es PURA: recibe lo ya
// leído (cajasResumenServer.js) y arma la respuesta.
//
// ── NINGUNA FÓRMULA PROPIA ─────────────────────────────────────────────────
//
// Cada número sale de la pieza que ya usa una pantalla del ERP:
//   · qué cajas entran al día, su turno operativo, sus entregas con el estado
//     de verificación, sus pagos desde la caja y sus Caja +/− ............
//     la lectura de Tesorería (`leerTesoreria`, lib/tesoreria/);
//   · a qué grupo va cada caja y en qué orden, "Sin turno asignado" al final ..
//     `grupoDeTesoreria` y `compararGrupos` (lib/tesoreria/turnoComercial.js);
//   · cuánto se vendió, cuántas ventas y por medio ...........................
//     `resumirVentas` y `desglosarPorMedio` del reporte de ventas, por
//     `mediosDePagoDe` (ventasResumen.js), sobre las MISMAS ventas que toma
//     Tesorería (`whereVentasDeTesoreria`);
//   · el estado del turno ........ `estadoDelTurno` (lib/caja/cierreRelevo.js);
//   · correcta, sobra o falta .... `resultadoCierre` (lib/caja/vistaTurno.js),
//     con el esperado guardado al cerrar o, en una caja abierta, el que calcula
//     `calcularEsperadoDeTurno` (lib/caja/arqueoServer.js) — la misma elección
//     que hace la ficha del turno en Finanzas (`app/api/finanzas/turno/[turnoId]`).
//
// Lo único que se suma acá son centavos para comparar —advertencias— y nunca
// se corrige un número: si dos fuentes no coinciden, se dice.
//
// ── LAS DIFERENCIAS NO SE COMPENSAN ────────────────────────────────────────
//
// La diferencia es de CADA caja, y el total de un turno operativo no la lleva:
// sumar un faltante de una caja con el sobrante de otra escondería los dos. La
// verificación de Tesorería (lo entregado contra lo contado por Tesorería) es
// otra cosa y va en su propio campo, sin mezclarse con la de caja.
//
// ── LO QUE NO DEVUELVE ─────────────────────────────────────────────────────
//
// Ni costos, ni ganancias, ni comisiones, ni productos, ni clientes.

import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { TZ_AR } from "@/lib/fechas/formatearFechaHora";
import { etiquetaMedio } from "@/lib/pos-ventas/pagos";
import { resumirVentas } from "@/lib/reportes-ventas/resumenVentas";
import { MEDIO_EFECTIVO, MEDIOS_SIN_COBRO, aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { estadoDelTurno, ESTADO_TURNO } from "@/lib/caja/cierreRelevo";
import { resultadoCierre, CAJA_CORRECTA, CAJA_SOBRANTE, CAJA_FALTANTE, CAJA_SIN_CONTEO } from "@/lib/caja/vistaTurno";
import { grupoDeTesoreria, compararGrupos } from "@/lib/tesoreria/turnoComercial";
import { ESTADO_ENTREGA, ORIGEN_PAGO } from "@/lib/tesoreria/lecturaTesoreria";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja";
import { esFechaReal, diaAnterior, mediosDePagoDe } from "./ventasResumen.js";

export const VERSION_CONTRATO = 1;

export const TIPOS_PERIODO = Object.freeze(["hoy", "ayer", "fecha"]);

/** El estado de una caja, como lo dice esta capacidad. */
export const ESTADO_CAJA = Object.freeze({
  ABIERTA: "ABIERTA",
  CORRECTA: "CORRECTA",
  CON_DIFERENCIA: "CON_DIFERENCIA",
  /** Cerrada sin contar: el ERP no sabe si estaba correcta. No es CORRECTA ni $0. */
  SIN_CONTEO: "SIN_CONTEO",
  /** Turno anulado con hechos en el día: se muestra, marcado. */
  ANULADA: "ANULADA",
});

export const TIPO_DIFERENCIA = Object.freeze({ FALTA: "FALTA", SOBRA: "SOBRA", NINGUNA: "NINGUNA" });

export const VERIFICACION_TESORERIA = Object.freeze({
  VERIFICADA: "VERIFICADA",
  FALTA_VERIFICAR: "FALTA_VERIFICAR",
  /** La caja no entregó efectivo a Tesorería en el día: no hay nada que verificar. */
  NO_APLICA: "NO_APLICA",
});

/** De dónde sale cada retiro. */
export const TIPO_RETIRO = Object.freeze({
  RECAUDACION: "RETIRO_RECAUDACION",
  CIERRE: "RETIRO_CIERRE",
  PAGO_PROVEEDOR: "PAGO_PROVEEDOR",
  PAGO_GASTO: "PAGO_GASTO",
  MANUAL: "RETIRO_MANUAL",
});

/** El nombre de un turno operativo pedido por nombre o por id, como mucho. */
const MAX_NOMBRE_TURNO = 80;

const rechazo = (codigo, error) => ({ ok: false, status: 400, codigo, error });

const iso = (v) => (v == null ? null : new Date(v).toISOString());
/** Un importe de la base como texto decimal; null queda null —"nadie lo registró"—. */
const dinero = (v) => (v == null ? null : desdeCentavos(aCentavos(v)).toFixed(2));

/**
 * El pedido: un día argentino y, si se pide, un turno operativo.
 *
 * @param {unknown} parametros `{ periodo: {tipo:"hoy"} | {tipo:"ayer"} | {tipo:"fecha", fecha:"AAAA-MM-DD"}, turnoOperativo?: number|string }`
 * @param {{ahora?: number}} [opciones]
 */
export function resolverPedido(parametros, { ahora = Date.now() } = {}) {
  const periodo = parametros?.periodo;
  if (!periodo || typeof periodo !== "object" || Array.isArray(periodo)) {
    return rechazo("PERIODO_INVALIDO", "Falta el período: hoy, ayer o una fecha.");
  }
  const { tipo } = periodo;
  if (!TIPOS_PERIODO.includes(tipo)) {
    return rechazo("PERIODO_INVALIDO", "El período tiene que ser hoy, ayer o fecha: un solo día.");
  }
  const permitidas = tipo === "fecha" ? ["tipo", "fecha"] : ["tipo"];
  if (Object.keys(periodo).some((k) => !permitidas.includes(k))) {
    return rechazo("PERIODO_INVALIDO", `El período ${tipo} no acepta más datos que ${permitidas.join(", ")}.`);
  }

  const hoy = fechaArgentinaISO(new Date(ahora));
  let dia = hoy;
  if (tipo === "ayer") dia = diaAnterior(hoy);
  if (tipo === "fecha") {
    if (!esFechaReal(periodo.fecha)) return rechazo("PERIODO_INVALIDO", "La fecha tiene que ser AAAA-MM-DD.");
    if (periodo.fecha > hoy) return rechazo("PERIODO_INVALIDO", `La fecha está en el futuro: hoy es ${hoy} en Argentina.`);
    dia = periodo.fecha;
  }

  const pedido = parametros.turnoOperativo;
  let turnoOperativo = null;
  if (pedido !== undefined && pedido !== null) {
    if (typeof pedido === "number" && Number.isInteger(pedido) && pedido > 0) {
      turnoOperativo = { id: pedido };
    } else if (typeof pedido === "string" && pedido.trim() && pedido.trim().length <= MAX_NOMBRE_TURNO) {
      turnoOperativo = { nombre: pedido.trim() };
    } else {
      return rechazo("TURNO_OPERATIVO_INVALIDO", "El turno operativo es su nombre o su número.");
    }
  }

  return { ok: true, tipo, dia, hoy, turnoOperativo };
}

/** Sin mayúsculas ni acentos: "Mañana" y "manana" son el mismo turno. */
const normalizar = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * El turno operativo pedido, entre los del local. Los nombres son únicos por
 * local en la base; un turno desactivado se sigue pudiendo pedir, porque el día
 * consultado puede ser de cuando estaba activo.
 *
 * @param {{id?:number, nombre?:string}|null} pedido
 * @param {Array<{id:number, nombre:string}>} turnosDelLocal
 * @returns {null | {ok:true, id:number, nombre:string} | {ok:false, status:number, codigo:string, error:string}}
 */
export function elegirTurnoOperativo(pedido, turnosDelLocal = []) {
  if (!pedido) return null;
  const encontrado =
    pedido.id != null
      ? turnosDelLocal.find((t) => t.id === pedido.id)
      : turnosDelLocal.find((t) => normalizar(t.nombre) === normalizar(pedido.nombre));
  if (encontrado) return { ok: true, id: encontrado.id, nombre: encontrado.nombre };
  const nombres = turnosDelLocal.map((t) => t.nombre);
  return rechazo(
    "TURNO_OPERATIVO_INVALIDO",
    nombres.length
      ? `El local no tiene ese turno operativo. Sus turnos son: ${nombres.join(", ")}.`
      : "El local no tiene turnos operativos configurados."
  );
}

/** Las ventas de un conjunto, como las cuenta el reporte: total, cantidad, por medio y lo no cobrado aparte. */
function ventasDe(ventas) {
  const resumen = resumirVentas(ventas);
  const medios = mediosDePagoDe(ventas);
  const cobrados = medios.filter((m) => !MEDIOS_SIN_COBRO.has(m.medio)).map((m) => ({ ...m, cobrado: true }));
  // FIADO es venta, pero no entró dinero: aparte y marcado.
  const noCobradas = medios.filter((m) => MEDIOS_SIN_COBRO.has(m.medio)).map((m) => ({ ...m, cobrado: false }));
  const efectivo = cobrados.find((m) => m.medio === MEDIO_EFECTIVO);
  const totalVendido = resumen.totalBruto.toFixed(2);
  const centavosMedios = medios.reduce((acc, m) => acc + aCentavos(m.total), 0);
  return {
    cantidadVentas: resumen.cantidadVentas,
    totalVendido,
    ventasEfectivo: efectivo ? efectivo.total : "0.00",
    ventasPorMedio: cobrados,
    ventasNoCobradas: noCobradas,
    cuadra: centavosMedios === aCentavos(totalVendido),
    sumaDeMedios: (centavosMedios / 100).toFixed(2),
  };
}

/** Correcta, con diferencia, abierta, sin conteo o anulada; y la diferencia con su signo en palabras. */
function cierreDeLaCaja(turno, esperadoVivo) {
  const estadoTurno = estadoDelTurno(turno);
  // El esperado guardado al cerrar; en una caja abierta, el de ahora. La misma
  // elección que la ficha del turno en Finanzas.
  const esperado = turno.montoEsperadoEfectivo ?? esperadoVivo?.efectivoEsperado ?? null;
  if (estadoTurno === ESTADO_TURNO.ANULADO) {
    return { estado: ESTADO_CAJA.ANULADA, esperado, diferencia: null };
  }
  const r = resultadoCierre({ esperado, contado: turno.montoRealEfectivo, cerrado: estadoTurno === ESTADO_TURNO.CERRADO });
  if (r.estado === CAJA_CORRECTA) {
    return { estado: ESTADO_CAJA.CORRECTA, esperado, diferencia: { monto: "0.00", tipo: TIPO_DIFERENCIA.NINGUNA }, firmada: 0 };
  }
  if (r.estado === CAJA_SOBRANTE || r.estado === CAJA_FALTANTE) {
    const sobra = r.estado === CAJA_SOBRANTE;
    return {
      estado: ESTADO_CAJA.CON_DIFERENCIA,
      esperado,
      diferencia: { monto: r.monto.toFixed(2), tipo: sobra ? TIPO_DIFERENCIA.SOBRA : TIPO_DIFERENCIA.FALTA },
      firmada: sobra ? r.monto : -r.monto,
    };
  }
  if (r.estado === CAJA_SIN_CONTEO) return { estado: ESTADO_CAJA.SIN_CONTEO, esperado, diferencia: null };
  return { estado: ESTADO_CAJA.ABIERTA, esperado, diferencia: null };
}

/** VERIFICADA si Tesorería cubrió todas las entregas de la caja; NO_APLICA si no entregó nada. */
function verificacionDe(entregas) {
  if (!entregas.length) return VERIFICACION_TESORERIA.NO_APLICA;
  return entregas.every((e) => e.estadoVerificacion === ESTADO_ENTREGA.VERIFICADA)
    ? VERIFICACION_TESORERIA.VERIFICADA
    : VERIFICACION_TESORERIA.FALTA_VERIFICAR;
}

/**
 * Los retiros y los ingresos de una caja, con el "a quién" que el ERP registró.
 * Lo que el ERP no registró va en null: no se arma con otro dato.
 */
function movimientosDeLaCaja(cajaLeida, turno, { movimientoPorId, arqueoPorMovimiento }) {
  const detalle = (id) => movimientoPorId.get(id) || {};
  const quien = (id) => detalle(id).usuario?.nombre ?? null;
  const retiros = [];

  for (const e of cajaLeida.entregas) {
    const m = detalle(e.cajaMovimientoId);
    const arqueo = arqueoPorMovimiento.get(e.cajaMovimientoId) || null;
    const esCierre = e.clase === CLASE_MOVIMIENTO.CIERRE;
    retiros.push({
      tipo: esCierre ? TIPO_RETIRO.CIERRE : TIPO_RETIRO.RECAUDACION,
      monto: dinero(e.montoDeclarado),
      motivo: m.motivo ?? null,
      // El destino que se cargó: el del cierre en el Turno, o el del registro
      // del retiro. El circuito de hoy no los pide, y entonces es null.
      aQuien: (esCierre ? turno?.destinoRetiroCierre : null) ?? arqueo?.destino ?? null,
      recibidoPor: (esCierre ? turno?.recibidoPorCierre : null) ?? arqueo?.recibidoPor ?? null,
      hora: iso(m.createdAt ?? e.instante),
      registradoPor: quien(e.cajaMovimientoId),
      _id: e.cajaMovimientoId,
    });
  }

  for (const p of cajaLeida.pagosDesdeCaja) {
    const m = detalle(p.cajaMovimientoId);
    const esProveedor = p.origen === ORIGEN_PAGO.PAGO_PROVEEDOR;
    retiros.push({
      tipo: esProveedor ? TIPO_RETIRO.PAGO_PROVEEDOR : TIPO_RETIRO.PAGO_GASTO,
      monto: dinero(p.montoPagado),
      motivo: m.motivo ?? null,
      // Del pago, como lo presenta Tesorería: el proveedor de la cuenta, o el
      // beneficiario del gasto y, si no se cargó, su concepto.
      aQuien: esProveedor ? p.beneficiario ?? null : p.beneficiario ?? p.concepto ?? null,
      recibidoPor: null,
      hora: iso(m.createdAt ?? p.fecha),
      registradoPor: quien(p.cajaMovimientoId),
      _id: p.cajaMovimientoId,
    });
  }

  const ingresos = [];
  for (const mm of cajaLeida.movimientosManuales) {
    const fila = {
      monto: dinero(mm.monto),
      motivo: mm.motivo ?? null,
      hora: iso(mm.instante),
      registradoPor: quien(mm.cajaMovimientoId),
      _id: mm.cajaMovimientoId,
    };
    if (mm.tipo === "RETIRO") {
      // Caja −: el ERP guarda el motivo y nada más. A quién no está registrado.
      retiros.push({ tipo: TIPO_RETIRO.MANUAL, monto: fila.monto, motivo: fila.motivo, aQuien: null, recibidoPor: null, hora: fila.hora, registradoPor: fila.registradoPor, _id: fila._id });
    } else if (mm.tipo === "INGRESO") {
      ingresos.push(fila);
    }
  }

  const porHora = (a, b) => (a.hora === b.hora ? a._id - b._id : String(a.hora) < String(b.hora) ? -1 : 1);
  const sinId = ({ _id, ...resto }) => resto;
  return { retiros: retiros.sort(porHora).map(sinId), ingresos: ingresos.sort(porHora).map(sinId) };
}

/**
 * La respuesta, armada sobre lo ya leído. Pura.
 *
 * @param {object} args
 * @param {{id:number, nombre:string, activo:boolean}} args.local
 * @param {number} args.grupoId
 * @param {{tipo:string, dia:string, hoy:string}} args.pedido
 * @param {{id:number, nombre:string}|null} args.filtro el turno operativo pedido, ya elegido
 * @param {object} args.lectura la de `leerTesoreria` para ese día
 * @param {Array} args.turnos los Turno de las cajas de la lectura, con los datos del cierre
 * @param {Array} args.ventas las de `whereVentasDeTesoreria`, con `turnoId`
 * @param {Array} args.movimientos los CajaMovimiento de la lectura, con motivo, hora y usuario
 * @param {Array} args.arqueos los ArqueoCaja de esos movimientos (destino y recibidoPor)
 * @param {Map<number, object>} args.esperadosVivos por turnoId, el de `calcularEsperadoDeTurno` de las cajas abiertas
 * @param {Date} args.inicioDelDia instante del comienzo del día argentino
 */
export function armarCajasResumen({
  local,
  grupoId,
  pedido,
  filtro = null,
  lectura,
  turnos = [],
  ventas = [],
  movimientos = [],
  arqueos = [],
  esperadosVivos = new Map(),
  inicioDelDia,
}) {
  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  const movimientoPorId = new Map(movimientos.map((m) => [m.id, m]));
  const arqueoPorMovimiento = new Map(arqueos.map((a) => [a.cajaMovimientoRetiroId, a]));
  const ventasPorCaja = new Map();
  for (const v of ventas) {
    if (v.turnoId == null) continue;
    if (!ventasPorCaja.has(v.turnoId)) ventasPorCaja.set(v.turnoId, []);
    ventasPorCaja.get(v.turnoId).push(v);
  }

  const advertencias = [];
  if (pedido.dia >= pedido.hoy) {
    advertencias.push({ codigo: "DIA_EN_CURSO", mensaje: "El día consultado es hoy y todavía no terminó: las cajas pueden cambiar." });
  }
  if (local.activo === false) {
    advertencias.push({ codigo: "LOCAL_INACTIVO", mensaje: "El local está marcado como inactivo en el ERP." });
  }

  const grupos = new Map();
  for (const cajaLeida of lectura?.cajas || []) {
    const turno = turnoPorId.get(cajaLeida.turnoId);
    if (!turno) continue;
    const g = grupoDeTesoreria(local.id, {
      caja: {
        turnoOperativoId: turno.turnoOperativoId,
        fechaOperativa: turno.fechaOperativa,
        turnoOperativoNombre: turno.turnoOperativo?.nombre ?? null,
        turnoOperativoOrden: turno.turnoOperativo?.orden ?? null,
      },
      // Una caja sin turno entró al día por sus hechos: va al "Sin turno
      // asignado" de ESE día.
      instante: inicioDelDia,
    });
    if (!g) continue;
    if (filtro && g.turnoOperativoId !== filtro.id) continue;
    if (!grupos.has(g.clave)) grupos.set(g.clave, { ...g, cajas: [], ventas: [] });
    const grupo = grupos.get(g.clave);

    const deLaCaja = ventasPorCaja.get(cajaLeida.turnoId) || [];
    grupo.ventas.push(...deLaCaja);
    const vendido = ventasDe(deLaCaja);
    if (!vendido.cuadra) {
      advertencias.push({
        codigo: "DESGLOSE_NO_CUADRA",
        cajaId: cajaLeida.turnoId,
        mensaje: `Caja #${cajaLeida.turnoId}: la suma por medio de pago (${vendido.sumaDeMedios}) no coincide con el total vendido (${vendido.totalVendido}).`,
      });
    }

    const cierre = cierreDeLaCaja(turno, esperadosVivos.get(cajaLeida.turnoId));
    // La diferencia que se informa sale de `resultadoCierre`; la guardada al
    // cerrar tiene que ser la misma. Si no lo es, se dice y no se elige.
    if (cierre.firmada != null && cajaLeida.diferenciaCaja != null && aCentavos(cierre.firmada) !== aCentavos(cajaLeida.diferenciaCaja)) {
      advertencias.push({
        codigo: "DIFERENCIA_NO_CUADRA",
        cajaId: cajaLeida.turnoId,
        mensaje: `Caja #${cajaLeida.turnoId}: la diferencia guardada al cerrar (${dinero(cajaLeida.diferenciaCaja)}) no coincide con lo contado menos lo esperado.`,
      });
    }
    if (cajaLeida.entregas.some((e) => e.desactualizada)) {
      advertencias.push({
        codigo: "VERIFICACION_DESACTUALIZADA",
        cajaId: cajaLeida.turnoId,
        mensaje: `Caja #${cajaLeida.turnoId}: una entrega cambió después de que Tesorería la verificara.`,
      });
    }

    const { retiros, ingresos } = movimientosDeLaCaja(cajaLeida, turno, { movimientoPorId, arqueoPorMovimiento });
    grupo.cajas.push({
      id: cajaLeida.turnoId,
      etiqueta: cajaLeida.etiqueta,
      operador: cajaLeida.operadorNombre ?? cajaLeida.vendedorNombre ?? null,
      apertura: iso(turno.apertura),
      cierre: iso(turno.cierre),
      estado: cierre.estado,
      montoInicial: dinero(turno.montoInicial),
      cantidadVentas: vendido.cantidadVentas,
      totalVendido: vendido.totalVendido,
      ventasEfectivo: vendido.ventasEfectivo,
      ventasPorMedio: vendido.ventasPorMedio,
      ventasNoCobradas: vendido.ventasNoCobradas,
      retiros,
      ingresos,
      efectivoEsperado: dinero(cierre.esperado),
      efectivoContado: dinero(turno.montoRealEfectivo),
      diferencia: cierre.diferencia,
      efectivoRetiradoCierre: dinero(turno.efectivoRetiradoCierre),
      fondoDejadoCierre: dinero(turno.fondoDejadoCierre),
      verificacionTesoreria: verificacionDe(cajaLeida.entregas),
    });
  }

  // El turno pedido aparece aunque no haya tenido cajas ese día: "no hubo" es
  // una respuesta, no un error.
  if (filtro && grupos.size === 0) {
    grupos.set(`filtro:${filtro.id}`, { turnoOperativoId: filtro.id, etiqueta: filtro.nombre, sinTurno: false, dia: pedido.dia, orden: 0, cajas: [], ventas: [] });
  }

  const turnosOperativos = [...grupos.values()].sort(compararGrupos).map((g) => {
    // Los totales del turno son las ventas de sus cajas, contadas con la misma
    // pieza. Ni la diferencia ni el efectivo contado se suman: son de cada caja.
    const vendido = ventasDe(g.ventas);
    return {
      turnoOperativo: { id: g.turnoOperativoId ?? null, nombre: g.etiqueta },
      sinTurnoAsignado: g.sinTurno === true,
      totales: {
        cantidadVentas: vendido.cantidadVentas,
        totalVendido: vendido.totalVendido,
        ventasEfectivo: vendido.ventasEfectivo,
        ventasPorMedio: vendido.ventasPorMedio,
        ventasNoCobradas: vendido.ventasNoCobradas,
      },
      cajas: g.cajas.sort((a, b) => (a.apertura === b.apertura ? a.id - b.id : String(a.apertura) < String(b.apertura) ? -1 : 1)),
    };
  });

  return {
    capacidad: "cajas_resumen",
    version: VERSION_CONTRATO,
    local: { id: local.id, nombre: local.nombre },
    grupoId,
    periodo: { tipo: pedido.tipo, fecha: pedido.dia, zonaHoraria: TZ_AR },
    turnoOperativoPedido: filtro ? { id: filtro.id, nombre: filtro.nombre } : null,
    turnosOperativos,
    advertencias,
  };
}
