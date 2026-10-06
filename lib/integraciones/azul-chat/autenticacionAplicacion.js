// lib/integraciones/azul-chat/autenticacionAplicacion.js
//
// ¿ESTA SOLICITUD LA MANDÓ AZUL CHAT? Autenticación MÁQUINA A MÁQUINA.
//
// ── LO QUE NO SE USA, Y POR QUÉ ────────────────────────────────────────────
//
// Nada de la sesión del ERP: ni `AUTH_SECRET`, ni la cookie `erpazul_sesion`, ni
// `erpazul_contexto_activo`, ni un JWT administrativo, ni el comodín `*`, ni los
// vouchers del POS offline. Todo eso autentica a una PERSONA en el navegador.
// Usarlo para una aplicación significaría que Azul Chat tiene en la mano algo
// que abre el ERP entero — y que filtrar ese secreto filtra todas las sesiones.
// Esta función ni siquiera lee la cabecera `cookie`.
//
// ── LO QUE SE USA ──────────────────────────────────────────────────────────
//
// Un secreto PROPIO de la integración, en `AZUL_CHAT_INTEGRACION_SECRET`, que
// conocen solo el ERP y Azul Chat. El secreto no viaja: cada solicitud lleva una
// FIRMA HMAC-SHA256 de su contenido exacto, con una marca de tiempo:
//
//   firma = HMAC_SHA256(secreto, "v1\n" + aplicacion + "\n" + marca + "\n" + cuerpo)
//
// Así una firma no sirve para otro cuerpo, ni para otra aplicación, ni pasados
// cinco minutos. La comparación es de tiempo constante.
//
// Sin el secreto configurado, la integración está APAGADA: no hay un default.
// Un secreto corto, o igual a `AUTH_SECRET`, también la apaga — es un error de
// configuración y se dice, en vez de seguir con un secreto débil o compartido.
//
// ── LO QUE TODAVÍA NO HACE ─────────────────────────────────────────────────
//
// No guarda las firmas ya vistas, así que una solicitud capturada se puede
// repetir dentro de la ventana de cinco minutos. Para una capacidad de SOLO
// LECTURA eso repite una consulta, no una operación. Cerrarlo pide un registro
// de nonces, que es una tabla y por lo tanto una migración: queda para cuando
// exista una capacidad que escriba.
//
// Nunca se escribe en un log ni el secreto, ni la firma, ni el cuerpo.

import crypto from "node:crypto";

/**
 * Las aplicaciones que pueden autenticarse, de qué variable sale su secreto y
 * con qué valor de `AplicacionIntegracion` se guardan sus vínculos: un vínculo
 * hecho para Azul Chat no le sirve a otra aplicación.
 */
export const APLICACIONES = Object.freeze({
  "azul-chat": Object.freeze({ variableSecreto: "AZUL_CHAT_INTEGRACION_SECRET", vinculo: "AZUL_CHAT" }),
});

export const CABECERAS = Object.freeze({
  aplicacion: "x-erp-integracion-aplicacion",
  marca: "x-erp-integracion-marca",
  firma: "x-erp-integracion-firma",
});

/** Cuánto puede diferir la marca de tiempo del reloj del ERP, en segundos. */
export const TOLERANCIA_SEGUNDOS = 300;

/** Un HMAC-SHA256 con un secreto más corto que esto es adivinable. */
export const LARGO_MINIMO_SECRETO = 32;

const VERSION_FIRMA = "v1";

/** El texto exacto que se firma. Una sola definición, para los dos lados. */
//
// SE FIRMAN BYTES, NO TEXTO. El cuerpo entra a la firma tal cual llegó por la
// red: la ruta HTTP lo lee como bytes y se los pasa a esta función sin
// decodificarlo, así que no hay ningún paso —UTF-8, BOM, espacios, orden de
// claves— entre lo que se firmó y lo que se verifica. Un string se acepta por
// comodidad de quien firma, y entra como sus bytes UTF-8, que es lo mismo que
// el cliente pone en el cable.
function cuerpoEnBytes(cuerpo) {
  if (typeof cuerpo === "string") return Buffer.from(cuerpo, "utf8");
  if (cuerpo instanceof Uint8Array) return Buffer.from(cuerpo.buffer, cuerpo.byteOffset, cuerpo.byteLength);
  return null;
}

/**
 * La firma de una solicitud. La usa Azul Chat para firmar y el ERP para
 * verificar; se exporta para que el contrato esté escrito en un solo lugar.
 *
 *   HMAC_SHA256(secreto, "v1\n" + aplicacion + "\n" + marca + "\n" ‖ bytes del cuerpo)
 *
 * @param {{secreto:string, aplicacion:string, marca:string, cuerpo:string|Uint8Array}} args
 * @returns {string} hex de 64 caracteres
 */
export function firmarSolicitud({ secreto, aplicacion, marca, cuerpo }) {
  return crypto
    .createHmac("sha256", String(secreto))
    .update(`${VERSION_FIRMA}\n${aplicacion}\n${marca}\n`, "utf8")
    .update(cuerpoEnBytes(cuerpo) ?? Buffer.alloc(0))
    .digest("hex");
}

function leerCabecera(headers, nombre) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(nombre);
  // Objeto plano: las cabeceras HTTP no distinguen mayúsculas.
  const clave = Object.keys(headers).find((k) => k.toLowerCase() === nombre);
  return clave === undefined ? null : headers[clave];
}

const rechazo = (status, codigo, error) => ({ ok: false, status, codigo, error });

/**
 * Verifica que la solicitud venga de una aplicación conocida y no se haya
 * alterado.
 *
 * @param {object} args
 * @param {Headers|object} args.headers
 * @param {Uint8Array|string} args.cuerpo el cuerpo CRUDO, en bytes tal como llegó: se verifica sobre esos bytes.
 * @param {object} [args.entorno=process.env]
 * @param {number} [args.ahora=Date.now()] milisegundos.
 * @returns {{ok:true, aplicacion:string} | {ok:false, status:number, codigo:string, error:string}}
 */
export function autenticarAplicacion({ headers, cuerpo, entorno = process.env, ahora = Date.now() }) {
  const aplicacion = leerCabecera(headers, CABECERAS.aplicacion);
  if (typeof aplicacion !== "string" || !Object.prototype.hasOwnProperty.call(APLICACIONES, aplicacion)) {
    return rechazo(401, "APLICACION_DESCONOCIDA", "La solicitud no identifica una aplicación habilitada.");
  }

  // La configuración se mira ANTES que la firma: con el secreto mal puesto no
  // hay nada que verificar, y decirlo es lo que permite arreglarlo.
  const secreto = entorno?.[APLICACIONES[aplicacion].variableSecreto];
  if (!secreto) {
    return rechazo(503, "INTEGRACION_DESHABILITADA", "La integración no está configurada en este ERP.");
  }
  if (String(secreto).length < LARGO_MINIMO_SECRETO) {
    return rechazo(503, "SECRETO_DEBIL", `El secreto de la integración tiene menos de ${LARGO_MINIMO_SECRETO} caracteres.`);
  }
  if (entorno?.AUTH_SECRET && String(secreto) === String(entorno.AUTH_SECRET)) {
    return rechazo(503, "SECRETO_COMPARTIDO", "El secreto de la integración no puede ser el de las sesiones del ERP.");
  }

  const marca = leerCabecera(headers, CABECERAS.marca);
  if (typeof marca !== "string" || !/^\d{1,12}$/.test(marca)) {
    return rechazo(401, "MARCA_INVALIDA", "La solicitud no trae una marca de tiempo válida.");
  }
  if (Math.abs(Math.floor(ahora / 1000) - Number(marca)) > TOLERANCIA_SEGUNDOS) {
    return rechazo(401, "MARCA_VENCIDA", "La marca de tiempo de la solicitud está fuera de la ventana aceptada.");
  }

  const firma = leerCabecera(headers, CABECERAS.firma);
  if (typeof firma !== "string" || !/^[0-9a-f]{64}$/.test(firma)) {
    return rechazo(401, "FIRMA_INVALIDA", "La firma de la solicitud no es válida.");
  }
  if (cuerpoEnBytes(cuerpo) === null) {
    return rechazo(400, "CUERPO_INVALIDO", "La solicitud no trae un cuerpo.");
  }

  const esperada = Buffer.from(firmarSolicitud({ secreto, aplicacion, marca, cuerpo }), "hex");
  const recibida = Buffer.from(firma, "hex");
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) {
    return rechazo(401, "FIRMA_INVALIDA", "La firma de la solicitud no es válida.");
  }

  return { ok: true, aplicacion, vinculo: APLICACIONES[aplicacion].vinculo };
}
