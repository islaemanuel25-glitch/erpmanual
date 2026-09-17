// LA FORMA DEL PDF DE ARCOR, EN UN SOLO LUGAR.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
//
// Porque hacían falta DOS listas con esta misma forma: la del fixture original
// —`scripts/fixture-lista-arcor-pdf.mjs`, catorce renglones armados alrededor de
// los números que Emanuel copió del papel— y la del banco de prueba del
// recorrido, con sus trampas calibradas contra los costos sembrados.
//
// Copiar el dibujo en el segundo archivo habría sido escribir una función
// parecida al lado, que es lo primero que el CLAUDE.md prohíbe: el día que el
// lector cambie cómo agrupa columnas, una de las dos se arregla y la otra no —y
// la que no, sigue en verde—. Así que el dibujo se saca acá y las dos lo piden.
//
// Lo que queda en cada llamador son SUS FILAS, que es lo único en lo que
// difieren de verdad.
//
// ── LO QUE NO SE PUEDE TOCAR SIN ROMPER LA LECTURA ────────────────────────
//
// El lector genérico agrupa los fragmentos del PDF en columnas por su
// COORDENADA X. Eso convierte la alineación en parte del formato, no en una
// cuestión estética, y hay dos trampas medidas:
//
//   1. Los títulos de precio van alineados a la DERECHA, igual que sus números.
//      Con el título a la izquierda y los valores a la derecha del mismo ancho,
//      la X del título y la de los datos no coinciden: "PRECIO S/IVA" quedaba en
//      la columna 4 y sus precios en la 5.
//   2. Los títulos son CORTOS a propósito. Con "PRECIO S/IVA" el título se
//      estiraba hacia la izquierda hasta tocar la X de CANT y el lector los
//      juntaba en una sola celda; los títulos quedaban corridos un lugar y la
//      columna de sin IVA aparecía rotulada "PRECIO C/IVA". Los datos se leían
//      igual de bien —el mapeo encontraba las dos columnas— pero la pantalla
//      habría mostrado el nombre de la columna equivocada.
//
// Y los títulos de rubro llevan "$0.00" en las dos columnas de precio. Es lo que
// hace el archivo real y es una trampa de verdad: si el lector no las descarta,
// esas filas entran como productos con precio cero.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");

/**
 * Un número como lo imprime Arcor: miles con coma, decimales con punto.
 *
 * Es el formato inglés, y está acá porque es parte de la forma del archivo: una
 * lista que escriba 9.131,73 no es la de Arcor y no probaría lo mismo.
 */
export function enIngles(n) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** El con IVA que no vino escrito: 21 % y dos decimales, como el proveedor. */
export const conIvaDe = (sinIva) => Math.round(Number(sinIva) * 1.21 * 100) / 100;

// Las columnas, en X fija. Ver el encabezado: esto es formato, no estética.
const X = { codigo: 40, desc: 90, um: 330, cant: 370, sinIva: 415, conIva: 495 };

/**
 * Escribe el PDF.
 *
 * `filas` mezcla dos cosas: `{ rubro }` para un título de sección y
 * `{ codigo, desc, um, cant, sinIva, conIva? }` para un producto. El `conIva` se
 * pasa solo cuando el papel trae un número que no es exactamente el 21 % —el
 * redondeo del proveedor—; si no, se calcula.
 *
 * Devuelve una promesa que resuelve cuando el archivo está cerrado. Sin eso, el
 * que lo llama sigue y lee un PDF a medio escribir: `doc.end()` no espera a que
 * el stream vacíe.
 */
export function armarPdfFormaArcor({ filas, salida, titulo, fecha }) {
  fs.mkdirSync(path.dirname(salida), { recursive: true });

  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const stream = fs.createWriteStream(salida);
  doc.pipe(stream);

  doc.font("Helvetica-Bold").fontSize(11);
  doc.text(titulo ?? "ARCOR S.A.I.C. - LISTA DE PRECIOS VIGENTE", 40, 40);
  doc.font("Helvetica").fontSize(8);
  doc.text(
    `Fecha: ${fecha ?? "17/09/2026"} - Los precios no incluyen impuestos internos`,
    40,
    56
  );

  let y = 80;
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("CODIGO", X.codigo, y);
  doc.text("DESCRIPCION", X.desc, y);
  doc.text("U.M.", X.um, y);
  doc.text("CANT", X.cant, y);
  doc.text("S/IVA", X.sinIva, y, { width: 70, align: "right" });
  doc.text("C/IVA", X.conIva, y, { width: 70, align: "right" });
  y += 16;

  for (const f of filas) {
    if (f.rubro) {
      doc.font("Helvetica-Bold").fontSize(8);
      doc.text(f.rubro, X.desc, y);
      doc.text("$0.00", X.sinIva, y, { width: 70, align: "right" });
      doc.text("$0.00", X.conIva, y, { width: 70, align: "right" });
      y += 14;
      continue;
    }
    const conIva = f.conIva ?? conIvaDe(f.sinIva);
    doc.font("Helvetica").fontSize(8);
    doc.text(f.codigo, X.codigo, y);
    doc.text(f.desc, X.desc, y, { width: 230, lineBreak: false });
    doc.text(f.um, X.um, y);
    doc.text(String(f.cant), X.cant, y);
    doc.text(enIngles(f.sinIva), X.sinIva, y, { width: 70, align: "right" });
    doc.text(enIngles(conIva), X.conIva, y, { width: 70, align: "right" });
    y += 14;
  }

  doc.end();
  return new Promise((ok, mal) => {
    stream.on("finish", () => ok(salida));
    stream.on("error", mal);
  });
}
