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

/** El default es un Flash: es lo que cubre el nivel gratuito. */
export const MODELO_POR_DEFECTO = "gemini-2.5-flash";

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

    async leer({ archivo, receta, proveedorNombre = null } = {}) {
      const mime = String(archivo?.mime || "").toLowerCase();
      if (!MIMES_SOPORTADOS.has(mime)) {
        // El Excel se acepta al SUBIR —el archivo se guarda igual— pero no lo lee
        // este lector. Se dice con su motivo en vez de mandarlo y que falle raro.
        return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };
      }

      const cuerpo = {
        contents: [
          {
            role: "user",
            parts: [
              { text: instruccionesDesdeReceta(receta, { proveedorNombre }) },
              { inline_data: { mime_type: mime, data: Buffer.from(archivo.bytes).toString("base64") } },
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
      try {
        respuesta = await fetchImpl(`${BASE}/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify(cuerpo),
        });
      } catch {
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

registrarLector("gemini", crearLectorGemini);
