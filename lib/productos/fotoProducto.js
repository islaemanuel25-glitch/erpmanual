// EL CONTRATO DE LA FOTO DE PRODUCTO. SIN DISCO Y SIN NODE.
//
// ── POR QUÉ ESTÁ SEPARADO DEL ALMACÉN ─────────────────────────────────────
//
// Porque lo usan los dos lados. El navegador necesita el lado máximo para
// achicar la foto antes de subirla, y el servidor necesita lo mismo para
// validarla. Si el número estuviera escrito en cada lado, el cliente mandaría
// algo que el servidor rechaza y la persona vería un error que no puede
// resolver.
//
// La primera versión puso todo junto en `almacenFotos.js`, que importa
// `node:fs`. El build murió con "the chunking context does not support external
// modules (request: node:fs/promises)": el componente del formulario arrastraba
// el módulo de disco entero al bundle del navegador. Este archivo es la mitad
// que sí puede cruzar.
//
// REGLA PARA EL QUE VENGA: acá no entra nada que toque el disco, ni un import de
// `node:`. Lo que necesite el filesystem va en `almacenFotos.js`.

/** El archivo que prueba que el volumen está montado. */
export const NOMBRE_CENTINELA_FOTOS = ".volumen-fotos-productos";

/** La variable que dice dónde está montado. Una sola vez, para que nadie la
 *  escriba a mano en una ruta. */
export const VARIABLE_RUTA_FOTOS = "FOTOS_PRODUCTOS_VOLUMEN_PATH";

/**
 * Los formatos que se aceptan.
 *
 * El cliente redimensiona y manda webp; jpeg queda como respaldo para los
 * navegadores que no sepan producirlo. No se acepta cualquier cosa: un archivo
 * que el navegador no pueda dibujar después es una foto guardada para nada, y un
 * svg adentro de un `img` es una superficie que no hace falta abrir.
 */
export const TIPOS_ACEPTADOS = Object.freeze({
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
});

/**
 * El tope de tamaño de lo que ENTRA al servidor.
 *
 * El cliente ya redimensiona a 1200 px de lado y comprime, así que una foto
 * normal pesa unos cientos de KB. Este tope no es la compresión: es el límite de
 * lo que se acepta cuando la compresión no ocurrió —un navegador viejo, alguien
 * llamando la ruta a mano—. Sin él, una foto de celular de 12 MB entra entera y
 * el volumen se llena con veinte productos.
 */
export const MAXIMO_BYTES = 2 * 1024 * 1024;

/** El lado máximo, en píxeles. Lo aplica el cliente antes de subir y lo conoce
 *  el servidor para no discutirle. */
export const LADO_MAXIMO = 1200;

/**
 * El nombre del archivo de una foto de producto.
 *
 * ── POR QUÉ LLEVA UN AZAR ADENTRO ─────────────────────────────────────────
 *
 * Si el nombre fuera solo el id, reemplazar la foto escribiría encima del
 * archivo anterior. Eso parece prolijo y trae un problema concreto: la url no
 * cambia, así que el navegador y el proxy siguen mostrando la foto VIEJA desde
 * su caché. La persona sacó una foto nueva, se guardó bien, y la pantalla le
 * muestra la anterior — sin ningún error.
 *
 * Con un sufijo al azar cada foto es una url nueva y eso no puede pasar. El
 * costo es que la anterior queda en el disco; a 1200 px comprimidos son unos
 * cientos de KB, y borrarla al reemplazar es una decisión aparte —hay que estar
 * seguro de que ninguna otra fila la referencia—.
 *
 * `globalThis.crypto` y no `node:crypto`: está en el navegador y en Node desde
 * la 19, así que este archivo sigue cruzando los dos lados.
 */
export function nombreDeFoto({ productoBaseId, extension = "webp" } = {}) {
  const id = Number(productoBaseId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("nombreDeFoto necesita el id del producto");
  }
  const ext = String(extension || "webp").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "webp";
  return `p${id}-${globalThis.crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/**
 * La url pública de una foto guardada. Es lo que se escribe en
 * `ProductoBase.imagen_url`.
 *
 * Va por una ruta de la aplicación y no por un archivo estático: el volumen está
 * fuera de `public/` a propósito — lo que se sirve estático se copia adentro de
 * la imagen y se pierde al recrear el contenedor, que es justo lo que el
 * centinela existe para evitar.
 */
export function urlDeFoto(archivo) {
  return `/api/productos/foto/${encodeURIComponent(String(archivo))}`;
}

/**
 * ¿Este nombre de archivo es uno de los nuestros?
 *
 * Se usa al SERVIR, y es la defensa contra el paseo de directorios: sin esto,
 * pedir `..%2F..%2Fetc%2Fpasswd` leería lo que quisiera del contenedor. Se valida
 * por forma completa y no sacando los ".." — una lista de cosas prohibidas
 * siempre se queda corta; una forma permitida, no.
 */
export function esNombreDeFotoValido(archivo) {
  return /^p[0-9]+-[0-9a-f]{8}\.(webp|jpg|png)$/.test(String(archivo ?? ""));
}
