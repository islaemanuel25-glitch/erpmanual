// lib/caja/cierreRelevoServer.js
//
// Piezas de SERVIDOR del cierre con relevo. Todo lo que toca Prisma vive acá; la
// política y la aritmética viven en lib/caja/cierreRelevo.js, que es puro.
// Mismo reparto que ya usan arqueoServer.js y arqueo.js.
//
// Regla de aislamiento, sin excepciones: cada consulta se ancla al `localId`
// resuelto del alcance de la sesión. Un corte de otro local no se lee ni se
// escribe aunque el token sea válido.

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { calcularEfectivoEsperado } from "./efectivoEsperado";
import {
  ESTADO_CIERRE,
  ESTADO_CAMBIO,
  estadoDelTurno,
  ESTADO_TURNO,
  tokenValido,
  cierreAtrasado,
} from "./cierreRelevo";

/**
 * Sesión + permiso + alcance, en un solo lugar.
 *
 * `pos.usar` es el mismo permiso que ya gobierna abrir, cerrar, vender y retirar.
 * NO se inventa un permiso nuevo para esta etapa: el cierre con relevo es el
 * mismo acto de cerrar caja, hecho en dos tiempos, y quien podía cerrar sigue
 * pudiendo. Si más adelante hiciera falta separarlo, es una decisión de negocio
 * que hay que tomar explícitamente, no un efecto secundario de esta subetapa.
 */
export async function contextoRelevo(req) {
  const session = getUsuarioSession(req);
  if (!session) return { error: "No autenticado", status: 401 };

  const perm = checkPerm(session, "pos.usar");
  if (!perm.ok) return { error: perm.error, status: perm.status };

  const scope = await resolveScope(req);
  if (scope.error) {
    return { error: scope.error, status: scope.status, needsContexto: scope.needsContexto };
  }

  return { session, localId: scope.localId, grupoId: scope.grupoId };
}

/**
 * Carga un corte por token, ya validado contra el alcance de la sesión.
 *
 * El token NO alcanza por sí solo. Se exige además sesión autenticada, permiso y
 * que el corte pertenezca al local del contexto activo: el token evita que la
 * pantalla dependa del operador activo —que es una cookie compartida por todo el
 * navegador— pero no reemplaza a la autenticación.
 *
 * Un token de otro local devuelve 404, no 403: revelar "existe pero no es tuyo"
 * convierte al token en un oráculo.
 */
export async function cargarCierrePorToken(req, tokenRaw, tx = prisma) {
  const ctx = await contextoRelevo(req);
  if (ctx.error) return ctx;

  if (!tokenValido(tokenRaw)) {
    return { error: "Cierre no encontrado", status: 404 };
  }

  const cierre = await tx.cierrePreparacion.findFirst({
    where: { token: String(tokenRaw), localId: ctx.localId },
    include: {
      turno: {
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, cierreEnPreparacionEn: true,
          anuladoEn: true, montoInicial: true,
        },
      },
      cambioPendiente: { select: { id: true, estado: true, turnoDestinoId: true } },
    },
  });

  if (!cierre) return { error: "Cierre no encontrado", status: 404 };

  // El vínculo con el turno original se revalida SIEMPRE, no se da por hecho por
  // haber encontrado la fila: el turno pudo cambiar de estado entre pedidos.
  if (!cierre.turno || cierre.turno.localId !== ctx.localId) {
    return { error: "Cierre no encontrado", status: 404 };
  }

  return { ...ctx, cierre };
}

/**
 * EL CORTE: efectivo esperado + frontera del universo del turno.
 *
 * LA FRONTERA VA POR ID, NO POR TIMESTAMP
 *
 * Dos filas creadas en el mismo milisegundo son indistinguibles por fecha, y una
 * venta que entra justo durante el corte podría caer de los dos lados o de
 * ninguno. Con `id <= ultimaVentaId` el universo queda cerrado sin ambigüedad y
 * sin depender del reloj.
 *
 * El máximo de venta se toma sobre TODAS las ventas del turno —incluidas las
 * internas, que no son cobros— porque la frontera define qué pertenece al turno,
 * no qué suma plata. La CANTIDAD, en cambio, cuenta solo las comerciales, que es
 * lo que ya guarda `Turno.cantidadVentas` en el cierre clásico.
 */
export async function calcularCorte(turno, tx = prisma) {
  const [ventas, movimientos, ultimaVenta, ultimoMovimiento] = await Promise.all([
    tx.venta.findMany({
      where: whereVentaComercial({ turnoId: turno.id }),
      select: {
        total: true, formaPago: true, esFiado: true, comisionBancaria: true, netoRecibido: true,
        // Igual que en el arqueo: el efectivo esperado no cambia, los renglones
        // informativos de comisión y neto digital sí pueden estar incompletos.
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
    cantidadVentasCorte: ventas.length,
  };
}

/**
 * Topes explícitos de toda transacción de este circuito.
 *
 * Estas transacciones toman un lock de fila sobre el Turno. Con el default
 * implícito, cuánto puede esperar el segundo pedido dependía de la versión de
 * Prisma; acá es una decisión. Mismos números que /retiros/registrar, que ya
 * hace lo mismo sobre la misma fila.
 */
export const OPCIONES_TX = { maxWait: 5000, timeout: 10000 };

/** Bloqueo de la fila del turno. Serializa las operaciones de ESA caja y ninguna otra. */
export async function bloquearTurno(tx, turnoId) {
  await tx.$queryRaw`SELECT id FROM "Turno" WHERE id = ${turnoId} FOR UPDATE`;
}

/** Bloqueo de la fila del corte, para que dos confirmaciones no se crucen. */
export async function bloquearCierre(tx, cierreId) {
  await tx.$queryRaw`SELECT id FROM "CierrePreparacion" WHERE id = ${cierreId} FOR UPDATE`;
}

/** Serializa un corte para la UI, con los Decimal ya en número. */
export function serializarCierre(c, ahora = new Date()) {
  if (!c) return null;
  return {
    id: c.id,
    token: c.token,
    turnoId: c.turnoId,
    localId: c.localId,
    estado: c.estado,
    iniciadoEn: c.iniciadoEn,
    corteEn: c.corteEn,
    venceEn: c.venceEn,
    atrasado: cierreAtrasado(c, ahora),
    iniciadoPorUsuarioId: c.iniciadoPorUsuarioId,
    iniciadoPorOperadorId: c.iniciadoPorOperadorId ?? null,
    efectivoEsperadoCorte: Number(c.efectivoEsperadoCorte),
    ultimaVentaId: c.ultimaVentaId ?? null,
    ultimoMovimientoId: c.ultimoMovimientoId ?? null,
    cantidadVentasCorte: c.cantidadVentasCorte,
    // El cambio separado ANTES del corte, ya congelado.
    desgloseCambio: c.desgloseCambio ?? null,
    totalCambio: c.totalCambio != null ? Number(c.totalCambio) : null,
    efectivoRetiradoEsperado:
      c.efectivoRetiradoEsperado != null ? Number(c.efectivoRetiradoEsperado) : null,
    // `false` en los cortes tomados con el orden anterior, que eligen el cambio
    // al final. La pantalla usa esto para saber qué contar.
    cambioSeparadoEnCorte: c.efectivoRetiradoEsperado != null,
    // El conteo del retiro, cargado al confirmar.
    desgloseRetiroContado: c.desgloseRetiroContado ?? null,
    totalRetiroContado: c.totalRetiroContado != null ? Number(c.totalRetiroContado) : null,
    // El equivalente del cajón completo. Mismo significado de siempre.
    desgloseContado: c.desgloseContado ?? null,
    totalContado: c.totalContado != null ? Number(c.totalContado) : null,
    retiroFinal: c.retiroFinal != null ? Number(c.retiroFinal) : null,
    diferencia: c.diferencia != null ? Number(c.diferencia) : null,
    observacion: c.observacion ?? null,
    confirmadoEn: c.confirmadoEn ?? null,
    arqueoFinalId: c.arqueoFinalId ?? null,
  };
}

/** Bloqueo de la fila del sobre de cambio, para que no se toque mientras se cierra. */
export async function bloquearCambio(tx, cambioId) {
  await tx.$queryRaw`SELECT id FROM "CambioPendiente" WHERE id = ${cambioId} FOR UPDATE`;
}

/** Serializa un sobre de cambio pendiente. */
export function serializarCambio(x) {
  if (!x) return null;
  return {
    id: x.id,
    localId: x.localId,
    estado: x.estado,
    turnoOrigenId: x.turnoOrigenId,
    operadorOrigenId: x.operadorOrigenId ?? null,
    dejadoEn: x.dejadoEn,
    total: Number(x.total),
    desglose: x.desglose ?? {},
    observacion: x.observacion ?? null,
    reservadoPorUsuarioId: x.reservadoPorUsuarioId ?? null,
    reservadoPorOperadorId: x.reservadoPorOperadorId ?? null,
    reservadoEn: x.reservadoEn ?? null,
    reservaVenceEn: x.reservaVenceEn ?? null,
    turnoDestinoId: x.turnoDestinoId ?? null,
    recibidoEn: x.recibidoEn ?? null,
    totalRecibido: x.totalRecibido != null ? Number(x.totalRecibido) : null,
    desgloseRecibido: x.desgloseRecibido ?? null,
    diferencia: x.diferencia != null ? Number(x.diferencia) : null,
    motivoDiferencia: x.motivoDiferencia ?? null,
    // Nombres, cuando la consulta los trajo.
    operadorOrigen: x.turnoOrigen?.operador?.nombre ?? null,
    cajeroOrigen: x.turnoOrigen?.vendedor?.nombre ?? null,
  };
}

/**
 * Libera las reservas de cambio vencidas de un local y devuelve cuántas volvieron
 * a DISPONIBLE.
 *
 * Se ejecuta al listar, no por un job: el momento en que a alguien le importa que
 * un sobre esté libre es justo cuando abre la pantalla para tomarlo. Un cron
 * agregaría infraestructura para adelantar unos segundos algo que igual se
 * resuelve solo.
 *
 * El UPDATE es CONDICIONAL —`estado = RESERVADO AND reservaVenceEn < ahora`— así
 * que dos listados simultáneos no pueden liberar dos veces ni pisar una reserva
 * que se acaba de renovar. No toca las que ya tienen `turnoDestinoId`: esas ya
 * consumieron el sobre.
 */
export async function liberarReservasVencidas(localId, ahora = new Date(), tx = prisma) {
  const { count } = await tx.cambioPendiente.updateMany({
    where: {
      localId,
      estado: ESTADO_CAMBIO.RESERVADO,
      turnoDestinoId: null,
      reservaVenceEn: { lt: ahora },
    },
    data: {
      estado: ESTADO_CAMBIO.DISPONIBLE,
      reservadoPorUsuarioId: null,
      reservadoPorOperadorId: null,
      reservadoEn: null,
      reservaVenceEn: null,
    },
  });
  return count;
}

/**
 * Marca como VENCIDOS los cortes que pasaron su plazo sin confirmar.
 *
 * OJO: esto NO libera el turno. `VENCIDO` es solo una etiqueta de atraso para
 * que aparezca como pendiente de resolución; el corte sigue congelado, el turno
 * sigue sin operar y el cierre se puede confirmar igual. Ver
 * `cierreConfirmable`, que acepta PREPARANDO y VENCIDO por igual.
 */
export async function marcarCortesVencidos(localId, ahora = new Date(), tx = prisma) {
  const { count } = await tx.cierrePreparacion.updateMany({
    where: { localId, estado: ESTADO_CIERRE.PREPARANDO, venceEn: { lt: ahora } },
    data: { estado: ESTADO_CIERRE.VENCIDO },
  });
  return count;
}

/**
 * Chequeo compartido: ¿este turno todavía puede sostener un cierre en curso?
 *
 * Devuelve un error listo para responder, o `null` si está todo bien.
 */
export function validarTurnoDelCierre(turno) {
  const estado = estadoDelTurno(turno);
  if (estado === ESTADO_TURNO.CERRADO) {
    return { error: "El turno ya fue cerrado.", status: 409 };
  }
  if (estado === ESTADO_TURNO.ANULADO) {
    return { error: "El turno fue anulado.", status: 409 };
  }
  if (estado !== ESTADO_TURNO.CIERRE_EN_PREPARACION) {
    return { error: "El turno no tiene un corte de cierre tomado.", status: 409 };
  }
  return null;
}
