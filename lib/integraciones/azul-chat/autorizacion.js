// lib/integraciones/azul-chat/autorizacion.js
//
// ¿PUEDE ESTA PERSONA, HOY, VER ESTO DE ESTE LOCAL?
//
// Azul Chat ya se autenticó como aplicación (`autenticacionAplicacion.js`). Eso
// dice QUIÉN MANDA la solicitud, no EN NOMBRE DE QUIÉN ni QUÉ puede ver. Lo
// segundo lo decide esta pieza, y lo decide contra el ERP en el momento:
//
//   1. la capacidad está en el catálogo cerrado;
//   2. el humano delegante existe y está ACTIVO;
//   3. su rol, leído de la base AHORA, tiene el permiso de la capacidad;
//   4. el local existe y pertenece de verdad al grupo que se dice;
//   5. ese local está dentro del alcance territorial ACTUAL de la persona.
//
// ── POR QUÉ NO SE CONFÍA EN LO QUE MANDA AZUL CHAT ─────────────────────────
//
// `usuarioId`, `grupoId` y `localId` llegan en el cuerpo, y el cuerpo lo arma la
// aplicación. Son una AFIRMACIÓN, no un dato: se usan para saber qué preguntarle
// a la base, y la respuesta de la base es la que manda. Un `grupoId` que no es el
// del local se rechaza aunque el usuario pudiera ver los dos: un pedido
// inconsistente es un pedido manipulado o roto, y en ninguno de los dos casos se
// adivina cuál de los dos valores quiso decir.
//
// ── POR QUÉ NO SE USAN LOS PERMISOS DEL JWT ────────────────────────────────
//
// El JWT de sesión congela los permisos del momento del login, por ocho horas.
// Si a alguien le sacan `reportes.ver` a las 10, su sesión del ERP lo sigue
// teniendo hasta que vuelva a entrar. La integración no tiene sesión: lee el rol
// de la base en cada solicitud, así que un permiso quitado o un usuario
// desactivado dejan de valer en la próxima pregunta.
//
// ── EL ALCANCE, IGUAL QUE EN EL ERP ────────────────────────────────────────
//
// La regla es la de `app/api/reportes-ventas/general/route.js`, sin cookies:
//
//   · Sin `*`: SOLO su local fijo (`Usuario.localId`). Sin local fijo, nada.
//   · Con `*` y un local fijo: los locales del grupo de ese local. En el ERP un
//     admin puede cambiar de grupo con la cookie de grupo activo; acá no hay
//     cookie, y se toma lo más estrecho que el ERP le reconoce sin ella.
//   · Con `*` y sin local fijo: cualquier local de cualquier grupo, que es lo
//     mismo que el ERP le deja elegir en `grupo-activo/set`.
//
// El `*` que se mira es el del ROL ACTUAL de la persona, y solo decide su
// alcance como humano. Nunca es una credencial de la aplicación.
//
// La decisión (`decidirAutorizacion`) es pura. La carga de los hechos viene
// inyectada: el ERP le pasa la base, los candados le pasan filas.

import { checkPerm } from "@/lib/authorize";
import { normalizarPermisos, esAdminPorPermisos } from "@/lib/rbac/permisosSesion";
import { capacidadDelCatalogo } from "./capacidades.js";

/** Un id del ERP: entero positivo, como número. Un string no es un id. */
export function esIdValido(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}

const rechazo = (status, codigo, error) => ({ ok: false, status, codigo, error });

/**
 * Lo que se puede decidir sin la base: la capacidad y la forma de los ids.
 * Va primero para no consultar nada con un pedido que no tiene sentido.
 */
export function validarPedido(pedido) {
  const { usuarioId, capacidad, grupoId, localId } = pedido || {};
  if (!capacidadDelCatalogo(capacidad)) {
    return rechazo(403, "CAPACIDAD_FUERA_DE_CATALOGO", "La capacidad pedida no está habilitada para la integración.");
  }
  if (!esIdValido(usuarioId)) {
    return rechazo(400, "PEDIDO_INVALIDO", "La delegación no trae un usuarioId válido.");
  }
  if (!esIdValido(grupoId) || !esIdValido(localId)) {
    return rechazo(400, "PEDIDO_INVALIDO", "El alcance tiene que traer un grupoId y un localId válidos.");
  }
  return { ok: true };
}

/**
 * La decisión, sobre hechos ya leídos de la base.
 *
 * @param {object} args
 * @param {{usuarioId:number, capacidad:string, grupoId:number, localId:number}} args.pedido
 * @param {{id:number, activo:boolean, localId:number|null, rol:{permisos:unknown}|null}|null} args.usuario
 * @param {number|null} args.grupoDelLocal grupo REAL del local pedido.
 * @param {number|null} [args.grupoDelLocalDelUsuario] grupo real del local fijo del usuario.
 */
export function decidirAutorizacion({ pedido, usuario, grupoDelLocal, grupoDelLocalDelUsuario = null }) {
  const forma = validarPedido(pedido);
  if (!forma.ok) return forma;
  const capacidad = capacidadDelCatalogo(pedido.capacidad);

  if (!usuario || usuario.id !== pedido.usuarioId) {
    return rechazo(403, "USUARIO_INEXISTENTE", "El usuario delegante no existe en el ERP.");
  }
  if (usuario.activo !== true) {
    return rechazo(403, "USUARIO_INACTIVO", "El usuario delegante está inactivo en el ERP.");
  }

  // La sesión se arma con el rol LEÍDO AHORA, y se le pregunta a `checkPerm`,
  // que es el mismo que usan las rutas del ERP.
  const permisos = normalizarPermisos(usuario.rol?.permisos);
  const sesionActual = { esAdmin: esAdminPorPermisos(permisos), permisos };
  const permiso = checkPerm(sesionActual, capacidad.permisos);
  if (!permiso.ok) {
    return rechazo(403, "SIN_PERMISO", `El usuario no tiene hoy el permiso que pide ${pedido.capacidad}.`);
  }

  if (!esIdValido(grupoDelLocal)) {
    return rechazo(403, "LOCAL_SIN_GRUPO", "El local pedido no existe o no pertenece a ningún grupo.");
  }
  if (grupoDelLocal !== pedido.grupoId) {
    return rechazo(403, "GRUPO_LOCAL_INCONSISTENTE", "El local pedido no pertenece al grupo indicado.");
  }

  const localFijo = esIdValido(usuario.localId) ? usuario.localId : null;
  if (!sesionActual.esAdmin) {
    if (!localFijo || localFijo !== pedido.localId) {
      return rechazo(403, "FUERA_DE_ALCANCE", "El local pedido está fuera del alcance del usuario.");
    }
  } else if (localFijo && grupoDelLocalDelUsuario !== grupoDelLocal) {
    return rechazo(403, "FUERA_DE_ALCANCE", "El local pedido está fuera del grupo del usuario.");
  }

  return {
    ok: true,
    autorizacion: Object.freeze({
      usuarioId: usuario.id,
      capacidad: pedido.capacidad,
      grupoId: grupoDelLocal,
      localId: pedido.localId,
    }),
  };
}

/**
 * Lee los hechos y decide.
 *
 * @param {object} pedido
 * @param {{usuario:(id:number)=>Promise<object|null>, grupoDeLocal:(id:number)=>Promise<number|null>}} cargador
 */
export async function autorizarIntegracion(pedido, cargador) {
  const forma = validarPedido(pedido);
  if (!forma.ok) return forma;

  const usuario = await cargador.usuario(pedido.usuarioId);
  const grupoDelLocal = await cargador.grupoDeLocal(pedido.localId);
  const grupoDelLocalDelUsuario =
    usuario && esIdValido(usuario.localId) ? await cargador.grupoDeLocal(usuario.localId) : null;

  return decidirAutorizacion({ pedido, usuario, grupoDelLocal, grupoDelLocalDelUsuario });
}
