// UNA MARCA PARA PODER UNIR UNA CAPTURA CON UNA LÍNEA DE LOG.
//
// ── POR QUÉ HIZO FALTA ────────────────────────────────────────────────────
//
// El 2026-08-27, dos veces en el mismo día, el importador falló en producción y
// el diagnóstico se quedó a mitad de camino por lo mismo: **no había forma de
// encontrar ESE pedido en los logs.** La ruta solo escribía cuando explotaba,
// así que un pedido que fallaba por el camino previsto —el proveedor no
// contesta— no dejaba ni una línea. La ausencia de log no distinguía "no llegó
// al handler" de "llegó y salió por la puerta de al lado", que son dos causas
// opuestas.
//
// Esto arregla exactamente eso: cada pedido tiene un identificador, se escribe
// una línea al entrar y otra al salir, y el identificador va en el encabezado y
// dentro del mensaje de error. La próxima captura trae el número.
//
// ── QUÉ SE REGISTRA, Y QUÉ NO ─────────────────────────────────────────────
//
// Se registra la FORMA de lo que pasó: qué etapa se alcanzó, cuánto duró cada
// una, qué clase de error hubo y qué contestó el proveedor.
//
// NO se registra nada del documento: ni la explicación escrita, ni un nombre de
// producto, ni un importe, ni el nombre del archivo. Tampoco la clave, ni
// fragmentos de ella, ni el prompt. Hay un candado que lo comprueba sobre lo que
// esta función produce.
//
// El motivo no es formal. Un log con el texto de la explicación es una copia de
// datos del proveedor en un archivo que nadie considera una base de datos, que
// nadie borra y que se lee con `docker logs`.

/** El prefijo distingue estas líneas de las demás al mirar `docker logs`. */
const ETIQUETA = "[importador]";

/**
 * Un identificador corto, legible y suficiente.
 *
 * No usa `crypto.randomUUID` a propósito: 36 caracteres no se copian bien de la
 * pantalla de un teléfono, y lo que tiene que pasar con esto es que alguien lo
 * lea de una captura y lo pegue en una búsqueda. Doce caracteres alcanzan para
 * no repetirse dentro de una ventana de logs y entran de un vistazo.
 */
export function nuevoRequestId(azar = Math.random) {
  let salida = "";
  const abecedario = "abcdefghjkmnpqrstuvwxyz23456789"; // sin l, i, o, 0, 1
  for (let i = 0; i < 12; i += 1) {
    salida += abecedario[Math.floor(azar() * abecedario.length)];
  }
  return salida;
}

/**
 * ARMA LA LÍNEA DE LOG, SIN DECIDIR DÓNDE SE ESCRIBE.
 *
 * Es una función pura para que un candado pueda mirar exactamente el texto que
 * va a salir. Si armara y escribiera a la vez, lo único comprobable sería que no
 * explota.
 */
export function lineaDeTraza({ requestId, ruta, etapa, ms = null, clase = null, estadoProveedor = null, intentos = null } = {}) {
  const partes = [ETIQUETA, `req=${requestId || "?"}`, `ruta=${ruta || "?"}`, `etapa=${etapa || "?"}`];
  if (ms !== null && ms !== undefined) partes.push(`ms=${Math.round(Number(ms) || 0)}`);
  if (clase) partes.push(`clase=${clase}`);
  // `estadoProveedor` puede ser 0 —no llegó a haber respuesta—, así que se
  // compara contra null y no por verdadero: `if (estado)` se comería el cero.
  if (estadoProveedor !== null && estadoProveedor !== undefined) {
    partes.push(`proveedor=${estadoProveedor}`);
  }
  if (Array.isArray(intentos) && intentos.length) {
    partes.push(`intentos=${intentos.map((i) => `${i.estado ?? "sin"}@${Math.round(i.ms || 0)}ms`).join("+")}`);
  }
  return partes.join(" ");
}

/**
 * EL CRONÓMETRO POR ETAPA.
 *
 * Devuelve un objeto que sabe marcar etapas y contar cuánto llevó cada una. La
 * duración de una etapa es desde que terminó la anterior, no desde el principio:
 * con acumulados no se puede ver cuál de tres llamadas fue la lenta, que es
 * justamente la pregunta.
 */
export function crearTraza({ requestId, ruta, ahora = Date.now, escribir = console.log } = {}) {
  const id = requestId || nuevoRequestId();
  const inicio = ahora();
  let ultimaMarca = inicio;
  const etapas = [];

  escribir(lineaDeTraza({ requestId: id, ruta, etapa: "entra" }));

  return {
    requestId: id,
    /** Marca el fin de una etapa y devuelve cuánto llevó. */
    etapa(nombre, extra = {}) {
      const t = ahora();
      const ms = t - ultimaMarca;
      ultimaMarca = t;
      etapas.push({ nombre, ms });
      escribir(lineaDeTraza({ requestId: id, ruta, etapa: nombre, ms, ...extra }));
      return ms;
    },
    /** La línea final. Siempre se escribe, salga bien o mal. */
    fin({ clase = "ok", estadoProveedor = null, intentos = null } = {}) {
      const ms = ahora() - inicio;
      escribir(lineaDeTraza({ requestId: id, ruta, etapa: "sale", ms, clase, estadoProveedor, intentos }));
      return { requestId: id, ms, etapas };
    },
  };
}

/** El encabezado con el que viaja, para que la pantalla lo pueda mostrar. */
export const CABECERA_REQUEST_ID = "x-request-id";
