// lib/rbac/permisosSesion.js
//
// NORMALIZAR LOS PERMISOS DE UNA SESIÓN. Una sola vez, en un solo lugar.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// La misma decisión estaba escrita en tres archivos, y uno de los tres la tenía
// al revés. `login/route.js` y `lib/auth.js` caían a `[]` ante permisos que no
// son un array; `app/api/me/route.js` caía a `["*"]`, o sea admin total.
//
// El backend rechazaba igual cada operación, porque valida contra
// `getUsuarioSession` y no contra `/api/me`. Pero el frontend arma el menú y los
// botones con lo que devuelve `/api/me`: a alguien con un token de permisos
// corruptos le mostraba la aplicación entera. Ver la contradicción, y su commit
// de origen, en docs/business-rules/contradicciones.md (C-01).
//
// Es el caso exacto de la regla 1 de CLAUDE.md: tres copias de la misma decisión
// no se rompen el día que se escriben, se rompen el día que una cambia. Esta se
// escribió distinta desde el principio y nadie lo vio durante meses.
//
// ── LA REGLA: FAIL-CLOSED ───────────────────────────────────────────────────
//
// Si los permisos no son un array, la sesión se queda SIN PERMISOS. Nunca con el
// comodín.
//
// El razonamiento no es simétrico y por eso importa escribirlo: un usuario que
// debería ver algo y no lo ve avisa enseguida —abre un ticket, llama, se queja—.
// Un usuario que NO debería ver algo y lo ve no avisa nunca. El error caro es el
// segundo, así que ante la duda se cierra.
//
// El rol Admin real guarda `["*"]` en un array de verdad y pasa por acá sin que
// se lo toque: fail-closed no le saca nada a quien legítimamente lo tiene.
//
// Módulo puro: sin Prisma, sin next/server, sin leer cookies. Se puede importar
// desde un candado sin arrastrar medio servidor.

/**
 * Los permisos de una sesión, normalizados a un array.
 *
 * Devuelve SIEMPRE un array. Ante cualquier cosa que no sea un array —null,
 * undefined, un objeto, un string, JSON mal parseado— devuelve uno vacío.
 *
 * @param {unknown} permisos lo que venga del rol en la base o del payload del JWT
 * @returns {string[]}
 */
export function normalizarPermisos(permisos) {
  return Array.isArray(permisos) ? permisos : [];
}

/**
 * ¿Esta sesión es admin?
 *
 * Se calcula SOBRE LOS PERMISOS YA NORMALIZADOS, nunca sobre el valor crudo:
 * `["*"].includes` sobre un string devuelve cosas raras y sobre null explota.
 */
export function esAdminPorPermisos(permisos) {
  return normalizarPermisos(permisos).includes("*");
}
