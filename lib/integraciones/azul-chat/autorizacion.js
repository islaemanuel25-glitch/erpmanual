// lib/integraciones/azul-chat/autorizacion.js
//
// ¿EN NOMBRE DE QUIÉN PREGUNTA AZUL CHAT, Y PUEDE ESA PERSONA, HOY, VER ESTO?
//
// Azul Chat ya se autenticó como aplicación (`autenticacionAplicacion.js`). Eso
// dice QUIÉN MANDA la solicitud, no EN NOMBRE DE QUIÉN ni QUÉ puede ver. Lo
// segundo lo decide esta pieza, y lo decide contra el ERP en el momento:
//
//   1. la capacidad está en el catálogo cerrado;
//   2. el TOKEN DE DELEGACIÓN existe, es de esta aplicación y su vínculo sigue
//      vigente (lib/integraciones/vinculos/). La persona en cuyo nombre se
//      pregunta SALE DEL TOKEN: es el dueño del vínculo que se canjeó;
//   3. esa persona existe y está ACTIVA;
//   4. su rol, leído de la base AHORA, tiene el permiso de la capacidad;
//   5. si la capacidad es sobre un local: el local existe, pertenece de verdad al
//      grupo que se dice, y está dentro del alcance territorial ACTUAL de la
//      persona.
//
// ── POR QUÉ EL `usuarioId` NO VIAJA ────────────────────────────────────────
//
// Hasta la tanda del canje, la consulta traía `usuarioId` y el código del
// vínculo, y la puerta comprobaba que coincidieran. Ahora el token alcanza para
// saber de quién es, así que el cuerpo no trae `usuarioId` — y lo que no viaja
// no se puede cambiar. Un cuerpo que lo traiga se rechaza por clave de más.
//
// ── LA DELEGACIÓN NO REEMPLAZA NADA ────────────────────────────────────────
//
// Es una condición MÁS, no un permiso, y solo delega IDENTIDAD. No congela ni
// el rol, ni los permisos, ni el local, ni el grupo: todo eso se relee en cada
// pregunta. Un token vigente de alguien que hoy no tiene `reportes.ver`, o que
// está inactivo, no deja ver nada; si mañana recupera el permiso, vuelve a
// poder sin volver a vincularse.
//
// ── POR QUÉ NO SE CONFÍA EN LO QUE MANDA AZUL CHAT ─────────────────────────
//
// `grupoId` y `localId` llegan en el cuerpo, y el cuerpo lo arma la aplicación.
// Son una AFIRMACIÓN, no un dato: se usan para saber qué preguntarle a la base,
// y la respuesta de la base es la que manda. Un `grupoId` que no es el del local
// se rechaza aunque el usuario pudiera ver los dos: un pedido inconsistente es
// un pedido manipulado o roto, y en ninguno de los dos casos se adivina cuál de
// los dos valores quiso decir.
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
// Está escrita UNA vez, en `alcanceTerritorial` y `localEnAlcance`. Las usan la
// autorización de cada capacidad sobre un local y `mi_alcance`, que enumera los
// locales: lo que `mi_alcance` lista es exactamente lo que la puerta deja
// consultar, porque es la misma función la que decide las dos cosas.
//
// El `*` que se mira es el del ROL ACTUAL de la persona, y solo decide su
// alcance como humano. Nunca es una credencial de la aplicación.
//
// La decisión (`decidirAutorizacion`) es pura. La carga de los hechos viene
// inyectada: el ERP le pasa la base, los candados le pasan filas.

import { checkPerm } from "@/lib/authorize";
import { normalizarPermisos, esAdminPorPermisos } from "@/lib/rbac/permisosSesion";
import { capacidadDelCatalogo } from "./capacidades.js";
import { esTokenDelegacion, hashTokenDelegacion } from "../vinculos/codigoVinculo.js";

/** Un id del ERP: entero positivo, como número. Un string no es un id. */
export function esIdValido(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}

const rechazo = (status, codigo, error) => ({ ok: false, status, codigo, error });

const sinDelegacion = () =>
  rechazo(403, "DELEGACION_INEXISTENTE", "La aplicación no presentó una delegación válida de esta persona.");

/**
 * Lo que se puede decidir sin la base: la capacidad, la forma del token y, si
 * la capacidad es sobre un local, la forma de los ids. Va primero para no
 * consultar nada con un pedido que no tiene sentido.
 *
 * @param {{capacidad:string, token:unknown, grupoId?:unknown, localId?:unknown}} pedido
 */
export function validarPedido(pedido) {
  const { capacidad: nombre, token, grupoId, localId } = pedido || {};
  const capacidad = capacidadDelCatalogo(nombre);
  if (!capacidad) {
    return rechazo(403, "CAPACIDAD_FUERA_DE_CATALOGO", "La capacidad pedida no está habilitada para la integración.");
  }
  // Un token con otra forma no se busca: no puede existir. Se responde igual
  // que uno que no existe, para no enseñar cuál de las dos cosas falló.
  if (!esTokenDelegacion(token)) return sinDelegacion();
  if (capacidad.pideLocal && (!esIdValido(grupoId) || !esIdValido(localId))) {
    return rechazo(400, "PEDIDO_INVALIDO", "El alcance tiene que traer un grupoId y un localId válidos.");
  }
  return { ok: true, capacidad };
}

/**
 * La delegación, sobre la fila ya leída por el hash del token. Pura.
 *
 * @param {string} aplicacionVinculo el valor de `AplicacionIntegracion` de la aplicación AUTENTICADA.
 * @param {{id:number, vinculo:{id:number, usuarioId:number, aplicacion:string, revocadoEn:Date|null}}|null} delegacion
 * @returns {{ok:true, usuarioId:number} | {ok:false, status:number, codigo:string, error:string}}
 */
export function decidirDelegacion(aplicacionVinculo, delegacion) {
  const vinculo = delegacion?.vinculo;
  if (!vinculo || !aplicacionVinculo || vinculo.aplicacion !== aplicacionVinculo) return sinDelegacion();
  if (vinculo.revocadoEn != null) {
    return rechazo(403, "VINCULO_REVOCADO", "El vínculo de esta persona con la aplicación fue revocado.");
  }
  return { ok: true, usuarioId: vinculo.usuarioId };
}

/**
 * EL ALCANCE TERRITORIAL de una persona, leído de su usuario y su rol de hoy.
 * Pura. Ver la cabecera: es la regla del reporte general, sin cookies.
 *
 * @param {{esAdmin:boolean, localFijo:number|null, grupoDelLocalDelUsuario:number|null}} hechos
 * @returns {{modo:"LOCAL", localId:number} | {modo:"GRUPO", grupoId:number} | {modo:"GLOBAL"} | {modo:"NINGUNO"}}
 */
export function alcanceTerritorial({ esAdmin, localFijo, grupoDelLocalDelUsuario }) {
  const fijo = esIdValido(localFijo) ? localFijo : null;
  if (!esAdmin) return fijo ? { modo: "LOCAL", localId: fijo } : { modo: "NINGUNO" };
  if (!fijo) return { modo: "GLOBAL" };
  // Admin con local fijo cuyo local no tiene grupo: no hay grupo que mirar.
  return esIdValido(grupoDelLocalDelUsuario) ? { modo: "GRUPO", grupoId: grupoDelLocalDelUsuario } : { modo: "NINGUNO" };
}

/**
 * ¿Ese local, cuyo grupo REAL es `grupoDelLocal`, está dentro de ese alcance? Pura.
 * Que el local exista y tenga grupo se mira aparte: esto decide solo el alcance.
 */
export function localEnAlcance(alcance, localId, grupoDelLocal) {
  switch (alcance?.modo) {
    case "LOCAL":
      return alcance.localId === localId;
    case "GRUPO":
      return alcance.grupoId === grupoDelLocal;
    case "GLOBAL":
      return true;
    default:
      return false;
  }
}

/**
 * La decisión, sobre hechos ya leídos de la base.
 *
 * @param {object} args
 * @param {{capacidad:string, token:string, grupoId?:number, localId?:number}} args.pedido
 * @param {string} args.aplicacionVinculo la aplicación autenticada, como `AplicacionIntegracion`.
 * @param {{id:number, vinculo:{id:number, usuarioId:number, aplicacion:string, revocadoEn:Date|null}}|null} args.delegacion la fila de la delegación.
 * @param {{id:number, activo:boolean, localId:number|null, rol:{permisos:unknown}|null}|null} args.usuario
 * @param {number|null} [args.grupoDelLocal] grupo REAL del local pedido (solo en capacidades sobre un local).
 * @param {number|null} [args.grupoDelLocalDelUsuario] grupo real del local fijo del usuario.
 */
export function decidirAutorizacion({ pedido, aplicacionVinculo, delegacion, usuario, grupoDelLocal = null, grupoDelLocalDelUsuario = null }) {
  const forma = validarPedido(pedido);
  if (!forma.ok) return forma;
  const { capacidad } = forma;

  const delegado = decidirDelegacion(aplicacionVinculo, delegacion);
  if (!delegado.ok) return delegado;

  if (!usuario || usuario.id !== delegado.usuarioId) {
    return rechazo(403, "USUARIO_INEXISTENTE", "La persona delegante no existe en el ERP.");
  }
  if (usuario.activo !== true) {
    return rechazo(403, "USUARIO_INACTIVO", "La persona delegante está inactiva en el ERP.");
  }

  // La sesión se arma con el rol LEÍDO AHORA, y se le pregunta a `checkPerm`,
  // que es el mismo que usan las rutas del ERP. Una capacidad sin permisos
  // declarados (`mi_alcance`) no pregunta: lo que muestra es lo que el ERP le
  // muestra a cualquier persona con sesión — su propio alcance.
  const permisos = normalizarPermisos(usuario.rol?.permisos);
  const sesionActual = { esAdmin: esAdminPorPermisos(permisos), permisos };
  if (capacidad.permisos.length > 0 && !checkPerm(sesionActual, capacidad.permisos).ok) {
    return rechazo(403, "SIN_PERMISO", `La persona no tiene hoy el permiso que pide ${pedido.capacidad}.`);
  }

  const alcance = alcanceTerritorial({
    esAdmin: sesionActual.esAdmin,
    localFijo: usuario.localId,
    grupoDelLocalDelUsuario,
  });

  const base = {
    usuarioId: usuario.id,
    capacidad: pedido.capacidad,
    vinculoId: delegacion.vinculo.id,
    delegacionId: delegacion.id,
    alcance: Object.freeze(alcance),
  };

  if (!capacidad.pideLocal) return { ok: true, autorizacion: Object.freeze(base) };

  if (!esIdValido(grupoDelLocal)) {
    return rechazo(403, "LOCAL_SIN_GRUPO", "El local pedido no existe o no pertenece a ningún grupo.");
  }
  if (grupoDelLocal !== pedido.grupoId) {
    return rechazo(403, "GRUPO_LOCAL_INCONSISTENTE", "El local pedido no pertenece al grupo indicado.");
  }
  if (!localEnAlcance(alcance, pedido.localId, grupoDelLocal)) {
    return rechazo(403, "FUERA_DE_ALCANCE", "El local pedido está fuera del alcance de la persona.");
  }

  return { ok: true, autorizacion: Object.freeze({ ...base, grupoId: grupoDelLocal, localId: pedido.localId }) };
}

/**
 * Lee los hechos y decide. La delegación se lee PRIMERO: sin una válida no se
 * consulta ni el usuario.
 *
 * @param {object} pedido
 * @param {{delegacion:(tokenHash:string)=>Promise<object|null>, usuario:(id:number)=>Promise<object|null>, grupoDeLocal:(id:number)=>Promise<number|null>}} cargador
 * @param {{aplicacionVinculo:string}} contexto lo que dijo la autenticación de la aplicación.
 */
export async function autorizarIntegracion(pedido, cargador, { aplicacionVinculo } = {}) {
  const forma = validarPedido(pedido);
  if (!forma.ok) return forma;

  const delegacion = await cargador.delegacion(hashTokenDelegacion(pedido.token));
  const delegado = decidirDelegacion(aplicacionVinculo, delegacion);
  if (!delegado.ok) return delegado;

  const usuario = await cargador.usuario(delegado.usuarioId);
  const grupoDelLocal = forma.capacidad.pideLocal ? await cargador.grupoDeLocal(pedido.localId) : null;
  const grupoDelLocalDelUsuario =
    usuario && esIdValido(usuario.localId) ? await cargador.grupoDeLocal(usuario.localId) : null;

  return decidirAutorizacion({ pedido, aplicacionVinculo, delegacion, usuario, grupoDelLocal, grupoDelLocalDelUsuario });
}
