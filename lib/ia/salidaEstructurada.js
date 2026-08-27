// UNA SOLA PUERTA PARA PEDIRLE JSON ESTRUCTURADO AL MODELO.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ───────────────────────────────────────────
//
// Cuando se fue a agregar la lectura conversacional de recetas, el relevamiento
// encontró que el ERP ya llamaba a Gemini desde DOS lugares:
//
//   lib/compras-proveedor/comprobante/lector/gemini.js  — implementa el contrato
//     del registro de lectores, con su respaldo y su chequeo de modelo vigente.
//   lib/compras-proveedor/importacion/lectorArchivo.js  — lo llamaba DIRECTO, con
//     la URL base y el nombre del modelo escritos otra vez.
//
// El segundo es una copia: el mismo host, el mismo encabezado de clave, la misma
// forma de `generationConfig`. Escribir un TERCERO para las recetas habría hecho
// que el día que Google cambie algo —ya pasó dos veces— hubiera que acordarse de
// tres lugares.
//
// Así que la parte común se sacó acá y `lectorArchivo` la usa. `gemini.js` sigue
// aparte a propósito: implementa el registro de lectores, que resuelve otro
// problema —elegir proveedor por configuración— y tocarlo para esto habría sido
// un refactor de la ruta que decide qué costos entran al ERP, sin motivo.
//
// ── NO HAY NINGUNA VARIABLE DE ENTORNO NUEVA ──────────────────────────────
//
// `GEMINI_API_KEY` y `GEMINI_MODELO`, las que ya estaban. No se agregó ningún
// proveedor, SDK, modelo ni secreto: era una condición del pedido y además es lo
// correcto — un secreto nuevo hay que cargarlo en el VPS y nadie se entera de que
// falta hasta que algo no anda.
//
// ── LA CLAVE NUNCA SE IMPRIME ─────────────────────────────────────────────
//
// Ni entera ni en fragmentos, ni en un log ni en un mensaje de error. Se informa
// que FALTA, que es lo único que sirve para arreglarlo.

import { MODELO_POR_DEFECTO } from "../compras-proveedor/comprobante/lector/gemini.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Los motivos por los que una consulta puede no producir nada. */
export const MOTIVO_IA = Object.freeze({
  NO_CONFIGURADO: "NO_CONFIGURADO",
  SERVICIO_CAIDO: "SERVICIO_CAIDO",
  CUOTA_AGOTADA: "CUOTA_AGOTADA",
  RESPUESTA_ILEGIBLE: "RESPUESTA_ILEGIBLE",
  TARDO_DEMASIADO: "TARDO_DEMASIADO",
});

export const TEXTO_MOTIVO_IA = Object.freeze({
  [MOTIVO_IA.NO_CONFIGURADO]:
    "La lectura asistida no está configurada. Se puede seguir cargando a mano.",
  [MOTIVO_IA.SERVICIO_CAIDO]: "El servicio de lectura no respondió. Probá de nuevo en un rato.",
  [MOTIVO_IA.CUOTA_AGOTADA]: "Se agotó la cuota del día. Probá mañana o cargalo a mano.",
  [MOTIVO_IA.RESPUESTA_ILEGIBLE]:
    "La respuesta volvió en un formato que no se entiende. Probá reformulando la explicación.",
  [MOTIVO_IA.TARDO_DEMASIADO]: "La consulta tardó demasiado y se cortó. Probá de nuevo.",
});

export function textoMotivoIa(motivo) {
  return TEXTO_MOTIVO_IA[motivo] || "No se pudo consultar el servicio de lectura.";
}

/**
 * PIDE UNA RESPUESTA ESTRUCTURADA Y DEVUELVE EL OBJETO YA PARSEADO.
 *
 * @param instrucciones  el texto del pedido
 * @param esquema        el `responseSchema` de la salida. Obligatorio.
 * @param adjuntos       archivos opcionales `{ mime, bytes }`
 * @param timeoutMs      cuánto se espera. Por debajo del corte de nginx.
 *
 * ── SIEMPRE ESTRUCTURADA, NUNCA TEXTO LIBRE ──────────────────────────────
 *
 * No es una preferencia de estilo. Un texto que después hay que interpretar
 * mueve el problema de lugar: el intérprete sería otro lugar donde inventar un
 * dato. Por eso el esquema es obligatorio y no tiene default.
 */
export async function pedirJson({
  instrucciones,
  esquema,
  adjuntos = [],
  timeoutMs = 45_000,
  env = process.env,
  fetchImpl = globalThis.fetch,
  crearSenal = (ms) => AbortSignal.timeout(ms),
} = {}) {
  if (!esquema || typeof esquema !== "object") {
    throw new Error("pedirJson: hace falta un esquema de salida.");
  }
  if (!env.GEMINI_API_KEY) return { ok: false, motivo: MOTIVO_IA.NO_CONFIGURADO };
  if (typeof fetchImpl !== "function") return { ok: false, motivo: MOTIVO_IA.SERVICIO_CAIDO };

  const modelo = env.GEMINI_MODELO || MODELO_POR_DEFECTO;
  const cuerpo = {
    contents: [
      {
        role: "user",
        parts: [
          { text: String(instrucciones ?? "") },
          ...(Array.isArray(adjuntos) ? adjuntos : []).map((a) => ({
            inline_data: {
              mime_type: String(a.mime).toLowerCase(),
              data: Buffer.from(a.bytes).toString("base64"),
            },
          })),
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: esquema,
      // Sin creatividad: se está transcribiendo o clasificando, no redactando.
      temperature: 0,
    },
  };

  let respuesta;
  try {
    respuesta = await fetchImpl(`${BASE}/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(cuerpo),
      signal: crearSenal(Math.max(1_000, Number(timeoutMs) || 45_000)),
    });
  } catch (error) {
    // El vencimiento se distingue del servicio caído: uno se arregla esperando,
    // el otro probando después o con un archivo más liviano.
    return {
      ok: false,
      motivo: error?.name === "TimeoutError" ? MOTIVO_IA.TARDO_DEMASIADO : MOTIVO_IA.SERVICIO_CAIDO,
    };
  }

  if (respuesta.status === 429) return { ok: false, motivo: MOTIVO_IA.CUOTA_AGOTADA };
  if (!respuesta.ok) return { ok: false, motivo: MOTIVO_IA.SERVICIO_CAIDO };

  try {
    const json = await respuesta.json();
    const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return { ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE };
    const uso = json?.usageMetadata || {};
    return {
      ok: true,
      datos: JSON.parse(texto),
      modelo,
      consumo: {
        tokensEntrada: uso.promptTokenCount ?? null,
        tokensSalida: uso.candidatesTokenCount ?? null,
      },
    };
  } catch {
    return { ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE };
  }
}
