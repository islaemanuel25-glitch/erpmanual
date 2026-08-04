// lib/caja/arqueoServer.js
//
// Piezas de servidor compartidas por las rutas de arqueo. Todo lo que toca
// Prisma vive acá; la política y la aritmética viven en lib/caja/arqueo.js y
// lib/caja/efectivoEsperado.js, que son puras y se prueban sin base.
//
// Regla de aislamiento, sin excepciones: cada consulta se ancla al `turnoId` Y
// al `localId` resueltos del alcance de la sesión. Un turno de otro local no se
// lee ni se escribe aunque el id sea válido.

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { calcularEfectivoEsperado } from "./efectivoEsperado";
import { normalizarConfig, CONFIG_ARQUEO_DEFAULT } from "./arqueo";

/**
 * Resuelve sesión, permiso y alcance de local, y devuelve el turno pedido —o el
 * turno abierto del cajero si no se pide uno.
 *
 * @returns {{ error?:string, status?:number, needsContexto?:boolean,
 *             session?:object, localId?:number, turno?:object|null }}
 */
export async function contextoArqueo(req, { turnoId = null, exigirAbierto = true } = {}) {
  const session = getUsuarioSession(req);
  if (!session) return { error: "No autenticado", status: 401 };

  const perm = checkPerm(session, "pos.usar");
  if (!perm.ok) return { error: perm.error, status: perm.status };

  const scope = await resolveScope(req, {
    explicitLocalId: req.nextUrl?.searchParams?.get("localId") ?? null,
  });
  if (scope.error) {
    return { error: scope.error, status: scope.status, needsContexto: scope.needsContexto };
  }
  const localId = scope.localId;

  const id = Number(turnoId);
  const turno = id
    ? // El localId va en el WHERE, no en una validación posterior: un turno de
      // otro local simplemente no existe para esta consulta.
      await prisma.turno.findFirst({
        where: { id, localId },
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, montoInicial: true,
        },
      })
    : await prisma.turno.findFirst({
        where: { localId, vendedorId: session.id, cierre: null },
        orderBy: { apertura: "desc" },
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, montoInicial: true,
        },
      });

  if (id && !turno) return { error: "Turno no encontrado", status: 404 };
  if (exigirAbierto && turno?.cierre) {
    return { error: "El turno ya está cerrado", status: 409 };
  }

  return { session, localId, turno: turno || null };
}

/** Configuración de arqueo del local, ya normalizada y con defaults. */
export async function configArqueoDeLocal(localId) {
  const cfg = await prisma.configuracionLocal.findUnique({
    where: { localId },
    select: {
      arqueoCajaActivo: true,
      intervaloArqueoMinutos: true,
      toleranciaPostergacionMinutos: true,
      postergacionCajeroMinutos: true,
      requiereAutorizacionPostergacion: true,
    },
  });
  // Un local sin fila conserva el comportamiento histórico: sin alertas.
  if (!cfg) return { ...CONFIG_ARQUEO_DEFAULT };
  return normalizarConfig({
    arqueoCajaActivo: cfg.arqueoCajaActivo ?? CONFIG_ARQUEO_DEFAULT.arqueoCajaActivo,
    intervaloArqueoMinutos: cfg.intervaloArqueoMinutos ?? CONFIG_ARQUEO_DEFAULT.intervaloArqueoMinutos,
    toleranciaPostergacionMinutos:
      cfg.toleranciaPostergacionMinutos ?? CONFIG_ARQUEO_DEFAULT.toleranciaPostergacionMinutos,
    postergacionCajeroMinutos:
      cfg.postergacionCajeroMinutos ?? CONFIG_ARQUEO_DEFAULT.postergacionCajeroMinutos,
    requiereAutorizacionPostergacion:
      cfg.requiereAutorizacionPostergacion ?? CONFIG_ARQUEO_DEFAULT.requiereAutorizacionPostergacion,
  });
}

/**
 * Efectivo esperado del turno AHORA, calculado en el servidor.
 *
 * Nunca se acepta un total enviado por el cliente: entre que el cajero abre el
 * formulario y confirma el conteo puede entrar una venta, y el esperado tiene
 * que incluirla. Acepta un `tx` para correr dentro de la transacción de
 * registro y leer exactamente el mismo estado que se persiste.
 */
export async function calcularEsperadoDeTurno(turno, tx = prisma) {
  const [ventas, movimientos] = await Promise.all([
    tx.venta.findMany({
      where: whereVentaComercial({ turnoId: turno.id }),
      select: {
        total: true, formaPago: true, esFiado: true, comisionBancaria: true, netoRecibido: true,
        pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
      },
    }),
    tx.cajaMovimiento.findMany({
      where: { turnoId: turno.id },
      select: { tipo: true, monto: true },
    }),
  ]);

  return calcularEfectivoEsperado({
    montoInicial: turno.montoInicial,
    ventas,
    movimientos,
  });
}

/**
 * Fondo objetivo configurado del local, o `null` si no lo configuraron.
 *
 * Se devuelve el crudo, sin aplicar el fallback: quien decide es
 * `resolverFondoObjetivo`, que es puro y probable. Acá solo se lee.
 */
export async function fondoObjetivoDeLocal(localId, tx = prisma) {
  const cfg = await tx.configuracionLocal.findUnique({
    where: { localId },
    select: { fondoObjetivoCaja: true },
  });
  return cfg?.fondoObjetivoCaja ?? null;
}

/** Último arqueo del turno (parcial o final), para anclar el próximo período. */
export async function ultimoArqueoDeTurno(turnoId, tx = prisma) {
  return tx.arqueoCaja.findFirst({
    where: { turnoId },
    orderBy: { fechaHora: "desc" },
    select: { id: true, fechaHora: true, tipo: true },
  });
}

/**
 * Postergaciones del turno posteriores al último arqueo. Las anteriores ya
 * quedaron saldadas por ese arqueo y no deben seguir corriendo la alerta.
 */
export async function postergacionesVigentes(turnoId, desde, tx = prisma) {
  return tx.arqueoPostergacion.findMany({
    where: { turnoId, ...(desde ? { creadoEn: { gt: desde } } : {}) },
    orderBy: { venceEn: "desc" },
    select: { id: true, venceEn: true, motivo: true, postergadoPorId: true, alertaProgramadaPara: true },
  });
}

/** Serializa un arqueo para la UI, con los Decimal ya en número. */
export function serializarArqueo(a) {
  if (!a) return null;
  return {
    id: a.id,
    turnoId: a.turnoId,
    tipo: a.tipo,
    fechaHora: a.fechaHora,
    periodoDesde: a.periodoDesde,
    periodoHasta: a.periodoHasta,
    efectivoEsperado: Number(a.efectivoEsperado),
    efectivoContado: Number(a.efectivoContado),
    diferencia: Number(a.diferencia),
    // Circuito del retiro. `null` en los registros históricos, que fueron
    // conteos puros: la pantalla los necesita para NO llamarlos "retiro".
    efectivoRetirado: a.efectivoRetirado != null ? Number(a.efectivoRetirado) : null,
    fondoObjetivo: a.fondoObjetivo != null ? Number(a.fondoObjetivo) : null,
    fondoDejado: a.fondoDejado != null ? Number(a.fondoDejado) : null,
    cajaMovimientoRetiroId: a.cajaMovimientoRetiroId ?? null,
    estadoEntrega: a.estadoEntrega ?? null,
    observacion: a.observacion,
    minutosDemora: a.minutosDemora,
    fuePostergado: a.fuePostergado,
    cantidadPostergaciones: a.cantidadPostergaciones,
    alertaProgramadaPara: a.alertaProgramadaPara,
    realizadoPor: a.realizadoPor?.nombre ?? null,
    cajero: a.usuario?.nombre ?? null,
    operador: a.operador?.nombre ?? null,
  };
}
