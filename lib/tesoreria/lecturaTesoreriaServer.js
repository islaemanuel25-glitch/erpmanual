// lib/tesoreria/lecturaTesoreriaServer.js
//
// EL LECTOR DE TESORERÍA: hace las consultas y le pasa las filas al armado puro
// (lecturaTesoreria.js). Solo lee.
//
// Las consultas son un número fijo, no una por caja ni por venta, y cada una
// filtra por local y por el instante de SU hecho en la base:
//   · ventas por `Venta.fecha`, con `whereVentaComercial` (sin internas ni
//     anuladas), y sus tenders en el mismo select;
//   · movimientos de caja por su `createdAt`, acotados a turnos del local;
//   · los vínculos que deciden la clase de cada movimiento, por id
//     (`vinculosDeMovimientos`, el mismo lector que usa el tablero de Finanzas);
//   · pagos a proveedor y de gastos por la fecha del PAGO —no la del hecho
//     económico— y la ubicación de la que salió la plata;
//   · los cortes cerrados sin conteo por `cerradoSinConteoEn`;
//   · el total de cobros de cuenta corriente, que no tienen medio ni caja;
//   · y al final los datos de las cajas que aparecieron, en una sola consulta.

import { whereVentaComercial } from "../ventas/filtroVentaComercial.js";
import { getRangoArgentina } from "../fechas/rangoArgentina.js";
import { rangoFinanciero } from "../finanzas/periodoFinanciero.js";
import { clasificarMovimientos } from "../finanzas/movimientosDeCaja.js";
import { vinculosDeMovimientos } from "../finanzas/movimientosDeCajaServer.js";
import { vigenciasDeUbicaciones } from "../semanaOperativa/semanaOperativaServer.js";
import { armarLecturaTesoreria } from "./lecturaTesoreria.js";

const SELECT_VENTA = {
  id: true,
  fecha: true,
  turnoId: true,
  total: true,
  esFiado: true,
  formaPago: true,
  comisionBancaria: true,
  netoRecibido: true,
  comisionPendiente: true,
  pagos: {
    select: {
      medio: true,
      monto: true,
      comision: true,
      neto: true,
      procesador: true,
      medioNombre: true,
      modalidadNombre: true,
    },
  },
};

const SELECT_PAGO = { id: true, fecha: true, monto: true, medio: true, turnoId: true, cajaMovimientoId: true };

/**
 * El rango de instantes de un período de Tesorería, con la MISMA semántica de
 * Día/Semana/Mes que Finanzas: `rangoFinanciero` con la semana operativa de la
 * ubicación, cortado en días argentinos.
 */
export async function rangoDeTesoreria(db, { localId, unidad, desplazamiento, hoy } = {}) {
  const vigencias = (await vigenciasDeUbicaciones(db, [localId])).get(localId) || [];
  const rango = rangoFinanciero({ unidad, desplazamiento, hoy, vigencias });
  const { fechaInicio, fechaFin } = getRangoArgentina(rango.desde, rango.hasta);
  // Las vigencias viajan para que quien describe el período (la semana del
  // local) use las MISMAS que cortaron el rango, sin volver a leerlas.
  return { ...rango, fechaInicio, fechaFin, vigencias };
}

/**
 * @param {object} db  cliente Prisma
 * @param {{localId:number, fechaInicio:Date, fechaFin:Date, turnoComercialDe?:Function}} args
 */
export async function leerTesoreria(db, { localId, fechaInicio, fechaFin, turnoComercialDe } = {}) {
  const enRango = { gte: fechaInicio, lte: fechaFin };

  const [ventas, movimientos, pagosProveedor, pagosGasto, cortesSinConteo, cuentaCorriente] = await Promise.all([
    db.venta.findMany({
      where: whereVentaComercial({ localId, fecha: enRango }),
      select: SELECT_VENTA,
    }),
    db.cajaMovimiento.findMany({
      where: { turno: { localId }, createdAt: enRango },
      select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true, turnoId: true },
    }),
    db.pagoProveedor.findMany({ where: { localOrigenId: localId, fecha: enRango }, select: SELECT_PAGO }),
    db.pagoGasto.findMany({ where: { localOrigenId: localId, fecha: enRango }, select: SELECT_PAGO }),
    db.cierrePreparacion.findMany({
      where: { localId, estado: "CERRADO_SIN_CONTEO", cerradoSinConteoEn: enRango },
      select: { turnoId: true, cerradoSinConteoEn: true },
    }),
    // Sin medio ni caja: se informa el total como dinero sin ubicar.
    db.movimientoCuenta.aggregate({
      where: { localId, tipo: "PAGO", direccion: "CREDITO", createdAt: enRango },
      _sum: { monto: true },
      _count: { _all: true },
    }),
  ]);

  const clasificados = clasificarMovimientos(
    movimientos,
    await vinculosDeMovimientos(db, movimientos.map((m) => m.id))
  );

  const turnoIds = new Set();
  for (const v of ventas) if (v.turnoId != null) turnoIds.add(v.turnoId);
  for (const m of movimientos) turnoIds.add(m.turnoId);
  for (const p of [...pagosProveedor, ...pagosGasto]) if (p.turnoId != null) turnoIds.add(p.turnoId);
  for (const c of cortesSinConteo) turnoIds.add(c.turnoId);

  const filasDeCaja = turnoIds.size
    ? await db.turno.findMany({
        where: { id: { in: [...turnoIds] } },
        select: {
          id: true,
          localId: true,
          apertura: true,
          cierre: true,
          cierreEnPreparacionEn: true,
          anuladoEn: true,
          operadorId: true,
          vendedorId: true,
          diferenciaEfectivo: true,
          operador: { select: { nombre: true } },
          vendedor: { select: { nombre: true } },
        },
      })
    : [];

  return armarLecturaTesoreria({
    localId,
    ventas,
    movimientos: clasificados,
    pagosProveedor,
    pagosGasto,
    cajas: filasDeCaja.map((t) => ({
      ...t,
      operadorNombre: t.operador?.nombre ?? null,
      vendedorNombre: t.vendedor?.nombre ?? null,
    })),
    cierresSinConteo: cortesSinConteo.map((c) => ({ turnoId: c.turnoId, instante: c.cerradoSinConteoEn })),
    cuentaCorrienteSinUbicar: {
      monto: Number(cuentaCorriente?._sum?.monto ?? 0),
      cantidad: cuentaCorriente?._count?._all ?? 0,
    },
    ...(turnoComercialDe ? { turnoComercialDe } : {}),
  });
}
