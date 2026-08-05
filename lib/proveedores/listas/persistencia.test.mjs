// De la conciliación a la base: mapeo, contadores y límites del upload.
//
// Sin base de datos: acá se prueban los errores que la base no puede atrapar
// —un estado mal mapeado, un contador que no suma, un decimal que se pierde, una
// sugerencia guardada como si fuera un vínculo—.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIMITES,
  ESTADO_IMPORTACION,
  MODO_PRECIO_VENTA,
  ERROR_UPLOAD,
  filaAPersistir,
  filasAPersistir,
  contadoresDeCabecera,
  contadoresCierran,
  enLotes,
  validarArchivo,
  paginacion,
} from "./persistencia.js";
import { conciliarLista, TIPO_COINCIDENCIA } from "./conciliarLista.js";
import { CONFIG_ARCOR } from "./configuraciones/arcor.js";
import { ESTADO_LINEA, PRIORIDAD_ESTADO } from "./estados.js";
import { parserRegistrado, resolverParserDeProveedor, listarParsers, PARSER_LISTA } from "./registro.js";

const DEPOSITO = 1;
const CTX = { grupoId: 7, proveedorId: 3, operandoEnLocalId: DEPOSITO, depositoLocalId: DEPOSITO };

const prod = (o = {}) => ({
  productoBaseId: 100, nombre: "Producto", precioCostoActual: 1000,
  factorPack: null, unidadMedida: "unidad", modoCompraProveedor: "BULTO",
  creadoEnLocalId: DEPOSITO, esCombo: false, codigosBarra: [], ...o,
});

const linea = (o = {}) => ({
  filaExcel: 10, hojaNombre: "Hoja1",
  codigoCrudo: "10301", codigoNormalizado: "10301", codigoComparableSinCeros: null,
  codigoBarraProveedor: null, descripcionProveedor: "KETCHUP", categoriaCruda: "ADEREZOS",
  unidadProveedor: "UN", unidadesPorBulto: 1, precioConIva: 1000, precioSinIva: 826.45, ...o,
});

const vinculo = (o = {}) => ({ id: 55, productoBaseId: 100, codigoInterno: "10301", activo: true, ...o });

const conciliar = (filas, productos = [prod()], codigos = [vinculo()]) =>
  conciliarLista({ filas, productos, codigosProveedor: codigos, contexto: CTX, config: CONFIG_ARCOR });

// ═══ MAPEO DE FILAS ══════════════════════════════════════════════════════════

test("1. una fila conciliada se mapea con todos sus campos", () => {
  const c = conciliar([linea()]);
  const f = filaAPersistir(c.filas[0]);

  assert.equal(f.filaExcel, 10);
  assert.equal(f.hojaNombre, "Hoja1");
  assert.equal(f.codigoCrudo, "10301");
  assert.equal(f.codigoNormalizado, "10301");
  assert.equal(f.descripcionProveedor, "KETCHUP");
  assert.equal(f.categoriaCruda, "ADEREZOS");
  assert.equal(f.unidadProveedor, "UN");
  assert.equal(f.unidadesPorBulto, 1);
  assert.equal(f.productoBaseId, 100);
  assert.equal(f.tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(f.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  assert.equal(f.seleccionable, true);
  assert.equal(f.seleccionada, true);
});

test("2. nace sin aplicar", () => {
  const f = filaAPersistir(conciliar([linea()]).filas[0]);
  assert.equal(f.aplicada, false);
  assert.equal(f.costoAplicado, null);
});

test("3. los decimales se conservan, no se truncan", () => {
  // El archivo real trae precios como 1404.602001.
  const c = conciliar([linea({ precioConIva: 1404.602001, precioSinIva: 1160.828100 })]);
  const f = filaAPersistir(c.filas[0]);
  assert.equal(f.precioConIva, 1404.602001);
  assert.equal(f.precioSinIva, 1160.8281);
  assert.equal(f.precioConRecargo, 1474.83); // 1404,602001 × 1,05 → dos decimales
});

test("4. los importes no finitos se cortan a null en vez de romper el INSERT", () => {
  const f = filaAPersistir({
    fila: linea(), estado: ESTADO_LINEA.ERROR, recargoPct: 5,
    costoAnterior: NaN, diferencia: Infinity, costoMaestroPropuesto: undefined,
  });
  assert.equal(f.costoAnterior, null);
  assert.equal(f.diferencia, null);
  assert.equal(f.costoMaestroPropuesto, null);
});

test("5. la sugerencia se guarda como DATO, no como vínculo", () => {
  const productos = [prod({ productoBaseId: 500, codigosBarra: ["7793360103018"] })];
  const c = conciliar(
    [linea({ codigoNormalizado: "SINVINCULO", codigoBarraProveedor: "7793360103018" })],
    productos, []
  );
  const f = filaAPersistir(c.filas[0]);
  assert.equal(f.productoBaseId, null, "la sugerencia NO puede escribirse como macheo");
  assert.equal(f.sugerenciaProductoBaseId, 500);
  assert.equal(f.sugerenciaCodigoBarra, "7793360103018");
  assert.equal(f.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(f.seleccionable, false);
});

test("6. los estados y motivos se persisten tal cual", () => {
  const c = conciliar([linea()], [prod({ unidadMedida: "kg" })]);
  const f = filaAPersistir(c.filas[0]);
  assert.equal(f.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(f.motivo, "UNIDAD_INCOMPATIBLE_CON_LISTA");
});

test("7. un tipo de coincidencia desconocido cae a NINGUNA", () => {
  const f = filaAPersistir({ fila: linea(), estado: ESTADO_LINEA.ERROR, tipoCoincidencia: "INVENTADO" });
  assert.equal(f.tipoCoincidencia, TIPO_COINCIDENCIA.NINGUNA);
});

test("8. se mapean TODAS las filas, no solo las aplicables", () => {
  const productos = [
    prod({ productoBaseId: 1, precioCostoActual: 500 }),
    prod({ productoBaseId: 2, unidadMedida: "kg" }),
  ];
  const codigos = [
    vinculo({ productoBaseId: 1, codigoInterno: "A1" }),
    vinculo({ productoBaseId: 2, codigoInterno: "A2" }),
  ];
  const filas = [
    linea({ filaExcel: 2, codigoCrudo: "A1", codigoNormalizado: "A1" }),
    linea({ filaExcel: 3, codigoCrudo: "A2", codigoNormalizado: "A2" }),
    linea({ filaExcel: 4, codigoCrudo: "A9", codigoNormalizado: "A9" }),
    linea({ filaExcel: 5, precioConIva: -1 }),
  ];
  const persistidas = filasAPersistir(conciliar(filas, productos, codigos));
  assert.equal(persistidas.length, 4);
  assert.deepEqual(persistidas.map((f) => f.estado).sort(), [
    "BLOQUEADO", "ERROR", "LISTO_PARA_ACTUALIZAR", "NO_MACHEADO",
  ]);
});

// ═══ CONTADORES ══════════════════════════════════════════════════════════════

test("9. los contadores de la cabecera cuentan cada estado en su columna", () => {
  const productos = [
    prod({ productoBaseId: 1, precioCostoActual: 500 }),
    prod({ productoBaseId: 2, precioCostoActual: 1050 }),
    prod({ productoBaseId: 3, unidadMedida: "kg" }),
  ];
  const codigos = [1, 2, 3].map((i) => vinculo({ productoBaseId: i, codigoInterno: `A${i}` }));
  const filas = [
    linea({ filaExcel: 2, codigoCrudo: "A1", codigoNormalizado: "A1" }),
    linea({ filaExcel: 3, codigoCrudo: "A2", codigoNormalizado: "A2" }),
    linea({ filaExcel: 4, codigoCrudo: "A3", codigoNormalizado: "A3" }),
    linea({ filaExcel: 5, codigoCrudo: "A9", codigoNormalizado: "A9" }),
  ];
  const c = conciliar(filas, productos, codigos);
  const k = contadoresDeCabecera(c);

  assert.equal(k.totalFilas, 4);
  assert.equal(k.listoParaActualizar, 1);
  assert.equal(k.sinCambios, 1);
  assert.equal(k.bloqueadas, 1);
  assert.equal(k.noMacheadas, 1);
  assert.equal(k.factorDudoso, 0);
  assert.equal(k.errores, 0);
});

test("10. la suma de los contadores es igual al total de filas", () => {
  const c = conciliar([
    linea({ filaExcel: 2 }),
    linea({ filaExcel: 3, unidadProveedor: "DI" }),
    linea({ filaExcel: 4, precioConIva: 0 }),
    linea({ filaExcel: 5, precioConIva: -1 }),
  ]);
  const k = contadoresDeCabecera(c);
  assert.equal(contadoresCierran(k), true);
  assert.equal(k.totalFilas, 4);
});

test("11. contadoresCierran detecta una cabecera inconsistente", () => {
  assert.equal(contadoresCierran({ totalFilas: 10, listoParaActualizar: 3 }), false);
});

test("12. el resumen cuenta sugerencias, variaciones altas y faltantes", () => {
  const productos = [
    prod({ productoBaseId: 1, precioCostoActual: 500 }),
    prod({ productoBaseId: 9, codigosBarra: ["779"] }),
  ];
  const codigos = [
    vinculo({ productoBaseId: 1, codigoInterno: "A1" }),
    vinculo({ productoBaseId: 2, codigoInterno: "AUSENTE" }),
  ];
  const c = conciliar(
    [linea({ codigoCrudo: "A1", codigoNormalizado: "A1" }),
     linea({ filaExcel: 3, codigoNormalizado: "ZZ", codigoBarraProveedor: "779" })],
    productos, codigos
  );
  const k = contadoresDeCabecera(c);
  assert.equal(k.sugerenciasCodigoBarras, 1);
  assert.equal(k.variacionAlta, 1);
  assert.equal(k.faltantes, 1);
});

test("13. todos los estados tienen columna en la cabecera", () => {
  const k = contadoresDeCabecera({ filas: [] });
  // Ocho columnas de estado + total + tres agregados.
  const columnas = Object.keys(k).filter((x) => !["totalFilas", "sugerenciasCodigoBarras", "variacionAlta", "faltantes"].includes(x));
  assert.equal(columnas.length, PRIORIDAD_ESTADO.length);
});

// ═══ LOTES ═══════════════════════════════════════════════════════════════════

test("14. las filas se reparten en lotes", () => {
  const filas = Array.from({ length: 917 }, (_, i) => ({ filaExcel: i }));
  const lotes = enLotes(filas, 500);
  assert.equal(lotes.length, 2);
  assert.equal(lotes[0].length, 500);
  assert.equal(lotes[1].length, 417);
  assert.equal(lotes.flat().length, 917);
});

test("15. una lista corta va en un solo lote, y una vacía en ninguno", () => {
  assert.equal(enLotes([1, 2, 3], 500).length, 1);
  assert.equal(enLotes([], 500).length, 0);
});

// ═══ VALIDACIÓN DEL ARCHIVO ══════════════════════════════════════════════════

test("16. un .xlsx normal pasa", () => {
  const r = validarArchivo({
    nombre: "lista.xlsx", tamano: 69742,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assert.equal(r.ok, true);
});

test("17. sin archivo", () => {
  assert.equal(validarArchivo({}).codigo, ERROR_UPLOAD.SIN_ARCHIVO);
});

test("18. archivo vacío", () => {
  assert.equal(validarArchivo({ nombre: "a.xlsx", tamano: 0 }).codigo, ERROR_UPLOAD.ARCHIVO_VACIO);
});

test("19. extensión inválida", () => {
  for (const n of ["lista.xls", "lista.csv", "lista.xlsm", "lista.exe", "lista"]) {
    assert.equal(validarArchivo({ nombre: n, tamano: 100 }).codigo, ERROR_UPLOAD.EXTENSION_INVALIDA, n);
  }
});

test("20. MIME dudoso se rechaza", () => {
  const r = validarArchivo({ nombre: "a.xlsx", tamano: 100, mime: "application/x-msdownload" });
  assert.equal(r.codigo, ERROR_UPLOAD.MIME_INVALIDO);
});

test("21. MIME vacío o genérico se acepta: el que decide es el parseo", () => {
  assert.equal(validarArchivo({ nombre: "a.xlsx", tamano: 100, mime: "" }).ok, true);
  assert.equal(validarArchivo({ nombre: "a.xlsx", tamano: 100, mime: "application/octet-stream" }).ok, true);
});

test("22. tamaño excedido", () => {
  const r = validarArchivo({ nombre: "a.xlsx", tamano: LIMITES.tamanoMaxBytes + 1 });
  assert.equal(r.codigo, ERROR_UPLOAD.DEMASIADO_GRANDE);
});

test("23. el límite de filas está declarado y cubre el archivo real", () => {
  assert.ok(LIMITES.filasMax >= 917);
  assert.equal(typeof LIMITES.tamanoMaxBytes, "number");
});

// ═══ PAGINACIÓN ══════════════════════════════════════════════════════════════

test("24. la paginación por defecto", () => {
  const p = paginacion({});
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, LIMITES.pageSizeDefault);
  assert.equal(p.skip, 0);
});

test("25. pageSize tiene techo: no se piden 917 filas de una", () => {
  const p = paginacion({ pageSize: 10000 });
  assert.equal(p.pageSize, LIMITES.pageSizeMax);
  assert.ok(LIMITES.pageSizeMax < 917);
});

test("26. valores inválidos caen a los defaults", () => {
  for (const v of [0, -5, "hola", null]) {
    assert.equal(paginacion({ page: v }).page, 1);
    assert.equal(paginacion({ pageSize: v }).pageSize, LIMITES.pageSizeDefault);
  }
});

test("27. el skip se calcula desde la página", () => {
  const p = paginacion({ page: 3, pageSize: 50 });
  assert.equal(p.skip, 100);
  assert.equal(p.take, 50);
});

// ═══ REGISTRO DE PARSERS ═════════════════════════════════════════════════════

test("28. el parser se resuelve por un identificador explícito", () => {
  const r = resolverParserDeProveedor({ parserListaId: PARSER_LISTA.ARCOR_XLSX });
  assert.equal(r.ok, true);
  assert.equal(typeof r.parser, "function");
  assert.equal(r.config.proveedor, "ARCOR");
  assert.ok(r.parserVersion);
});

test("29. un proveedor SIN el campo cargado no importa listas", () => {
  const r = resolverParserDeProveedor({ nombre: "Arcor S.A.", parserListaId: null });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "PROVEEDOR_SIN_PARSER");
});

test("30. el nombre del proveedor NO alcanza para elegir parser", () => {
  // Es el punto entero del registro: reconocerlo por el texto sería frágil.
  for (const nombre of ["Arcor", "ARCOR SAIC", "Distribuidora Arcor"]) {
    assert.equal(resolverParserDeProveedor({ nombre }).ok, false, nombre);
  }
});

test("31. un identificador desconocido se rechaza", () => {
  const r = resolverParserDeProveedor({ parserListaId: "LO_QUE_SEA" });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "PARSER_DESCONOCIDO");
  assert.equal(parserRegistrado("LO_QUE_SEA"), false);
});

test("32. el registro se puede listar para ofrecerlo en una pantalla", () => {
  const l = listarParsers();
  assert.equal(l.length, 1);
  assert.equal(l[0].id, PARSER_LISTA.ARCOR_XLSX);
  assert.deepEqual(l[0].extensiones, [".xlsx"]);
});

// ═══ CONSTANTES ══════════════════════════════════════════════════════════════

test("33. los estados de cabecera son los cuatro pedidos", () => {
  assert.deepEqual(Object.keys(ESTADO_IMPORTACION).sort(), [
    "APLICADA", "BORRADOR", "CONCILIADA", "DESCARTADA",
  ]);
});

test("34. el modo de precio de venta nace en NO_TOCAR", () => {
  assert.equal(MODO_PRECIO_VENTA.NO_TOCAR, "NO_TOCAR");
});
