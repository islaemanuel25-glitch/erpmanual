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
import { contadorEnMemoria, contadorPersistente } from "./contadorDeIa.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Los motivos por los que una consulta puede no producir nada. */
export const MOTIVO_IA = Object.freeze({
  NO_CONFIGURADO: "NO_CONFIGURADO",
  SERVICIO_CAIDO: "SERVICIO_CAIDO",
  CUOTA_AGOTADA: "CUOTA_AGOTADA",
  RESPUESTA_ILEGIBLE: "RESPUESTA_ILEGIBLE",
  TARDO_DEMASIADO: "TARDO_DEMASIADO",
  // El tope NUESTRO, que no es el del proveedor. Se distinguen a propósito:
  // "no queda cuota del plan" y "no te dejo gastar más hoy" llevan a mensajes
  // distintos, y confundirlos con un error del archivo sería lo peor de todo.
  LIMITE_DIARIO: "LIMITE_DIARIO",
});

/**
 * LA RED HACIA LA IA SE PUEDE PROHIBIR, Y LAS PRUEBAS LA PROHÍBEN.
 *
 * ── POR QUÉ ES UNA EXCEPCIÓN Y NO UN "no hagas eso" ───────────────────────
 *
 * Con veinte consultas por día, una suite que por descuido llame de verdad se
 * come la cuota de la jornada de trabajo. Ya pasó: el 2026-08-27 unas
 * mediciones gastaron dieciséis de veinte.
 *
 * Un comentario que pida no hacerlo no lo impide. Esto sí: cuando
 * `IA_PROHIBIR_RED` está en "1" y nadie inyectó un `fetch` de mentira, la puerta
 * LANZA en vez de salir a la red. El cargador de las pruebas —
 * `scripts/alias-loader.mjs`— la pone, así que toda la suite queda cubierta sin
 * que cada archivo tenga que acordarse.
 *
 * Lanzar y no devolver un error tranquilo es a propósito: un `{ok:false}` se
 * podría confundir con "el servicio no contestó" y pasar desapercibido. Una
 * excepción rompe la prueba y nombra el problema.
 */
export class RedDeIaProhibida extends Error {
  constructor() {
    super(
      "PRUEBA INTENTÓ LLAMAR A LA IA DE VERDAD. Las pruebas usan respuestas sintéticas: " +
        "pasá `fetchImpl` con un doble. Si de verdad hace falta una llamada real, es un " +
        "comando aparte y con autorización explícita."
    );
    this.name = "RedDeIaProhibida";
  }
}

/**
 * Se mira el entorno inyectado Y el del proceso, y alcanza con que UNO lo diga.
 *
 * La prohibición es una propiedad de la CORRIDA —"esto es una prueba"— y no de
 * la configuración que se le pasó a esta llamada. Los candados inyectan un `env`
 * de mentira con la clave adentro; si solo se mirara ése, la prohibición que
 * pone el cargador de pruebas no llegaría nunca y el control sería decorativo.
 */
export function redDeIaProhibida(env = process.env) {
  const dice = (e) => String(e?.IA_PROHIBIR_RED ?? "") === "1";
  return dice(env) || dice(process.env);
}

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
  // ── Y DESDE EL 2026-08-27 NADIE LO PIDE ────────────────────────────────
  //
  // Existía para el 503 transitorio, y era razonable mientras la cuota no
  // importara. Con VEINTE consultas por día importa: un reintento automático
  // gasta una consulta que la persona no pidió, y con el tope tan bajo esa
  // consulta puede ser la que le falte a la tarde.
  //
  // El reintento pasa a ser MANUAL: si falla, la pantalla ofrece reintentar y
  // dice que va a usar otra consulta. Se deja el parámetro porque el mecanismo
  // está probado y el día que la cuota deje de ser el problema alcanza con
  // pedirlo; hay un candado que comprueba que HOY nadie lo pide.
  reintentar = false,
  // ── QUIÉN LLEVA LA CUENTA ──────────────────────────────────────────────
  //
  // `null` significa "el que corresponda", y eso depende de dónde se esté:
  //
  //   · corriendo de verdad → el persistente, que escribe en la base y es el
  //     que comparten el importador y los comprobantes;
  //   · en las pruebas —donde la red a la IA está prohibida— → uno en memoria,
  //     porque no hay base y porque una prueba no consume cuota real.
  //
  // Resolverlo acá y no en cada llamador evita tener que tocar los treinta
  // candados que ya inyectan un `fetch` de mentira. Un candado que quiera
  // ejercer el LÍMITE inyecta el suyo, con el tope que quiera.
  contador = null,
  // Contra qué comprobante fue, cuando lo hubo. El importador no tiene.
  comprobanteId = null,
} = {}) {
  if (!esquema || typeof esquema !== "object") {
    throw new Error("pedirJson: hace falta un esquema de salida.");
  }
  // LA PROHIBICIÓN VA PRIMERO, antes incluso de mirar si hay clave. Si mirara la
  // clave antes, una prueba en una máquina sin clave saldría por NO_CONFIGURADO
  // y nunca se enteraría de que su código quería llamar de verdad — y el día que
  // corriera en una máquina CON clave, gastaría.
  if (redDeIaProhibida(env) && fetchImpl === globalThis.fetch) throw new RedDeIaProhibida();
  if (!env.GEMINI_API_KEY) return { ok: false, motivo: MOTIVO_IA.NO_CONFIGURADO };
  if (typeof fetchImpl !== "function") return { ok: false, motivo: MOTIVO_IA.SERVICIO_CAIDO };

  const cuenta =
    contador ?? (redDeIaProhibida(env) ? contadorEnMemoria({ limite: Number.MAX_SAFE_INTEGER }) : contadorPersistente);

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

    // ── SE CUENTA ANTES DE SALIR, SIEMPRE ────────────────────────────────
    //
    // Acá y no en la ruta que llama: si lo hiciera cada llamador, el día que
    // aparezca uno nuevo va a ser el día que alguien se olvide, y el síntoma es
    // un contador que dice que quedan consultas que ya no están.
    //
    // Si no hay cuota, no se sale. No es un error del archivo y por eso tiene
    // motivo propio.
    const reserva = await cuenta.reservar({ modelo, comprobanteId });
    if (!reserva.ok) {
      return {
        fin: true,
        estado: null,
        ms: 0,
        resultado: { ok: false, motivo: MOTIVO_IA.LIMITE_DIARIO, consumo: reserva },
      };
    }

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
      await cuenta.cerrar({ id: reserva.id, ok: false, motivo });
      return { fin: true, resultado: { ok: false, motivo }, estado: null, ms: ahora() - t0 };
    }

    const estado = respuesta.status;
    const ms = ahora() - t0;
    if (estado === 429) {
      await cuenta.cerrar({ id: reserva.id, ok: false, motivo: MOTIVO_IA.CUOTA_AGOTADA });
      return { fin: true, resultado: { ok: false, motivo: MOTIVO_IA.CUOTA_AGOTADA }, estado, ms };
    }
    if (!respuesta.ok) {
      await cuenta.cerrar({ id: reserva.id, ok: false, motivo: MOTIVO_IA.SERVICIO_CAIDO });
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
        await cuenta.cerrar({ id: reserva.id, ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE });
        return { fin: true, resultado: { ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE }, estado, ms };
      }
      const uso = json?.usageMetadata || {};
      await cuenta.cerrar({ id: reserva.id, ok: true, motivo: null });
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
      await cuenta.cerrar({ id: reserva.id, ok: false, motivo: MOTIVO_IA.RESPUESTA_ILEGIBLE });
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
