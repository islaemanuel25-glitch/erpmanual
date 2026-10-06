// lib/integraciones/vinculos/codigoVinculo.js
//
// LAS DOS CREDENCIALES DE UN VÍNCULO: CÓMO SE GENERAN, QUÉ FORMA TIENEN Y QUÉ SE
// GUARDA.
//
// ── EL CÓDIGO DE CANJE: HUMANO, 10 MINUTOS, UNA VEZ ─────────────────────────
//
// Cuando una persona autoriza a Azul Chat desde su sesión del ERP, el ERP genera
// un código al azar, se lo muestra UNA vez y guarda solo su SHA-256 (en
// `VinculoIntegracion.codigoHash`). La persona lo pega en Azul Chat, y el
// backend de Azul Chat lo CANJEA: vale `VIDA_CODIGO_CANJE_MS` desde que se
// autorizó y una sola vez. No sirve para consultar. Ver canje.js.
//
// ── EL TOKEN DE DELEGACIÓN: DE MÁQUINA ─────────────────────────────────────
//
// El canje devuelve un token que nunca ve una persona ni un navegador: lo
// guarda el backend de Azul Chat y lo manda con cada consulta. El ERP guarda
// solo su SHA-256 (en `DelegacionIntegracion.tokenHash`) y deriva de él a quién
// representa: el `usuarioId` no viaja en la consulta, así que no hay cómo
// cambiarlo manteniendo el token.
//
// Los prefijos distintos (`vin1_` y `del1_`) dicen cuál es cuál a simple vista
// —en un log que no debió existir, en un soporte— sin quitar entropía: los 32
// bytes al azar van completos después del prefijo. Un código pasado como token,
// o al revés, no tiene la forma y se rechaza sin buscarlo.
//
// ── POR QUÉ ALCANZA UN SHA-256 SIN SAL ─────────────────────────────────────
//
// Los dos son 32 bytes de `crypto.randomBytes`: 256 bits que nadie eligió. Una
// sal o un hash lento existen para contraseñas, que una persona elige y se
// pueden adivinar probando; acá no hay nada que probar. Y un hash determinista
// es lo que permite buscarlos por índice único.
//
// Pieza pura: la usan el lado del ERP que crea vínculos y la puerta de Azul Chat
// que los verifica, y tienen que coincidir en una sola definición.

import crypto from "node:crypto";

/** Las aplicaciones que se pueden vincular: el valor del enum `AplicacionIntegracion`. */
export const APLICACION_INTEGRACION = Object.freeze({ AZUL_CHAT: "AZUL_CHAT" });

/**
 * Cuánto vale un código de canje desde que se autorizó. La base lo exige con el
 * mismo número en el trigger de la migración 20261006150000_delegacion_integracion;
 * un candado comprueba que coincidan.
 */
export const VIDA_CODIGO_CANJE_MS = 10 * 60 * 1000;

/** Bytes al azar de cada credencial: 256 bits. */
export const BYTES_DE_CREDENCIAL = 32;

const PREFIJO_CODIGO = "vin1_";
const FORMATO_CODIGO = /^vin1_[A-Za-z0-9_-]{43}$/;
const PREFIJO_TOKEN = "del1_";
const FORMATO_TOKEN = /^del1_[A-Za-z0-9_-]{43}$/;

const sha256Hex = (valor) => crypto.createHash("sha256").update(String(valor), "utf8").digest("hex");

/** Un código nuevo. Se muestra una vez y no se guarda. */
export function generarCodigoVinculo() {
  return PREFIJO_CODIGO + crypto.randomBytes(BYTES_DE_CREDENCIAL).toString("base64url");
}

/** ¿Tiene la forma de un código? No dice si existe. */
export function esCodigoVinculo(valor) {
  return typeof valor === "string" && FORMATO_CODIGO.test(valor);
}

/** Lo único que se guarda del código. */
export function hashCodigoVinculo(codigo) {
  return sha256Hex(codigo);
}

/** Cuándo deja de servir el código de un vínculo autorizado en `autorizadoEn`. */
export function vencimientoDelCodigo(autorizadoEn) {
  return new Date(new Date(autorizadoEn).getTime() + VIDA_CODIGO_CANJE_MS);
}

/** Un token de delegación nuevo. Se entrega una vez, al backend que canjeó, y no se guarda. */
export function generarTokenDelegacion() {
  return PREFIJO_TOKEN + crypto.randomBytes(BYTES_DE_CREDENCIAL).toString("base64url");
}

/** ¿Tiene la forma de un token? No dice si existe. */
export function esTokenDelegacion(valor) {
  return typeof valor === "string" && FORMATO_TOKEN.test(valor);
}

/** Lo único que se guarda del token. */
export function hashTokenDelegacion(token) {
  return sha256Hex(token);
}
