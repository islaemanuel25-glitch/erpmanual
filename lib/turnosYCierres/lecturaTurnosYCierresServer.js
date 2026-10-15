// lib/turnosYCierres/lecturaTurnosYCierresServer.js
//
// EL LECTOR DE "TURNOS Y CIERRES": hace las consultas y le pasa las filas al
// armado puro (lecturaTurnosYCierres.js). Solo lee.
//
// QUÉ CAJAS ENTRAN AL PERÍODO, con el criterio de Tesorería: una caja con turno
// operativo entra ENTERA por su fecha operativa —la que fijó su apertura—,
// aunque haya cruzado la medianoche. Una caja anterior al turno operativo (sin
// fecha) entra por el día de su apertura. Las anuladas no entran: no tuvieron
// plata ni conteo.
//
// Cada caja se lee COMPLETA —todas sus ventas y movimientos, no solo los del
// rango—, porque el esperado y la diferencia son de la caja entera. Eso es lo
// que la cuenta de Auditoría POS no hacía con una caja que empezaba antes del
// rango.
//
// Las consultas son un número fijo, no una por caja.

import { whereVentaComercial } from "../ventas/filtroVentaComercial.js";
import { fechaArgentinaISO, hoyArgentinaISO } from "../fechas/rangoArgentina.js";
import { fechaOperativaParaGuardar } from "../caja/turnoOperativo.js";
import { turnosOperativosDelLocal } from "../caja/turnoOperativoServer.js";
import { clasificarMovimientos } from "../finanzas/movimientosDeCaja.js";
import { vinculosDeMovimientos } from "../finanzas/movimientosDeCajaServer.js";
import { SELECT_RESUMEN_VENTA } from "../reportes-ventas/resumenVentas.js";
import { whereCajasDelAlcance } from "./alcance.js";
import {
  armarMisCajas,
  armarTurnosYCierres,
  arqueosDeCaja,
  datosDelComprobanteZ,
  resumenDeCaja,
  resumenVentasSinCaja,
} from "./lecturaTurnosYCierres.js";

export const SELECT_CAJA = Object.freeze({
  id: true,
  localId: true,
  vendedorId: true,
  operadorId: true,
  apertura: true,
  cierre: true,
  cierreEnPreparacionEn: true,
  anuladoEn: true,
  montoInicial: true,
  montoEsperadoEfectivo: true,
  montoRealEfectivo: true,
  diferenciaEfectivo: true,
  retiroCierreMovimientoId: true,
  turnoOperativoId: true,
  fechaOperativa: true,
  turnoOperativo: { select: { nombre: true, orden: true } },
  operador: { select: { nombre: true } },
  vendedor: { select: { nombre: true } },
});

const SELECT_VENTA = Object.freeze({ ...SELECT_RESUMEN_VENTA, turnoId: true });

const SELECT_MOVIMIENTO = Object.freeze({
  id: true,
  turnoId: true,
  tipo: true,
  monto: true,
  motivo: true,
  // Qué se pagó, para la ganancia. La plata no lo mira.
  tipoEgreso: true,
  createdAt: true,
  // Lo que se MUESTRA de un pago sale de sus relaciones, como en Tesorería: el
  // proveedor de la cuenta o el gasto. La clase la decide el vínculo.
  pagoProveedor: { select: { cuenta: { select: { proveedor: { select: { nombre: true } } } } } },
  pagoGasto: { select: { gasto: { select: { concepto: true, categoria: { select: { nombre: true } } } } } },
});

/** La fila de Turno con los nombres planos que usa el armado. */
export function planoDeCaja(t) {
  return {
    ...t,
    turnoOperativoNombre: t.turnoOperativo?.nombre ?? null,
    turnoOperativoOrden: t.turnoOperativo?.orden ?? null,
    operadorNombre: t.operador?.nombre ?? null,
    vendedorNombre: t.vendedor?.nombre ?? null,
  };
}

/**
 * QUÉ CAJAS ENTRAN AL PERÍODO, como condición de Prisma: por fecha operativa,
 * o —sin ella— por el instante de la apertura. Sin anuladas.
 */
export function whereCajasDelPeriodo({ fechaInicio, fechaFin }) {
  const dias = {
    gte: fechaOperativaParaGuardar(fechaArgentinaISO(fechaInicio)),
    lte: fechaOperativaParaGuardar(fechaArgentinaISO(fechaFin)),
  };
  return {
    anuladoEn: null,
    OR: [{ fechaOperativa: dias }, { fechaOperativa: null, apertura: { gte: fechaInicio, lte: fechaFin } }],
  };
}

/**
 * LAS VENTAS SIN CAJA del período: comerciales —sin anuladas ni internas—, del
 * local, sin turno, por su instante. Es la consulta del aviso de Auditoría POS
 * (`auditoria-pos-ventas/turnos/sin-turno`) con el filtro de venta comercial.
 */
export function whereVentasSinCaja({ localId, fechaInicio, fechaFin }) {
  return whereVentaComercial({ localId, turnoId: null, fecha: { gte: fechaInicio, lte: fechaFin } });
}

/** Ventas y movimientos de un conjunto de cajas, con los movimientos ya clasificados. */
async function hechosDeCajas(db, ids) {
  if (!ids.length) return { ventas: [], movimientos: [] };
  const [ventas, movimientos] = await Promise.all([
    db.venta.findMany({
      // El MISMO criterio que el esperado del cierre: sin anuladas ni internas.
      where: whereVentaComercial({ turnoId: { in: ids } }),
      select: SELECT_VENTA,
      orderBy: { id: "asc" },
    }),
    db.cajaMovimiento.findMany({ where: { turnoId: { in: ids } }, select: SELECT_MOVIMIENTO, orderBy: { id: "asc" } }),
  ]);
  const vinculos = await vinculosDeMovimientos(db, movimientos.map((m) => m.id));
  const planos = movimientos.map(({ pagoProveedor, pagoGasto, ...m }) => ({
    ...m,
    proveedorNombre: pagoProveedor?.cuenta?.proveedor?.nombre ?? null,
    gastoConcepto: pagoGasto?.gasto?.concepto ?? null,
    gastoCategoria: pagoGasto?.gasto?.categoria?.nombre ?? null,
  }));
  return { ventas, movimientos: clasificarMovimientos(planos, vinculos) };
}

/**
 * La lectura de un local en un período, para quien ve el local entero.
 *
 * @param {object} db
 * @param {{localId:number, fechaInicio:Date, fechaFin:Date, alcance:string, identidad:object}} args
 */
export async function leerTurnosYCierres(db, args) {
  const filas = await filasDeTurnosYCierres(db, args);
  return {
    ...armarTurnosYCierres({ localId: args.localId, ...filas }),
    ventasSinCaja: resumenVentasSinCaja(filas.ventasSinCaja),
  };
}

/**
 * Las filas tal como salen de la base, ANTES de armar. Es lo que reciben los
 * candados como fixture (`filasReales.fixture.json`): la forma del dato de
 * prueba es la del dato real porque es el mismo lector.
 */
export async function filasDeTurnosYCierres(db, { localId, fechaInicio, fechaFin, alcance, identidad }) {
  const [cajas, turnosDelLocal, sinCaja] = await Promise.all([
    db.turno.findMany({
      where: { ...whereCajasDelAlcance({ localId, alcance, identidad }), ...whereCajasDelPeriodo({ fechaInicio, fechaFin }) },
      select: SELECT_CAJA,
      orderBy: { id: "asc" },
    }),
    turnosOperativosDelLocal(db, localId),
    db.venta.findMany({
      where: whereVentasSinCaja({ localId, fechaInicio, fechaFin }),
      select: { id: true, numero: true, fecha: true, total: true },
      orderBy: { fecha: "desc" },
    }),
  ]);
  const { ventas, movimientos } = await hechosDeCajas(db, cajas.map((c) => c.id));
  return { cajas: cajas.map(planoDeCaja), ventas, movimientos, turnosDelLocal, ventasSinCaja: sinCaja };
}

/** Cuántas cajas anteriores ve un cajero. */
export const LIMITE_MIS_CAJAS = 30;

/** Las cajas de un cajero: solo las suyas, la de hoy y las anteriores. */
export async function leerMisCajas(db, { localId, alcance, identidad, hoy = hoyArgentinaISO() }) {
  const cajas = await db.turno.findMany({
    where: { ...whereCajasDelAlcance({ localId, alcance, identidad }), anuladoEn: null },
    select: SELECT_CAJA,
    orderBy: [{ apertura: "desc" }, { id: "desc" }],
    take: LIMITE_MIS_CAJAS,
  });
  const { ventas, movimientos } = await hechosDeCajas(db, cajas.map((c) => c.id));
  return armarMisCajas({ cajas: cajas.map(planoDeCaja), ventas, movimientos, hoy });
}

/**
 * Una caja con su detalle y los datos de su comprobante Z. Devuelve null si no
 * existe; el alcance lo decide quien llama, con la fila que viene en `caja`.
 */
export async function leerDetalleDeCaja(db, cajaId) {
  const fila = await db.turno.findUnique({
    where: { id: cajaId },
    select: {
      ...SELECT_CAJA,
      efectivoRetiradoCierre: true,
      fondoDejadoCierre: true,
      destinoRetiroCierre: true,
      recibidoPorCierre: true,
      observaciones: true,
      local: { select: { nombre: true } },
    },
  });
  if (!fila) return null;
  const [{ ventas, movimientos }, arqueos] = await Promise.all([
    hechosDeCajas(db, [fila.id]),
    db.arqueoCaja.findMany({
      where: { turnoId: fila.id },
      select: { id: true, tipo: true, fechaHora: true, efectivoContado: true, efectivoRetirado: true, diferencia: true },
      orderBy: { fechaHora: "asc" },
    }),
  ]);
  const caja = planoDeCaja(fila);
  return {
    caja,
    detalle: resumenDeCaja({ caja, ventas, movimientos }),
    arqueos: arqueosDeCaja(arqueos),
    z: datosDelComprobanteZ({ caja, ventas, movimientos }),
  };
}
