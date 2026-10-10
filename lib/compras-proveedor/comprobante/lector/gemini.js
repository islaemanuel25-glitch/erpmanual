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

import { MOTIVO_LECTURA, registrarLector, normalizarLectura, respuestaCompleta } from "./contrato.js";
// ── LOS DOS LEEN EL PAPEL INTERPRETADO (lecturaInterpretada.js) ───────────
//
// Flash con la explicación confirmada del proveedor como guía, el modelo
// grande sin ella o cuando Flash no alcanzó. Los dos devuelven la misma forma:
// el costo final de cada renglón y cómo leyeron el papel.
import { esquemaInterpretado, instruccionesInterpretadas } from "./lecturaInterpretada.js";

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

// Las esperas viven en `esperas.js`, que también lee el texto de `contrato.js`.
// Se reexportan acá porque es de donde las importa todo lo demás.
import { ESPERA_MAX_MS, ESPERA_PRO_MS } from "./esperas.js";
export { ESPERA_MAX_MS, ESPERA_PRO_MS };

/**
 * ── EL TECHO DE RAZONAMIENTO DE FLASH ────────────────────────────────────
 *
 * MEDIDO EN PRODUCCIÓN el 2026-10-10 (sesión del VPS, solo lectura): el
 * comprobante 22 —Das, pedido 255, una hoja— se cortó TRES veces por la
 * espera, a los 45 s, a los 45 s y a los 90 s, sin que Google devolviera nada
 * ni diera error. Otras fotos del mismo tamaño se leyeron. Lo más probable,
 * sin medir: Flash razona sin techo sobre ese papel y no termina. Transcribir
 * no necesita razonar largo.
 *
 * VERIFICADO EN LA DOCUMENTACIÓN DE GOOGLE el 2026-10-10, no de memoria:
 *
 *   · el campo, para `generateContent`, es `generationConfig.thinkingConfig
 *     .thinkingLevel`, con el valor como texto ("low") — el ejemplo REST de
 *     https://ai.google.dev/gemini-api/docs/generate-content/text-generation;
 *   · `gemini-3.6-flash` admite minimal, low, medium y high, y razona en
 *     medium si no se dice nada — la tabla de
 *     https://ai.google.dev/gemini-api/docs/thinking;
 *   · no se puede mandar junto con `thinkingBudget`: da 400 —
 *     https://ai.google.dev/gemini-api/docs/gemini-3.
 *
 * Se elige "low" y no "minimal": minimal es el piso, pero no está medido que
 * alcance para leer números chicos en una foto, y una lectura peor se paga con
 * una escalada al modelo grande. "low" es un escalón debajo del default y el
 * valor de los ejemplos de Google. Los tokens de razonamiento de cada llamada
 * quedan en `LlamadaLector.tokensRazonamiento`: con eso se decide si bajar.
 *
 * POR MODELO, Y SOLO LOS VERIFICADOS. El respaldo de Flash y los modelos
 * grandes no lo llevan: de `gemini-3.5-flash` la tabla no dice nada, y el
 * trabajo del grande es justamente razonar.
 */
export const NIVEL_DE_RAZONAMIENTO = Object.freeze({
  "gemini-3.6-flash": "low",
});

// ── EL MODELO GRANDE, PARA CUANDO FLASH NO ALCANZA ─────────────────────────
//
// Entra solo en tres casos y una vez por lectura: ver `escalada.js`. Es de la
// misma familia y la misma clave que el titular.
//
// ── LOS NOMBRES, MEDIDOS CONTRA LA API EL 2026-10-09 ──────────────────────
//
// Desde un contenedor descartable de la imagen de producción, con la clave de
// producción y sin escribir nada. La API listó 62 modelos; 9 tienen "pro" y
// no "latest", y los 9 contestaron 200 al GET y aceptan generateContent:
//
//     gemini-3.1-pro-preview             3.1-pro-preview-01-2026, 1.048.576 de entrada
//     gemini-2.5-pro                     estable (June 17th, 2025), 1.048.576 de entrada
//     gemini-3.1-pro-preview-customtools ajustado para herramientas propias
//     gemini-3-pro-image(-preview)       GENERAN imágenes, no las leen
//     nano-banana-pro-preview            alias del anterior
//     gemini-2.5-pro-preview-tts         texto a voz
//     lyria-3-pro-preview                música
//     deep-research-pro-preview-12-2025  investigación
//
// TITULAR, el 3.1: es el Pro más nuevo, y el lector de todos los días ya es un
// 3.6 Flash. Un Pro de una generación anterior podría razonar peor que el
// Flash al que viene a corregir. Decisión de Emanuel del 2026-10-09.
//
// RESPALDO, el 2.5 estable: el 3.1 solo existe en preview, y un preview se da
// de baja con menos aviso todavía. Por eso el respaldo de la escalada también
// entra con un 404 —ver `MOTIVOS_QUE_PASAN_EN_LA_ESCALADA` en `cadena.js`—.
//
// LO QUE NO ESTÁ MEDIDO: que acepten una foto de entrada. La metadata no dice
// qué entradas acepta un modelo, y un GET en 200 no lo prueba —`gemini-2.5-flash`
// también figuraba y su generateContent dio 404—. Lo confirma la primera
// lectura real; si el titular la rechaza, pasa al respaldo y queda anotado.
//
// `GEMINI_MODELO_PRO` y `GEMINI_MODELO_PRO_RESPALDO` los pisan, como
// `GEMINI_MODELO` pisa al lector de todos los días.
/**
 * Hasta cuántos caracteres de la respuesta se guardan en `LlamadaLector`. Una
 * boleta de veinte renglones son unos 6.000; esto deja lugar para un papel de
 * varias hojas sin que una respuesta desbocada llene la tabla.
 */
export const LARGO_MAXIMO_RESPUESTA_CRUDA = 200_000;

export const MODELO_PRO = "gemini-3.1-pro-preview";
export const MODELO_PRO_RESPALDO = "gemini-2.5-pro";


/**
 * ¿Es un alias que cambia de modelo abajo sin que nadie lo decida?
 *
 * `gemini-flash-latest`, `gemini-pro-latest`: hoy apuntan a uno y mañana a
 * otro. Para el titular lo cuida el candado del respaldo; para el modelo
 * grande lo cuida también el intérprete, que se niega a usarlo.
 */
export function esAliasMovil(modelo) {
  return /latest/i.test(String(modelo ?? ""));
}

/** El nombre del modelo grande titular que se va a usar, o null si no hay ninguno. */
export function modeloPro(env = process.env) {
  const nombre = String(env?.GEMINI_MODELO_PRO || MODELO_PRO || "").trim();
  return nombre || null;
}

/** Y el de su respaldo. */
export function modeloProRespaldo(env = process.env) {
  const nombre = String(env?.GEMINI_MODELO_PRO_RESPALDO || MODELO_PRO_RESPALDO || "").trim();
  return nombre || null;
}

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

/**
 * De un estado HTTP de Google al motivo que corresponde.
 *
 * El default sigue siendo SERVICIO_CAIDO: un 5xx desconocido ES el servicio sin
 * poder contestar. Lo que cambia es que los que NO son eso dejan de decir que
 * lo son.
 */
export function motivoPorEstado(estado, detalle = "") {
  const n = Number(estado);
  if (n === 429 || n === 402) return motivoDeCuota(detalle);
  if (n === 404) return MOTIVO_LECTURA.MODELO_NO_EXISTE;
  if (n === 401 || n === 403) return MOTIVO_LECTURA.NO_AUTORIZADO;
  if (n === 400 || n === 413 || n === 415 || n === 422) return MOTIVO_LECTURA.PEDIDO_RECHAZADO;
  return MOTIVO_LECTURA.SERVICIO_CAIDO;
}

/**
 * QUEDARSE SIN CUOTA Y QUEDARSE SIN SALDO LLEGAN LOS DOS COMO 429.
 *
 * Y se arreglan distinto: una se espera, la otra se paga. El estado no alcanza
 * para separarlas, así que se mira el cuerpo.
 *
 * ── QUÉ ESTÁ MEDIDO Y QUÉ NO, PORQUE IMPORTA ──────────────────────────────
 *
 * El cuerpo del límite gratuito SÍ está medido, contra la API y con la clave de
 * producción el 2026-09-21: trae `generate_content_free_tier_requests` y
 * `FreeTier`. Ésa es la marca que se busca primero y la única que se reconoce
 * por haberla visto.
 *
 * El cuerpo de "se acabó el saldo" NO está medido: para verlo habría que gastar
 * el saldo de Emanuel. Las palabras que se buscan salen de los errores que
 * Google documenta para una cuenta de facturación sin fondos o deshabilitada.
 * Por eso el orden importa y el default es conservador: si no se reconoce
 * ninguna marca, queda CUOTA_AGOTADA, que muestra lo que dijo el servicio con
 * sus palabras y nunca afirma algo que no sabe. El día que aparezca el cuerpo
 * real, se agrega acá con su fixture.
 */
export function motivoDeCuota(detalle = "") {
  const t = String(detalle || "").toLowerCase();
  if (t.includes("free_tier") || t.includes("freetier")) return MOTIVO_LECTURA.CUOTA_AGOTADA;
  const hablaDeLaCuenta =
    /billing account|insufficient|out of credit|no credit|balance|has been disabled|suspended|payment/.test(t);
  return hablaDeLaCuenta ? MOTIVO_LECTURA.SIN_SALDO : MOTIVO_LECTURA.CUOTA_AGOTADA;
}

/** Cuánto del error de Google se guarda. Suficiente para diagnosticar, acotado. */
export const LARGO_DETALLE = 300;

/**
 * El mensaje de Google, sin la clave y sin el cuerpo entero.
 *
 * Nunca puede tirar: es información de diagnóstico y no puede convertir un
 * error del servicio en un error de la lectura.
 */
export async function detalleDelError(respuesta) {
  try {
    const texto = await respuesta.text();
    let msg = texto;
    try {
      const j = JSON.parse(texto);
      msg = j?.error?.message || j?.error?.status || texto;
    } catch {}
    return `${respuesta.status} ${String(msg).replace(/\s+/g, " ").trim()}`.slice(0, LARGO_DETALLE);
  } catch {
    return `${respuesta?.status ?? "sin estado"} (no se pudo leer el cuerpo)`;
  }
}

/**
 * ¿Se pueden mandar TODAS las fotos? Basta con que UNA no se pueda leer: media
 * factura no es una factura, y leer la mitad daría una cuenta que no cierra
 * por el motivo equivocado.
 */
function sePuedenMandar(lista) {
  if (!lista.length) return false;
  return lista.every((a) => MIMES_SOPORTADOS.has(String(a?.mime || "").toLowerCase()));
}

/**
 * UNA CONSULTA A GEMINI, CON TODO LO QUE YA SE APRENDIÓ AL HACERLA.
 *
 * Es el cuerpo que tenía `leer` hasta el 2026-10-09, sacado tal cual para que
 * el modelo grande —`crearInterpreteGemini`— pase por el MISMO camino: cada
 * estado dice lo que es, el cuerpo del error se guarda, una respuesta que no
 * terminó no se lee y las partes de razonamiento no se mezclan. Escribirle al
 * modelo grande una llamada parecida al lado sería tener que aprender las
 * cinco cosas de abajo dos veces.
 *
 * Devuelve `{ ok: true, cruda, uso }` con el JSON ya parseado y comprobado
 * contra los obligatorios del esquema, o la falla con su motivo y su detalle.
 */
async function consultarGemini(pedido) {
  // ── CUÁNTO TARDÓ, SALGA COMO SALGA ──────────────────────────────────────
  //
  // Va en cada resultado —bien, mal o cortado por la espera— y de ahí a
  // `LlamadaLector.duracionMs`. Es lo que va a decir con datos de producción
  // qué espera necesita cada modelo.
  const inicio = Date.now();
  const r = await consultarGeminiSinMedir(pedido);
  // ── Y CUÁNTO ESCRIBIÓ Y CUÁNTO RAZONÓ, cuando Google lo informa ─────────
  //
  // Para ver en producción cuánto razona cada modelo: es lo que dirá si el
  // techo de Flash alcanza o hay que bajarlo. Una llamada que se cortó por la
  // espera no trae nada, y queda vacío — no en cero.
  const u = r.uso;
  const n = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  const tokens = u
    ? { salida: n(u.candidatesTokenCount), razonamiento: n(u.thoughtsTokenCount), total: n(u.totalTokenCount) }
    : null;
  return { ...r, duracionMs: Date.now() - inicio, tokens };
}

/** El techo de razonamiento de este modelo, o null si no tiene uno verificado. */
export function nivelDeRazonamiento(modelo) {
  return NIVEL_DE_RAZONAMIENTO[modelo] ?? null;
}

async function consultarGeminiSinMedir({ modelo, espera, texto, archivos, esquema, env, fetchImpl, conTecho = false }) {
  const cuerpo = {
    contents: [
      {
        role: "user",
        parts: [
          { text: texto },
          ...archivos.map((a) => ({
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
      responseSchema: esquema,
      // Sin creatividad: se está transcribiendo, no redactando.
      temperature: 0,
      // El techo de razonamiento, SOLO para el lector de todos los días y solo
      // en los modelos verificados: ver `NIVEL_DE_RAZONAMIENTO`. El modelo
      // grande no lo lleva nunca — razonar es su trabajo.
      ...(conTecho && nivelDeRazonamiento(modelo)
        ? { thinkingConfig: { thinkingLevel: nivelDeRazonamiento(modelo) } }
        : {}),
    },
  };

  let respuesta;
  const reloj = AbortSignal.timeout(espera);
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

  // ── CADA ESTADO DICE LO QUE ES, Y EL CUERPO SE GUARDA ─────────────
  //
  // Acá decía `if (!respuesta.ok) return SERVICIO_CAIDO` y el cuerpo se
  // tiraba. El 2026-09-21 el lector no leyó en todo el día y la bitácora
  // repitió SERVICIO_CAIDO diecinueve veces sin poder contestar por qué.
  // Medido contra la API con la clave de producción, el mismo día y con la
  // misma foto, salieron DOS causas distintas debajo de esa única etiqueta:
  //
  //   503 UNAVAILABLE   "This model is currently experiencing high demand."
  //   429 RESOURCE_EXHAUSTED  "Quota exceeded ... limit: 20, model:
  //                            gemini-3.6-flash" (GenerateRequestsPerDay...)
  //
  // Una se arregla esperando y la otra no se arregla hasta mañana. Con la
  // misma palabra para las dos, la única salida visible era reintentar — y
  // cada reintento gasta una de las veinte del día.
  if (!respuesta.ok) {
    const detalle = await detalleDelError(respuesta);
    return {
      ok: false,
      // El estado dice la familia; el CUERPO distingue quedarse sin cuota
      // de quedarse sin saldo, que llegan las dos como 429.
      motivo: motivoPorEstado(respuesta.status, detalle),
      // LO QUE DIJO GOOGLE, TAL CUAL, recortado. Es lo que faltaba para
      // poder contestar "¿por qué no lee?" sin volver a llamar a la API.
      detalle,
      estado: respuesta.status,
    };
  }

  let json;
  try {
    json = await respuesta.json();
  } catch {
    return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };
  }

  const uso = json?.usageMetadata || {};
  const candidato = json?.candidates?.[0];
  const finishReason = candidato?.finishReason ?? null;
  // ── TODAS LAS PARTES DE TEXTO, NO SOLO LA PRIMERA ────────────────────
  //
  // Se leía `parts[0].text`. La respuesta puede venir partida en varias
  // partes, y con un modelo que razona puede traer partes de pensamiento:
  // quedarse con la primera es quedarse con un pedazo.
  const salida = (candidato?.content?.parts ?? [])
    .filter((p) => typeof p?.text === "string" && p.thought !== true)
    .map((p) => p.text)
    .join("");
  // ── Y ESE TEXTO, TAL CUAL, VA A LA BITÁCORA ──────────────────────────
  //
  // Sirva o no sirva. Con Secco #256 el modelo grande no cerró y no quedó
  // nada de lo que había contestado: diagnosticarlo costaba otra lectura.
  const respuestaCruda = salida ? salida.slice(0, LARGO_MAXIMO_RESPUESTA_CRUDA) : null;
  // Lo que se guarda en la bitácora cuando la respuesta no sirve: por qué
  // terminó y cuántos tokens de salida usó. Sin esto, "llegó cortada" no se
  // puede distinguir de "el modelo contestó poco".
  const cortada = (porque) => ({
    ok: false,
    uso: json?.usageMetadata ?? null,
    respuestaCruda,
    motivo: MOTIVO_LECTURA.LECTURA_CORTADA,
    detalle:
      `${porque} · finishReason ${finishReason ?? "sin dato"} · ` +
      `tokens de salida ${uso.candidatesTokenCount ?? "sin dato"}` +
      (uso.thoughtsTokenCount != null ? ` · de razonamiento ${uso.thoughtsTokenCount}` : ""),
  });

  // ── UNA RESPUESTA QUE NO TERMINÓ NO SE LEE ───────────────────────────
  //
  // `STOP` es "terminé". Cualquier otro —se acabaron los tokens de salida,
  // seguridad, recitado— dice que lo que vino no es la respuesta entera, y
  // no se repara para quedarse con la parte que entró: guardada como
  // lectura, borra los renglones de la anterior. Hasta el 2026-10-09 esto
  // no se miraba.
  if (finishReason && finishReason !== "STOP") return cortada("el lector no terminó la respuesta");

  if (!salida) return { ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE };

  let cruda;
  try {
    cruda = JSON.parse(salida);
  } catch {
    // Un JSON que no cierra es una respuesta cortada, aunque el servicio
    // diga que terminó: no se sabe qué faltó del papel.
    return cortada("el JSON no está completo");
  }
  if (!respuestaCompleta(cruda, esquema)) {
    return cortada("al JSON le faltan campos obligatorios");
  }
  return { ok: true, cruda, uso, respuestaCruda };
}

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
      if (!sePuedenMandar(lista)) return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };

      const r = await consultarGemini({
        modelo,
        espera: ESPERA_MAX_MS,
        conTecho: true,
        texto: instruccionesInterpretadas({
          explicacion: receta?.explicacion ?? null,
          // Las del proveedor, una por tipo de comprobante: Flash todavía no
          // leyó la letra del papel (`explicacionPorTipo.js`).
          explicaciones: receta?.explicaciones ?? null,
          proveedorNombre,
          paginas: lista.length,
        }),
        archivos: lista,
        esquema: esquemaInterpretado(),
        env,
        fetchImpl,
      });
      if (!r.ok) return r;
      const { cruda, uso } = r;

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
          { modelo, interpretada: true }
        ),
        duracionMs: r.duracionMs,
        tokens: r.tokens,
        respuestaCruda: r.respuestaCruda ?? null,
      };
    },
  };
}

/**
 * EL MODELO GRANDE: LEE EL PAPEL ENTERO Y PROPONE CÓMO VIENE ARMADO.
 *
 * Mismo contrato que un lector —devuelve lo que leyó y nunca decide si está
 * bien—, con una cosa más: la propuesta de receta, CRUDA. Quien decide si la
 * lectura y la propuesta sirven es `escalada.js`, haciendo la cuenta del papel
 * con el código de siempre.
 */
export function crearInterpreteGemini({
  env = process.env,
  fetchImpl = globalThis.fetch,
  // El titular por defecto; el respaldo lo arma `armarInterpretes`.
  modelo = modeloPro(env),
} = {}) {

  return {
    nombre: modelo,

    disponible() {
      if (!env.GEMINI_API_KEY) return { ok: false, motivo: MOTIVO_LECTURA.NO_CONFIGURADO };
      // Sin un nombre medido no se llama a nada: ver `MODELO_PRO`.
      if (!modelo) return { ok: false, motivo: MOTIVO_LECTURA.NO_CONFIGURADO, porque: "SIN_MODELO" };
      // Un alias móvil cambia de modelo abajo sin que nadie lo decida.
      if (esAliasMovil(modelo)) {
        return { ok: false, motivo: MOTIVO_LECTURA.NO_CONFIGURADO, porque: "ALIAS_MOVIL" };
      }
      if (typeof fetchImpl !== "function") return { ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO };
      return { ok: true };
    },

    /**
     * @param archivos    las MISMAS fotos que leyó el lector de todos los días
     * @param receta      la del proveedor, por su explicación; o null
     * @param referencia  la lectura del lector de todos los días
     * @param motivo      por qué se escala, una clave de `ESCALADA`
     */
    async interpretar({ archivos, receta = null, referencia = null, motivo = null, proveedorNombre = null } = {}) {
      const disp = this.disponible();
      if (!disp.ok) return { ok: false, motivo: disp.motivo, detalle: disp.porque ?? null };
      const lista = Array.isArray(archivos) ? archivos : [];
      if (!sePuedenMandar(lista)) return { ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO };

      const r = await consultarGemini({
        modelo,
        espera: ESPERA_PRO_MS,
        texto: instruccionesInterpretadas({
          explicacion: receta?.explicacion ?? null,
          referencia,
          motivo,
          proveedorNombre,
          paginas: lista.length,
        }),
        archivos: lista,
        esquema: esquemaInterpretado(),
        env,
        fetchImpl,
      });
      if (!r.ok) return r;
      const cruda = r.cruda;

      return {
        ok: true,
        lectura: normalizarLectura(
          {
            ...cruda,
            consumo: {
              tokensEntrada: r.uso.promptTokenCount ?? null,
              tokensSalida: r.uso.candidatesTokenCount ?? null,
              costoMicroUsd: 0,
            },
          },
          { modelo, interpretada: true }
        ),
        // LA RECETA QUE PROPONE ES SU EXPLICACIÓN: cómo leyó este papel.
        propuesta: cruda?.explicacion ? { explicacion: String(cruda.explicacion).trim() } : null,
        duracionMs: r.duracionMs,
        tokens: r.tokens,
        respuestaCruda: r.respuestaCruda ?? null,
      };
    },
  };
}

/**
 * EL TITULAR Y EL RESPALDO DE LA ESCALADA, con la misma clave y el mismo
 * `fetch`. Es lo que recibe `escalarAlModeloGrande`.
 */
export function armarInterpretes({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return {
    titular: crearInterpreteGemini({ env, fetchImpl, modelo: modeloPro(env) }),
    respaldo: crearInterpreteGemini({ env, fetchImpl, modelo: modeloProRespaldo(env) }),
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
export async function verificarModelo({
  env = process.env,
  fetchImpl = globalThis.fetch,
  // El modelo grande pasa por la MISMA pregunta: `verificarModelo({ modelo:
  // modeloPro() })`. Sin esto, se daría de baja sin que nadie se entere hasta
  // la primera boleta que lo necesite.
  modelo = env.GEMINI_MODELO || MODELO_POR_DEFECTO,
} = {}) {
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

/**
 * LOS DOS MODELOS DE LA ESCALADA, PREGUNTADOS AL ARRANCAR.
 *
 * Devuelve los avisos, uno por modelo, para que el arranque los imprima. Si el
 * titular —un preview— ya no existe, el aviso lo dice ESE día, y dice que la
 * escalada pasa al respaldo: no es que se apague.
 *
 * @returns `[{ texto, grave }]`
 */
export async function verificarModelosPro({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!env.GEMINI_API_KEY) return [];
  const avisos = [];
  const pares = [
    ["titular", modeloPro(env)],
    ["respaldo", modeloProRespaldo(env)],
  ];
  for (const [papel, modelo] of pares) {
    const rotulo = papel === "titular" ? "el grande" : "el respaldo del grande";
    if (!modelo) {
      avisos.push({ texto: `sin modelo para ${rotulo}.`, grave: papel === "titular" });
      continue;
    }
    if (esAliasMovil(modelo)) {
      avisos.push({ texto: `${rotulo}, "${modelo}", es un alias móvil: no se usa. Fijalo a un nombre medido.`, grave: true });
      continue;
    }
    const v = await verificarModelo({ env, fetchImpl, modelo });
    if (v.ok) {
      avisos.push({ texto: `modelo de lectura verificado: ${modelo} (${rotulo}, para cuando Flash no alcanza)`, grave: false });
    } else if (v.motivo === "DADO_DE_BAJA") {
      avisos.push({
        texto:
          papel === "titular"
            ? `EL MODELO GRANDE TITULAR YA NO EXISTE: ${modelo}. La escalada pasa a su respaldo, ` +
              `${modeloProRespaldo(env) ?? "que no está configurado"}. Hay que fijar un titular vigente.`
            : `EL RESPALDO DEL MODELO GRANDE YA NO EXISTE: ${modelo}. Si el titular falla, no hay a quién pasar.`,
        grave: true,
      });
    } else {
      avisos.push({
        texto: `no se pudo verificar ${rotulo}, ${modelo} (${v.motivo}). Puede ser la red; no quiere decir que no exista.`,
        grave: false,
      });
    }
  }
  return avisos;
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
