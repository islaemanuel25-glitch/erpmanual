// lib/integraciones/vinculos/vinculos.js
//
// AUTORIZAR Y REVOCAR UNA APLICACIÓN EXTERNA EN NOMBRE DE UNA PERSONA.
//
// Vive FUERA de lib/integraciones/azul-chat/ a propósito: esa carpeta es la
// puerta por la que entra Azul Chat y es de solo lectura —un candado lo exige—.
// Esto lo usa el ERP, con la sesión de una persona, y sí escribe.
//
// ── QUIÉN PUEDE AUTORIZAR ──────────────────────────────────────────────────
//
// Solo la persona, para sí misma, desde su sesión. Es un consentimiento: "dejo
// que Azul Chat consulte en mi nombre". Nadie autoriza por otro — ni un admin —,
// porque el código se le muestra a quien autoriza, y autorizar por otro sería
// quedarse con un código para hablar en su nombre.
//
// No pide un permiso: el vínculo no da ninguno. Cada consulta relee el rol de la
// persona, así que vincularse sin `reportes.ver` no le deja ver ventas. Sí pide
// que la persona exista y esté ACTIVA en la base, no en su JWT.
//
// ── QUIÉN PUEDE REVOCAR ────────────────────────────────────────────────────
//
// La persona misma, siempre. Y quien HOY puede darla de baja en el ERP, con la
// MISMA regla de `/api/usuarios/eliminar/[id]`: `autorizarGestionUsuarios` más
// `dentroDeAlcance` de lib/usuarios/gestion.js. Revocar corta menos que dar de
// baja —que ya corta la integración porque la consulta mira `activo`—, así que
// no se le da a nadie un poder que no tuviera.
//
// ── VOLVER A AUTORIZAR ─────────────────────────────────────────────────────
//
// Revoca el vínculo vigente y crea otro, en la misma transacción: el código
// viejo deja de servir, y la delegación que se hubiera canjeado con él también
// —la delegación vale mientras su vínculo esté vigente—. El índice único
// parcial de la migración impide que dos autorizaciones simultáneas dejen dos
// vigentes; la que pierde recibe un 409.
//
// ── QUÉ ES EL CÓDIGO QUE SE DEVUELVE ───────────────────────────────────────
//
// Un código de CANJE: vale 10 minutos y una vez, y solo para que el backend de
// Azul Chat lo cambie por un token de delegación (canje.js). No es una
// contraseña permanente y no viaja en ninguna consulta.

import { autorizarGestionUsuarios, dentroDeAlcance } from "@/lib/usuarios/gestion";
import { generarCodigoVinculo, hashCodigoVinculo, APLICACION_INTEGRACION } from "./codigoVinculo.js";

const rechazo = (status, codigo, error) => ({ ok: false, status, codigo, error });

function aplicacionValida(aplicacion) {
  return Object.prototype.hasOwnProperty.call(APLICACION_INTEGRACION, aplicacion);
}

/**
 * La persona autoriza a la aplicación para sí misma.
 *
 * @param {object} db cliente Prisma.
 * @param {{usuarioId:number, aplicacion:string}} args `usuarioId` sale de la SESIÓN, nunca del cuerpo.
 * @returns {Promise<{ok:true, codigo:string, vinculo:{id:number, autorizadoEn:Date}} | {ok:false, status:number, codigo:string, error:string}>}
 */
export async function autorizarVinculo(db, { usuarioId, aplicacion }) {
  if (!aplicacionValida(aplicacion)) return rechazo(400, "APLICACION_DESCONOCIDA", "Esa aplicación no se puede vincular.");
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) return rechazo(401, "SIN_SESION", "No hay una persona identificada.");

  const codigo = generarCodigoVinculo();
  try {
    return await db.$transaction(async (tx) => {
      const usuario = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, activo: true } });
      if (!usuario) return rechazo(403, "USUARIO_INEXISTENTE", "Tu usuario ya no existe en el ERP.");
      if (usuario.activo !== true) return rechazo(403, "USUARIO_INACTIVO", "Tu usuario está inactivo en el ERP.");

      // Las dos fechas las pone el mismo reloj —el de la aplicación— que la
      // revocación: si `autorizadoEn` lo pusiera la base y `revocadoEn` la app,
      // un desfasaje entre los dos relojes haría saltar el CHECK que exige
      // revocar después de autorizar.
      const ahora = new Date();
      await tx.vinculoIntegracion.updateMany({
        where: { usuarioId, aplicacion, revocadoEn: null },
        data: { revocadoEn: ahora, revocadoPorId: usuarioId },
      });
      const vinculo = await tx.vinculoIntegracion.create({
        data: { usuarioId, aplicacion, codigoHash: hashCodigoVinculo(codigo), autorizadoEn: ahora },
        select: { id: true, autorizadoEn: true },
      });
      return { ok: true, codigo, vinculo };
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return rechazo(409, "AUTORIZACION_SIMULTANEA", "Se estaba autorizando la misma aplicación al mismo tiempo. Probá de nuevo.");
    }
    throw e;
  }
}

/**
 * ¿Puede esta sesión revocar el vínculo de ese usuario? Pura.
 *
 * @param {object|null} session la de `getUsuarioSession`.
 * @param {{id:number, localId:number|null}|null} objetivo el usuario dueño del vínculo, leído de la base.
 */
export function decidirRevocacion(session, objetivo) {
  if (!session?.id) return rechazo(401, "SIN_SESION", "No autenticado.");
  if (!objetivo) return rechazo(404, "USUARIO_INEXISTENTE", "Ese usuario no existe.");
  if (objetivo.id === Number(session.id)) return { ok: true, propio: true };
  const gestion = autorizarGestionUsuarios(session);
  if (!gestion.ok) return rechazo(gestion.status, "SIN_PERMISO", "Solo podés revocar tu propio vínculo.");
  if (!dentroDeAlcance(gestion, objetivo.localId)) {
    return rechazo(403, "FUERA_DE_ALCANCE", "Ese usuario está fuera de tu alcance.");
  }
  return { ok: true, propio: false };
}

/**
 * Revoca el vínculo vigente de un usuario. Idempotente: sin vínculo vigente,
 * no hace nada y lo dice.
 *
 * @param {object} db
 * @param {{session:object, usuarioId:number, aplicacion:string}} args
 * @returns {Promise<{ok:true, revocado:boolean} | {ok:false, status:number, codigo:string, error:string}>}
 */
export async function revocarVinculo(db, { session, usuarioId, aplicacion }) {
  if (!aplicacionValida(aplicacion)) return rechazo(400, "APLICACION_DESCONOCIDA", "Esa aplicación no se puede vincular.");
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) return rechazo(400, "PEDIDO_INVALIDO", "usuarioId inválido.");

  const objetivo = await db.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, localId: true } });
  const decision = decidirRevocacion(session, objetivo);
  if (!decision.ok) return decision;

  const r = await db.vinculoIntegracion.updateMany({
    where: { usuarioId, aplicacion, revocadoEn: null },
    data: { revocadoEn: new Date(), revocadoPorId: Number(session.id) },
  });
  return { ok: true, revocado: r.count > 0 };
}
