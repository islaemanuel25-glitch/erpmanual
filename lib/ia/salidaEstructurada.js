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

// ── EL REINTENTO, Y POR QUÉ SOLO PARA ALGUNOS ESTADOS ─────────────────────
//
// Medido contra producción el 2026-08-27, desde un contenedor descartable y con
// texto sintético: el modelo contesta **503 UNAVAILABLE** —"high demand"— y
// tarda entre 6 y 54 segundos en decirlo. Eso es transitorio: el intento
// siguiente suele salir en 2,3 segundos.
//
// El 429 NO se reintenta, y es la distinción que importa. El detalle del error
// dice `GenerateRequestsPerDayPerProjectPerModel-FreeTier` con valor **20**: es
// la cuota del DÍA, no un pico. Reintentarla no la arregla — solo hace esperar
// al que está delante de la pantalla para darle el mismo error.
//
// Tampoco se reintenta nada de 4xx que no sea 429: un 400 es un contrato mal
// armado y un 401/403 es la clave. Los tres se ven igual desde acá y ninguno
// mejora insistiendo.
const REINTENTABLES = new Set([500, 502, 503, 504]);

/**
 * Cuánto se espera CADA intento.
 *
 * No es la mitad del presupuesto por prolijidad: es que un 503 puede tardar 54
 * segundos en llegar, y esperarlo entero deja al pedido pasado del corte del
 * proxy —60 s en nginx— sin haber intentado nada más. Cortando antes se pierde
 * una respuesta que igual iba a ser un error, y se gana el segundo intento.
 *
 * El techo sale de lo medido: las respuestas BUENAS tardaron 2,3, 2,6, 2,6 y
 * 10,3 segundos. Veinte segundos son casi el doble de la peor buena.
 */
export const CORTE_POR_INTENTO_MS = 20_000;

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
  // El reloj se inyecta para que los candados puedan medir el presupuesto sin
  // esperar segundos de verdad, igual que en `lectorArchivo`.
  ahora = Date.now,
  // ── EL REINTENTO SE PIDE, NO VIENE PUESTO ──────────────────────────────
  //
  // Y es importante que sea así. `lectorArchivo` YA tiene su propio reintento
  // —para cuando la foto vuelve sin renglones— con su propio presupuesto. Si
  // acá se reintentara por defecto, los dos se multiplicarían: hasta CUATRO
  // llamadas al modelo en un solo pedido, contra una cuota de veinte por día, y
  // hasta ochenta segundos contra un corte de proxy de sesenta.
  //
  // Lo pide el camino que puede pagarlo: la vista previa de la explicación, que
  // hace UNA llamada y no escribe nada.
  reintentar = false,
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

  // El presupuesto TOTAL lo sigue fijando quien llama; lo que cambia es que ya
  // no se gasta entero en un solo intento.
  const presupuesto = Math.max(1_000, Number(timeoutMs) || 45_000);
  // Sin reintento, cada intento recibe el presupuesto ENTERO: recortarlo a 20 s
  // le cambiaría el contrato a `lectorArchivo`, que pide 45 y tiene candados que
  // lo afirman. El recorte existe para que quepan DOS, así que solo aplica
  // cuando va a haber dos.
  const porIntento = reintentar ? Math.min(CORTE_POR_INTENTO_MS, presupuesto) : presupuesto;
  const arranque = ahora();
  const gastado = () => ahora() - arranque;
  const intentos = [];

  const unIntento = async (corteMs) => {
    const t0 = ahora();
    let respuesta;
    try {
      respuesta = await fetchImpl(`${BASE}/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify(cuerpo),
        signal: crearSenal(Math.max(1_000, corteMs)),
      });
    } catch (error) {
      // El vencimiento se distingue del servicio caído: uno se arregla esperando,
      // el otro probando después o con un archivo más liviano.
      const motivo =
        error?.name === "TimeoutError" ? MOTIVO_IA.TARDO_DEMASIADO : MOTIVO_IA.SERVICIO_CAIDO;
      return { fin: true, resultado: { ok: false, motivo }, estado: null, ms: ahora() - t0 };
    }

    const estado = respuesta.status;
    const ms = ahora() - t0;
    if (estado === 429) {
      return { fin: true, resultado: { ok: false, motivo: MOTIVO_IA.CUOTA_AGOTADA }, estado, ms };
    }
    if (!respuesta.ok) {
      return {
        fin: !REINTENTABLES.has(estado),
        resultado: { ok: false, motivo: MOTIVO_IA.SERVICIO_CAIDO },
        estado,
        ms,
      };
    }

    try {
      const json = await respuesta.json();
      const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) {
        return { fin: true, resultado: { ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE }, estado, ms };
      }
      const uso = json?.usageMetadata || {};
      return {
        fin: true,
        estado,
        ms: ahora() - t0,
        resultado: {
          ok: true,
          datos: JSON.parse(texto),
          modelo,
          consumo: {
            tokensEntrada: uso.promptTokenCount ?? null,
            tokensSalida: uso.candidatesTokenCount ?? null,
          },
        },
      };
    } catch {
      return { fin: true, resultado: { ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE }, estado, ms };
    }
  };

  let ultimo = await unIntento(porIntento);
  intentos.push({ estado: ultimo.estado, ms: ultimo.ms });

  // UN reintento y nada más, y solo si el presupuesto todavía alcanza para uno
  // entero. Volver a salir con dos segundos de margen no es reintentar: es
  // garantizar un TimeoutError y gastarle el tiempo al que espera.
  const alcanza = presupuesto - gastado() >= porIntento;
  if (reintentar && !ultimo.resultado.ok && !ultimo.fin && alcanza) {
    ultimo = await unIntento(Math.min(porIntento, presupuesto - gastado()));
    intentos.push({ estado: ultimo.estado, ms: ultimo.ms });
  }

  // La traza viaja SIEMPRE: son números y estados, nunca el prompt ni el
  // documento. Quien la lee necesita saber cuántos intentos hubo, qué contestó
  // el proveedor y cuánto tardó cada uno — nada de eso identifica una factura.
  return { ...ultimo.resultado, modelo, intentos, msTotal: gastado() };
}
