// lib/integraciones/vinculos/codigoVinculo.js
//
// EL CÓDIGO DE UN VÍNCULO: CÓMO SE GENERA, QUÉ FORMA TIENE Y QUÉ SE GUARDA.
//
// Cuando una persona autoriza a Azul Chat desde su sesión del ERP, el ERP genera
// un código al azar, se lo muestra UNA vez y guarda solo su SHA-256. La persona
// lo pega en Azul Chat, y Azul Chat lo manda con cada consulta junto con el
// `usuarioId`. Sin el código, conocer el `usuarioId` no sirve; y el código de A
// no sirve para hablar en nombre de B, porque el vínculo dice de quién es.
//
// ── POR QUÉ ALCANZA UN SHA-256 SIN SAL ─────────────────────────────────────
//
// El código son 32 bytes de `crypto.randomBytes`: 256 bits que nadie eligió. Una
// sal o un hash lento existen para contraseñas, que una persona elige y se
// pueden adivinar probando; acá no hay nada que probar. Y un hash determinista
// es lo que permite buscar el vínculo por índice único en cada consulta.
//
// Pieza pura: la usan el lado del ERP que crea vínculos y la puerta de Azul Chat
// que los verifica, y tienen que coincidir en una sola definición.

import crypto from "node:crypto";

/** Las aplicaciones que se pueden vincular: el valor del enum `AplicacionIntegracion`. */
export const APLICACION_INTEGRACION = Object.freeze({ AZUL_CHAT: "AZUL_CHAT" });

const PREFIJO = "vin1_";
const FORMATO = /^vin1_[A-Za-z0-9_-]{43}$/;

/** Un código nuevo. Se muestra una vez y no se guarda. */
export function generarCodigoVinculo() {
  return PREFIJO + crypto.randomBytes(32).toString("base64url");
}

/** ¿Tiene la forma de un código? No dice si existe. */
export function esCodigoVinculo(valor) {
  return typeof valor === "string" && FORMATO.test(valor);
}

/** Lo único que se guarda del código. */
export function hashCodigoVinculo(codigo) {
  return crypto.createHash("sha256").update(String(codigo), "utf8").digest("hex");
}
