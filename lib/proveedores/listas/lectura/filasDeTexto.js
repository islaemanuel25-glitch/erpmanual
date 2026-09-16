// lib/proveedores/listas/lectura/filasDeTexto.js
//
// DE FRAGMENTOS CON POSICIÓN A RENGLONES.
//
// Un PDF no tiene filas ni columnas: tiene pedacitos de texto con una coordenada.
// Este módulo los junta en renglones. Quién es cada columna lo resuelve
// `tablaDeArchivo.js`.
//
// ── LAS FILAS PEGADAS ───────────────────────────────────────────────────────
//
// Dos de las cuatro listas reales tienen las filas "pegadas" cuando se copia el
// texto: una termina y la siguiente arranca sin ningún separador. Eso pasa porque
// el que copia concatena por orden de aparición y se pierde la Y. Acá no pasa:
// los renglones salen de la coordenada, no del orden.
//
// Módulo puro: sin BD, sin Next, sin pdfjs. Recibe fragmentos ya extraídos.

/**
 * Cuánto se pueden separar verticalmente dos fragmentos del MISMO renglón.
 *
 * Tres puntos. Medido sobre las cuatro listas: dentro de un renglón la variación
 * es de cero a dos puntos —la coma de un número se dibuja un pelo más abajo— y
 * entre dos renglones consecutivos la distancia más chica es de siete, en la
 * lista de bebidas. Tres separa las dos poblaciones con margen para las dos.
 */
const TOLERANCIA_Y = 3;

/** Un número utilizable, o null. */
function numeroONulo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Cuánto ocupa una pieza.
 *
 * EL ANCHO MEDIDO MANDA. pdfjs lo informa por fragmento y es el dato exacto; la
 * estimación por cantidad de letras existe solo para que este módulo se pueda
 * probar con fragmentos escritos a mano, sin un PDF.
 */
export function anchoDePieza(pieza) {
  if (pieza && numeroONulo(pieza.ancho) !== null) return pieza.ancho;
  return String(pieza?.texto ?? "").length * 4.2;
}

/**
 * Agrupa fragmentos en renglones por su coordenada vertical.
 *
 * @param fragmentos [{ x, y, texto, ancho? }]
 * @returns [{ y, piezas: [{ x, texto, ancho }] }] de arriba hacia abajo
 */
export function renglonesPorY(fragmentos = []) {
  const vivos = fragmentos.filter((f) => f && String(f.texto ?? "").trim() !== "");
  const grupos = [];
  for (const f of vivos) {
    const y = Number(f.y);
    let g = grupos.find((x) => Math.abs(x.y - y) <= TOLERANCIA_Y);
    if (!g) {
      g = { y, piezas: [] };
      grupos.push(g);
    }
    g.piezas.push({ x: Number(f.x), texto: String(f.texto), ancho: numeroONulo(f.ancho) });
  }
  for (const g of grupos) g.piezas.sort((a, b) => a.x - b.x);
  // De arriba hacia abajo: en PDF la Y crece hacia arriba.
  grupos.sort((a, b) => b.y - a.y);
  return grupos;
}

/** Un título comparable: sin tildes, sin signos, en minúscula. */
export function normalizarTitulo(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
