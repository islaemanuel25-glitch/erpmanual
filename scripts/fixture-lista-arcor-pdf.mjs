// ARMA UN PDF CON LA FORMA DE LA LISTA DE ARCOR QUE SUBIÓ EMANUEL.
//
// ── POR QUÉ SE ARMA UNO Y NO SE USA EL SUYO ────────────────────────────────
//
// Porque el archivo real no está en esta máquina: `erpazul-fixtures-dev` es la
// carpeta hermana del repo y este contenedor es un clon limpio. Lo que sí se
// conoce del suyo son los datos concretos que él reportó, y la forma se arma
// alrededor de ellos para que lo que se pruebe sea SU caso y no uno parecido.
//
// ── POR QUÉ EL GENERADOR ENTRA AL REPO Y EL PDF NO ─────────────────────────
//
// Es la misma regla de `scripts/test/fixturesExternos.mjs`: una lista de
// proveedor entera lleva los precios de compra del negocio. El PDF que esto
// produce NO se commitea —se escribe donde se le pida, fuera del árbol— y lo que
// queda versionado es la receta para volver a armarlo, que son catorce renglones
// inventados con la forma del archivo real.
//
// Los pocos precios que sí están escritos acá son los que Emanuel pasó como el
// caso a reproducir y los que él mismo puso en el diseño de Figma. Sin ellos el
// candado probaría un caso parecido en vez del suyo, que es justamente lo que
// esa regla prohíbe por el otro lado.
//
// ── DÓNDE ESTÁ EL DIBUJO ───────────────────────────────────────────────────
//
// En `scripts/lib/pdfFormaArcor.mjs`, desde el 2026-09-17. Lo que queda acá son
// LAS FILAS, que es lo único propio de este fixture: el banco de prueba del
// recorrido necesitaba la misma forma con otras filas, y copiar el dibujo habría
// dejado dos funciones que se rompen el día que una cambie. El encabezado de ese
// módulo tiene las dos trampas de alineación que hacen que el lector agrupe bien
// las columnas.
//
//   node scripts/fixture-lista-arcor-pdf.mjs <salida.pdf>

import { armarPdfFormaArcor, enIngles, conIvaDe } from "./lib/pdfFormaArcor.mjs";

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

await armarPdfFormaArcor({ filas: FILAS, salida });

console.log(`escrito: ${salida}`);
for (const f of FILAS.filter((x) => x.codigo)) {
  const conIva = f.conIva ?? conIvaDe(f.sinIva);
  console.log(`  ${f.codigo}\t${f.um}\tx${f.cant}\t${enIngles(f.sinIva)}\t${enIngles(conIva)}\t${f.desc}`);
}
