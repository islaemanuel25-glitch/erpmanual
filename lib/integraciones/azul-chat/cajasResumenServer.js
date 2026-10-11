// lib/integraciones/azul-chat/cajasResumenServer.js
//
// LAS CONSULTAS DE `cajas_resumen`. Solo lee; el armado es puro y está en
// cajasResumen.js.
//
// El día y las cajas que entran son los de Tesorería: `rangoDeTesoreria` con
// el día como rango fijo y `leerTesoreria`, las mismas funciones que la
// pantalla de Tesorería. Después se leen, en un número fijo de consultas, los
// datos del cierre que Tesorería no mira (inicial, esperado, contado, retiro y
// fondo del cierre), las ventas de ese mismo universo con el `select` del
// reporte, el motivo y el autor de cada movimiento, y el destino que se haya
// registrado en el retiro. Para cada caja abierta, el esperado de ahora sale de
// `calcularEsperadoDeTurno`, la pieza del arqueo.

import { SELECT_RESUMEN_VENTA } from "@/lib/reportes-ventas/resumenVentas";
import { estadoDelTurno, ESTADO_TURNO } from "@/lib/caja/cierreRelevo";
import { calcularEsperadoDeTurno } from "@/lib/caja/arqueoServer";
import { leerTesoreria, rangoDeTesoreria, whereVentasDeTesoreria } from "@/lib/tesoreria/lecturaTesoreriaServer";
import { resolverPedido, elegirTurnoOperativo, armarCajasResumen } from "./cajasResumen.js";

const SELECT_TURNO = Object.freeze({
  id: true,
  apertura: true,
  cierre: true,
  cierreEnPreparacionEn: true,
  anuladoEn: true,
  montoInicial: true,
  montoEsperadoEfectivo: true,
  montoRealEfectivo: true,
  efectivoRetiradoCierre: true,
  fondoDejadoCierre: true,
  destinoRetiroCierre: true,
  recibidoPorCierre: true,
  turnoOperativoId: true,
  fechaOperativa: true,
  turnoOperativo: { select: { nombre: true, orden: true } },
});

/**
 * Ejecuta la capacidad para una autorización ya concedida. El local y el grupo
 * salen de la AUTORIZACIÓN, nunca del cuerpo.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{periodo:unknown, turnoOperativo?:unknown}} parametros
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export async function cajasResumen(autorizacion, parametros, { db, ahora = Date.now() }) {
  const pedido = resolverPedido(parametros, { ahora });
  if (!pedido.ok) return pedido;

  const local = await db.local.findUnique({
    where: { id: autorizacion.localId },
    select: { id: true, nombre: true, activo: true },
  });
  if (!local) {
    return { ok: false, status: 403, codigo: "LOCAL_SIN_GRUPO", error: "El local pedido no existe." };
  }

  let filtro = null;
  if (pedido.turnoOperativo) {
    const turnosDelLocal = await db.turnoOperativo.findMany({
      where: { localId: local.id },
      select: { id: true, nombre: true },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    });
    filtro = elegirTurnoOperativo(pedido.turnoOperativo, turnosDelLocal);
    if (!filtro.ok) return filtro;
  }

  const { fechaInicio, fechaFin } = await rangoDeTesoreria(db, {
    localId: local.id,
    rangoFijo: { desde: pedido.dia, hasta: pedido.dia },
  });
  const lectura = await leerTesoreria(db, { localId: local.id, fechaInicio, fechaFin });

  const turnoIds = lectura.cajas.map((c) => c.turnoId);
  const movimientoIds = lectura.cajas.flatMap((c) => [
    ...c.entregas.map((e) => e.cajaMovimientoId),
    ...c.pagosDesdeCaja.map((p) => p.cajaMovimientoId),
    ...c.movimientosManuales.map((m) => m.cajaMovimientoId),
  ]);

  const [turnos, ventas, movimientos, arqueos] = await Promise.all([
    turnoIds.length
      ? db.turno.findMany({ where: { id: { in: turnoIds }, localId: local.id }, select: SELECT_TURNO })
      : [],
    db.venta.findMany({
      where: whereVentasDeTesoreria({ localId: local.id, fechaInicio, fechaFin }),
      select: { ...SELECT_RESUMEN_VENTA, turnoId: true },
    }),
    movimientoIds.length
      ? db.cajaMovimiento.findMany({
          where: { id: { in: movimientoIds } },
          select: { id: true, motivo: true, createdAt: true, usuario: { select: { nombre: true } } },
        })
      : [],
    movimientoIds.length
      ? db.arqueoCaja.findMany({
          where: { cajaMovimientoRetiroId: { in: movimientoIds } },
          select: { cajaMovimientoRetiroId: true, destino: true, recibidoPor: true },
        })
      : [],
  ]);

  const abiertas = turnos.filter((t) =>
    [ESTADO_TURNO.ABIERTO, ESTADO_TURNO.CIERRE_EN_PREPARACION].includes(estadoDelTurno(t))
  );
  const esperadosVivos = new Map(
    await Promise.all(abiertas.map(async (t) => [t.id, await calcularEsperadoDeTurno(t, db)]))
  );

  return {
    ok: true,
    datos: armarCajasResumen({
      local,
      grupoId: autorizacion.grupoId,
      pedido,
      filtro,
      lectura,
      turnos,
      ventas,
      movimientos,
      arqueos,
      esperadosVivos,
      inicioDelDia: fechaInicio,
    }),
  };
}
