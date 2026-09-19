// COMPARTIR UN ARCHIVO POR EL MENÚ DEL SISTEMA, O DESCARGARLO.
//
// ── DE DÓNDE SALE ESTA PIEZA ──────────────────────────────────────────────
//
// De `components/proveedores/listas/BotonReporte.jsx`, que la tenía escrita
// adentro y FUNCIONA HOY. Se sacó tal cual está —las dos funciones auxiliares
// carácter por carácter y la cascada con el mismo orden y las mismas guardas—,
// no escrita de nuevo adivinando casos: el envío del pedido a proveedor necesita
// exactamente esa cascada y escribir una tercera copia es cómo empiezan las dos
// que después no coinciden.
//
// ── POR QUÉ DEVUELVE UN RESULTADO EN VEZ DE NO DEVOLVER NADA ──────────────
//
// Es lo único que se le agregó, y hay un motivo concreto: el pedido a proveedor
// tiene que MARCARSE COMO ENVIADO cuando se compartió, y NO marcarse cuando la
// persona canceló el menú. Sin saber cuál de los tres caminos se tomó, el
// llamador no puede distinguir "lo mandó" de "se arrepintió", que es justamente
// la diferencia que hace que un pedido no quede en borrador para siempre.
//
// `BotonReporte` no necesita el resultado y sigue comportándose igual: ver el
// comentario de su llamada.
//
// ── QUÉ NO ESTÁ ACÁ, Y ES A PROPÓSITO ─────────────────────────────────────
//
// `components/reportes-ventas/AccionesTicket.jsx` tiene una TERCERA cascada, con
// un escalón más: si no puede compartir el archivo, comparte TEXTO —Web Share
// nivel 1— antes de caer a la descarga. Ese escalón no está acá porque ninguno
// de los dos consumidores de esta pieza lo quiere, y agregarlo "por si sirve"
// sería escribir adivinando.
//
// Así que `AccionesTicket` NO se migró en esta tanda y queda anotado: migrarlo
// pide decidir si ese escalón de texto se conserva, y eso cambia qué pasa cuando
// alguien comparte un ticket desde un aparato viejo. Es una tanda con su propia
// verificación, no un efecto lateral de ésta.

/** Qué pasó al intentar compartir. Los tres caminos posibles y nada más. */
export const RESULTADO_COMPARTIR = Object.freeze({
  /** Se abrió el menú del sistema y la persona eligió a dónde mandarlo. */
  COMPARTIDO: "COMPARTIDO",
  /** Se abrió el menú y la persona lo cerró sin elegir. No se descargó nada. */
  CANCELADO: "CANCELADO",
  /** No se pudo compartir, así que el archivo bajó a la carpeta de descargas. */
  DESCARGADO: "DESCARGADO",
});

/**
 * ¿Conviene compartir en vez de descargar?
 *
 * Solo en dispositivos táctiles. En una computadora el menú de compartir es un
 * rodeo —lo que se quiere es el archivo en Descargas— y además varios
 * navegadores de escritorio dicen que pueden compartir y después rechazan el
 * pedido si no viene de un gesto directo.
 */
export function conviensCompartir(archivo) {
  try {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const tactil = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    if (!tactil) return false;
    return !!navigator.canShare?.({ files: [archivo] });
  } catch {
    return false;
  }
}

/** Bajar el archivo. Es el camino por defecto y el respaldo de compartir. */
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera en el próximo tick: revocarla en el mismo cancela la descarga en
  // algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * La cascada: compartir si se puede, descargar si no.
 *
 * @param {object} p
 * @param {Blob} p.blob    el contenido del archivo.
 * @param {string} p.nombre con qué nombre se comparte o se guarda.
 * @param {string} p.titulo el título que ve la persona en el menú del sistema.
 * @param {string} [p.tipo] el media type. PDF por defecto, que es lo único que
 *                          los dos consumidores mandan hoy.
 * @returns {Promise<string>} uno de `RESULTADO_COMPARTIR`.
 */
export async function compartirODescargar({ blob, nombre, titulo, tipo = "application/pdf" }) {
  const archivo = new File([blob], nombre, { type: tipo });

  if (conviensCompartir(archivo)) {
    try {
      await navigator.share({ files: [archivo], title: titulo });
      return RESULTADO_COMPARTIR.COMPARTIDO;
    } catch (e) {
      // Cancelar el menú es una decisión, no un error: ahí no se descarga nada.
      // Cualquier otra falla cae al camino normal para que el archivo no se
      // pierda.
      if (e?.name === "AbortError") return RESULTADO_COMPARTIR.CANCELADO;
      descargar(blob, nombre);
      return RESULTADO_COMPARTIR.DESCARGADO;
    }
  }

  descargar(blob, nombre);
  return RESULTADO_COMPARTIR.DESCARGADO;
}
