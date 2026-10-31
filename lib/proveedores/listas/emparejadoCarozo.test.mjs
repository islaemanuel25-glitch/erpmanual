// "PUEDEN SER DE CAROZO": EL EMPAREJADO POR NOMBRE CON LA LISTA DE VINOS REAL.
//
// ── EL CASO ─────────────────────────────────────────────────────────────────
//
// Importación #23 de Carozo ("VINOS CONTADO 19.10.pdf"): "Pueden ser de…"
// ofreció 5, cuando de 23 productos del catálogo con marcas de la lista 15
// tienen renglón; y "VINO ESTANCIA MENDOZA MALBEC 750ML" quedó vinculado a
// "ESTANCIA MENDOZA MERLOT-MALBEC" en vez de "ESTANCIA MENDOZA MALBEC" (86288).
//
// ── DE DÓNDE SALEN LOS NOMBRES ──────────────────────────────────────────────
//
// Dos juegos, y ninguno está escrito a mano:
//
//   CATALOGO_FOTO   los nombres de bebidas de la foto del catálogo que ya está en
//                   el repo (`tests/huellas/baseline/huellas.json`), tal cual.
//                   Con esta foto el cálculo anterior ofrecía 5, el mismo número
//                   que producción.
//   NOMBRES_ORDEN   los nombres del catálogo que vienen en la orden de esta tanda.
//
// Se corren por separado porque los dos juegos traen el mismo vino escrito de
// dos formas ("Canciller blanco dulce 750" y "VINO CANCILLER BLANCO DULCE 750ML
// X6"): juntos empatarían entre sí, una combinación que no existe en ningún
// catálogo.
//
// Los renglones salen del PDF real, leído por el lector de verdad: el archivo no
// está en el repo (es público y lleva precios) y sin la carpeta
// `erpazul-fixtures-dev` estos casos se saltean diciendo por qué. Las reglas
// sueltas tienen sus candados sin fixture en `posibles.test.mjs` y acá abajo.
//
// ── LO QUE NO SE PRUEBA, Y POR QUÉ ──────────────────────────────────────────
//
// Los cinco combos de Canciller con Speed: sus nombres no están en el repo, y
// escribirlos de memoria sería fabricar el caso. Lo que sí se prueba es que los
// productos SPEED de la foto no se ofrecen.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { leerArchivoDeLista } from "@/lib/proveedores/listas/lectura/lecturaDeArchivo";
import { proponerMapeo } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";
import { filasDelArchivo } from "@/lib/proveedores/listas/importacionGenerica";
import { posiblesDelProveedor } from "@/lib/proveedores/listas/vincularConUnaFila";
import { palabrasDelNombre, parecidoNombre, nombreParaComparar } from "@/lib/proveedores/listas/conciliarLista";
import { contenidoEnRenglon } from "@/lib/proveedores/listas/lectura/numeroDeLista";
import { fixturePorMarca } from "../../../scripts/test/fixturesExternos.mjs";

const { ruta, motivo } = fixturePorMarca({ marca: "vinos contado", extension: ".pdf" });
const saltear = ruta ? false : motivo;

const CATALOGO_FOTO = [
  "ESTANCIA MENDOZA SYR-MAL 1.125 X6", "Estancia Malbec 1.125ml", "PASO DE LOS TOROS 1.5L POMELO X 6",
  "PASO DE LOS TOROS TONICA 1 5lts X6", "SPEED CHICO", "SPEED XL", "speed zero", "TORO AMARILLA BOTELLON 1L",
  "TORO AMARRILLA 700ML PACK X 6", "VINO 4 MONOS MALBEC XCAJA", "VINO ALARIS MALBEC", "VINO ALMA MORA MALBEC XCAJA",
  "VINO BENJAMIN MALBEC X6", "VINO CANCILLER BLANCO DULCE 1125ml", "VINO CANCILLER BLANCO DULCE 750ML X6",
  "VINO CANCILLER BLEND TINTO 1.125ML X6", "VINO CANCILLER TINTO 750ML X6", "VINO COLON SELECTO FRESCO DULCE",
  "VINO DADA #391 malbec", "VINO DADA Nº8 CHOCOLATE XCAJA", "VINO DADA Nº9 CARAMELO", "VINO DILEMA BLANCO DULCE XCAJA",
  "VINO DILEMA ROSADO DULCE XCAJA", "VINO DON VALENTIN LACRADO", "VINO EL NAUFRAGO MALBEC X CAJA",
  "VINO ESTANCIA MENDOZA 1.125ML CAB MAL X6", "VINO ESTANCIA MENDOZA BLANCO DULCE 750ML", "VINO ESTANCIA MENDOZA CAB-MAL 750",
  "VINO ESTANCIA MENDOZA MALBEC 750ML", "VINO ESTANCIA MENDOZA SYR-MAL 750", "VINO FINCA LAS MORAS CABERNET",
  "VINO PERRO CALLEJERO", "VINO PROFUGO FRUTOS ROJOS", "VINO SANTA JULIA TINTO DULCE X6", "VINO TORO ETIQUETA BLANCA 1.125L",
  "VINO TORO TETRA BLANCO 1L", "VINO TORO TETRA TINTO 1L", "VINO TRAPICHE IMPURO", "VINO TRAPICHE PURO",
  "VINO TRAPICHE RESERVA MALBEC", "VINO UVITA BLANCO DULCE X12", "VINO VIÑAS DE BALBO 1125ML", "Vino Santa Julia Blanco Dulce x6",
  "toro ETIQ BLANCA 750ML",
];

const NOMBRES_ORDEN = [
  "CANCILLER BLEND ENOLO TINTO 1LT",
  "VINO ESTANCIA MENDOZA MALBEC 750ML",
  "Canciller blanco dulce 750",
  "Canciller blanco dulce 1125",
  "Estancia Mendoza CAB-MAL 750",
];
const SIN_RENGLON = ["SPEED CHICO", "SPEED XL", "speed zero", "PASO DE LOS TOROS 1.5L POMELO X 6", "PASO DE LOS TOROS TONICA 1 5lts X6"];

let renglones = null;
async function leer() {
  if (renglones) return renglones;
  const r = await leerArchivoDeLista(new Uint8Array(fs.readFileSync(ruta)), { nombre: "VINOS CONTADO 19.10.pdf" });
  const columnas = r.tabla.titulos.map((titulo, indice) => ({ indice, titulo, valores: r.tabla.filas.map((f) => f.valores[indice]) }));
  const { filas } = filasDelArchivo({ tabla: r.tabla, mapeo: proponerMapeo(columnas).mapeo });
  renglones = filas.map((f, i) => ({ ...f, id: i + 1, productoBaseId: null }));
  return renglones;
}

const ofrecer = (filas, nombres) =>
  new Map(
    posiblesDelProveedor({ filas, productos: nombres.map((nombre, i) => ({ id: i + 1, nombre })) }).map((p) => [
      p.producto.nombre,
      { codigo: p.renglon.codigo, descripcion: p.renglon.descripcion },
    ])
  );

test("los nombres de la orden van cada uno a su renglón", { skip: saltear }, async () => {
  const of = ofrecer(await leer(), [...NOMBRES_ORDEN, ...SIN_RENGLON]);
  assert.equal(of.get("CANCILLER BLEND ENOLO TINTO 1LT")?.descripcion, "CANCILLER BLEND ENOLO TINTO");
  assert.equal(of.get("VINO ESTANCIA MENDOZA MALBEC 750ML")?.descripcion, "ESTANCIA MENDOZA MALBEC");
  assert.equal(of.get("VINO ESTANCIA MENDOZA MALBEC 750ML")?.codigo, "86288**");
  // Los dos "CANCILLER BLEND BLANCO DULCE", cada uno por su presentación.
  assert.equal(of.get("Canciller blanco dulce 750")?.codigo, "87351**", "el de 6X750");
  assert.equal(of.get("Canciller blanco dulce 1125")?.codigo, "87353**", "el de 6X1125");
  assert.equal(of.get("Estancia Mendoza CAB-MAL 750")?.descripcion, "ESTANCIA MENDOZA CABERNET-MLBEC");
  for (const n of SIN_RENGLON) assert.equal(of.has(n), false, `"${n}" no tiene renglón y se ofreció`);
});

test("ESTANCIA MENDOZA MALBEC nunca va a MERLOT-MALBEC, ni en el orden de la hoja de vincular", { skip: saltear }, async () => {
  const filas = await leer();
  const nombre = "VINO ESTANCIA MENDOZA MALBEC 750ML";
  const correcto = filas.find((f) => f.codigoNormalizado === "86288");
  const merlot = filas.find((f) => f.descripcionProveedor === "ESTANCIA MENDOZA MERLOT-MALBEC");
  assert.ok(parecidoNombre(nombre, correcto.descripcionProveedor) > parecidoNombre(nombre, merlot.descripcionProveedor));
  const of = ofrecer(filas, CATALOGO_FOTO);
  assert.equal(of.get(nombre)?.codigo, "86288**");
});

test("con la foto del catálogo: los pares buenos se ofrecen y lo que no tiene renglón no", { skip: saltear }, async () => {
  const of = ofrecer(await leer(), CATALOGO_FOTO);
  const esperados = {
    "VINO ESTANCIA MENDOZA MALBEC 750ML": "86288**",
    "VINO ESTANCIA MENDOZA CAB-MAL 750": "86343**",
    "VINO CANCILLER BLANCO DULCE 750ML X6": "87351**",
    "VINO CANCILLER BLANCO DULCE 1125ml": "87353**",
    "VINO CANCILLER BLEND TINTO 1.125ML X6": "87349**",
    "VINO CANCILLER TINTO 750ML X6": "87347**",
    "VINO DILEMA BLANCO DULCE XCAJA": "85514**",
    "VINO DILEMA ROSADO DULCE XCAJA": "85519**",
    "VINO TORO TETRA BLANCO 1L": "45620**",
    "VINO TORO TETRA TINTO 1L": "45615**",
    "VINO UVITA BLANCO DULCE X12": "BG001",
  };
  for (const [nombre, codigo] of Object.entries(esperados)) assert.equal(of.get(nombre)?.codigo, codigo, nombre);
  for (const n of SIN_RENGLON) assert.equal(of.has(n), false, `"${n}" se ofreció`);
  // Carozo no tiene Estancia Mendoza Malbec de 1125: no se le ofrece PHEBUS
  // MALBEC (6X1125) por compartir la botella.
  assert.equal(of.has("Estancia Malbec 1.125ml"), false);
});

// ── SIN FIXTURE: LAS REGLAS DE LA NORMALIZACIÓN ─────────────────────────────

test("los tamaños quedan en una forma única en ml, sin partir el punto", () => {
  const tamano = (t) => [...palabrasDelNombre(t)].filter((p) => /ml$/.test(p));
  assert.deepEqual(tamano("1.125ML"), ["1125ml"]);
  assert.deepEqual(tamano("1.125"), ["1125ml"]);
  assert.deepEqual(tamano("1125ML"), ["1125ml"]);
  assert.deepEqual(tamano("X1125"), ["1125ml"]);
  assert.deepEqual(tamano("X 1125"), ["1125ml"]);
  assert.deepEqual(tamano("1L"), ["1000ml"]);
  assert.deepEqual(tamano("1LT"), ["1000ml"]);
  assert.deepEqual(tamano("X1000"), ["1000ml"]);
  assert.deepEqual(tamano("1000"), ["1000ml"]);
  assert.deepEqual(tamano("750ML"), ["750ml"]);
  assert.deepEqual(tamano("X750"), ["750ml"]);
  assert.deepEqual(tamano("VINO TORO ETIQUETA BLANCA 1.125L"), ["1125ml"]);
  // El error de tipeo no se adivina, y los gramos no son volumen.
  assert.deepEqual(tamano("TORO CLASICO BLANCO X 11125"), []);
  assert.deepEqual(tamano("TOSTEX CHIPS COLORES BOLSA 10 X 270 G."), []);
  assert.deepEqual(tamano("VINO DADA #391 malbec"), []);
});

test("sin tamaño en el nombre, el de la presentación; con tamaño, el del nombre", () => {
  assert.ok(palabrasDelNombre("CANCILLER BLEND TINTO", { contenidoMl: 750 }).has("750ml"));
  assert.ok(palabrasDelNombre("CANCILLER BLEND TINTO", { contenidoMl: 1125 }).has("1125ml"));
  const conNombre = palabrasDelNombre("TORO TINTO X1000", { contenidoMl: 750 });
  assert.ok(conNombre.has("1000ml") && !conNombre.has("750ml"));
  // La presentación leída del renglón.
  assert.equal(contenidoEnRenglon(["CANCILLER BLEND TINTO", "87349**", "6X1125", "$ 2.074,00"]), 1125);
  assert.equal(contenidoEnRenglon(["NATIVO TINTO TETRA", "2353", "12X1000"]), 1000);
  assert.equal(contenidoEnRenglon(["FID. MOLTO SPAGUETTI 20X500 GR"]), null, "gramos no es volumen");
  assert.equal(contenidoEnRenglon(["DIAMANTE VINO TETRA", "2347**"]), null);
});

test("sin 'vino', sin caja, y con las abreviaturas de vinos escritas enteras", () => {
  assert.equal(nombreParaComparar("VINO EL NAUFRAGO MALBEC X CAJA"), "vino el naufrago malbec");
  assert.deepEqual([...palabrasDelNombre("VINO EL NAUFRAGO MALBEC X CAJA")], ["el", "naufrago", "malbec"]);
  assert.deepEqual([...palabrasDelNombre("VINO 4 MONOS MALBEC XCAJA")], ["monos", "malbec"]);
  assert.deepEqual([...palabrasDelNombre("VINO BENJAMIN MALBEC X6")], ["benjamin", "malbec"]);
  assert.deepEqual([...palabrasDelNombre("VINO UVITA BLANCO DULCE X12")], ["uvita", "blanco", "dulce"]);
  assert.deepEqual([...palabrasDelNombre("Estancia Mendoza CAB-MAL 750")], ["estancia", "mendoza", "cabernet", "malbec", "750ml"]);
  assert.deepEqual([...palabrasDelNombre("ESTANCIA MENDOZA CABERNET-MLBEC")], ["estancia", "mendoza", "cabernet", "malbec"]);
  assert.deepEqual([...palabrasDelNombre("ESTANCIA MENDOZA CHEN-CHAR. DULCE")], ["estancia", "mendoza", "chenin", "chardonnay", "dulce"]);
  assert.deepEqual([...palabrasDelNombre("toro ETIQ BLANCA 750ML")], ["toro", "etiqueta", "blanca", "750ml"]);
});

test("dos tamaños distintos dan parecido cero; un tamaño igual no acerca dos productos distintos", () => {
  assert.equal(parecidoNombre("Canciller blanco dulce 1125", "CANCILLER BLEND BLANCO DULCE 6X750"), 0);
  assert.equal(parecidoNombre("Canciller blanco dulce 750", "CANCILLER BLEND BLANCO DULCE 6X750"), 0.75);
  // Comparten la botella y nada más que "malbec": queda por debajo del umbral.
  assert.ok(parecidoNombre("Estancia Malbec 1.125ml", "PHEBUS MALBEC 6X1125") < 0.5);
});
