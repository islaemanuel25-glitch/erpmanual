// UN PDF DE VARIAS PÁGINAS SE LEE COMO VARIAS HOJAS, UNA POR PÁGINA.
//
// ── EL CASO (Arcor #582, 2026-11-10) ──────────────────────────────────────
//
// Ros ArC SRL mandó UN PDF con CUATRO facturas, una por página: 00371634 a
// 00371637, cada una con su total. Se leía entero como un solo papel y el
// lector, con cuatro totales y cuatro listas, devolvía cero productos —también
// el grande—.
//
// Regla de Emanuel: un PDF con varias facturas se parte en varios comprobantes
// dentro de la misma recepción, y cada uno cierra contra su propio total. Para
// cualquier proveedor.
//
// ── SE PARTE POR PÁGINA, Y LA AGRUPACIÓN DE SIEMPRE LAS VUELVE A JUNTAR ───
//
// Antes de leer no se sabe dónde termina cada factura: eso lo dice el papel, y
// lo dice con su total (`agruparHojas.js`). Así que cada página pasa a ser una
// hoja, como si fuera una foto subida aparte, y después de leer la agrupación
// de siempre junta las que no traen total con la que sigue. Una factura de dos
// páginas vuelve a ser una; cuatro facturas de una página quedan cuatro.
//
// Solo carga `pdf-lib`. Sin Prisma, sin red y sin disco.

/** ¿Este archivo es un PDF? Por el tipo que se guardó al subirlo. */
export function esPdf(mime) {
  return String(mime ?? "").toLowerCase() === "application/pdf";
}

/**
 * LAS PÁGINAS DE UN PDF, CADA UNA COMO UN PDF DE UNA PÁGINA.
 *
 * @param bytes  Uint8Array o Buffer del PDF entero
 * @returns un array de Uint8Array, uno por página, o null si el PDF tiene una
 *          sola página o no se puede abrir: entonces se lee como está.
 */
export async function partirPdfEnHojas(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  let original;
  try {
    // Copia: pdf-lib no toca el búfer, pero quien llama lo sigue usando.
    original = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: true });
  } catch {
    return null;
  }
  const paginas = original.getPageCount();
  if (paginas <= 1) return null;
  const hojas = [];
  for (let i = 0; i < paginas; i++) {
    const hoja = await PDFDocument.create();
    const [pagina] = await hoja.copyPages(original, [i]);
    hoja.addPage(pagina);
    hojas.push(await hoja.save());
  }
  return hojas;
}
