// LA LISTA DE VINOS DE CAROZO, LEÍDA DE PUNTA A PUNTA.
//
// ── EL CASO ─────────────────────────────────────────────────────────────────
//
// "VINOS CONTADO 19.10.pdf", subida en producción como importación #22: se
// leyeron 17 renglones y 104 se descartaron "sin precio"; en las 17 la
// presentación quedó vacía, un renglón quedó sin descripción, los códigos
// llevaban "**" y la importación se guardó con tamaño de archivo 0.
//
// La causa principal no era una columna: el PDF imprime cada renglón en DOS
// ALTURAS —código y nombre en una, el precio 3 a 4 puntos más abajo— y el lector
// los tomaba como dos renglones. Ver `unirRenglonesPartidos` en
// `tablaDeArchivo.js`.
//
// ── EL ARCHIVO NO ESTÁ EN EL REPO, Y A PROPÓSITO ────────────────────────────
//
// El repositorio es público y la lista lleva precios de compra: vive en la
// carpeta hermana `erpazul-fixtures-dev`, como los Excel de Arcor (ver
// `scripts/test/fixturesExternos.mjs`). Sin la carpeta, este candado se saltea
// diciendo por qué.
//
// ── DE DÓNDE SALE EL 123 ────────────────────────────────────────────────────
//
// Contado del PDF y NO del parser: se volcaron con pdfjs todos los fragmentos de
// las cuatro páginas y se contaron los que caen en la franja del código (X menor
// que 60): son 123, todos distintos. Diez no llevan "**" ("CAL 761", "688810",
// "2347", "2353", "636011", "BG001"…) y 113 sí. Los renglones de marca —"KILLKA",
// "NATIVO", "TORO"— no tienen nada en esa franja.
//
// ── EL MAPA DE COLUMNAS ─────────────────────────────────────────────────────
//
// El que confirma la persona en "¿leí bien la lista?": código en la primera
// columna, descripción en la segunda, precio en la última, y la cantidad SIN
// columna —la presentación "6X750" no es un número—. Se afirma además que la
// propuesta del sistema coincide en la descripción y el precio, para que el día
// que las columnas se armen distinto este candado no siga leyendo con índices
// que ya no corresponden.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { leerArchivoDeLista } from "@/lib/proveedores/listas/lectura/lecturaDeArchivo";
import { proponerMapeo } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";
import { filasDelArchivo, MOTIVO_NO_ES_PRODUCTO } from "@/lib/proveedores/listas/importacionGenerica";
import { fixturePorMarca } from "../../../../scripts/test/fixturesExternos.mjs";

const { ruta, motivo } = fixturePorMarca({ marca: "vinos contado", extension: ".pdf" });
const saltear = ruta ? false : motivo;

/** Renglones con código en el PDF, contados de los fragmentos (ver arriba). */
const RENGLONES_CON_CODIGO = 123;

const MAPEO_CONFIRMADO = { codigo: 0, codigoBarra: null, descripcion: 1, cantidad: null, descuento: null, precios: [4] };

let leida = null;
async function leer() {
  if (leida) return leida;
  const crudo = fs.readFileSync(ruta);
  // Como lo arma la ruta de importar: un Buffer sobre su propio búfer.
  const bytes = Buffer.from(crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength));
  const largoAntes = bytes.length;
  const r = await leerArchivoDeLista(bytes, { nombre: "VINOS CONTADO 19.10.pdf" });
  assert.equal(r.ok, true, `no se pudo leer el PDF: ${r.motivo}`);
  const columnas = r.tabla.titulos.map((titulo, indice) => ({
    indice,
    titulo,
    valores: r.tabla.filas.map((f) => f.valores[indice]),
  }));
  const propuesta = proponerMapeo(columnas);
  const lectura = filasDelArchivo({ tabla: r.tabla, mapeo: MAPEO_CONFIRMADO });
  leida = { r, propuesta, lectura, largoAntes, largoDespues: bytes.length, tamanoReal: crudo.length };
  return leida;
}

const porCodigo = (lectura, codigo) => lectura.filas.find((f) => f.codigoNormalizado === codigo);

test("la propuesta coincide con el mapa confirmado en descripción y precio", { skip: saltear }, async () => {
  const { r, propuesta } = await leer();
  assert.equal(r.tabla.titulos.length, 5, "el PDF tiene cinco columnas: código, nombre, variedad, presentación y precio");
  assert.equal(propuesta.mapeo.descripcion, MAPEO_CONFIRMADO.descripcion);
  assert.deepEqual(propuesta.mapeo.precios, MAPEO_CONFIRMADO.precios);
});

test("se leen todos los renglones con código del archivo, y ninguno se descarta sin precio", { skip: saltear }, async () => {
  const { lectura } = await leer();
  const sinPrecio = lectura.descartadas.filter((d) => d.motivo === MOTIVO_NO_ES_PRODUCTO.SIN_PRECIO);
  assert.deepEqual(sinPrecio, [], "hay renglones descartados sin precio");
  assert.equal(lectura.filas.length, RENGLONES_CON_CODIGO);
  assert.equal(new Set(lectura.filas.map((f) => f.codigoNormalizado)).size, RENGLONES_CON_CODIGO, "hay códigos repetidos");
});

test("ningún código queda con asterisco", { skip: saltear }, async () => {
  const { lectura } = await leer();
  const conAsterisco = lectura.filas.filter((f) => f.codigoNormalizado.includes("*"));
  assert.deepEqual(conAsterisco.map((f) => f.codigoNormalizado), []);
});

test("ningún renglón de marca entra como producto, y todos tienen descripción", { skip: saltear }, async () => {
  const { lectura } = await leer();
  // Las marcas del papel: renglones de una sola palabra o nombre, sin código.
  const marcas = ["ESPUMANTES", "ARIZU", "CALLIA", "CANCILLER", "DIAMANTE", "KILLKA", "NATIVO", "PORTILLO", "TORO", "ZUMUVA"];
  for (const m of marcas) {
    assert.equal(lectura.filas.some((f) => f.descripcionProveedor === m), false, `"${m}" entró como producto`);
  }
  const sinDescripcion = lectura.filas.filter((f) => !String(f.descripcionProveedor ?? "").trim());
  assert.deepEqual(sinDescripcion.map((f) => f.codigoNormalizado), []);
});

test("las cuatro filas de control salen exactas", { skip: saltear }, async () => {
  const { lectura } = await leer();
  const esperadas = [
    ["KIL483", "KILLKA MALBEC", 6, 4775.7],
    ["POR274", "PORTILLO MALBEC SERIGRAFIA", 6, 6730.99],
    ["2353", "NATIVO TINTO TETRA", 12, 1170.54],
    ["2354", "NATIVO BLANCO TETRA", 12, 1064.6],
  ];
  for (const [codigo, descripcion, porCaja, precio] of esperadas) {
    const f = porCodigo(lectura, codigo);
    assert.ok(f, `no se leyó ${codigo}`);
    assert.equal(f.descripcionProveedor, descripcion, codigo);
    assert.equal(f.unidadesPorBulto, porCaja, codigo);
    assert.equal(f.preciosPorColumna[4], precio, codigo);
  }
});

test("leer el PDF no le vacía los bytes a quien llama", { skip: saltear }, async () => {
  // Con los bytes vacíos después de leer, la ruta guardaba `archivoTamano` 0.
  const { largoAntes, largoDespues, tamanoReal } = await leer();
  assert.equal(largoAntes, tamanoReal);
  assert.equal(largoDespues, tamanoReal);
});
