// lib/compras-proveedor/comprobante/lector/groq.js
//
// OTRA IMPLEMENTACIÓN DEL MISMO CONTRATO. Se elige con COMPROBANTE_LECTOR=groq.
//
// Es la prueba de que lo intercambiable servía: cuando la clave que apareció fue
// de Groq y no de Google, agregar este proveedor fue escribir este archivo. No
// se tocó la puerta, ni la verificación, ni el endpoint, ni la subida.
//
// ── HOY NO ES EL RESPALDO ACTIVO ───────────────────────────────────────────
//
// Con la foto real de un comprobante —6,2 MB, 8,2 en base64— Groq devuelve 400:
// "Failed to validate JSON". No llega a producir la salida estructurada, así que
// como respaldo no sirve: un respaldo que rechaza el caso que importa no es un
// respaldo. Medido el 2026-08-11.
//
// Queda en el repo y se puede elegir por configuración —el trabajo está hecho y
// el día que cambien los límites sirve—, pero el respaldo activo es otro MODELO
// de Gemini. Ver `MODELO_RESPALDO` en gemini.js.
//
// ── EL MODELO SE ELIGIÓ MIDIENDO, NO LEYENDO ───────────────────────────────
//
// Medido el 2026-08-11 contra la API real, con la cuenta de Emanuel:
//
//   · La cuenta ofrece 15 modelos. Se le mandó una imagen a cada candidato:
//     `groq/compound` y los `openai/gpt-oss-*` la rechazan con "content must be
//     a string" —son de texto—, los `llama-4-scout` y `llama-4-maverick` dan 404
//     (sin acceso), y `llama-3.2-11b-vision-preview` está dado de baja.
//   · El ÚNICO con visión disponible es `qwen/qwen3.6-27b`. Se confirmó
//     mandándole una imagen y pidiéndole que la describiera: la describió bien.
//
// No hay elección de modelo que hacer: es el que hay. Si mañana aparece otro,
// se cambia con GROQ_MODELO sin tocar código.
//
// ── EL CUELLO ES EL LÍMITE POR MINUTO, Y ESTÁ MEDIDO ───────────────────────
//
// La API informa 8000 tokens por minuto (`x-ratelimit-limit-tokens`) y 1000
// pedidos por día.
//
// Cuánto cuesta una imagen, medido subiendo la resolución:
//
//     256 x 256   → 1293 tokens
//     384 x 512   → 1805
//     512 x 683   → 1805
//     768 x 1024  → 1805
//
// SATURA EN 1805. El servicio reduce la imagen por su cuenta, así que mandar una
// foto de celular a resolución completa cuesta lo mismo que mandarla a 768x1024.
//
// Dos consecuencias, y la segunda importa más que la primera:
//
//  1. Entran unas CUATRO IMÁGENES POR MINUTO. Con más, la API contesta 429, que
//     acá se traduce a CUOTA_AGOTADA y el comprobante queda subido sin leer.
//     Por eso no se manda una tanda entera de golpe.
//
//  2. ACHICAR LA IMAGEN NO AHORRA TOKENS por encima de 384x512, y por debajo
//     ahorra apenas 500 a cambio de perder detalle. O sea que NO hay nada que
//     ganar reduciéndola, y por eso este lector no la toca: agregar una
//     dependencia de procesamiento de imágenes para no ahorrar nada sería costo
//     puro. El número está anotado para que nadie lo intente de nuevo.
//
// El riesgo que deja abierto es real y no lo tapa ninguna configuración: si el
// servicio reduce la imagen a ese presupuesto, la letra chica de una factura
// densa puede perderse, y mandar más píxeles NO lo arregla. Lo único que
// protege de eso es la doble ecuación de la puerta, que atrapa el número mal
// leído aunque venga con toda confianza.

import { MOTIVO_LECTURA, registrarLector, normalizarLectura } from "./contrato.js";
import { ESPERA_MAX_MS } from "./gemini.js";
import { esquemaDeSalida, instruccionesDesdeReceta } from "./promptDesdeReceta.js";

/** El único con visión disponible en la cuenta, comprobado contra la API. */
export const MODELO_POR_DEFECTO = "qwen/qwen3.6-27b";

const URL = "https://api.groq.com/openai/v1/chat/completions";

/** Medido: 8000 tokens/min y ~1805 por imagen. */
export const LIMITE_MEDIDO = Object.freeze({
  tokensPorMinuto: 8000,
  tokensPorImagen: 1805,
  imagenesPorMinuto: 4,
});

/** Groq acepta imágenes; el PDF no entra por esta vía. */
const MIMES_SOPORTADOS = new Set(["image/jpeg", "image/png", "image/webp"]);

export function crearLectorGroq({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const modelo = env.GROQ_MODELO || MODELO_POR_DEFECTO;

  return {
    nombre: modelo,

    disponible() {
      // Se informa que FALTA, nunca cuánto vale ni un fragmento: un mensaje de
      // error que muestre parte de una clave la publica en el log.
      if (!env.GROQ_API_KEY) return { ok: false, motivo: MOTIVO_LECTURA.NO_CONFIGURADO };
      if (typeof fetchImpl !== "function") return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };
      return { ok: true };
    },

    // Todas las fotos JUNTAS, en un solo pedido. OJO CON EL LÍMITE: son 1805
    // tokens por imagen sobre 8000 por minuto, así que un comprobante de dos
    // fotos gasta 3610 y entran DOS por minuto, no cuatro.
    async leer({ archivos, receta, proveedorNombre = null } = {}) {
      const lista = Array.isArray(archivos) ? archivos : [];
      if (!lista.length) return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };
      for (const a of lista) {
        if (!MIMES_SOPORTADOS.has(String(a?.mime || "").toLowerCase())) {
          return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };
        }
      }
      const cuerpo = {
        model: modelo,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruccionesDesdeReceta(receta, { proveedorNombre, paginas: lista.length }) },
              ...lista.map((a) => ({
                type: "image_url",
                image_url: {
                  url: `data:${String(a.mime).toLowerCase()};base64,${Buffer.from(a.bytes).toString("base64")}`,
                },
              })),
            ],
          },
        ],
        // SALIDA ESTRUCTURADA CON ESQUEMA, no `json_object` a secas. Medido: con
        // `json_object` el modelo respetó el JSON pero NO el esquema —devolvió un
        // arreglo donde el esquema pedía un texto—, y con `json_schema` lo
        // respetó. Un campo con el tipo cambiado es un número que después no se
        // puede sumar.
        response_format: {
          type: "json_schema",
          json_schema: { name: "comprobante", schema: esquemaDeSalida(receta) },
        },
        temperature: 0,
      };

      let respuesta;
      const reloj = AbortSignal.timeout(ESPERA_MAX_MS);
      try {
        respuesta = await fetchImpl(URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify(cuerpo),
          signal: reloj,
        });
      } catch (e) {
        if (e?.name === "TimeoutError" || reloj.aborted) {
          return { ok: false, motivo: MOTIVO_LECTURA.TARDO_DEMASIADO };
        }
        return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };
      }

      // 429 es el caso frecuente acá, no el raro: con 8000 tokens por minuto y
      // 1805 por imagen, la quinta imagen del minuto ya lo toca.
      if (respuesta.status === 429) return { ok: false, motivo: MOTIVO_LECTURA.CUOTA_AGOTADA };
      if (!respuesta.ok) return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };

      let json;
      try {
        json = await respuesta.json();
      } catch {
        return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };
      }

      const texto = json?.choices?.[0]?.message?.content;
      if (!texto) return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };

      let cruda;
      try {
        cruda = JSON.parse(texto);
      } catch {
        return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };
      }

      const uso = json?.usage || {};
      return {
        ok: true,
        lectura: normalizarLectura(
          {
            ...cruda,
            consumo: {
              tokensEntrada: uso.prompt_tokens ?? null,
              tokensSalida: uso.completion_tokens ?? null,
              // CERO PORQUE EL NIVEL GRATUITO NO COBRA, no porque no se mida.
              // Los tokens se guardan igual: son lo que va a permitir decidir,
              // más adelante, si conviene pasar a uno pago y cuánto costaría.
              costoMicroUsd: 0,
            },
          },
          { modelo }
        ),
      };
    },
  };
}

registrarLector("groq", crearLectorGroq);
