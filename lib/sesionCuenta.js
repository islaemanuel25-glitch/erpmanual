// lib/sesionCuenta.js
//
// LA SESIÓN DE LA CUENTA: qué lleva el token y si sigue valiendo. Puro, sin
// imports de servidor: lo usan `/api/login` y `proxy.js`, y lo prueban los
// candados sin base.
//
// ── LA REGLA (Emanuel, 2026-10-19) ─────────────────────────────────────────
//
// La sesión de la cuenta no vence por reloj: dura hasta que el usuario cierra
// sesión. Una Sunmi prendida más de 8 horas pedía el mail y la contraseña en
// plena venta. Lo que decide si vale es el servidor, en cada pedido: el usuario
// existe, está activo, y la sesión se emitió después de su `sesionInvalidadaEn`
// (cambiarle la contraseña la escribe).
//
// ── LA FOTO DEL TOKEN ──────────────────────────────────────────────────────
//
// El token lleva los permisos, el rol y el local del momento del login, y
// `getUsuarioSession` los lee de ahí. Con 8 horas, un cambio de rol se aplicaba
// al vencer; sin vencimiento no se aplicaría nunca. Por eso el proxy compara la
// foto contra la base y, si cambió, firma una nueva con el MISMO `emitidoEn`.

import { DUENO_LOCAL } from "@/lib/rbac/systemRoles";
import { normalizarPermisos } from "@/lib/rbac/permisosSesion";
import { emitidoEnDelToken, sesionDeOperadorVigente } from "@/lib/operador-sesion";

/** Lo que el proxy lee del usuario para decidir. */
export const SELECT_USUARIO_DE_SESION = Object.freeze({
  id: true,
  nombre: true,
  email: true,
  rolId: true,
  localId: true,
  activo: true,
  sesionInvalidadaEn: true,
  rol: { select: { nombre: true, esSistema: true, permisos: true } },
  local: { select: { es_deposito: true } },
});

/**
 * El payload del token de la cuenta, desde el usuario de la base con su rol y su
 * local. Lo usan el login al entrar y el proxy al renovar la foto.
 */
export function payloadDeSesion(user) {
  // Identidad de rol para el bypass de operario de DUEÑO_LOCAL: rol de sistema
  // + nombre canónico, sin depender de un id fijo ni solo del texto. Ver
  // lib/operador.js (puedeOperarSinOperador).
  const esDuenoLocal = user.rol?.esSistema === true && user.rol?.nombre === DUENO_LOCAL;
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,

    rolId: user.rolId,
    rolNombre: user.rol?.nombre ?? null,
    // Fail-closed: un `permisos` que no es un array válido no otorga nada.
    permisos: normalizarPermisos(user.rol?.permisos),
    esDuenoLocal,

    localId: user.localId ?? null,
    esDeposito: user.local?.es_deposito ?? false,
  };
}

const CAMPOS_DE_LA_FOTO = ["id", "nombre", "email", "rolId", "rolNombre", "esDuenoLocal", "localId", "esDeposito"];

/** ¿La foto del token es distinta de lo que hoy dice la base? */
export function fotoDesactualizada(data, actual) {
  for (const c of CAMPOS_DE_LA_FOTO) {
    if ((data?.[c] ?? null) !== (actual[c] ?? null)) return true;
  }
  const a = normalizarPermisos(data?.permisos);
  const b = actual.permisos;
  return a.length !== b.length || a.some((p, i) => p !== b[i]);
}

/**
 * ¿Sigue valiendo esta sesión? El usuario existe, está activo y la sesión es
 * posterior a su última invalidación. La comparación es la misma que la del PIN
 * (`sesionDeOperadorVigente`): un token sin instante, con una invalidación
 * escrita, no vale.
 */
export function sesionDeCuentaVigente(usuario, data) {
  if (!usuario || usuario.activo !== true) return false;
  return sesionDeOperadorVigente({ emitidoEn: emitidoEnDelToken(data), sesionInvalidadaEn: usuario.sesionInvalidadaEn });
}
