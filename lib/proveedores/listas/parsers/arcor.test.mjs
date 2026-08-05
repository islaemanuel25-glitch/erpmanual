// Parser de la lista de precios de Arcor.
//
// Dos clases de prueba conviven acá:
//
//   · FIXTURES EN MEMORIA — se arman con XLSX.utils.aoa_to_sheet y prueban cada
//     validación por separado. Corren siempre.
//   · FIXTURE REAL — el Excel de Arcor de verdad. NO vive en el repositorio: es
//     un binario de un proveedor y no tiene por qué quedar versionado. La ruta
//     se pasa por la variable de entorno ARCOR_FIXTURE. Sin ella, esas pruebas
//     se SALTEAN con un aviso; no se dan por buenas en silencio.
//
// Para correrlas:
//   ARCOR_FIXTURE="/ruta/lista de precios agosto 2026.xls.xlsx" \
//     node --test lib/proveedores/listas/parsers/arcor.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Import DEFAULT y no namespace, al revés que en el código de la aplicación.
// `xlsx` publica dos builds: el CJS (xlsx.js), que tiene todo incluido readFile,
// y el ESM (xlsx.mjs), que es FS-free y NO expone readFile. Un `import *` en un
// .mjs resuelve al ESM y se queda sin readFile; el default resuelve al CJS. En
// las rutas de Next pasa lo contrario: Turbopack toma el ESM y el default no
// existe. Por eso cada contexto usa la forma que le sirve.
import XLSX from "xlsx";

import {
  parsearListaArcor,
  mapearColumnas,
  hojaEsCandidata,
  formatoDeHoja,
  clasificarFila,
  normalizarEncabezado,
  ENCABEZADOS,
  ENCABEZADOS_OBLIGATORIOS,
  ENCABEZADOS_OPCIONALES,
  ERROR_PARSER,
  ADVERTENCIA_PARSER,
  UNIDADES_VALIDAS,
  DESCRIPCION_UNIDAD,
  TIPO_FILA,
} from "./arcor.js";

/** Formato A: el de agosto, con Precio S/IVA. */
const CABECERA = ["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA"];
/** Formato B: la exportación con códigos de barras. Precio C/IVA una columna antes. */
const CABECERA_B = ["Producto", "Descripción", "U.M.", "UxBU", "Precio C/IVA", "Cod de barra "];
const CATEGORIA = "03- ALIMENTOS   91- COMESTIBLES LA CAMPAGNOLA   0123- ADEREZOS    ";

/** Workbook de una sola hoja desde una matriz de filas. */
function libro(filas, nombreHoja = "Hoja1") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
  return wb;
}

/** Un producto válido, para variar solo lo que cada prueba quiere romper. */
const fila = (over = []) => {
  const base = [10301, "KETCHUP DOYP. LC X250G", "UN", 24, 1160.83, 1404.6];
  return base.map((v, i) => (over[i] === undefined ? v : over[i]));
};

// ═══ ENCABEZADOS Y HOJAS ═════════════════════════════════════════════════════

test("1. reconoce el formato A completo", () => {
  const wb = libro([CABECERA, fila()]);
  const { faltantes, columnas } = mapearColumnas(wb.Sheets.Hoja1);
  assert.deepEqual(faltantes, []);
  assert.deepEqual(columnas, {
    codigo: 0, descripcion: 1, unidad: 2, unidadesPorBulto: 3, precioSinIva: 4, precioConIva: 5,
  });
  assert.equal(formatoDeHoja(wb.Sheets.Hoja1), "A");
});

test("1b. los obligatorios son cinco; S/IVA y Cod de barra son opcionales", () => {
  assert.deepEqual(Object.keys(ENCABEZADOS_OBLIGATORIOS).sort(), [
    "codigo", "descripcion", "precioConIva", "unidad", "unidadesPorBulto",
  ]);
  assert.deepEqual(Object.keys(ENCABEZADOS_OPCIONALES).sort(), ["codigoBarra", "precioSinIva"]);
});

test("2. el encabezado se reconoce sin acentos, con espacios de más y en minúsculas", () => {
  assert.equal(normalizarEncabezado("Descripción"), normalizarEncabezado("descripcion"));
  assert.equal(normalizarEncabezado("  Precio   S/IVA  "), "precio s/iva");
  const wb = libro([["producto", "DESCRIPCION", " u.m. ", "uxbu", "precio s/iva", "Precio  C/IVA"], fila()]);
  assert.equal(hojaEsCandidata(wb.Sheets.Hoja1), true);
});

test("3. encabezado inválido: falta un OBLIGATORIO y el archivo se rechaza entero", () => {
  // Sin Precio C/IVA no hay con qué conciliar.
  const wb = libro([["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA"], fila()]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.NINGUNA_HOJA_VALIDA);
  assert.equal(r.productos.length, 0);
});

test("4. el error de encabezado dice CUÁL falta, por hoja", () => {
  const wb = libro([["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA"], fila()]);
  const r = parsearListaArcor(wb);
  assert.deepEqual(r.errores[0].detalle[0].faltantes, ["precioConIva"]);
});

test("4b. cada obligatorio ausente rechaza el archivo", () => {
  const completo = { Producto: 1, "Descripción": "A", "U.M.": "UN", UxBU: 1, "Precio C/IVA": 10 };
  for (const quitar of Object.keys(completo)) {
    const titulos = Object.keys(completo).filter((t) => t !== quitar);
    const wb = libro([titulos, titulos.map((t) => completo[t])]);
    const r = parsearListaArcor(wb);
    assert.equal(r.errores[0]?.codigo, ERROR_PARSER.NINGUNA_HOJA_VALIDA, `sin ${quitar}`);
  }
});

// ═══ FORMATO B Y COLUMNAS OPCIONALES ═════════════════════════════════════════

test("4c. archivo SIN Precio S/IVA pero CON Precio C/IVA: se acepta", () => {
  const wb = libro([CABECERA_B, [10301, "KETCHUP", "UN", 24, 1404.6, 7793360103018]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
  assert.equal(r.resumen.formato, "B");
});

test("4d. sin la columna Precio S/IVA, precioSinIva queda en null y SIN advertencia", () => {
  const wb = libro([CABECERA_B, [10301, "KETCHUP", "UN", 24, 1404.6, 7793360103018]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos[0].precioSinIva, null);
  // No es una anomalía: es un formato válido. Avisar por cada fila sería ruido.
  assert.equal(
    r.advertencias.filter((a) => a.codigo === ADVERTENCIA_PARSER.PRECIO_SIN_IVA_AUSENTE).length,
    0
  );
  assert.deepEqual(r.resumen.columnasOpcionalesAusentes, ["precioSinIva"]);
});

test("4e. el precio NO se deriva de C/IVA cuando falta S/IVA", () => {
  const wb = libro([CABECERA_B, [10301, "KETCHUP", "UN", 24, 1404.6, 7793360103018]]);
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.precioSinIva, null);
  assert.notEqual(p.precioSinIva, 1404.6 / 1.21);
  // Y el precio con IVA sigue siendo el de la columna, sin recargo aplicado.
  assert.equal(p.precioConIva, 1404.6);
  assert.notEqual(p.precioConIva, 1404.6 * 1.05);
});

test("4f. los dos formatos se aceptan y se identifican", () => {
  assert.equal(parsearListaArcor(libro([CABECERA, fila()])).resumen.formato, "A");
  assert.equal(
    parsearListaArcor(libro([CABECERA_B, [1, "A", "UN", 1, 10, 7793360103018]])).resumen.formato,
    "B"
  );
});

test("4g. Precio C/IVA se ubica por NOMBRE aunque cambie de columna", () => {
  // En el formato A está en F; en el B, en E. El mismo parser, sin posiciones.
  const a = mapearColumnas(libro([CABECERA, fila()]).Sheets.Hoja1);
  const b = mapearColumnas(libro([CABECERA_B, [1, "A", "UN", 1, 10, 999]]).Sheets.Hoja1);
  assert.equal(a.columnas.precioConIva, 5);
  assert.equal(b.columnas.precioConIva, 4);
});

test("4h. las columnas obligatorias se ubican aunque estén en cualquier orden", () => {
  const wb = libro([
    ["Precio C/IVA", "UxBU", "Producto", "Cod de barra", "U.M.", "Descripción"],
    [1404.6, 24, 10301, "0779336010301", "UN", "KETCHUP"],
  ]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  const p = r.productos[0];
  assert.equal(p.precioConIva, 1404.6);
  assert.equal(p.unidadesPorBulto, 24);
  assert.equal(p.codigoNormalizado, "10301");
  assert.equal(p.unidadProveedor, "UN");
  assert.equal(p.descripcionProveedor, "KETCHUP");
  assert.equal(p.codigoBarraProveedor, "0779336010301");
});

// ═══ CÓDIGO DE BARRAS ════════════════════════════════════════════════════════

test("4i. el código de barras se conserva como codigoBarraProveedor", () => {
  const wb = libro([CABECERA_B, [10301, "KETCHUP", "UN", 24, 1404.6, 7793360103018]]);
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.codigoBarraProveedor, "7793360103018");
  assert.equal(typeof p.codigoBarraProveedor, "string");
});

test("4j. un EAN de 13 dígitos NO se lee en notación científica", () => {
  const wb = libro([CABECERA_B, [1, "A", "UN", 1, 10, 7793360103018]]);
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.codigoBarraProveedor, "7793360103018");
  assert.ok(!p.codigoBarraProveedor.includes("e"), "salió en notación científica");
  assert.equal(p.codigoBarraProveedor.length, 13);
});

test("4k. el cero inicial se conserva cuando el archivo lo trae como texto", () => {
  const wb = libro([CABECERA_B, [1, "A", "UN", 1, 10, "0779336010301"]]);
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.codigoBarraProveedor, "0779336010301");
  assert.equal(p.codigoBarraProveedor[0], "0");
});

test("4l. el código de barras NO se confunde con un precio", () => {
  const wb = libro([CABECERA_B, [1, "A", "UN", 1, 1404.6, 7793360103018]]);
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.precioConIva, 1404.6);
  assert.notEqual(p.precioConIva, 7793360103018);
  // Y no participa de ninguna validación numérica: un barcode raro no rompe.
  const raro = parsearListaArcor(libro([CABECERA_B, [1, "A", "UN", 1, 10, "sin-codigo"]]));
  assert.equal(raro.errores.length, 0);
  assert.equal(raro.productos[0].codigoBarraProveedor, "sin-codigo");
});

test("4m. sin columna de barras, codigoBarraProveedor es null", () => {
  const p = parsearListaArcor(libro([CABECERA, fila()])).productos[0];
  assert.equal(p.codigoBarraProveedor, null);
});

test("4n. una fila de categoría con basura en la columna de barras sigue siendo categoría", () => {
  // El archivo real trae 0 y "" ahí en las filas de categoría.
  for (const basura of [0, "", null]) {
    const wb = libro([CABECERA_B, [CATEGORIA, null, null, null, null, basura]]);
    const r = parsearListaArcor(wb);
    assert.equal(r.categorias.length, 1, `basura ${JSON.stringify(basura)}`);
    assert.equal(r.errores.length, 0);
  }
});

test("4n2. una fila de categoría con 0 en Precio S/IVA sigue siendo categoría", () => {
  // Es el caso REAL de la lista de agosto: 76 de las 77 categorías traen un cero
  // numérico en esa columna. Mirarla las convertía a todas en filas rotas.
  for (const basura of [0, "", null]) {
    const wb = libro([CABECERA, [CATEGORIA, null, null, null, basura, null]]);
    const r = parsearListaArcor(wb);
    assert.equal(r.categorias.length, 1, `S/IVA ${JSON.stringify(basura)}`);
    assert.equal(r.errores.length, 0);
    assert.equal(r.productos.length, 0);
  }
});

test("4n3. una fila con precio C/IVA pero sin descripción NO es categoría", () => {
  // El precio obligatorio sí cuenta: una fila con plata no es un encabezado.
  const wb = libro([CABECERA, [CATEGORIA, null, null, null, null, 1404.6]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.categorias.length, 0);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.FILA_PARCIAL);
});

test("4o. el resumen cuenta cuántos productos traen código de barras", () => {
  const wb = libro([
    CABECERA_B,
    [1, "A", "UN", 1, 10, 7793360103018],
    [2, "B", "UN", 1, 10, null],
  ]);
  const r = parsearListaArcor(wb);
  assert.equal(r.resumen.productos, 2);
  assert.equal(r.resumen.conCodigoBarra, 1);
});

test("5. ninguna hoja válida", () => {
  const wb = libro([["Cliente", "Saldo"], ["A", 1]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.NINGUNA_HOJA_VALIDA);
  assert.equal(r.resumen.hojaNombre, null);
});

test("6. dos hojas válidas: no se elige en silencio", () => {
  const wb = libro([CABECERA, fila()], "Enero");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CABECERA, fila()]), "Febrero");
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.MULTIPLES_HOJAS_VALIDAS);
  assert.deepEqual(r.errores[0].detalle.hojas, ["Enero", "Febrero"]);
  assert.equal(r.productos.length, 0);
});

test("7. una sola hoja válida entre varias: se usa esa", () => {
  const wb = libro([["Otra", "cosa"], ["x", 1]], "Notas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CABECERA, fila()]), "Lista");
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.resumen.hojaNombre, "Lista");
  assert.equal(r.productos.length, 1);
  assert.equal(r.productos[0].hojaNombre, "Lista");
});

test("8. workbook sin hojas", () => {
  const r = parsearListaArcor({ SheetNames: [], Sheets: {} });
  assert.equal(r.errores[0].codigo, ERROR_PARSER.SIN_HOJAS);
});

test("9. encabezado OBLIGATORIO duplicado: ambigüedad real, se rechaza", () => {
  const wb = libro([[...CABECERA, "U.M."], fila()]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.ENCABEZADO_DUPLICADO);
  assert.equal(r.productos.length, 0);
});

test("9b. Precio C/IVA duplicado también se rechaza", () => {
  const wb = libro([[...CABECERA, "Precio C/IVA"], [...fila(), 999]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.ENCABEZADO_DUPLICADO);
});

test("9c. un OPCIONAL duplicado solo advierte: se usa el primero", () => {
  const wb = libro([[...CABECERA, "Cod de barra", "Cod de barra"], [...fila(), 111, 222]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
  assert.equal(r.productos[0].codigoBarraProveedor, "111");
  assert.ok(r.advertencias.some((a) => a.codigo === ADVERTENCIA_PARSER.ENCABEZADO_EXTRA));
});

// ═══ CLASIFICACIÓN DE FILAS ══════════════════════════════════════════════════

test("10. la fila de categoría tiene texto en A y nada más", () => {
  assert.equal(
    clasificarFila({ codigo: CATEGORIA, descripcion: null, unidad: null, unidadesPorBulto: null, precioConIva: null, precioSinIva: null }),
    TIPO_FILA.CATEGORIA
  );
});

test("11. la fila de producto tiene código y descripción", () => {
  assert.equal(
    clasificarFila({ codigo: 10301, descripcion: "KETCHUP", unidad: "UN", unidadesPorBulto: 24, precioConIva: 1404.6, precioSinIva: 1160 }),
    TIPO_FILA.PRODUCTO
  );
});

test("12. fila vacía", () => {
  assert.equal(
    clasificarFila({ codigo: null, descripcion: null, unidad: null, unidadesPorBulto: null, precioConIva: null, precioSinIva: null }),
    TIPO_FILA.VACIA
  );
});

test("13. fila parcial: descripción sin código", () => {
  assert.equal(
    clasificarFila({ codigo: null, descripcion: "ALGO", unidad: null, unidadesPorBulto: null, precioConIva: null, precioSinIva: null }),
    TIPO_FILA.PARCIAL
  );
});

test("14. la fila parcial es un error con su número de fila, no un descarte mudo", () => {
  const wb = libro([CABECERA, [null, "SIN CÓDIGO", "UN", 1, 10, 12]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 1);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.FILA_PARCIAL);
  assert.equal(r.errores[0].filaExcel, 2);
  assert.equal(r.productos.length, 0);
});

test("15. las filas totalmente vacías se cuentan aparte y no molestan", () => {
  const wb = libro([CABECERA, fila(), [null, null, null, null, null, null], fila([10302])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos.length, 2);
  assert.equal(r.errores.length, 0);
  assert.equal(r.resumen.filasVacias, 1);
});

// ═══ CATEGORÍAS ══════════════════════════════════════════════════════════════

test("16. la categoría se arrastra a los productos siguientes", () => {
  const OTRA = "08- Agroindustria   08- DIV. AGROINDUSTRIAS   0171- ENDULZANTES    ";
  const wb = libro([
    CABECERA,
    [CATEGORIA],
    fila([10301]),
    fila([10302]),
    [OTRA],
    fila([12753]),
  ]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos.length, 3);
  assert.equal(r.productos[0].categoriaCruda, CATEGORIA.trim());
  assert.equal(r.productos[1].categoriaCruda, CATEGORIA.trim());
  assert.equal(r.productos[2].categoriaCruda, OTRA.trim());
});

test("17. las categorías se devuelven aparte, con su fila y su texto crudo", () => {
  const wb = libro([CABECERA, [CATEGORIA], fila()]);
  const r = parsearListaArcor(wb);
  assert.equal(r.categorias.length, 1);
  assert.equal(r.categorias[0].filaExcel, 2);
  assert.equal(r.categorias[0].textoCrudo, CATEGORIA.trim());
  // El texto NO se descompone en jerarquía: se conserva entero.
  assert.match(r.categorias[0].textoCrudo, /03- ALIMENTOS/);
  assert.match(r.categorias[0].textoCrudo, /0123- ADEREZOS/);
});

test("18. un producto antes de cualquier categoría queda con categoría nula", () => {
  const wb = libro([CABECERA, fila(), [CATEGORIA], fila([10302])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos[0].categoriaCruda, null);
  assert.equal(r.productos[1].categoriaCruda, CATEGORIA.trim());
});

test("19. las categorías no son errores ni productos", () => {
  const wb = libro([CABECERA, [CATEGORIA], [CATEGORIA]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 0);
  assert.equal(r.categorias.length, 2);
});

// ═══ CÓDIGOS ═════════════════════════════════════════════════════════════════

test("20. código numérico de Excel", () => {
  const r = parsearListaArcor(libro([CABECERA, fila([10301])]));
  const p = r.productos[0];
  assert.equal(p.codigoCrudo, "10301");
  assert.equal(p.codigoNormalizado, "10301");
  assert.equal(p.codigoComparableSinCeros, null);
  assert.equal(r.resumen.codigos.numericos, 1);
  assert.equal(r.resumen.codigos.alfanumericos, 0);
});

test("21. código alfanumérico: se conserva entero, no se reduce a dígitos", () => {
  const r = parsearListaArcor(libro([CABECERA, fila(["AG10747"])]));
  const p = r.productos[0];
  assert.equal(p.codigoCrudo, "AG10747");
  assert.equal(p.codigoNormalizado, "AG10747");
  assert.equal(r.resumen.codigos.alfanumericos, 1);
});

test("22. códigos alfanuméricos del archivo real: HEL1 y HELIMPFEB", () => {
  const r = parsearListaArcor(libro([CABECERA, fila(["HEL1"]), fila(["HELIMPFEB"])]));
  assert.equal(r.productos[0].codigoNormalizado, "HEL1");
  assert.equal(r.productos[1].codigoNormalizado, "HELIMPFEB");
  assert.equal(r.errores.length, 0);
});

test("23. ceros iniciales: se conservan y se ofrece la variante comparable", () => {
  const r = parsearListaArcor(libro([CABECERA, fila(["001234"])]));
  const p = r.productos[0];
  assert.equal(p.codigoCrudo, "001234");
  assert.equal(p.codigoNormalizado, "001234");
  assert.equal(p.codigoComparableSinCeros, "1234");
});

test("24. código vacío", () => {
  const wb = libro([CABECERA, fila(["   ", "ALGO"])]);
  const r = parsearListaArcor(wb);
  // Sin código y con descripción, la fila es parcial: ni categoría ni producto.
  assert.equal(r.errores[0].codigo, ERROR_PARSER.FILA_PARCIAL);
  assert.equal(r.productos.length, 0);
});

test("25. código que solo tiene separadores: no queda nada que machear", () => {
  const wb = libro([CABECERA, fila(["---"])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.CODIGO_VACIO);
  assert.equal(r.productos.length, 0);
});

test("26. código duplicado después de normalizar", () => {
  const wb = libro([CABECERA, fila(["001234"]), fila(["001-234"])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos.length, 1);
  assert.equal(r.errores.length, 1);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.CODIGO_DUPLICADO);
  assert.equal(r.errores[0].filaExcel, 3);
  assert.equal(r.errores[0].detalle.filaPrevia, 2);
});

test("27. dos códigos parecidos pero distintos NO son duplicados", () => {
  const wb = libro([CABECERA, fila(["A01"]), fila(["01A"]), fila(["0A1"])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos.length, 3);
  assert.equal(r.errores.length, 0);
});

// ═══ DESCRIPCIÓN Y UNIDAD ════════════════════════════════════════════════════

test("28. descripción vacía en una fila que igual trae unidad y precio", () => {
  const wb = libro([CABECERA, [10301, "   ", "UN", 24, 1160, 1404.6]]);
  const r = parsearListaArcor(wb);
  // Sin descripción no es producto; con lo demás cargado tampoco es categoría.
  assert.equal(r.errores[0].codigo, ERROR_PARSER.FILA_PARCIAL);
});

test("29. las tres unidades comerciales se conservan tal cual", () => {
  const wb = libro([CABECERA, fila([1, "A", "UN"]), fila([2, "B", "DI"]), fila([3, "C", "BU"])]);
  const r = parsearListaArcor(wb);
  assert.deepEqual(r.productos.map((p) => p.unidadProveedor), ["UN", "DI", "BU"]);
  assert.deepEqual(r.resumen.porUnidad, { UN: 1, DI: 1, BU: 1 });
});

test("30. DI no se convierte a unidad ni BU a factor 1", () => {
  const wb = libro([CABECERA, fila([2, "B", "DI", 12, 100, 121])]);
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.unidadProveedor, "DI");
  assert.equal(p.unidadesPorBulto, 12);
  // El precio no se toca: ni multiplicado ni dividido.
  assert.equal(p.precioConIva, 121);
  assert.equal(DESCRIPCION_UNIDAD.DI, "display");
  assert.equal(DESCRIPCION_UNIDAD.BU, "bulto");
});

test("31. unidad desconocida", () => {
  const wb = libro([CABECERA, fila([1, "A", "KG"])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores[0].codigo, ERROR_PARSER.UNIDAD_DESCONOCIDA);
  assert.match(r.errores[0].mensaje, /UN, DI o BU/);
  assert.equal(r.productos.length, 0);
});

test("32. la unidad en minúsculas se acepta y se normaliza a mayúsculas", () => {
  const p = parsearListaArcor(libro([CABECERA, fila([1, "A", "un"])])).productos[0];
  assert.equal(p.unidadProveedor, "UN");
  assert.equal(UNIDADES_VALIDAS.has("UN"), true);
});

// ═══ UxBU ════════════════════════════════════════════════════════════════════

test("33. UxBU se conserva como entero", () => {
  const p = parsearListaArcor(libro([CABECERA, fila([1, "A", "UN", 24])])).productos[0];
  assert.equal(p.unidadesPorBulto, 24);
});

test("34. UxBU cero, negativo, decimal, texto y ausente son inválidos", () => {
  for (const v of [0, -5, 1.5, "doce", null, ""]) {
    const wb = libro([CABECERA, fila([1, "A", "UN", v])]);
    const r = parsearListaArcor(wb);
    assert.equal(r.errores[0]?.codigo, ERROR_PARSER.UXBU_INVALIDO, `UxBU ${JSON.stringify(v)}`);
    assert.equal(r.productos.length, 0);
  }
});

test("35. UxBU 1 es válido", () => {
  const r = parsearListaArcor(libro([CABECERA, fila([1, "A", "UN", 1])]));
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos[0].unidadesPorBulto, 1);
});

// ═══ PRECIOS ═════════════════════════════════════════════════════════════════

test("36. el precio sale de la columna F, Precio C/IVA", () => {
  const p = parsearListaArcor(libro([CABECERA, fila([1, "A", "UN", 1, 1160.83, 1404.6])])).productos[0];
  assert.equal(p.precioConIva, 1404.6);
  assert.equal(p.precioSinIva, 1160.83);
});

test("37. el precio conserva su precisión original: no se redondea", () => {
  const p = parsearListaArcor(libro([CABECERA, fila([1, "A", "UN", 1, 0, 1404.602001])])).productos[0];
  assert.equal(p.precioConIva, 1404.602001);
});

test("38. precio ausente, texto, negativo e infinito", () => {
  for (const v of [null, "", "s/d", -100, Infinity]) {
    const wb = libro([CABECERA, fila([1, "A", "UN", 1, 100, v])]);
    const r = parsearListaArcor(wb);
    const tiene = r.errores.some((e) => e.codigo === ERROR_PARSER.PRECIO_INVALIDO) ||
      r.errores.some((e) => e.codigo === ERROR_PARSER.FILA_PARCIAL);
    assert.equal(tiene, true, `precio ${String(v)}`);
    assert.equal(r.productos.length, 0);
  }
});

test("39. precio cero: se conserva el producto y se advierte", () => {
  const r = parsearListaArcor(libro([CABECERA, fila(["HELIMPFEB", "IMPULSIVO", "UN", 1, 0, 0])]));
  assert.equal(r.productos.length, 1);
  assert.equal(r.productos[0].precioConIva, 0);
  const adv = r.advertencias.find((a) => a.codigo === ADVERTENCIA_PARSER.PRECIO_CERO);
  assert.ok(adv, "falta la advertencia de precio cero");
  assert.equal(adv.codigoCrudo, "HELIMPFEB");
  assert.equal(r.errores.length, 0);
});

test("40. precio prácticamente cero: producto conservado, advertencia explícita", () => {
  const r = parsearListaArcor(libro([CABECERA, fila(["HELIMPFEB", "IMPULSIVO", "UN", 1, 0.0008, 0.001])]));
  assert.equal(r.productos.length, 1);
  assert.equal(r.productos[0].precioConIva, 0.001);
  const adv = r.advertencias.find((a) => a.codigo === ADVERTENCIA_PARSER.PRECIO_CASI_CERO);
  assert.ok(adv, "falta la advertencia de precio casi cero");
  assert.match(adv.mensaje, /prácticamente cero/);
});

test("41. un precio normal no genera advertencia de precio", () => {
  const r = parsearListaArcor(libro([CABECERA, fila()]));
  const dePrecio = r.advertencias.filter((a) =>
    a.codigo === ADVERTENCIA_PARSER.PRECIO_CERO || a.codigo === ADVERTENCIA_PARSER.PRECIO_CASI_CERO
  );
  assert.equal(dePrecio.length, 0);
});

// ═══ FÓRMULAS ════════════════════════════════════════════════════════════════

test("42. fórmula en E CON valor cacheado: se lee el valor", () => {
  const hoja = XLSX.utils.aoa_to_sheet([CABECERA, fila()]);
  hoja.E2 = { t: "n", f: "F2/1.21", v: 1160.83 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Hoja1");
  const r = parsearListaArcor(wb);
  assert.equal(r.productos[0].precioSinIva, 1160.83);
  assert.equal(r.errores.length, 0);
});

test("43. fórmula en E SIN valor cacheado: no rompe, queda null y avisa", () => {
  const hoja = XLSX.utils.aoa_to_sheet([CABECERA, fila()]);
  hoja.E2 = { t: "n", f: "F2/1.21" }; // sin .v
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Hoja1");
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
  assert.equal(r.productos[0].precioSinIva, null);
  // El precio con IVA sigue siendo la fuente de verdad.
  assert.equal(r.productos[0].precioConIva, 1404.6);
  const adv = r.advertencias.find((a) => a.codigo === ADVERTENCIA_PARSER.PRECIO_SIN_IVA_AUSENTE);
  assert.ok(adv);
  assert.match(adv.mensaje, /fórmula sin valor guardado/);
});

test("44. no se recalcula la fórmula: E no se deriva de F", () => {
  const hoja = XLSX.utils.aoa_to_sheet([CABECERA, fila()]);
  hoja.E2 = { t: "n", f: "F2/1.21" };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Hoja1");
  const p = parsearListaArcor(wb).productos[0];
  assert.equal(p.precioSinIva, null);
  assert.notEqual(p.precioSinIva, 1404.6 / 1.21);
});

// ═══ COLUMNAS EXTRA ══════════════════════════════════════════════════════════

test("45. columnas G y H con contenido inesperado: no rompen, advierten", () => {
  const wb = libro([CABECERA, [...fila(), "basura G", 999]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
  const cols = r.advertencias
    .filter((a) => a.codigo === ADVERTENCIA_PARSER.COLUMNA_INESPERADA)
    .map((a) => a.detalle.columna);
  assert.deepEqual(cols, ["G", "H"]);
});

test("46. G y H vacías no generan ninguna advertencia", () => {
  const wb = libro([[...CABECERA, "", ""], [...fila(), null, null]]);
  const r = parsearListaArcor(wb);
  assert.equal(
    r.advertencias.filter((a) => a.codigo === ADVERTENCIA_PARSER.COLUMNA_INESPERADA).length,
    0
  );
});

test("47. una columna DESCONOCIDA se avisa y no invalida el archivo", () => {
  const wb = libro([[...CABECERA, "Rentabilidad"], [...fila(), "0,32"]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
  const extra = r.advertencias.find((a) => a.codigo === ADVERTENCIA_PARSER.ENCABEZADO_EXTRA);
  assert.ok(extra);
  assert.match(extra.mensaje, /Rentabilidad/);
});

test("47b. Cod de barra ya NO es una columna desconocida: es opcional conocida", () => {
  const wb = libro([[...CABECERA, "Cod de barra "], [...fila(), 7793360103018]]);
  const r = parsearListaArcor(wb);
  assert.equal(r.errores.length, 0);
  assert.equal(
    r.advertencias.filter((a) => a.codigo === ADVERTENCIA_PARSER.ENCABEZADO_EXTRA).length,
    0
  );
  assert.equal(r.productos[0].codigoBarraProveedor, "7793360103018");
  // Con las dos opcionales presentes, el formato no es ni A ni B puro.
  assert.equal(r.resumen.formato, "MIXTO");
});

// ═══ SALIDA ══════════════════════════════════════════════════════════════════

test("48. la salida separa productos, categorías, advertencias, errores y resumen", () => {
  const r = parsearListaArcor(libro([CABECERA, [CATEGORIA], fila()]));
  assert.deepEqual(Object.keys(r).sort(), ["advertencias", "categorias", "errores", "productos", "resumen"]);
});

test("49. cada producto trae los once campos pedidos", () => {
  const r = parsearListaArcor(libro([CABECERA, [CATEGORIA], fila()]));
  const p = r.productos[0];
  for (const campo of [
    "filaExcel", "hojaNombre", "codigoCrudo", "codigoNormalizado", "codigoComparableSinCeros",
    "descripcionProveedor", "unidadProveedor", "unidadesPorBulto", "precioSinIva",
    "precioConIva", "codigoBarraProveedor", "categoriaCruda",
  ]) {
    assert.ok(campo in p, `falta ${campo}`);
  }
  assert.equal(p.filaExcel, 3);
  assert.equal(p.hojaNombre, "Hoja1");
});

test("50. el resumen cuenta por unidad, por tipo de código y las descartadas", () => {
  const wb = libro([
    CABECERA,
    [CATEGORIA],
    fila([1, "A", "UN"]),
    fila([2, "B", "DI"]),
    fila(["AG10747", "C", "BU"]),
    fila([9, "D", "KG"]), // descartada: unidad desconocida
  ]);
  const r = parsearListaArcor(wb);
  assert.equal(r.resumen.productos, 3);
  assert.equal(r.resumen.categorias, 1);
  assert.deepEqual(r.resumen.porUnidad, { UN: 1, DI: 1, BU: 1 });
  assert.deepEqual(r.resumen.codigos, { numericos: 2, alfanumericos: 1 });
  assert.equal(r.resumen.filasDescartadas, 1);
  assert.equal(r.resumen.porTipoDeError.UNIDAD_DESCONOCIDA, 1);
});

test("51. el parser no toca el workbook que recibe", () => {
  const wb = libro([CABECERA, fila()]);
  const antes = JSON.stringify(wb);
  parsearListaArcor(wb);
  assert.equal(JSON.stringify(wb), antes);
});

test("52. un archivo con errores igual devuelve los productos buenos", () => {
  const wb = libro([CABECERA, fila([1, "A", "UN"]), fila([2, "B", "XX"]), fila([3, "C", "DI"])]);
  const r = parsearListaArcor(wb);
  assert.equal(r.productos.length, 2);
  assert.equal(r.errores.length, 1);
});

// ═══ FIXTURE REAL ════════════════════════════════════════════════════════════
//
// Los conteos que informó el relevamiento del archivo de agosto 2026.

const RUTA_FIXTURE = process.env.ARCOR_FIXTURE ?? "";
const HAY_FIXTURE = RUTA_FIXTURE !== "" && fs.existsSync(RUTA_FIXTURE);
const saltar = HAY_FIXTURE
  ? false
  : "sin ARCOR_FIXTURE: el Excel real no está en el repositorio (ver cabecera)";

// Segundo fixture real: la exportación con códigos de barras (formato B). Se
// pasa por ARCOR_FIXTURE_B y también vive fuera del repositorio.
const RUTA_FIXTURE_B = process.env.ARCOR_FIXTURE_B ?? "";
const HAY_FIXTURE_B = RUTA_FIXTURE_B !== "" && fs.existsSync(RUTA_FIXTURE_B);
const saltarB = HAY_FIXTURE_B
  ? false
  : "sin ARCOR_FIXTURE_B: la exportación con códigos de barras no está en el repositorio";

const ESPERADO = {
  productos: 917,
  categorias: 77,
  porUnidad: { UN: 651, DI: 230, BU: 36 },
  codigos: { numericos: 887, alfanumericos: 30 },
  filas: 995,
};

let real = null;
function parsearReal() {
  if (real) return real;
  const wb = XLSX.readFile(RUTA_FIXTURE, { cellFormula: true });
  real = { wb, salida: parsearListaArcor(wb) };
  return real;
}

test("53. fixture real: detecta la hoja correcta", { skip: saltar }, () => {
  const { wb, salida } = parsearReal();
  assert.equal(salida.errores.filter((e) => e.filaExcel === undefined).length, 0);
  assert.ok(wb.SheetNames.includes(salida.resumen.hojaNombre));
});

test("54. fixture real: 917 productos", { skip: saltar }, () => {
  assert.equal(parsearReal().salida.resumen.productos, ESPERADO.productos);
});

test("55. fixture real: 77 categorías", { skip: saltar }, () => {
  assert.equal(parsearReal().salida.resumen.categorias, ESPERADO.categorias);
});

test("56. fixture real: 651 UN, 230 DI, 36 BU", { skip: saltar }, () => {
  assert.deepEqual(parsearReal().salida.resumen.porUnidad, ESPERADO.porUnidad);
});

test("57. fixture real: 887 códigos numéricos y 30 alfanuméricos", { skip: saltar }, () => {
  assert.deepEqual(parsearReal().salida.resumen.codigos, ESPERADO.codigos);
});

test("58. fixture real: sin códigos duplicados", { skip: saltar }, () => {
  const dups = parsearReal().salida.errores.filter((e) => e.codigo === ERROR_PARSER.CODIGO_DUPLICADO);
  assert.deepEqual(dups, []);
});

test("59. fixture real: conserva AG10747", { skip: saltar }, () => {
  const p = parsearReal().salida.productos.find((x) => x.codigoNormalizado === "AG10747");
  assert.ok(p, "no se encontró AG10747");
  assert.equal(p.codigoCrudo, "AG10747");
  assert.ok(p.descripcionProveedor.length > 0);
});

test("60. fixture real: conserva y normaliza HELIMPFEB, con precio casi cero", { skip: saltar }, () => {
  const { salida } = parsearReal();
  const p = salida.productos.find((x) => x.codigoNormalizado === "HELIMPFEB");
  assert.ok(p, "no se encontró HELIMPFEB");
  assert.equal(p.codigoCrudo, "HELIMPFEB");
  const adv = salida.advertencias.find(
    (a) =>
      a.codigoCrudo === "HELIMPFEB" &&
      (a.codigo === ADVERTENCIA_PARSER.PRECIO_CERO || a.codigo === ADVERTENCIA_PARSER.PRECIO_CASI_CERO)
  );
  assert.ok(adv, "falta la advertencia de precio prácticamente cero de HELIMPFEB");
});

test("61. fixture real: el precio sale de F y UxBU se conserva", { skip: saltar }, () => {
  const { wb, salida } = parsearReal();
  const hoja = wb.Sheets[salida.resumen.hojaNombre];
  const { columnas } = mapearColumnas(hoja);
  const p = salida.productos[0];
  const celdaF = hoja[XLSX.utils.encode_cell({ r: p.filaExcel - 1, c: columnas.precioConIva })];
  assert.equal(p.precioConIva, celdaF.v);
  const celdaD = hoja[XLSX.utils.encode_cell({ r: p.filaExcel - 1, c: columnas.unidadesPorBulto })];
  assert.equal(p.unidadesPorBulto, Number(celdaD.v));
});

test("62. fixture real: cada producto hereda la categoría anterior", { skip: saltar }, () => {
  const { salida } = parsearReal();
  const primeraCat = salida.categorias[0];
  const primerProdDespues = salida.productos.find((p) => p.filaExcel > primeraCat.filaExcel);
  assert.equal(primerProdDespues.categoriaCruda, primeraCat.textoCrudo);
  // Y ninguno posterior a la primera categoría queda sin categoría.
  const huerfanos = salida.productos.filter((p) => p.filaExcel > primeraCat.filaExcel && !p.categoriaCruda);
  assert.deepEqual(huerfanos, []);
});

test("63. fixture real: no quedan filas sin clasificar", { skip: saltar }, () => {
  const { salida } = parsearReal();
  const parciales = salida.errores.filter((e) => e.codigo === ERROR_PARSER.FILA_PARCIAL);
  assert.deepEqual(parciales.map((p) => p.filaExcel), []);
});

test("64. fixture real: productos + categorías + vacías cubren las 995 filas", { skip: saltar }, () => {
  const { salida } = parsearReal();
  const total =
    salida.resumen.productos + salida.resumen.categorias +
    salida.resumen.filasVacias + salida.resumen.filasDescartadas;
  assert.equal(total + 1, ESPERADO.filas); // +1 por la fila de encabezado
});

test("65. fixture real: es formato A y trae Precio S/IVA", { skip: saltar }, () => {
  const { salida } = parsearReal();
  assert.equal(salida.resumen.formato, "A");
  assert.deepEqual(salida.resumen.columnasOpcionalesAusentes, ["codigoBarra"]);
});

// ═══ FIXTURE REAL B: exportación con códigos de barras ═══════════════════════
//
// Conteos observados sobre el archivo real. Este formato NO tiene "Precio
// S/IVA" y sí "Cod de barra": antes de esta corrección, el parser lo rechazaba.

const ESPERADO_B = {
  productos: 927,
  categorias: 74,
  porUnidad: { UN: 618, DI: 274, BU: 35 },
  codigos: { numericos: 897, alfanumericos: 30 },
};

let realB = null;
function parsearRealB() {
  if (realB) return realB;
  const wb = XLSX.readFile(RUTA_FIXTURE_B, { cellFormula: true });
  realB = { wb, salida: parsearListaArcor(wb) };
  return realB;
}

test("66. fixture B: se acepta pese a no tener Precio S/IVA", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  assert.deepEqual(salida.errores, []);
  assert.equal(salida.resumen.formato, "B");
  assert.deepEqual(salida.resumen.columnasOpcionalesAusentes, ["precioSinIva"]);
});

test("66b. fixture B: 927 productos y 74 categorías", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  assert.equal(salida.resumen.productos, ESPERADO_B.productos);
  assert.equal(salida.resumen.categorias, ESPERADO_B.categorias);
});

test("66c. fixture B: unidades y tipos de código", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  assert.deepEqual(salida.resumen.porUnidad, ESPERADO_B.porUnidad);
  assert.deepEqual(salida.resumen.codigos, ESPERADO_B.codigos);
});

test("66d. fixture B: reconoce Precio C/IVA por nombre, no por posición", { skip: saltarB }, () => {
  const { wb, salida } = parsearRealB();
  const { columnas } = mapearColumnas(wb.Sheets[salida.resumen.hojaNombre]);
  // En este archivo el precio está en la columna E, no en la F.
  assert.equal(columnas.precioConIva, 4);
  assert.equal(columnas.codigoBarra, 5);
});

test("66e. fixture B: ningún código de barras se leyó como precio", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  // Un EAN vale ~7,79e12. Ningún precio de lista se acerca a eso.
  const absurdos = salida.productos.filter((p) => p.precioConIva > 1e9);
  assert.deepEqual(absurdos, []);
});

test("66f. fixture B: los códigos de barras son texto, sin notación científica", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  const conBarra = salida.productos.filter((p) => p.codigoBarraProveedor);
  assert.ok(conBarra.length > 800, `solo ${conBarra.length} con código de barras`);
  for (const p of conBarra) {
    assert.equal(typeof p.codigoBarraProveedor, "string");
    assert.ok(!/e\+/i.test(p.codigoBarraProveedor), `${p.codigoCrudo}: ${p.codigoBarraProveedor}`);
  }
});

test("66g. fixture B: conserva los 30 códigos internos alfanuméricos", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  const alfa = salida.productos.filter((p) => !/^[0-9]+$/.test(p.codigoNormalizado));
  assert.equal(alfa.length, 30);
  assert.ok(alfa.some((p) => p.codigoNormalizado === "AG10747"));
});

test("66h. fixture B: sin filas parciales ni duplicados", { skip: saltarB }, () => {
  const { salida } = parsearRealB();
  assert.equal(salida.resumen.filasDescartadas, 0);
  assert.deepEqual(
    salida.errores.filter((e) => e.codigo === ERROR_PARSER.CODIGO_DUPLICADO),
    []
  );
});
