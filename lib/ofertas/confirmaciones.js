// lib/ofertas/confirmaciones.js
//
// QUÉ DICE EL CARTEL ANTES DE UNA ACCIÓN QUE NO SE PUEDE DESHACER.
//
// ── POR QUÉ ES UN MÓDULO Y NO TEXTO ADENTRO DEL MODAL ────────────────────
//
// Porque lo que decide qué dice el cartel son tres preguntas con borde, y las
// tres se contestan mal sin querer:
//
//   1. ¿a QUÉ precio vuelve? No es el que se congeló al cargar la oferta: es el
//      precio normal de HOY, que puede haber cambiado;
//   2. ¿y si la oferta tiene varios productos? No hay "el" precio;
//   3. ¿y si falta alguno de los dos números? Un importe que no vino no es cero.
//
// Adentro del JSX ninguna de las tres se puede ejercer sin montar React.
//
// ── UN `confirm()` NO PODÍA DECIR NADA DE ESTO ───────────────────────────
//
// El texto que reemplaza era: «¿Finalizar "X"? Deja de aplicarse y pasa al
// archivo». Nombraba la OFERTA —que en el flujo móvil se llama como el producto,
// pero en una de varias no— y no decía el número. Lo que hace falta saber antes
// de bajar una promoción es a cuánto pasa a venderse.

/** Ausente de verdad: `Number(null)` es 0 y un cero se lee como un dato. */
function importe(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * EL PRECIO AL QUE VUELVE, y por qué no es el de referencia.
 *
 * `precioNormalReferencia` es la FOTO del momento en que se cargó la línea.
 * `precioNormalActual` es lo que el producto vale hoy. Al finalizar, el POS
 * pasa a cobrar el de HOY — así que decir el de referencia sería prometer un
 * precio que no va a salir, y justamente la diferencia entre los dos es lo que
 * el aviso de revisar existe para señalar.
 *
 * Se cae a la referencia solo si no hay actual: es peor no decir ningún número
 * que decir el único que se tiene, y en ese caso los dos coinciden salvo que
 * alguien haya tocado el precio sin que el barrido corriera.
 */
export function precioAlQueVuelve(linea) {
  return importe(linea?.precioNormalActual) ?? importe(linea?.precioNormalReferencia);
}

/**
 * EL CARTEL DE FINALIZAR.
 *
 * Devuelve `{ titulo, subtitulo, producto, cambio, advertencia }`. `cambio` es
 * `null` cuando no se puede decir el número, y el modal no dibuja ese renglón:
 * inventar "vuelve a su precio normal" sin el importe es exactamente lo que
 * este cartel existe para no hacer.
 *
 * `money` entra por afuera porque la pantalla que lo usa ya tiene el suyo. El
 * módulo no elige cómo se escribe la plata.
 */
export function carteDeFinalizar({ oferta, money } = {}) {
  const lineas = Array.isArray(oferta?.lineas) ? oferta.lineas : [];
  const fmt = typeof money === "function" ? money : (n) => String(n);
  const unica = lineas.length === 1 ? lineas[0] : null;

  const vuelve = unica ? precioAlQueVuelve(unica) : null;
  const oferta$ = unica ? importe(unica.precioOferta) : null;

  return {
    titulo: "Terminar esta oferta",
    subtitulo: "Desde que confirmes, el POS vuelve a cobrar el precio normal.",
    // Con una línea se nombra el PRODUCTO; con varias, la oferta y cuántos son.
    producto: unica
      ? unica.nombre || oferta?.nombre || "este producto"
      : `${oferta?.nombre || "Esta oferta"} · ${lineas.length} productos`,
    cambio:
      unica && vuelve != null && oferta$ != null
        ? `Pasa de ${fmt(oferta$)} a ${fmt(vuelve)}`
        : lineas.length > 1
          ? `${lineas.length} productos vuelven a su precio normal`
          : null,
    advertencia:
      "No se borra nada: queda guardada con quién la terminó y cuándo, y se " +
      "puede consultar en Terminadas. Lo que no hay es un botón para volver a " +
      "prenderla — para eso hay que cargarla de nuevo.",
    confirmar: "Finalizar la oferta",
    volver: "Volver",
  };
}

/**
 * EL CARTEL DE ELIMINAR, que NO es el mismo.
 *
 * Finalizar archiva —la oferta sigue existiendo y se puede consultar—; eliminar
 * borra la fila. El servidor solo lo permite mientras la oferta no haya regido
 * (`accionesDisponibles`: BORRADOR y PROGRAMADA), así que no hay ventas colgando
 * — pero la configuración cargada se pierde y no hay archivo donde buscarla.
 *
 * Dos carteles iguales para dos cosas distintas es cómo se aprende a tocar
 * "Sí" sin leer.
 */
export function carteDeEliminar({ oferta, money } = {}) {
  const lineas = Array.isArray(oferta?.lineas) ? oferta.lineas : [];
  const fmt = typeof money === "function" ? money : (n) => String(n);
  const unica = lineas.length === 1 ? lineas[0] : null;
  const oferta$ = unica ? importe(unica.precioOferta) : null;

  return {
    titulo: "Borrar esta oferta",
    subtitulo: "Todavía no rigió, así que se puede borrar sin dejar rastro.",
    producto: unica
      ? unica.nombre || oferta?.nombre || "este producto"
      : `${oferta?.nombre || "Esta oferta"} · ${lineas.length} productos`,
    cambio: oferta$ != null ? `Se pierde el precio cargado, ${fmt(oferta$)}` : null,
    advertencia:
      "Esto NO la archiva: la borra. No va a quedar en Terminadas ni se va a " +
      "poder consultar después. Si querés conservarla, terminala en vez de " +
      "borrarla.",
    confirmar: "Borrar la oferta",
    volver: "Volver",
  };
}
