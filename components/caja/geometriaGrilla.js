// Geometría COMPARTIDA de las grillas de denominaciones.
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// Las dos grillas —contar el cajón y elegir el cambio— tenían sus columnas
// escritas a mano, cada una con las suyas. Medido en producción a 360 px: la de
// conteo daba `63px 148.6px 40.4px` y la del cambio `50.4px 36.4px 120.6px
// 42.9px`. Las etiquetas de denominación no arrancaban en la misma x, y los
// subtotales tampoco. Con las plantillas acá, las dos comparten la misma
// primera y la misma última columna por construcción.
//
// LA ÚLTIMA COLUMNA NO PUEDE SER `auto`
//
// Era el defecto de fondo. Con `auto`, la columna del subtotal se dimensiona por
// su contenido: medido, la fila de $20.000 pasaba de `40.4px` a `74.1px` al
// cargar un billete, y esos 33,7 px se los sacaba al input, que encogía de 78,6
// a 44,9 px. Cada fila terminaba con un ancho distinto según el número que
// mostraba, y el input se movía mientras la persona tipeaba. Con un ancho fijo,
// el input mide lo mismo con 0, con 1 o con 100.
//
// El importe se muestra SIN el "$" dentro de la grilla: la columna ya se llama
// Subtotal, y repetir el signo ocho veces por bloque costaba el ancho que hacía
// falta para que el número entrara sin empujar nada. El total del bloque, abajo,
// sí lo lleva.

// Los anchos de móvil salen de medir, no de estimar: con 3,4rem la etiqueta
// mostraba "$20.0…" —imposible distinguir $20.000 de $200— y con 4rem el
// subtotal partía "140.000,00" en dos renglones. 3,6rem entra la denominación
// más larga y 4,5rem el subtotal de 100 billetes de $20.000, sin cortar nada.

/** Grilla de CONTEO: denominación · control · subtotal. */
export const GRID_CONTEO =
  "grid grid-cols-[3.6rem_1fr_4.5rem] sm:grid-cols-[5rem_1fr_6.5rem] items-center gap-1.5";

/** Grilla de CAMBIO: denominación · contadas · control · subtotal. */
export const GRID_CAMBIO =
  "grid grid-cols-[3.6rem_1.6rem_1fr_4.5rem] sm:grid-cols-[5rem_3.5rem_1fr_6.5rem] items-center gap-1.5";

/** Celda del subtotal: ancho estable, alineada a la derecha, sin desbordar. */
export const CELDA_SUBTOTAL =
  "text-[11px] sm:text-[13px] text-right tabular-nums font-mono leading-tight break-words min-w-0";

/**
 * Etiqueta de la denominación.
 *
 * SIN `truncate`: recortar "$20.000" a "$20.0…" hace imposible distinguirlo de
 * "$200", y en una pantalla que cuenta plata eso no es un detalle estético. Las
 * denominaciones entran enteras en la columna; "Monedas / otros" pasa a dos
 * renglones, que es lo correcto.
 */
export const CELDA_ETIQUETA =
  "text-[12px] sm:text-[13px] font-semibold tabular-nums leading-tight";

/** Contenedor del control (− input +). `min-w-0` para que el input pueda encoger. */
export const CELDA_CONTROL = "flex items-center gap-1 min-w-0";

/** Botón de ±1: mismo tamaño en las dos grillas, así los inputs arrancan igual. */
export const BOTON_PASO =
  "shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-md sunmi-btn-base sunmi-btn-slate text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Hueco del mismo tamaño que un botón, para las filas que no tienen ±.
 *
 * Se usa sobre un `<button>` con las MISMAS clases que `BOTON_PASO`, no sobre un
 * `<span>` con el mismo ancho declarado: medido, el span quedaba 3,5 px más
 * angosto de cada lado —bordes y caja del botón— y el input de "Monedas" salía
 * corrido respecto de los de arriba. Mismo elemento y mismas clases es la única
 * forma de que midan igual por construcción.
 */
export const HUECO_BOTON = `${BOTON_PASO} invisible pointer-events-none`;

/** Importe dentro de la grilla: sin "$", que lo lleva el total del bloque. */
export function importeGrilla(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
