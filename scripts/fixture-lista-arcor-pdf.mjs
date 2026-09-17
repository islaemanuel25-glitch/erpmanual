// ARMA UN PDF CON LA FORMA DE LA LISTA DE ARCOR QUE SUBIÓ EMANUEL.
//
// ── POR QUÉ SE ARMA UNO Y NO SE USA EL SUYO ────────────────────────────────
//
// Porque el archivo real no está en esta máquina: `erpazul-fixtures-dev` es la
// carpeta hermana del repo y este contenedor es un clon limpio. Lo que sí se
// conoce del suyo son los datos concretos que él reportó, y la forma se arma
// alrededor de ellos para que lo que se pruebe sea SU caso y no uno parecido:
//
// ── POR QUÉ EL GENERADOR ENTRA AL REPO Y EL PDF NO ─────────────────────────
//
// Es la misma regla de `scripts/test/fixturesExternos.mjs`: este repositorio es
// público y una lista de proveedor entera lleva los precios de compra del
// negocio. El PDF que esto produce NO se commitea — se escribe donde se le pida,
// fuera del árbol— y lo que queda versionado es la receta para volver a
// armarlo, que son catorce renglones inventados con la forma del archivo real.
//
// Los pocos precios que sí están escritos acá son los que Emanuel pasó como el
// caso a reproducir y los que él mismo puso en el diseño de Figma. Sin ellos el
// candado probaría un caso parecido en vez del suyo, que es justamente lo que
// esa regla prohíbe por el otro lado.
//
//   - dos columnas de precio, SIN IVA y CON IVA, con el IVA al 21 %
//   - formato de número inglés: 9,131.73 — coma de miles, punto decimal
//   - unidad comercial UN, DI o BU
//   - títulos de rubro con "$0.00" en las dos columnas, que el lector descarta
//   - 3113 MOGUL x1 Kg CONITOS con 9,131.73 y 11,049.39, que son los dos
//     números que él copió
//   - 13113 MOGUL GOMITAS 30G X 12, el código parecido que se le macheó mal
//   - Cofler Air Blanco 27g a 1,684.03 sin IVA, que es el "la lista dice
//     $1.684,03" de su captura
//
//   node scratchpad/armarPdfArcor.mjs <salida.pdf>

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// La ruta se resuelve desde ESTE archivo y no desde un absoluto: el repo se
// clona en distintas carpetas según la máquina, y un absoluto lo ata a una.
const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");

/** Un número como lo imprime Arcor: miles con coma, decimales con punto. */
function enIngles(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Las filas. `sinIva` es el dato; el con IVA se calcula al 21 % y se redondea a
// dos decimales, que es lo que hace el proveedor.
//
// El de MOGUL CONITOS se fija a mano en 11,049.39 porque es el número que
// Emanuel copió del papel: 9131.73 * 1.21 da 11049.3933, y el papel dice
// 11,049.39. Sirve además para que el redondeo del proveedor esté representado.
const FILAS = [
  { rubro: "GOLOSINAS" },
  { codigo: "3113", desc: "MOGUL x1 Kg CONITOS (450u)", um: "UN", cant: 6, sinIva: 9131.73, conIva: 11049.39 },
  { codigo: "3096", desc: "MOGUL x1 Kg ANILLOS (157u)", um: "UN", cant: 6, sinIva: 8742.15 },
  { codigo: "13113", desc: "MOGUL GOMITAS 30G X 12", um: "DI", cant: 12, sinIva: 4416.48 },
  { codigo: "3120", desc: "MOGUL x1 Kg FRUTALES (430u)", um: "UN", cant: 6, sinIva: 9450.00 },
  { rubro: "CHOCOLATES" },
  { codigo: "7742", desc: "COFLER AIR BLANCO 27G", um: "UN", cant: 20, sinIva: 1684.03 },
  { codigo: "7740", desc: "COFLER AIR LECHE 27G", um: "UN", cant: 20, sinIva: 1684.03 },
  { codigo: "7801", desc: "BON O BON LECHE 15G X 30", um: "DI", cant: 30, sinIva: 5120.44 },
  { codigo: "7810", desc: "TOFI CHOCOLATE 18G X 24", um: "DI", cant: 24, sinIva: 3980.12 },
  { rubro: "ALIMENTOS" },
  { codigo: "9101", desc: "POMAROLA TOMATE 340G", um: "BU", cant: 24, sinIva: 966.94 },
  { codigo: "9140", desc: "ARCOR ARVEJAS 350G", um: "BU", cant: 24, sinIva: 742.30 },
  { codigo: "9155", desc: "MERMELADA DURAZNO 454G", um: "UN", cant: 12, sinIva: 2210.55 },
  { codigo: "9160", desc: "ACEITE GIRASOL 900ML", um: "BU", cant: 12, sinIva: 3055.80 },
];

const salida = process.argv[2];
if (!salida) {
  console.error("Falta la ruta de salida.");
  process.exit(2);
}
fs.mkdirSync(path.dirname(salida), { recursive: true });

const doc = new PDFDocument({ size: "A4", margin: 36 });
doc.pipe(fs.createWriteStream(salida));

// Las columnas, en x fijo: el lector usa la coordenada de cada fragmento para
// agrupar en columnas, así que la alineación es parte del formato.
const X = { codigo: 40, desc: 90, um: 330, cant: 370, sinIva: 415, conIva: 495 };

doc.font("Helvetica-Bold").fontSize(11);
doc.text("ARCOR S.A.I.C. - LISTA DE PRECIOS VIGENTE", 40, 40);
doc.font("Helvetica").fontSize(8);
doc.text("Fecha: 17/09/2026 - Los precios no incluyen impuestos internos", 40, 56);

let y = 80;
const encabezado = () => {
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("CODIGO", X.codigo, y);
  doc.text("DESCRIPCION", X.desc, y);
  doc.text("U.M.", X.um, y);
  doc.text("CANT", X.cant, y);
  // LOS TÍTULOS DE PRECIO VAN ALINEADOS A LA DERECHA, igual que sus números.
  // Con el título a la izquierda y los valores a la derecha del mismo ancho, la
  // X del título y la de los datos no coinciden y el lector los pone en columnas
  // distintas: "PRECIO S/IVA" quedaba en la 4 y sus precios en la 5.
  // CORTOS A PROPÓSITO. Con "PRECIO S/IVA" el título se estiraba hacia la
  // izquierda hasta tocar la X de CANT y el lector los juntaba en una sola
  // celda; los títulos quedaban corridos un lugar y la columna de sin IVA
  // aparecía rotulada "PRECIO C/IVA". Los datos se leían igual de bien —el
  // mapeo encontraba las dos columnas de precio— pero la pantalla le habría
  // mostrado a Emanuel el nombre de la columna equivocada.
  doc.text("S/IVA", X.sinIva, y, { width: 70, align: "right" });
  doc.text("C/IVA", X.conIva, y, { width: 70, align: "right" });
  y += 16;
};
encabezado();

for (const f of FILAS) {
  if (f.rubro) {
    // EL TÍTULO DE RUBRO TRAE "$0.00" EN LAS DOS COLUMNAS. Es lo que hace el
    // archivo real y es una trampa de verdad: si el lector no lo descarta, esas
    // filas entran como productos con precio cero.
    doc.font("Helvetica-Bold").fontSize(8);
    doc.text(f.rubro, X.desc, y);
    doc.text("$0.00", X.sinIva, y, { width: 70, align: "right" });
    doc.text("$0.00", X.conIva, y, { width: 70, align: "right" });
    y += 14;
    continue;
  }
  const conIva = f.conIva ?? Math.round(f.sinIva * 1.21 * 100) / 100;
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
console.log(`escrito: ${salida}`);
for (const f of FILAS.filter((x) => x.codigo)) {
  const conIva = f.conIva ?? Math.round(f.sinIva * 1.21 * 100) / 100;
  console.log(`  ${f.codigo}\t${f.um}\tx${f.cant}\t${enIngles(f.sinIva)}\t${enIngles(conIva)}\t${f.desc}`);
}
