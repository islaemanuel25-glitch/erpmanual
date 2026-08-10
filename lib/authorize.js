import { getUsuarioSession } from "./auth";

/**
 * ¿La sesión tiene ALGUNO de los permisos pedidos?
 *
 * `perm` puede ser un string o un array. El array significa "cualquiera de
 * estos", no "todos": hay pantallas a las que se llega por más de un camino
 * legítimo. El caso que lo motivó es la búsqueda de clientes, que la necesita el
 * POS con `pos.usar` y la agenda con `clientes.ver`; hasta ahora se resolvía no
 * pidiendo permiso a nadie.
 *
 * Se agregó acá en vez de escribir un helper nuevo al lado: los que pasan un
 * string siguen andando igual.
 */
function tieneAlguno(session, perm) {
  const pedidos = Array.isArray(perm) ? perm : [perm];
  return session.esAdmin || pedidos.some((p) => session.permisos.includes(p));
}

const textoSinPermiso = (perm) =>
  `Sin permiso: ${Array.isArray(perm) ? perm.join(" o ") : perm}`;

/**
 * Standalone: parsea session del request y valida permiso.
 * @param {string|string[]} perm un permiso, o varios de los que alcanza con uno
 * @returns {{ ok:true, session }} | {{ ok:false, status:number, error:string }}
 */
export function requirePerm(req, perm) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (tieneAlguno(session, perm)) {
    return { ok: true, session };
  }
  return { ok: false, status: 403, error: textoSinPermiso(perm) };
}

/**
 * Solo requiere sesión válida (login). Sin permiso granular.
 * @returns {{ ok:true, session }} | {{ ok:false, status:number, error:string }}
 */
export function requireAuth(req) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  return { ok: true, session };
}

/**
 * Requiere sesión válida + admin (permisos incluye "*").
 * @returns {{ ok:true, session }} | {{ ok:false, status:number, error:string }}
 */
export function requireAdmin(req) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (!session.esAdmin) {
    return { ok: false, status: 403, error: "Requiere administrador" };
  }
  return { ok: true, session };
}

/**
 * Valida permiso contra una session ya resuelta (ej: de resolveLocalAndGrupo).
 * @param {string|string[]} perm un permiso, o varios de los que alcanza con uno
 * @returns {{ ok:true }} | {{ ok:false, status:number, error:string }}
 */
export function checkPerm(session, perm) {
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (tieneAlguno(session, perm)) {
    return { ok: true };
  }
  return { ok: false, status: 403, error: textoSinPermiso(perm) };
}

/**
 * LEER LA AGENDA DE CLIENTES.
 *
 * Se define UNA vez porque son seis rutas las que lo necesitan, y escribirlo a
 * mano en cada una es exactamente cómo se llega a que una quede distinta.
 *
 * Son dos permisos porque son dos caminos legítimos: el cajero busca al cliente
 * desde el POS con `pos.usar` —no tiene por qué administrar la agenda— y quien
 * la administra entra con `clientes.ver`. Antes esto se resolvía no pidiendo
 * permiso a nadie, así que cualquier usuario autenticado veía los clientes del
 * grupo entero.
 */
export const PERMISOS_LEER_CLIENTES = ["clientes.ver", "pos.usar"];
