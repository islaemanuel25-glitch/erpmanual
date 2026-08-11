// lib/compras-proveedor/comprobante/almacenImagenes.js
//
// DÓNDE VIVEN LAS FOTOS DE LAS FACTURAS, Y CÓMO SE COMPRUEBA QUE EL LUGAR EXISTE.
//
// ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
//
// Las fotos van a un VOLUMEN del VPS. Si el volumen no está montado, Docker
// igual crea el directorio del punto de montaje —vacío— y todo parece andar:
// la escritura funciona, el archivo se guarda, nadie ve un error. Pero eso está
// escribiendo en el disco del contenedor, y se pierde al recrearlo.
//
// Es la peor forma de fallar: silenciosa, y el daño aparece un despliegue
// después, cuando ya nadie relaciona una cosa con la otra. Es exactamente lo
// que le pasó a ImportacionListaProveedor, cuyo campo de ubicación quedó en
// null todo este tiempo justamente para no caer en esto.
//
// ── CÓMO SE DISTINGUE UN VOLUMEN DE UNA CARPETA VACÍA ──────────────────────
//
// Con un CENTINELA: un archivo que se deja al aprovisionar el volumen y que
// vive adentro de él. Si el volumen está montado, el centinela está. Si no está
// montado, el directorio existe pero está vacío, y el centinela falta.
//
// Comprobar solamente que el directorio exista NO alcanza, y ese es el punto:
// el directorio siempre existe.
//
// ── SE COMPRUEBA DOS VECES, Y LAS DOS HACEN FALTA ──────────────────────────
//
// 1. AL ARRANCAR — para que el problema se vea al levantar y no cuando alguien
//    intenta subir una factura un sábado a la mañana.
// 2. ANTES DE CADA ESCRITURA — porque un montaje se puede caer DESPUÉS de
//    arrancar, y ahí el chequeo del arranque ya pasó y no protege nada.
//
// El segundo es el que salva de verdad. El primero es el que avisa a tiempo.
//
// El núcleo de decisión es puro y está acá; el que toca el disco es una cáscara
// fina que le pasa lo que encontró.

export const NOMBRE_CENTINELA = ".volumen-facturas";

export const MOTIVO_ALMACEN = Object.freeze({
  SIN_RUTA:
    "No está configurada la ruta del volumen de facturas. Sin eso no se sabe dónde escribir, " +
    "y adivinar sería escribir en el disco del contenedor.",
  SIN_DIRECTORIO:
    "El directorio del volumen no existe. Revisá que el volumen esté declarado en el compose.",
  SIN_CENTINELA:
    "El directorio existe pero está vacío: EL VOLUMEN NO ESTÁ MONTADO. Docker crea el punto de " +
    "montaje aunque el volumen falte, así que escribir acá guardaría en el disco del contenedor " +
    "y se perdería al recrearlo. No se escribe.",
  NO_ESCRIBIBLE:
    "El volumen está montado pero no se puede escribir en él. Suele ser un problema de permisos " +
    "del usuario con el que corre el contenedor.",
});

/**
 * ¿Se puede escribir en el almacén?
 *
 * Función pura: recibe lo que el que miró el disco encontró, y decide. Así el
 * criterio se puede ejercer sin sistema de archivos.
 *
 * @param {object} hallazgos
 * @param {string|null} hallazgos.ruta          ruta configurada del volumen
 * @param {boolean} hallazgos.existeDirectorio  el directorio del punto de montaje
 * @param {boolean} hallazgos.existeCentinela   el archivo centinela adentro
 * @param {boolean} hallazgos.esEscribible      se pudo escribir de prueba
 */
export function evaluarAlmacen({ ruta, existeDirectorio, existeCentinela, esEscribible } = {}) {
  if (!ruta || typeof ruta !== "string" || !ruta.trim()) {
    return { ok: false, motivo: MOTIVO_ALMACEN.SIN_RUTA };
  }
  if (existeDirectorio !== true) {
    return { ok: false, motivo: MOTIVO_ALMACEN.SIN_DIRECTORIO };
  }
  // El orden importa: el centinela se pregunta ANTES que la escritura. Si no
  // está montado, escribir de prueba FUNCIONA —en el disco del contenedor— y
  // daría un falso ok. Preguntar primero si se puede escribir sería justamente
  // el error que este módulo existe para impedir.
  if (existeCentinela !== true) {
    return { ok: false, motivo: MOTIVO_ALMACEN.SIN_CENTINELA };
  }
  if (esEscribible !== true) {
    return { ok: false, motivo: MOTIVO_ALMACEN.NO_ESCRIBIBLE };
  }
  return { ok: true, motivo: null };
}

/**
 * El nombre del archivo de una foto, atado al comprobante.
 *
 * Se arma con el proveedor, el punto de venta y el número para que una factura
 * suelta se pueda encontrar sin abrir el paquete entero — que es lo que pidió
 * Emanuel para el ZIP.
 *
 * Se sanea todo lo que no sea letra, número, guión o punto: un nombre de
 * proveedor con barra adentro escribiría en otro directorio.
 */
export function nombreDeArchivo({ comprobanteId, proveedorNombre, puntoVenta, numero, extension = "jpg" } = {}) {
  const limpio = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  const ext = String(extension || "jpg").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "jpg";
  const partes = [
    limpio(proveedorNombre) || "proveedor",
    limpio(puntoVenta) || "0",
    limpio(numero) || "0",
    String(Number(comprobanteId) || 0),
  ];
  return `${partes.join("_")}.${ext}`;
}
