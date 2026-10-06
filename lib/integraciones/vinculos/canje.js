// lib/integraciones/vinculos/canje.js
//
// EL CANJE: EL CÓDIGO HUMANO DE UN VÍNCULO SE CAMBIA, UNA VEZ, POR UN TOKEN DE
// DELEGACIÓN QUE SOLO CONOCE EL BACKEND DE AZUL CHAT.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Hasta esta tanda, el código que la persona copiaba del ERP viajaba en CADA
// consulta: era una contraseña permanente, y Azul Chat tenía que guardarla
// recuperable. Ahora el código vale 10 minutos y una vez; Azul Chat lo canjea
// apenas la persona lo pega, y lo que guarda es el token — una credencial de
// máquina que ninguna persona ve, que no sirve sin la firma de la aplicación, y
// que el ERP puede invalidar revocando el vínculo.
//
// ── LOS PASOS ──────────────────────────────────────────────────────────────
//
//   1. la aplicación se autentica con la MISMA firma HMAC que la consulta
//      (autenticacionAplicacion.js) — ni cookies, ni JWT, ni AUTH_SECRET;
//   2. el cuerpo es JSON canónico y trae exactamente `{ "codigo": "…" }`. No
//      trae `usuarioId`: la identidad sale del vínculo que el código encuentra;
//   3. el cupo, antes de tocar la base;
//   4. el vínculo por el hash del código, y la decisión (`decidirCanje`);
//   5. la delegación se inserta con el hash de un token nuevo. Lo que hace que
//      un código se canjee UNA vez no es el paso 4 sino la base: el índice único
//      de `DelegacionIntegracion.vinculoId` y el trigger que rechaza un vínculo
//      revocado o vencido. Dos canjes a la vez —o la MISMA solicitud firmada
//      repetida dentro de la ventana de 300 s del HMAC— dejan uno solo; el otro
//      choca contra el índice y sale como código usado.
//
// ── LO QUE SE DICE AFUERA ──────────────────────────────────────────────────
//
// Cualquier falla del código —inexistente, mal escrito, vencido, usado,
// revocado, de una persona inactiva— sale con el MISMO código público,
// CODIGO_NO_VALIDO (respuestaPublica.js). Los motivos internos quedan para el
// log, sin el código ni el token.
//
// ── SI LA RESPUESTA SE PIERDE ──────────────────────────────────────────────
//
// Si el canje se hace y la respuesta no llega a Azul Chat, el código ya está
// usado y el token se perdió. No hay forma de pedirlo de nuevo, a propósito:
// la persona genera un código nuevo desde el ERP, lo que revoca el vínculo
// viejo y su delegación huérfana.

import { autenticarAplicacion } from "../azul-chat/autenticacionAplicacion.js";
import { leerCuerpoCanonico } from "../azul-chat/atender.js";
import { crearLimitador } from "../azul-chat/limitador.js";
import {
  APLICACION_INTEGRACION,
  esCodigoVinculo,
  hashCodigoVinculo,
  generarTokenDelegacion,
  hashTokenDelegacion,
  vencimientoDelCodigo,
} from "./codigoVinculo.js";

const rechazo = (status, codigo, error) => ({ ok: false, status, codigo, error });

const CLAVES_CUERPO = ["codigo"];

/** El canje, para el cupo, es UNA clave por aplicación: todavía no se sabe de quién es el código. */
export const CLAVE_DE_CUPO_CANJE = "canje";

/**
 * Canjes por minuto y por aplicación. Adivinar un código de 256 bits no es
 * posible con ningún cupo; lo que esto frena es a una aplicación desbocada
 * golpeando la base. Un ingreso a Azul Chat es un canje, así que veinte por
 * minuto sobra para una instalación. Por proceso, como el de la consulta.
 */
export const MAX_CANJES_POR_MINUTO = 20;

/** El cupo del canje: el mismo limitador de la consulta, con una sola clave. */
export function crearLimitadorCanje() {
  return crearLimitador({ maxPorUsuario: MAX_CANJES_POR_MINUTO, maxPorAplicacion: MAX_CANJES_POR_MINUTO });
}

/**
 * ¿Se puede canjear el código de este vínculo, ahora? Pura.
 *
 * @param {{id:number, aplicacion:string, autorizadoEn:Date, revocadoEn:Date|null, delegacion:{id:number}|null, usuario:{id:number, activo:boolean}|null}|null} vinculo
 * @param {string} aplicacionVinculo la aplicación AUTENTICADA, como `AplicacionIntegracion`.
 * @param {number} ahora milisegundos.
 */
export function decidirCanje(vinculo, aplicacionVinculo, ahora) {
  if (!vinculo || !aplicacionVinculo || vinculo.aplicacion !== aplicacionVinculo) {
    return rechazo(403, "CANJE_CODIGO_INEXISTENTE", "No hay un vínculo de esta aplicación con ese código.");
  }
  if (vinculo.revocadoEn != null) return rechazo(403, "CANJE_VINCULO_REVOCADO", "El vínculo de ese código fue revocado.");
  if (vinculo.delegacion) return rechazo(403, "CANJE_CODIGO_USADO", "Ese código ya se canjeó.");
  if (ahora > vencimientoDelCodigo(vinculo.autorizadoEn).getTime()) {
    return rechazo(403, "CANJE_CODIGO_VENCIDO", "Ese código venció.");
  }
  if (!vinculo.usuario || vinculo.usuario.activo !== true) {
    return rechazo(403, "CANJE_USUARIO_NO_HABILITADO", "La persona del vínculo no existe o está inactiva.");
  }
  return { ok: true };
}

/** El error de la base, si es uno de los que este canje sabe explicar. */
function motivoDeLaBase(e) {
  if (e?.code === "P2002") return "CANJE_CODIGO_USADO";
  const mensaje = String(e?.message || "");
  // Los textos son los de los RAISE del trigger de la migración 20261006150000.
  if (mensaje.includes("El código de canje venció")) return "CANJE_CODIGO_VENCIDO";
  if (mensaje.includes("No se canjea el código de un vínculo revocado")) return "CANJE_VINCULO_REVOCADO";
  return null;
}

/**
 * Canjea un código. Escribe una sola fila: la delegación.
 *
 * @param {object} db cliente Prisma.
 * @param {{codigo:unknown, aplicacionVinculo:string}} args
 * @param {{ahora?:number}} [opciones]
 * @returns {Promise<{ok:true, datos:{usuarioId:number, vinculoId:number, tokenDelegacion:string, autorizadoEn:Date, canjeadoEn:Date}} | {ok:false, status:number, codigo:string, error:string}>}
 */
export async function canjearCodigo(db, { codigo, aplicacionVinculo }, { ahora = Date.now() } = {}) {
  if (!Object.values(APLICACION_INTEGRACION).includes(aplicacionVinculo)) {
    return rechazo(403, "CANJE_CODIGO_INEXISTENTE", "No hay un vínculo de esta aplicación con ese código.");
  }
  // Un código con otra forma no se busca: no puede existir.
  if (!esCodigoVinculo(codigo)) {
    return rechazo(403, "CANJE_CODIGO_INEXISTENTE", "No hay un vínculo de esta aplicación con ese código.");
  }

  const token = generarTokenDelegacion();
  try {
    return await db.$transaction(async (tx) => {
      const vinculo = await tx.vinculoIntegracion.findUnique({
        where: { codigoHash: hashCodigoVinculo(codigo) },
        select: {
          id: true,
          usuarioId: true,
          aplicacion: true,
          autorizadoEn: true,
          revocadoEn: true,
          delegacion: { select: { id: true } },
          usuario: { select: { id: true, activo: true } },
        },
      });
      const decision = decidirCanje(vinculo, aplicacionVinculo, ahora);
      if (!decision.ok) return decision;

      const delegacion = await tx.delegacionIntegracion.create({
        data: { vinculoId: vinculo.id, tokenHash: hashTokenDelegacion(token) },
        select: { id: true, canjeadoEn: true },
      });
      return {
        ok: true,
        datos: {
          usuarioId: vinculo.usuarioId,
          vinculoId: vinculo.id,
          tokenDelegacion: token,
          autorizadoEn: vinculo.autorizadoEn,
          canjeadoEn: delegacion.canjeadoEn,
        },
      };
    });
  } catch (e) {
    const motivo = motivoDeLaBase(e);
    if (motivo) return rechazo(403, motivo, "La base rechazó el canje.");
    throw e;
  }
}

/**
 * Atiende un canje: la puerta completa, sin HTTP. La ruta le pasa las cabeceras
 * y el cuerpo crudo, y traduce el resultado con `aRespuestaPublica`.
 *
 * @param {{headers: Headers|object, cuerpo: Uint8Array|string}} solicitud
 * @param {{db:object, limitador?:{consumir:Function}|null, entorno?:object, ahora?:number}} deps
 * @returns {Promise<{status:number, cuerpo:object}>}
 */
export async function atenderCanje({ headers, cuerpo }, { db, limitador = null, entorno = process.env, ahora = Date.now() }) {
  const fallar = ({ status, codigo, error, ...extra }) => ({ status, cuerpo: { ok: false, codigo, error, ...extra } });

  // 1. La aplicación, antes de leer una sola clave del cuerpo.
  const app = autenticarAplicacion({ headers, cuerpo, entorno, ahora });
  if (!app.ok) return fallar(app);

  // 2. La forma: exactamente { codigo }.
  const leido = leerCuerpoCanonico(cuerpo);
  if (leido.error) return leido.error;
  const claves = Object.keys(leido.datos);
  if (claves.length !== CLAVES_CUERPO.length || !claves.every((k) => CLAVES_CUERPO.includes(k))) {
    return fallar(rechazo(400, "PEDIDO_INVALIDO", "El canje solo acepta codigo."));
  }

  // 3. El cupo.
  if (limitador) {
    const cupo = limitador.consumir({ aplicacion: app.aplicacion, clave: CLAVE_DE_CUPO_CANJE }, ahora);
    if (!cupo.ok) {
      return fallar({ status: 429, codigo: "LIMITE_EXCEDIDO", error: "Demasiados canjes en poco tiempo.", reintentarEnSegundos: cupo.reintentarEnSegundos });
    }
  }

  // 4 y 5.
  const r = await canjearCodigo(db, { codigo: leido.datos.codigo, aplicacionVinculo: app.vinculo }, { ahora });
  if (!r.ok) return fallar(r);
  return { status: 200, cuerpo: { ok: true, datos: r.datos } };
}
