// PEDIR UNA LECTURA Y ESPERAR SU TURNO. UN SOLO CAMINO PARA LOS DOS QUE LLAMAN.
//
// ── POR QUÉ NO VA ESCRITO EN CADA PANTALLA ────────────────────────────────
//
// Porque son dos —la tarjeta de comprobantes y la relectura de la receta— y el
// candado de `laRecepcionSobreviveAlRefresco` existe justamente para que nadie
// agregue un tercero sin enterarse. Dos copias del «pedí, esperá, volvé a
// preguntar» no se rompen el día que se escriben: se rompen el día que una
// cambia el intervalo, o deja de mirar `leyendo`, o se olvida de pasar el
// turno. Y ahí una de las dos dispara diez lecturas en paralelo contra una
// cuota de veinte por día.
//
// ── EL CONTRATO CON LA RUTA ───────────────────────────────────────────────
//
// · POST devuelve `{ ok: true, leyendo: true, turno }` enseguida.
// · GET `?turno=…` devuelve `{ ok: true, leyendo: true }` mientras trabaja, y
//   cuando termina devuelve EXACTAMENTE la respuesta que el POST daba antes.
//
// Una respuesta sin `leyendo` es el resultado final: eso es lo único que esto
// mira. Si algún día el POST vuelve a contestar directo —porque la lectura pasó
// a ser instantánea—, esto sigue funcionando sin tocarlo.
//
// Módulo sin React y sin Prisma. `fetch` y el reloj entran por parámetro para
// poder ejercer la espera sin red y sin esperar de verdad.

/** Cada cuánto se vuelve a preguntar. Dos segundos: la lectura tarda decenas. */
export const CADA_MS = 2000;

/**
 * PEDIR LA LECTURA DE UN COMPROBANTE Y DEVOLVER EL RESULTADO FINAL.
 *
 * @param comprobanteId cuál
 * @param origen        quién la pidió, para que quede en la llamada guardada
 * @param fetchImpl     el `fetch` a usar
 * @param dormir        `(ms) => Promise`, para que los candados no esperen
 * @param alAvisar      se llama con el texto de "leyendo…" la primera vez
 * @returns `{ respuesta, cuerpo }` — la `Response` del último pedido y su JSON.
 *          Se devuelve la respuesta porque quien llama traduce los estados HTTP
 *          con su propio catálogo, y ése no se duplica acá.
 */
export async function pedirLaLectura({
  comprobanteId,
  origen,
  fetchImpl,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  alAvisar = null,
  cada = CADA_MS,
} = {}) {
  const base = `/api/compras-proveedor/comprobantes/leer/${comprobanteId}`;

  const arranque = await fetchImpl(base, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origen }),
  });
  if (!arranque.ok) return { respuesta: arranque, cuerpo: null };

  const inicio = await arranque.json().catch(() => null);
  if (!inicio?.leyendo || !inicio?.turno) {
    // Contestó directo: no hay turno que esperar.
    return { respuesta: arranque, cuerpo: inicio };
  }
  if (alAvisar) alAvisar(inicio.texto || "Leyendo el papel…");
  return esperarLaLectura({ comprobanteId, turno: inicio.turno, fetchImpl, dormir, cada });
}

/**
 * ESPERAR UNA LECTURA QUE YA ESTÁ CORRIENDO. Solo pregunta: no lanza nada.
 *
 * Es la mitad de `pedirLaLectura` que pregunta, separada para que la pantalla
 * pueda engancharse a una lectura en curso al volver —el estado vive en la
 * base desde el 2026-10-10— sin hacer el POST, que es lo que lanza una.
 *
 * @returns `{ respuesta, cuerpo }`, como `pedirLaLectura`.
 */
export async function esperarLaLectura({
  comprobanteId,
  turno = null,
  fetchImpl,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  alAvisar = null,
  cada = CADA_MS,
} = {}) {
  const base = `/api/compras-proveedor/comprobantes/leer/${comprobanteId}`;
  const url = turno ? `${base}?turno=${encodeURIComponent(turno)}` : base;
  let avisado = false;

  // Sin tope propio de intentos, y es una decisión: el que manda es el
  // servidor. Una lectura que quedó a medias por un reinicio contesta cortada
  // y corta sola; una que sigue leyendo sigue leyendo. Un tope acá sería un
  // segundo criterio para "ya fue", y siempre le erraría al del que trabaja.
  for (;;) {
    const r = await fetchImpl(url, { credentials: "include", cache: "no-store" });
    // El cuerpo se lee SIEMPRE, también de un fallo: ahí viene el motivo, y
    // quien llama no puede volver a leerlo —una `Response` se lee una vez—.
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.leyendo) return { respuesta: r, cuerpo: d };
    if (alAvisar && !avisado) {
      alAvisar(d.texto || "Leyendo el papel…");
      avisado = true;
    }
    await dormir(cada);
  }
}
