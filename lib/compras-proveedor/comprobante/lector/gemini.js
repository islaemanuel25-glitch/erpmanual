// lib/compras-proveedor/comprobante/lector/gemini.js
//
// UNA IMPLEMENTACIÓN DEL CONTRATO, NO EL LECTOR DEL MÓDULO.
//
// Todo lo específico de Google vive acá adentro y en ningún otro lado: ni la
// puerta, ni la ruta, ni la verificación saben que existe Gemini. Cambiar de
// proveedor es escribir otro archivo como este y cambiar `COMPROBANTE_LECTOR`.
//
// ── POR QUÉ ESTO IMPORTA MÁS QUE EL AHORRO ─────────────────────────────────
//
// En abril de 2026 Google cambió las condiciones del nivel gratuito de AI Studio
// y sacó los modelos Pro. Lo que hoy sale cero puede dejar de estar mañana. Si
// el proveedor estuviera cableado adentro del módulo, ese día habría que tocar
// el código que decide qué costos entran al ERP, con apuro y sin margen para
// verificar. Así, ese día se cambia una variable de entorno.
//
// ── EL MODELO ES FLASH, Y ES DELIBERADO ────────────────────────────────────
//
// El nivel gratuito cubre los Flash. La contracara es que Flash se equivoca más
// que un Pro leyendo números chicos en una foto torcida — y eso está contemplado:
// no se confía en la lectura, se la verifica. Medido sobre las dos facturas
// reales con 125 lecturas mal hechas, la puerta atrapa el 100 %. Que Flash falle
// más cambia cuánto hay que cargar a mano; no cambia qué entra al ERP.
//
// ── LA CLAVE ───────────────────────────────────────────────────────────────
//
// Sale de `GEMINI_API_KEY`, que va en el `.env.prod` del VPS. NUNCA en el repo,
// nunca en el compose versionado, y nunca impresa en un log ni en un mensaje de
// error — por eso `disponible()` informa que falta, sin decir qué vale.

import { MOTIVO_LECTURA, registrarLector, normalizarLectura } from "./contrato.js";
import { esquemaDeSalida, instruccionesDesdeReceta } from "./promptDesdeReceta.js";

// ── EL NOMBRE DEL MODELO SE MIDE, NO SE ESCRIBE DE MEMORIA ─────────────────
//
// El 2026-08-11 este archivo decía `gemini-2.5-flash` y Google contestaba 404:
// "no longer available to new users". La lectura falló en producción por eso, y
// el nombre estaba escrito de memoria — con el comentario de más arriba, el que
// advierte que Google cambia el nivel gratuito sin avisar, tres líneas más
// abajo. Advertirlo y no comprobarlo es no haberlo advertido.
//
// Medidos contra la API real, con la clave de Emanuel y una foto de factura de
// verdad, el 2026-08-11:
//
//     gemini-3.6-flash        200 · 35 s
//     gemini-3.5-flash        200 · 18 s
//     gemini-flash-latest     200 · 24 s
//     gemini-3.1-flash-lite   200 · 12 s
//     gemini-2.5-flash        404 · dado de baja
//     gemini-2.5-flash-lite   404 · dado de baja
//
// Y hay un chequeo al arrancar que le pregunta a la API si el modelo
// configurado sigue existiendo: ver `verificarModelo`. El aviso tiene que
// llegar antes de que alguien esté con el camión en la puerta.
export const MODELO_POR_DEFECTO = "gemini-3.6-flash";

/**
 * El respaldo: OTRO MODELO, no otro proveedor.
 *
 * Groq quedó en el repo y se puede elegir por configuración, pero no como
 * respaldo activo: con la foto real de 6,2 MB devuelve 400 —"Failed to validate
 * JSON"— así que no es un respaldo. Un respaldo que rechaza el caso que importa
 * no es un respaldo.
 *
 * Va FIJADO y no `gemini-flash-latest`: un alias móvil cambia de modelo abajo
 * sin que nadie lo decida, que es exactamente la clase de sorpresa que este
 * archivo existe para evitar.
 */
export const MODELO_RESPALDO = "gemini-3.5-flash";

/**
 * Cuánto se espera una lectura.
 *
 * 45 segundos, POR DEBAJO de los 60 de `proxy_read_timeout` de nginx. Así el
 * que corta es la aplicación, con su propio mensaje, y no el proxy con una
 * página HTML que además rompe el `r.json()` de la pantalla — que es
 * exactamente lo que pasó con el 413 del 2026-08-11.
 *
 * Medido: una lectura real tarda entre 12 y 35 segundos según el modelo, así que
 * 45 deja margen sin dejar a nadie esperando de más.
 */
export const ESPERA_MAX_MS = 45_000;

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Qué tipos de archivo sabe mandar esta implementación. */
const MIMES_SOPORTADOS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export function crearLectorGemini({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const modelo = env.GEMINI_MODELO || MODELO_POR_DEFECTO;

  return {
    nombre: modelo,

    disponible() {
      // Se informa que FALTA, nunca cuánto vale ni un fragmento. Un mensaje de
      // error que muestre parte de una clave la publica en el log.
      if (!env.GEMINI_API_KEY) return { ok: false, motivo: MOTIVO_LECTURA.NO_CONFIGURADO };
      if (typeof fetchImpl !== "function") return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };
      return { ok: true };
    },

    // Recibe TODAS las fotos del comprobante y las manda JUNTAS, en un solo
    // pedido: una factura larga viene en varias fotos y el total del pie tiene
    // que poder sumarse contra las líneas del encabezado. Leerlas por separado
    // haría que ninguna cerrara nunca.
    async leer({ archivos, receta, proveedorNombre = null } = {}) {
      const lista = Array.isArray(archivos) ? archivos : [];
      if (!lista.length) return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };
      // Basta con que UNA no se pueda leer: media factura no es una factura, y
      // leer la mitad daría una cuenta que no cierra por el motivo equivocado.
      for (const a of lista) {
        if (!MIMES_SOPORTADOS.has(String(a?.mime || "").toLowerCase())) {
          return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };
        }
      }

      const cuerpo = {
        contents: [
          {
            role: "user",
            parts: [
              { text: instruccionesDesdeReceta(receta, { proveedorNombre, paginas: lista.length }) },
              ...lista.map((a) => ({
                inline_data: {
                  mime_type: String(a.mime).toLowerCase(),
                  data: Buffer.from(a.bytes).toString("base64"),
                },
              })),
            ],
          },
        ],
        generationConfig: {
          // SALIDA ESTRUCTURADA, NUNCA TEXTO LIBRE. Un texto que después hay que
          // interpretar mueve el problema de lugar: el intérprete sería otro
          // lugar donde inventar un número.
          responseMimeType: "application/json",
          responseSchema: esquemaDeSalida(receta),
          // Sin creatividad: se está transcribiendo, no redactando.
          temperature: 0,
        },
      };

      let respuesta;
      const reloj = AbortSignal.timeout(ESPERA_MAX_MS);
      try {
        respuesta = await fetchImpl(`${BASE}/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify(cuerpo),
          signal: reloj,
        });
      } catch (e) {
        // El vencimiento se distingue del servicio caído: uno se arregla
        // esperando, el otro sacando una foto más liviana o probando después.
        if (e?.name === "TimeoutError" || reloj.aborted) {
          return { ok: false, motivo: MOTIVO_LECTURA.TARDO_DEMASIADO };
        }
        return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };
      }

      if (respuesta.status === 429) return { ok: false, motivo: MOTIVO_LECTURA.CUOTA_AGOTADA };
      if (!respuesta.ok) return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };

      let json;
      try {
        json = await respuesta.json();
      } catch {
        return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };
      }

      const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };

      let cruda;
      try {
        cruda = JSON.parse(texto);
      } catch {
        return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };
      }

      const uso = json?.usageMetadata || {};
      return {
        ok: true,
        lectura: normalizarLectura(
          {
            ...cruda,
            consumo: {
              tokensEntrada: uso.promptTokenCount ?? null,
              tokensSalida: uso.candidatesTokenCount ?? null,
              // CERO PORQUE EL NIVEL GRATUITO NO COBRA, no porque no se mida. Los
              // tokens se guardan igual: son el único dato que va a permitir
              // decidir, dentro de unos meses, si conviene pasar a uno pago y
              // cuánto costaría. Sin eso, esa conversación empieza sin números.
              costoMicroUsd: 0,
            },
          },
          { modelo }
        ),
      };
    },
  };
}

/**
 * ¿EL MODELO CONFIGURADO SIGUE EXISTIENDO?
 *
 * Le pregunta a la API. Google da modelos de baja sin avisar —pasó con
 * `gemini-2.5-flash` el 2026-08-11— y el síntoma es un 404 en medio de una
 * recepción, con el camión en la puerta. Este chequeo lo adelanta al arranque.
 *
 * NO tumba la aplicación ni bloquea nada: informa. Es la misma regla que el
 * chequeo del volumen — un problema del módulo de comprobantes no puede dejar
 * sin POS a los locales.
 */
export async function verificarModelo({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const modelo = env.GEMINI_MODELO || MODELO_POR_DEFECTO;
  if (!env.GEMINI_API_KEY) return { ok: false, motivo: MOTIVO_LECTURA.NO_CONFIGURADO, modelo };
  try {
    const r = await fetchImpl(`${BASE}/${modelo}`, {
      headers: { "x-goog-api-key": env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 404) {
      return {
        ok: false,
        modelo,
        motivo: "DADO_DE_BAJA",
        queHacer:
          `El modelo "${modelo}" ya no existe en la API de Google. Los comprobantes NO se van ` +
          "a poder leer hasta que se cambie GEMINI_MODELO por uno vigente. La lista de los que " +
          "hay se pide a la API; no se escribe de memoria.",
      };
    }
    if (!r.ok) return { ok: false, modelo, motivo: "NO_SE_PUDO_PREGUNTAR", estado: r.status };
    return { ok: true, modelo };
  } catch {
    // Que la consulta falle no prueba que el modelo no exista: puede ser la red.
    // Se dice como lo que es y no como una baja.
    return { ok: false, modelo, motivo: "NO_SE_PUDO_PREGUNTAR" };
  }
}

registrarLector("gemini", crearLectorGemini);

// EL RESPALDO ES OTRO MODELO, NO OTRO PROVEEDOR. Se registra con nombre propio
// para que se elija por configuración igual que cualquier otro:
// COMPROBANTE_LECTOR_RESPALDO=gemini-respaldo.
//
// Groq sigue en el repo y se puede elegir, pero no como respaldo activo: con la
// foto real de 6,2 MB devuelve 400 y no produce la salida estructurada.
registrarLector("gemini-respaldo", ({ env = process.env, fetchImpl } = {}) =>
  crearLectorGemini({
    // El modelo del respaldo NO sale de GEMINI_MODELO: si saliera, cambiar el
    // titular cambiaría el respaldo al mismo modelo y dejaría de ser un
    // respaldo. `respaldoInutil` lo detectaría, pero mejor que no pase.
    env: { ...env, GEMINI_MODELO: env.GEMINI_MODELO_RESPALDO || MODELO_RESPALDO },
    fetchImpl,
  })
);
