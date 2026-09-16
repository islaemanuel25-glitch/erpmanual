// Qué es cada columna de una lista que nunca se vio.
//
// Los valores de cada columna están copiados de las cuatro listas reales. Los
// nombres de los encabezados también, y por eso importan: la columna de precio
// que se termina usando se llama "Precio", "FINAL", "px caja" y "It_PrecioFinal"
// en una lista cada una. Un fixture con cuatro columnas todas llamadas "PRECIO"
// probaría que el módulo sabe leer un encabezado, que es justo lo que no puede
// hacer.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAMPO,
  proponerMapeo,
  perfilDeColumna,
  pareceCodigoDeBarras,
  pareceTituloDeColumna,
} from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";

/** Una columna repetida n veces, como llega del lector. */
const col = (indice, titulo, valores) => ({ indice, titulo, valores });
const repetir = (v, n = 30) => Array.from({ length: n }, (_, i) => (Array.isArray(v) ? v[i % v.length] : v));

// ── LA LISTA DE M Y F ───────────────────────────────────────────────────────

const MYF = [
  col(0, "Código", repetir(["4638", "4635", "2034", "5486", "1892", "360", "104", "49"])),
  col(1, "Articulo", repetir([
    "TOSTEX CHIPS COLORES BOLSA 10 X 270 G.",
    "AGUA BAGGIO VIDA MANZANA 6 X 1500",
    "FID. MOLTO SPAGUETTI 20X500 GR",
    "FRA HUG CLASSIC G REG 12X8 2024 0",
  ])),
  col(2, "Desc%", repetir(["-12,0", "", "-7,0", "", "-5,0", "", "-16,0", ""])),
  col(3, "Precio", repetir(["1.430,19", "1.135,65", "737,84", "2.327,25", "457,68", "10.907,83"])),
];

test("M Y F: el descuento no se lo lleva la cantidad por bulto", () => {
  // CONTRAPRUEBA DE LA REGLA: los valores "-12,0" son enteros chicos y muy
  // repetidos, que es también el perfil de una columna de unidades por bulto.
  // Con el orden de campos fijo —cantidad antes que descuento— la cantidad se
  // llevaba la columna aunque puntuara mucho menos, y la lista quedaba sin
  // descuento Y con una cantidad por bulto que era el descuento.
  const p = proponerMapeo(MYF);
  assert.equal(p.mapeo.descuento, 2, `mapeo: ${JSON.stringify(p.mapeo)}`);
  assert.equal(p.mapeo.cantidad, null, "esta lista no tiene columna de unidades");
  assert.equal(p.mapeo.codigo, 0);
  assert.equal(p.mapeo.descripcion, 1);
  assert.deepEqual(p.mapeo.precios, [3]);
  assert.deepEqual(p.motivosDeDuda, []);
});

// ── LA LISTA DE DREAMCO: código de barras, unidades y CUATRO precios ────────

const DREAMCO = [
  col(0, "Cod.Barra", repetir(["7790740000233", "7790740000240", "7790263119702", "7790740000257"])),
  col(1, "Art", repetir(["50928", "50929", "511982", "549574"])),
  col(2, "Descripción", repetir(["PB SH BRILLO 12X1 CORAZÓN", "PANAL CHOCOLATE 16UX247G", "MAGIST ANTIGR LIMON GAT 500ML -12-"])),
  col(3, "UxB", repetir(["12", "16", "12", "24"])),
  col(4, "Px. Final", repetir(["$ 61.905,50", "$ 31.256,86", "$ 114.797,39"])),
  col(5, "Px.U Final", repetir(["$ 5.158,79", "$ 1.953,55", "$ 994,12"])),
  col(6, "% uni", repetir(["36%", "24%", "39%"])),
  col(7, "px unidad", repetir(["$ 3.301,63", "$ 1.484,70", "$ 954,87"])),
  col(8, "%dsc", repetir(["39%", "27%", "36%"])),
  col(9, "px caja", repetir(["$ 3.146,86", "$ 1.426,09", "$ 11.193,89"])),
];

test("DREAMCO: el código de barras no se confunde con el código del proveedor", () => {
  const p = proponerMapeo(DREAMCO);
  assert.equal(p.mapeo.codigoBarra, 0);
  assert.equal(p.mapeo.codigo, 1, "el código del proveedor es 'Art', no el de barras");
  assert.equal(p.mapeo.cantidad, 3);
  assert.equal(p.mapeo.descuento, 8, "hay dos columnas de porcentaje y el descuento es '%dsc'");
});

test("DREAMCO: las cuatro columnas de precio salen todas, y ordenadas", () => {
  // El módulo NO elige cuál es la buena: eso lo decide el motor probando cada
  // una contra los costos que ya están en el sistema. Lo que tiene que hacer es
  // no perder ninguna.
  const p = proponerMapeo(DREAMCO);
  assert.deepEqual([...p.mapeo.precios].sort((a, b) => a - b), [4, 5, 7, 9]);
});

// ── LA LISTA DE AASS: la marca NO es el código ─────────────────────────────

const AASS = [
  col(0, "Prov_Nombre", repetir(["BIC", "GENOMMA", "MERISANT", "TREGAR", "MOLINOS RIO DE LA PLATA"])),
  col(1, "It_Codigo", repetir(["6000097087", "3110000909", "1020008713", "2000002293"])),
  col(2, "It_Descripcion", repetir([
    "BIC AF SOLEIL ESCAPE LAVANDA Y EUCALIPTO 1X3X18",
    "TREGAR YOGUR FRUTAS DESCREMADO ARANDANO 150GRX18",
    "LIRA AC MEZCLA ESP 900MLX12",
  ])),
  col(3, "It_PrecioFinal", repetir(["$ 6.314,05", "$ 1.210,21", "$ 24.567,63", ""])),
];

test("AASS: la columna de marca queda sin mapear", () => {
  // En una lista de distribuidor el proveedor es el distribuidor y la marca no
  // sirve para vincular. Que quede sin mapear es el resultado correcto, no una
  // detección fallida.
  const p = proponerMapeo(AASS);
  assert.equal(p.mapeo.codigo, 1);
  assert.equal(p.mapeo.descripcion, 2);
  assert.deepEqual(p.mapeo.precios, [3]);
  const marca = p.columnas.find((c) => c.indice === 0);
  assert.equal(marca.tipo, null, "la marca no es ninguno de los campos del motor");
});

test("un código de diez dígitos no es un código de barras", () => {
  // Los de AASS tienen diez y catorce dígitos según el caso. Tomarlos por
  // código de barras los mandaría a buscar contra el EAN del catálogo.
  assert.equal(pareceCodigoDeBarras("6000097087"), false);
  assert.equal(pareceCodigoDeBarras("7790740000233"), true);
  assert.equal(pareceCodigoDeBarras("50928"), false);
});

// ── EL CONTENIDO PESA MÁS QUE EL NOMBRE ─────────────────────────────────────

test("una columna que se llama PRECIO y tiene texto adentro no gana como precio", () => {
  const columnas = [
    col(0, "Codigo", repetir(["A1", "A2", "A3", "A4", "A5", "A6"])),
    col(1, "Detalle", repetir(["GALLETITA SURTIDA 12X200", "AGUA MINERAL 6X1500", "FIDEO LARGO 20X500"])),
    col(2, "PRECIO", repetir(["en consulta", "consultar", "a pedido"])),
    col(3, "Costo", repetir(["1.430,19", "2.327,25", "737,84"])),
  ];
  const p = proponerMapeo(columnas);
  assert.deepEqual(p.mapeo.precios, [3], `mapeo: ${JSON.stringify(p.mapeo)}`);
});

test("una lista sin ninguna columna de precio se informa con su motivo", () => {
  const columnas = [
    col(0, "Codigo", repetir(["A1", "A2", "A3", "A4", "A5", "A6"])),
    col(1, "Detalle", repetir(["GALLETITA SURTIDA 12X200", "AGUA MINERAL 6X1500"])),
  ];
  const p = proponerMapeo(columnas);
  assert.deepEqual(p.mapeo.precios, []);
  assert.ok(p.motivosDeDuda.some((m) => m.includes("precio")));
  assert.ok(p.confianza < 0.5, "sin precio la confianza no puede quedar alta");
});

// ── LOS TÍTULOS ─────────────────────────────────────────────────────────────

test("el título de un documento no se confunde con el de una columna", () => {
  // "Lista de Precios 3 en PESO" y "LISTA DE PRECIO 22 + 9,5%" encabezan dos de
  // los cuatro archivos. Si valen como nombre de columna, se posan sobre la
  // primera columna que les quede cerca.
  assert.equal(pareceTituloDeColumna("Lista de Precios 3 en PESO"), false);
  assert.equal(pareceTituloDeColumna("LISTA DE PRECIO 22 + 9,5%"), false);
  // Y los nombres de columna de verdad sí valen.
  for (const t of ["Código", "Articulo", "Desc%", "Precio", "COD", "UND", "NETO C/DESC", "Px. Final", "It_PrecioFinal", "UxB"]) {
    assert.equal(pareceTituloDeColumna(t), true, `"${t}" es un nombre de columna real`);
  }
  // Un número no es un título.
  assert.equal(pareceTituloDeColumna("9,5%"), false);
  assert.equal(pareceTituloDeColumna("1.430,19"), false);
});

// ── EL PERFIL SE MIDE SOBRE LO QUE HAY, NO SOBRE LO QUE FALTA ──────────────

test("una columna medio vacía sigue siendo lo que es", () => {
  // La de impuesto interno de la lista de bebidas viene vacía en las filas de
  // soda y llena en las de gaseosa. Medir el perfil sobre las celdas vacías la
  // convertiría en otra cosa.
  const perfil = perfilDeColumna(["118,93", "", "164,36", "", "314,56", ""]);
  assert.equal(perfil.llenas, 3);
  assert.equal(perfil.numeros, 1);
  assert.equal(perfil.proporcionLlena, 0.5);
});

test("el descuento en negativo entra en el perfil como porcentaje", () => {
  const perfil = perfilDeColumna(["-12,0", "-7,0", "-5,0", "-16,0"]);
  assert.equal(perfil.porcentajes, 1);
  // 5, 7, 12 y 16 ordenados: la mediana de un número par de valores se toma del
  // de arriba. Lo que importa acá es que sea un número y no null, que es lo que
  // daba cuando el signo negativo dejaba la magnitud afuera.
  assert.equal(perfil.mediana, 12, "la mediana se mide por magnitud, no por signo");
});

test("los campos que el motor necesita están todos nombrados", () => {
  assert.deepEqual(Object.values(CAMPO).sort(), [
    "cantidad", "codigo", "codigoBarra", "descripcion", "descuento", "precio",
  ]);
});
