// lib/integraciones/azul-chat/cuerpoHttp.js
//
// LO QUE LA RUTA HTTP MIRA ANTES DE LA PUERTA: el tipo de contenido y el
// cuerpo, leído como BYTES y con tope.
//
// ── POR QUÉ BYTES Y NO `req.json()` NI `req.text()` ────────────────────────
//
// La firma se verifica sobre lo que llegó por la red. `req.json()` parsea
// antes de que nadie haya verificado nada, y `req.text()` decodifica con
// reemplazo —una secuencia UTF-8 inválida se vuelve U+FFFD y un BOM se
// pierde—, así que dos cuerpos distintos podrían verse iguales. Acá el cuerpo
// sale como `Uint8Array`, la firma se verifica sobre esos bytes, y recién
// después la puerta los decodifica, en modo estricto.
//
// ── POR QUÉ CON TOPE MIENTRAS SE LEE ───────────────────────────────────────
//
// `Content-Length` lo escribe el cliente y puede mentir o faltar. Se mira para
// cortar temprano, pero el tope que vale es el de los bytes que efectivamente
// llegan: pasado el límite se deja de leer y se cancela el resto.

/** ¿Es `application/json`, con a lo sumo `charset=utf-8`? */
export function esTipoJson(contentType) {
  if (typeof contentType !== "string") return false;
  const [tipo, ...params] = contentType.split(";").map((s) => s.trim().toLowerCase());
  if (tipo !== "application/json") return false;
  return params.every((p) => p === "" || p === "charset=utf-8");
}

/**
 * Lee el cuerpo completo, sin pasarse de `max` bytes.
 *
 * @param {Request} req
 * @param {number} max
 * @returns {Promise<{ok:true, bytes:Uint8Array} | {ok:false, motivo:"DEMASIADO_GRANDE"|"VACIO"}>}
 */
export async function leerCuerpoAcotado(req, max) {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > max) return { ok: false, motivo: "DEMASIADO_GRANDE" };
  if (!req.body) return { ok: false, motivo: "VACIO" };

  const lector = req.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => {});
      return { ok: false, motivo: "DEMASIADO_GRANDE" };
    }
    partes.push(value);
  }
  if (total === 0) return { ok: false, motivo: "VACIO" };
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  return { ok: true, bytes };
}
