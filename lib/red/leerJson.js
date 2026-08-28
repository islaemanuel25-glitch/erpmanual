// LEER UNA RESPUESTA DE LA API SIN CREER QUE SIEMPRE ES JSON.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// El 2026-08-27, en producción, "Ver cómo quedaría" mostró esto:
//
//     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
//
// Ese texto no lo escribió nadie del proyecto: es el error del parser de JSON
// del navegador al recibir una página HTML. La pantalla hacía
// `await respuesta.json()` sin mirar nada antes, así que cualquier cosa que no
// fuera JSON —una página de 404, una de error del proxy, una pantalla de
// login— salía a la cara del usuario convertida en un mensaje del motor.
//
// Lo grave no es que sea feo. Es que **no dice nada**: no dice qué operación
// falló, no dice con qué código, y no distingue "la ruta no existe" de "se cayó
// el servidor" de "se venció la sesión". Los tres se ven idénticos, y los tres
// se arreglan distinto.
//
// ── EL ORDEN IMPORTA, Y ES AL REVÉS DE LO QUE PARECE ──────────────────────
//
// Lo primero NO es mirar `respuesta.ok`. Las rutas de este proyecto contestan
// JSON *también* cuando fallan —`{ ok: false, error: "..." }` con 401, 409 o
// 502— y ese texto está escrito para que alguien lo lea. Cortar por el estado
// HTTP antes de leer el cuerpo tiraría el único mensaje bueno que hay y lo
// reemplazaría por uno genérico.
//
// Entonces: primero se mira si el cuerpo ES json. Si lo es, manda el mensaje
// del servidor, tenga el estado que tenga. Si NO lo es, recién ahí se arma un
// mensaje con lo único que quedó: la operación y el código.
//
// ── Y EL HTML NO SE MUESTRA ────────────────────────────────────────────────
//
// Una página de error puede traer rutas internas, nombres de archivo o un
// volcado de stack. Nada de eso va a la pantalla: se informa QUÉ pasó, no el
// cuerpo. Hay un candado que lo comprueba.

/** Lo que se informa cuando el cuerpo no era json. Lo mira la pantalla. */
export const RESPUESTA_NO_JSON = "RESPUESTA_NO_JSON";

/**
 * El encabezado con el identificador del pedido.
 *
 * Se declara acá y no se importa de `lib/ia/trazaDePedido.js` a propósito: ese
 * módulo es de SERVIDOR y este viaja al navegador. Importarlo arrastraría el
 * llamador del modelo al bundle del cliente — el mismo error que ya se cometió
 * una vez con `LARGO_MAXIMO_EXPLICACION`. Hay un candado que comprueba que las
 * dos constantes digan lo mismo.
 */
export const CABECERA_REQUEST_ID = "x-request-id";

/**
 * ¿El cuerpo es una página y no una respuesta de la API?
 *
 * Se mira el principio del texto y no el `Content-Type`: un proxy puede mandar
 * HTML rotulado `text/plain`, y al revés un JSON legítimo nunca empieza con `<`.
 */
export function pareceHtml(texto = "") {
  return /^\s*(<!doctype|<html|<\?xml|<)/i.test(String(texto ?? ""));
}

/** ¿El `Content-Type` promete json? Vale `application/json` y sus variantes. */
export function prometeJson(contentType = "") {
  return /\bapplication\/(\w+\+)?json\b/i.test(String(contentType ?? ""));
}

/**
 * EL MENSAJE PARA UN CUERPO QUE NO ERA JSON.
 *
 * Dice tres cosas y ninguna más: qué se estaba haciendo, con qué código
 * contestó el servidor, y qué conviene hacer. El cuerpo NO entra.
 */
export function mensajeDeRespuestaRara({ status, operacion, esPagina = false } = {}) {
  const que = String(operacion || "la operación").trim();
  const codigo = Number(status);
  const conCodigo = Number.isFinite(codigo) && codigo > 0 ? ` (código ${codigo})` : "";

  // 401 y 403 tienen una causa concreta y una salida concreta, así que se
  // nombran. El resto comparte texto a propósito: inventarle una explicación
  // distinta a cada código sería adivinar.
  if (codigo === 401) {
    return `Se cerró la sesión mientras se hacía ${que}. Volvé a entrar y probá de nuevo. No se guardó nada.`;
  }
  if (codigo === 403) {
    return `No tenés permiso para ${que}${conCodigo}. No se guardó nada.`;
  }
  if (codigo === 404) {
    return `El servidor no encontró la dirección de ${que}${conCodigo}. Suele pasar cuando la pantalla quedó abierta desde antes de una actualización: recargá y probá de nuevo. No se guardó nada.`;
  }
  const donde = esPagina
    ? "El servidor contestó una página en vez de datos"
    : "El servidor contestó algo que no se pudo leer";
  return `${donde} al hacer ${que}${conCodigo}. No se guardó nada. Si vuelve a pasar, recargá la pantalla.`;
}

/**
 * LEE LA RESPUESTA Y DEVUELVE EL OBJETO, O LANZA UN ERROR QUE SE PUEDE LEER.
 *
 * El error que lanza lleva `status`, `operacion` y `codigo` colgados, para que
 * quien lo atrapa pueda decidir distinto sin volver a parsear el texto.
 *
 * @param respuesta  lo que devolvió `fetch`
 * @param operacion  qué se estaba haciendo, en infinitivo y en castellano:
 *                   "interpretar la explicación", "guardar la receta".
 */
export async function leerJson(respuesta, operacion) {
  const status = respuesta?.status ?? 0;
  const contentType = respuesta?.headers?.get?.("content-type") ?? "";

  let texto = "";
  try {
    texto = await respuesta.text();
  } catch {
    texto = "";
  }

  // El cuerpo manda sobre el rótulo: se intenta parsear igual aunque el
  // `Content-Type` no prometa json, porque una ruta puede contestar bien con el
  // rótulo mal y ese caso no tiene por qué romperse.
  let datos = null;
  if (texto && !pareceHtml(texto)) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = null;
    }
  }

  if (datos !== null && typeof datos === "object") {
    return { datos, status, ok: respuesta?.ok === true };
  }

  const error = new Error(
    mensajeDeRespuestaRara({
      status,
      operacion,
      esPagina: pareceHtml(texto) || (!prometeJson(contentType) && Boolean(texto)),
    })
  );
  error.codigo = RESPUESTA_NO_JSON;
  error.status = status;
  error.operacion = operacion;
  return { error };
}

/**
 * EL CAMINO CORTO, QUE ES EL QUE USAN LAS PANTALLAS.
 *
 * Devuelve el objeto ya validado o LANZA con un mensaje legible. Junta las dos
 * comprobaciones que antes estaban repetidas en cada `fetch`: que el cuerpo sea
 * json, y que la ruta haya dicho `ok`.
 */
export async function jsonOrError(respuesta, operacion, textoPorDefecto) {
  const { datos, error } = await leerJson(respuesta, operacion);
  if (error) {
    // Si el pedido llegó a la aplicación, ésta le puso su identificador en el
    // encabezado — y ahí sigue aunque el CUERPO lo haya reemplazado un proxy.
    // Ese caso es el interesante: dice que el pedido SÍ entró, y da el número
    // para buscarlo en los logs.
    const id = respuesta?.headers?.get?.(CABECERA_REQUEST_ID);
    if (id) {
      error.requestId = id;
      error.message = `${error.message} Referencia: ${id}.`;
    }
    throw error;
  }
  if (datos.ok === false) {
    const e = new Error(datos.error || textoPorDefecto || `No se pudo ${operacion}.`);
    e.motivo = datos.motivo ?? null;
    e.status = respuesta?.status ?? 0;
    e.requestId = datos.requestId ?? null;
    if (e.requestId) e.message = `${e.message} Referencia: ${e.requestId}.`;
    throw e;
  }
  return datos;
}
