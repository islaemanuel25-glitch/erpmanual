import jwt from "jsonwebtoken";
import { seedAuditoria } from "@/lib/auditoria/contexto";
import { programarFlush } from "@/lib/auditoria/interceptor";
import { programarRevisionPorCosto } from "@/lib/ofertas/disparadorCosto";
import { normalizarPermisos, esAdminPorPermisos } from "@/lib/rbac/permisosSesion";
import { permisosEfectivos } from "@/lib/rbac/permisosDelOperador";

const COOKIE_NAME = "erpazul_sesion";
const MAX_AGE = 60 * 60 * 8;

// ✅ nuevo: grupo activo (solo para admin padre)
export const ACTIVE_GROUP_COOKIE = "erpazul_grupo_activo";

// -----------------------------------------------------
// FIRMAR TOKEN
// -----------------------------------------------------
export function firmarToken(payload) {
  return jwt.sign(payload, process.env.AUTH_SECRET, { expiresIn: MAX_AGE });
}

// -----------------------------------------------------
// VERIFICAR TOKEN
// -----------------------------------------------------
export function verificarToken(token) {
  try {
    return jwt.verify(token, process.env.AUTH_SECRET);
  } catch {
    return null;
  }
}

// Verifica la FIRMA de un token pero ignora su expiración. Se usa solo para el
// voucher de operador en el replay de cola offline: la venta ya se cobró con un
// operador identificado, así que no exigimos token vigente — pero la firma
// (AUTH_SECRET) sigue siendo infalsificable.
export function verificarTokenIgnorandoVencimiento(token) {
  try {
    return jwt.verify(token, process.env.AUTH_SECRET, { ignoreExpiration: true });
  } catch {
    return null;
  }
}

// -----------------------------------------------------
// OBTENER COOKIE VALUE DESDE REQUEST
// -----------------------------------------------------
export function getCookieValue(req, cookieName) {
  const cookie = req.headers.get("cookie") || "";
  const piezas = cookie.split(";").map((c) => c.trim());
  const par = piezas.find((p) => p.startsWith(`${cookieName}=`));
  return par ? decodeURIComponent(par.split("=")[1]) : null;
}

// -----------------------------------------------------
// OBTENER TOKEN DESDE REQUEST
// -----------------------------------------------------
export function getTokenFromRequest(req) {
  return getCookieValue(req, COOKIE_NAME);
}

// -----------------------------------------------------
// OPERADOR ACTIVO, SOLO LA COOKIE
// -----------------------------------------------------
// Lee la cookie del operador sin importar lib/operador.js (evita el ciclo) y
// sin ir a la base. Basta la firma: se usa para RESTAR permisos
// (lib/rbac/permisosDelOperador.js), y ante la duda restar es lo seguro. Quien
// necesite saber de quién es una caja usa `getOperadorActivoDelLocal`, que sí
// valida contra el local.
export function leerOperadorDeCookie(req) {
  const opTok = getCookieValue(req, "erpazul_operador_activo");
  if (!opTok) return null;
  const od = verificarToken(opTok);
  if (!od || od._tipo !== "operador") return null;
  return {
    operadorId: od.operadorId ?? null,
    nombre: od.nombre ?? null,
    localId: od.localId ?? null,
  };
}

// -----------------------------------------------------
// ⭐ OBTENER SESIÓN DEL USUARIO
// -----------------------------------------------------
export function getUsuarioSession(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const data = verificarToken(token);
  if (!data) return null;

  const operadorCookie = leerOperadorDeCookie(req);
  const operadorActivo = operadorCookie !== null;

  const localId =
    data.localId === undefined ||
    data.localId === null ||
    data.localId === "" ||
    Number.isNaN(Number(data.localId))
      ? null
      : Number(data.localId);

  // Con operador activo, los de la cuenta MENOS lo que no es del operador.
  // `esAdmin` se calcula igual: el comodín no se resta como lista, y por eso
  // `operadorActivo` viaja en la sesión para que `tieneAlguno` lo mire.
  const permisos = permisosEfectivos(normalizarPermisos(data.permisos), operadorActivo);
  const esAdmin = esAdminPorPermisos(permisos);

  // ✅ Para admin padre: leer grupo activo desde cookie
  const activeGroupRaw = getCookieValue(req, ACTIVE_GROUP_COOKIE);
  const activeGroupNum =
    activeGroupRaw === undefined ||
    activeGroupRaw === null ||
    activeGroupRaw === "" ||
    Number.isNaN(Number(activeGroupRaw))
      ? null
      : Number(activeGroupRaw);

  const activeGroupId = activeGroupNum && activeGroupNum > 0 ? activeGroupNum : null;

  const session = {
    id: data.id ?? null,
    rolId: data.rolId ?? null,
    localId,
    permisos,
    esAdmin,
    // Snapshot del login (esSistema + nombre canónico DUEÑO_LOCAL). JWT viejos sin
    // el flag → false. Habilita el bypass de operario acotado a session.localId
    // (ver lib/operador.js puedeOperarSinOperador).
    esDuenoLocal: data.esDuenoLocal === true,
    esDeposito: data.esDeposito === true,
    operadorActivo,
    grupoId: esAdmin ? activeGroupId : null,
    grupoActivoId: esAdmin ? activeGroupId : null,
  };

  // Auditoría: sembramos el CONTEXTO COMPLETO (usuario + operador + local) para
  // el interceptor de Prisma, leyendo las cookies inline (sin importar
  // operador.js/contexto.js → evita ciclos). Muchos endpoints no llaman a
  // resolveLocalAndGrupo/getOperadorActivo, así que sembrar acá es lo que
  // garantiza que operador y local no salgan vacíos.
  const operadorId = operadorCookie?.operadorId ?? null;
  const operadorNombre = operadorCookie?.nombre ?? null;
  const opLocalId = operadorCookie?.localId ?? null;
  // Local: local fijo del JWT → local del operador → cookie de contexto (admin).
  let ctxLocalId = session.localId ?? opLocalId ?? null;
  if (!ctxLocalId) {
    const raw = getCookieValue(req, "erpazul_contexto_activo");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        const n = Number(p.localId);
        if (n > 0) ctxLocalId = n;
      } catch {
        // cookie inválida → sin local
      }
    }
  }

  const store = seedAuditoria({
    usuarioId: session.id,
    esAdmin,
    localId: ctxLocalId,
    operadorId,
    operadorNombre,
  });
  // Registrar el flush post-respuesta desde acá (contexto del handler, donde
  // after() sí funciona — a diferencia del interceptor).
  programarFlush(store);

  // Y la revisión de ofertas por cambio de costo, por el MISMO motivo y en el
  // mismo lugar: es el único punto con contexto de request por el que pasan
  // todos los handlers.
  //
  // Acá no se mira nada ni se consulta la base. Adentro del `after()` se lee el
  // buffer que la auditoría ya llenó y, solo si algún `precio_costo` quedó
  // distinto de como estaba, se corre el barrido de esa ubicación. Un request
  // que no toca costos no paga nada.
  //
  // Va en su propio llamado y no adentro de `programarFlush` a propósito: son
  // dos consumidores independientes del mismo buffer, y un fallo de uno no puede
  // dejar sin correr al otro.
  programarRevisionPorCosto(store);

  return session;
}

// -----------------------------------------------------
// COOKIE CONFIG
// -----------------------------------------------------
const isProd = process.env.NODE_ENV === "production";
export const SesionCookie = {
  nombre: COOKIE_NAME,
  opciones: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};

export const GrupoActivoCookie = {
  nombre: ACTIVE_GROUP_COOKIE,
  opciones: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};
