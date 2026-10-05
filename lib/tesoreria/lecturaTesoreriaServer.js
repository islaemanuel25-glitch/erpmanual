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
//   · las verificaciones de efectivo VIGENTES que cubren esos movimientos, con
//     todas sus fotos (`verificacionesVigentesDe`);
//   · y al final los datos de las cajas que aparecieron, en una sola consulta.

import { whereVentaComercial } from "../ventas/filtroVentaComercial.js";
import { fechaArgentinaISO, getRangoArgentina } from "../fechas/rangoArgentina.js";
import { fechaOperativaParaGuardar } from "../caja/turnoOperativo.js";
import { rangoFinanciero } from "../finanzas/periodoFinanciero.js";
import { clasificarMovimientos } from "../finanzas/movimientosDeCaja.js";
import { vinculosDeMovimientos } from "../finanzas/movimientosDeCajaServer.js";
import { vigenciasDeUbicaciones } from "../semanaOperativa/semanaOperativaServer.js";
import { armarLecturaTesoreria } from "./lecturaTesoreria.js";
import { formatoDeVerificacion, verificacionesVigentesDe } from "./verificacionEfectivoLectura.js";

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

const SELECT_PAGO = { id: true, fecha: true, monto: true, medio: true, turnoId: true, cajaMovimientoId: true, nota: true };
// Lo que se MUESTRA de cada pago sale de sus relaciones reales, en la misma
// consulta (no una por pago): el proveedor de la cuenta, o el gasto con su
// categoría. Nunca del motivo libre del movimiento de caja.
const SELECT_PAGO_PROVEEDOR = {
  ...SELECT_PAGO,
  cuenta: { select: { pedidoProveedorId: true, proveedor: { select: { nombre: true } } } },
};
const SELECT_PAGO_GASTO = {
  ...SELECT_PAGO,
  gasto: { select: { id: true, concepto: true, beneficiario: true, categoria: { select: { nombre: true } } } },
};

/**
 * El rango de instantes de un período de Tesorería, con la MISMA semántica de
 * Día/Semana/Mes que Finanzas: `rangoFinanciero` con la semana operativa de la
 * ubicación, cortado en días argentinos.
 */
export async function rangoDeTesoreria(db, { localId, unidad, desplazamiento, hoy, rangoFijo = null } = {}) {
  const vigencias = (await vigenciasDeUbicaciones(db, [localId])).get(localId) || [];
  // "Otro": el rango elegido, ya validado por `leerRangoElegido`. Pasa por el
  // MISMO `getRangoArgentina` que las unidades calculadas.
  const rango = rangoFijo ? { desde: rangoFijo.desde, hasta: rangoFijo.hasta } : rangoFinanciero({ unidad, desplazamiento, hoy, vigencias });
  const { fechaInicio, fechaFin } = getRangoArgentina(rango.desde, rango.hasta);
  // Las vigencias viajan para que quien describe el período (la semana del
  // local) use las MISMAS que cortaron el rango, sin volver a leerlas.
  return { ...rango, fechaInicio, fechaFin, vigencias };
}

/**
 * @param {object} db  cliente Prisma
 * @param {{localId:number, fechaInicio:Date, fechaFin:Date, grupoDe?:Function}} args
 *   `fechaInicio`/`fechaFin` son los instantes del corte argentino del período;
 *   de ellos salen también los días contra los que se mira la fecha operativa.
 */
export async function leerTesoreria(db, { localId, fechaInicio, fechaFin, grupoDe } = {}) {
  const enRango = { gte: fechaInicio, lte: fechaFin };

  // QUÉ ENTRA AL PERÍODO. Una caja con turno operativo entra ENTERA por su
  // fecha operativa: sus ventas, entregas y pagos, aunque alguno haya pasado la
  // medianoche: la fecha es la que la apertura fijó para la jornada del turno.
  // Los hechos de una caja SIN turno (anterior al turno operativo) y los que no
  // son de ninguna caja entran por su instante, como siempre. La matemática de
  // la base no cambia: cambia a qué día se atribuye lo de una caja.
  const diasDelPeriodo = {
    gte: fechaOperativaParaGuardar(fechaArgentinaISO(fechaInicio)),
    lte: fechaOperativaParaGuardar(fechaArgentinaISO(fechaFin)),
  };
  // Por relación y no con una consulta previa de ids: el número de consultas
  // de la lectura es fijo y su candado lo cuenta (tesoreriaApi, sección E).
  const porCaja = { turno: { localId, fechaOperativa: diasDelPeriodo } };
  // Por instante, salvo que la caja tenga fecha operativa: esa ya entró —o
  // quedó afuera— por la suya.
  const porInstante = (campo) => ({
    [campo]: enRango,
    OR: [{ turnoId: null }, { turno: { fechaOperativa: null } }],
  });

  // ORDEN EXPLÍCITO POR id en las cinco. Con el OR por fecha operativa Postgres
  // elige otro plan según el período y las filas salían en otro orden: el Día
  // y un «Otro» del mismo día devolvían las mismas entregas desordenadas. La
  // lectura del mismo período tiene que ser la misma, también en el orden.
  const porId = { id: "asc" };
  const [ventas, movimientos, pagosProveedor, pagosGasto, cortesSinConteo, cuentaCorriente] = await Promise.all([
    db.venta.findMany({
      where: whereVentaComercial({ localId, OR: [porInstante("fecha"), porCaja] }),
      select: SELECT_VENTA,
      orderBy: porId,
    }),
    db.cajaMovimiento.findMany({
      where: {
        turno: { localId },
        OR: [{ createdAt: enRango, turno: { fechaOperativa: null } }, porCaja],
      },
      select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true, turnoId: true },
      orderBy: porId,
    }),
    db.pagoProveedor.findMany({
      where: { localOrigenId: localId, OR: [porInstante("fecha"), porCaja] },
      select: SELECT_PAGO_PROVEEDOR,
      orderBy: porId,
    }),
    db.pagoGasto.findMany({
      where: { localOrigenId: localId, OR: [porInstante("fecha"), porCaja] },
      select: SELECT_PAGO_GASTO,
      orderBy: porId,
    }),
    db.cierrePreparacion.findMany({
      where: {
        localId,
        estado: "CERRADO_SIN_CONTEO",
        OR: [{ cerradoSinConteoEn: enRango, turno: { fechaOperativa: null } }, porCaja],
      },
      select: { turnoId: true, cerradoSinConteoEn: true },
      orderBy: porId,
    }),
    // Sin medio ni caja: se informa el total como dinero sin ubicar.
    db.movimientoCuenta.aggregate({
      where: { localId, tipo: "PAGO", direccion: "CREDITO", createdAt: enRango },
      _sum: { monto: true },
      _count: { _all: true },
    }),
  ]);

  const idsDeMovimientos = movimientos.map((m) => m.id);
  const [vinculos, verificaciones] = await Promise.all([
    vinculosDeMovimientos(db, idsDeMovimientos),
    // Las vigentes que cubren cualquier movimiento del período —no solo los que
    // hoy son entrega: uno que perdió el vínculo también tiene que avisar—.
    verificacionesVigentesDe(db, idsDeMovimientos),
  ]);
  const clasificados = clasificarMovimientos(movimientos, vinculos);

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
          turnoOperativoId: true,
          fechaOperativa: true,
          turnoOperativo: { select: { nombre: true, orden: true } },
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
      turnoOperativoNombre: t.turnoOperativo?.nombre ?? null,
      turnoOperativoOrden: t.turnoOperativo?.orden ?? null,
    })),
    cierresSinConteo: cortesSinConteo.map((c) => ({ turnoId: c.turnoId, instante: c.cerradoSinConteoEn })),
    cuentaCorrienteSinUbicar: {
      monto: Number(cuentaCorriente?._sum?.monto ?? 0),
      cantidad: cuentaCorriente?._count?._all ?? 0,
    },
    ...(grupoDe ? { grupoDe } : {}),
    verificaciones: verificaciones.map(formatoDeVerificacion),
  });
}
