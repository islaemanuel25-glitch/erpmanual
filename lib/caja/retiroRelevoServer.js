// lib/caja/retiroRelevoServer.js
//
// Piezas de SERVIDOR del retiro con corte congelado. Todo lo que toca Prisma
// vive acá; la política y la aritmética viven en lib/caja/retiroRelevo.js, que
// es puro. Mismo reparto que ya usan arqueoServer.js y cierreRelevoServer.js.
//
// Regla de aislamiento, sin excepciones: cada consulta se ancla al `localId`
// resuelto del alcance de la sesión. Un corte de otro local no se lee ni se
// escribe aunque el token sea válido.

import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { calcularEfectivoEsperado } from "./efectivoEsperado";
import { contextoRelevo } from "./cierreRelevoServer";
import { tokenValido } from "./cierreRelevo";
import { ESTADO_RETIRO } from "./retiroRelevo";

/**
 * Carga una preparación de retiro por token, ya validada contra el alcance de la
 * sesión.
 *
 * El token NO alcanza por sí solo: se exige además sesión autenticada, permiso y
 * que la preparación pertenezca al local del contexto activo. El token evita que
 * la pantalla dependa del operador activo —que es una cookie compartida por todo
 * el navegador— pero no reemplaza a la autenticación.
 *
 * Un token de otro local devuelve 404, no 403: revelar "existe pero no es tuyo"
 * convierte al token en un oráculo.
 */
export async function cargarRetiroPorToken(req, tokenRaw, tx = prisma) {
  const ctx = await contextoRelevo(req);
  if (ctx.error) return ctx;

  if (!tokenValido(tokenRaw)) {
    return { error: "Retiro no encontrado", status: 404 };
  }

  const retiro = await tx.retiroPreparacion.findFirst({
    where: { token: String(tokenRaw), localId: ctx.localId },
    include: {
      turno: {
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, cierreEnPreparacionEn: true,
          anuladoEn: true, montoInicial: true,
        },
      },
    },
  });

  if (!retiro) return { error: "Retiro no encontrado", status: 404 };

  // El vínculo con el turno se revalida SIEMPRE, no se da por hecho por haber
  // encontrado la fila: el turno pudo cambiar de estado entre pedidos.
  if (!retiro.turno || retiro.turno.localId !== ctx.localId) {
    return { error: "Retiro no encontrado", status: 404 };
  }

  return { ...ctx, retiro };
}

/**
 * EL CORTE del retiro: efectivo esperado + frontera del universo del turno.
 *
 * Es la MISMA lógica que `calcularCorte` del cierre, y se repite acá en vez de
 * compartirse por una diferencia real: el cierre necesita además
 * `cantidadVentasCorte`, que termina en `Turno.cantidadVentas` al cerrar. Un
 * retiro no cierra nada, así que ese conteo no tiene dónde ir y calcularlo sería
 * trabajo que nadie lee.
 *
 * LA FRONTERA VA POR ID, NO POR TIMESTAMP. Dos filas creadas en el mismo
 * milisegundo son indistinguibles por fecha, y una venta que entra justo durante
 * el corte podría caer de los dos lados o de ninguno.
 *
 * El máximo de venta se toma sobre TODAS las ventas del turno —incluidas las
 * internas, que no son cobros— porque la frontera define qué pertenece al
 * período, no qué suma plata.
 */
export async function calcularCorteRetiro(turno, tx = prisma) {
  const [ventas, movimientos, ultimaVenta, ultimoMovimiento] = await Promise.all([
    tx.venta.findMany({
      where: whereVentaComercial({ turnoId: turno.id }),
      select: {
        total: true, formaPago: true, esFiado: true, comisionBancaria: true, netoRecibido: true,
        // Igual que en el arqueo: el efectivo esperado no cambia; lo que puede
        // quedar incompleto es la información derivada de la comisión.
        comisionPendiente: true,
        pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
      },
    }),
    tx.cajaMovimiento.findMany({
      where: { turnoId: turno.id },
      select: { tipo: true, monto: true },
    }),
    tx.venta.findFirst({
      where: { turnoId: turno.id },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
    tx.cajaMovimiento.findFirst({
      where: { turnoId: turno.id },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
  ]);

  const calculo = calcularEfectivoEsperado({
    montoInicial: turno.montoInicial,
    ventas,
    movimientos,
  });

  return {
    calculo,
    efectivoEsperadoCorte: calculo.efectivoEsperado,
    ultimaVentaId: ultimaVenta?.id ?? null,
    ultimoMovimientoId: ultimoMovimiento?.id ?? null,
  };
}

/**
 * Últimos ids del turno AHORA, para detectar actividad posterior al corte.
 *
 * Es lo único que se consulta en vivo en toda la pantalla de conteo, y sirve
 * exclusivamente para mostrar un aviso. Ningún número monetario sale de acá.
 */
export async function fronteraActual(turnoId, tx = prisma) {
  const [ultimaVenta, ultimoMovimiento] = await Promise.all([
    tx.venta.findFirst({ where: { turnoId }, orderBy: { id: "desc" }, select: { id: true } }),
    tx.cajaMovimiento.findFirst({
      where: { turnoId },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
  ]);
  return {
    ultimaVentaActualId: ultimaVenta?.id ?? null,
    ultimoMovimientoActualId: ultimoMovimiento?.id ?? null,
  };
}

/** Bloqueo de la fila de la preparación, para que dos confirmaciones no se crucen. */
export async function bloquearRetiro(tx, retiroId) {
  await tx.$queryRaw`SELECT id FROM "RetiroPreparacion" WHERE id = ${retiroId} FOR UPDATE`;
}

/**
 * ¿Este turno tiene un retiro a medio contar?
 *
 * Se usa desde el cierre para la exclusión mutua, y desde el propio retiro para
 * no abrir dos. Devuelve la fila, no un booleano: quien pregunta casi siempre
 * quiere además el token, para poder ofrecer "continuá el que ya tenés".
 */
export async function retiroEnPreparacion(turnoId, tx = prisma) {
  return tx.retiroPreparacion.findFirst({
    where: { turnoId, estado: ESTADO_RETIRO.PREPARANDO },
    select: { id: true, token: true, corteEn: true },
  });
}

/** Serializa una preparación para la UI, con los Decimal ya en número. */
export function serializarRetiroPreparacion(r) {
  if (!r) return null;
  return {
    id: r.id,
    token: r.token,
    turnoId: r.turnoId,
    localId: r.localId,
    estado: r.estado,
    corteEn: r.corteEn,
    iniciadoPorUsuarioId: r.iniciadoPorUsuarioId,
    iniciadoPorOperadorId: r.iniciadoPorOperadorId ?? null,
    efectivoEsperadoCorte: Number(r.efectivoEsperadoCorte),
    ultimaVentaId: r.ultimaVentaId ?? null,
    ultimoMovimientoId: r.ultimoMovimientoId ?? null,
    desgloseCambio: r.desgloseCambio ?? {},
    totalCambio: Number(r.totalCambio),
    efectivoRetiradoEsperado: Number(r.efectivoRetiradoEsperado),
    desgloseRetiroContado: r.desgloseRetiroContado ?? null,
    totalRetiroContado: r.totalRetiroContado != null ? Number(r.totalRetiroContado) : null,
    totalCajonDerivado: r.totalCajonDerivado != null ? Number(r.totalCajonDerivado) : null,
    diferencia: r.diferencia != null ? Number(r.diferencia) : null,
    observacion: r.observacion ?? null,
    confirmadoEn: r.confirmadoEn ?? null,
    arqueoCajaId: r.arqueoCajaId ?? null,
    canceladoEn: r.canceladoEn ?? null,
    motivoCancelacion: r.motivoCancelacion ?? null,
  };
}
