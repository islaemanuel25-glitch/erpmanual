// LA LISTA DE PRECIOS VE LO QUE LA RECEPCIÓN YA VINCULÓ POR SU NOMBRE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/listaUsaLosVinculosPorNombre.test.mjs
//
// ── EL CASO (Mauro, 2026-11-05) ─────────────────────────────────────────────
//
// Un PDF de medicamentos sin columna de código. Los productos de Mauro ya
// estaban vinculados en sus remitos, pero en "Tus productos de Mauro" las 109
// tarjetas decían "En la lista: no está" y los 68 renglones quedaban "Sin
// producto en tu catálogo". La conciliación de listas buscaba solo por código y
// por código de barras; el vínculo que la recepción guarda por la descripción
// (`ProductoCodigoProveedor` con la clave `TXT:` de `claveDeAlias`) no lo miraba
// nadie.
//
// Regla de Emanuel: el motor de macheo proveedor-producto es UNO SOLO. Lo
// vinculado en una factura, boleta o remito vale para la lista, y al revés.
//
// ── DE DÓNDE SALEN LOS FIXTURES ────────────────────────────────────────────
//
// Los vínculos, de `filasDeIdentidad` —la función con la que los escribe la
// recepción (`recepcion/correccion`)— y con la forma que les da la carga
// (`cargarDatosDeConciliacion`). Los renglones, de `filasDelArchivo` +
// `aplicarEleccion`, que es como los produce el importador genérico. Nada se
// escribe a mano con la forma que "debería" tener.

import { test } from "node:test";
import assert from "node:assert/strict";

import { filasDeIdentidad, METODO_DETECCION } from "@/lib/proveedores/identidad/servicioIdentidad";
import { filasDelArchivo, aplicarEleccion } from "./importacionGenerica.js";
import { conciliarLista, TIPO_COINCIDENCIA } from "./conciliarLista.js";
import { resolverParserPorId } from "./registro.js";
import { motorParaEstaLista } from "./vincularConUnaFila.js";
import { ESTADO_LINEA } from "./estados.js";

const GRUPO = 1;
const MAURO = 7;

/** Un producto del universo de Mauro, con la forma que entrega la carga. */
const producto = (id, nombre, costo) => ({
  productoBaseId: id,
  nombre,
  precioCostoActual: costo,
  factorPack: null,
  unidadMedida: "unidad",
  modoCompraProveedor: null,
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
  esCombo: false,
  codigosBarra: [],
  relacionProveedor: 1,
});

const AGUA = producto(101, "AGUA OXIGENADA 20 VOL", 1000);
const ALCOHOL = producto(102, "ALCOHOL SAN IGINIO 250", 1500);
/** De Mauro, vinculado en un remito, y que esta lista NO trae. */
const GASA = producto(103, "GASA ESTERIL 10X10", 800);

/** Lo que guardó la recepción al vincular a mano un renglón de un remito sin código. */
function vinculoDeLaRecepcion(productoBaseId, textoDelRemito, id) {
  const [fila] = filasDeIdentidad({
    grupoId: GRUPO,
    proveedorId: MAURO,
    productoBaseId,
    codigoProveedor: null,
    descripcionProveedor: textoDelRemito,
    metodoDeteccion: METODO_DETECCION.MANUAL,
    confirmadaPorUsuarioId: 5,
    confirmadaEn: new Date("2026-10-30T12:00:00Z"),
  });
  // La forma que `cargarDatosDeConciliacion` le da a `codigosProveedor`.
  return {
    id,
    productoBaseId: fila.productoBaseId,
    codigoInterno: fila.codigoInterno,
    descripcionProveedor: fila.descripcionProveedor,
    activo: fila.activo,
    unidadesPorPresentacion: fila.unidadesPorPresentacion,
  };
}

const VINCULOS = [
  vinculoDeLaRecepcion(AGUA.productoBaseId, "AGUA OXIGENADA 20V", 1),
  vinculoDeLaRecepcion(ALCOHOL.productoBaseId, "ALCOHOL SAN IGINIO 250", 2),
  vinculoDeLaRecepcion(GASA.productoBaseId, "GASA ESTERIL 10 X 10", 3),
];

const CABECERA = Object.freeze({
  id: 30,
  estado: "CONCILIADA",
  proveedorId: MAURO,
  parser: "GENERICO",
  recargoPct: 0,
  impuestoAdicionalPct: 0,
  modo: null,
  aumentoEsperadoMinPct: 0,
  aumentoEsperadoMaxPct: 15,
});

function conciliar(filas) {
  const reg = resolverParserPorId(CABECERA.parser);
  assert.ok(reg.ok);
  const { config, contexto } = motorParaEstaLista({
    cab: CABECERA,
    reg,
    grupoId: GRUPO,
    operandoEnLocalId: 1,
    depositoLocalId: null,
  });
  return conciliarLista({ filas, productos: [AGUA, ALCOHOL, GASA], codigosProveedor: VINCULOS, contexto, config });
}

/** Los renglones del PDF, por el camino del importador genérico. */
function renglones({ titulos, valores, mapeo }) {
  const { filas } = filasDelArchivo({ tabla: { titulos, filas: valores.map((v, i) => ({ pagina: 1, y: i, valores: v })) }, mapeo });
  return aplicarEleccion({ filas, eleccion: { columna: mapeo.precios[0], conDescuento: false } });
}

test("lista sin código propio: la columna del NOMBRE quedó como código, y los vinculados por nombre se encuentran", () => {
  // Es lo que pasa con una lista sin columna de código: para seguir hay que
  // elegir una, y se elige la del nombre. La descripción queda vacía.
  const filas = renglones({
    titulos: ["PRODUCTO", "PRECIO ($)"],
    valores: [
      ["AGUA OXIGENADA 20V", "1.050,00"],
      ["ALCOHOL SAN IGINIO 250", "1.600,00"],
      ["IBUPROFENO 400 X 10", "2.000,00"],
    ],
    mapeo: { codigo: 0, codigoBarra: null, descripcion: null, cantidad: null, descuento: null, precios: [1] },
  });
  assert.equal(filas.length, 3, "los tres son productos para el importador");
  const r = conciliar(filas);

  assert.equal(r.filas[0].producto?.productoBaseId, AGUA.productoBaseId);
  assert.equal(r.filas[0].tipoCoincidencia, TIPO_COINCIDENCIA.ALIAS_CONFIRMADO);
  assert.equal(r.filas[1].producto?.productoBaseId, ALCOHOL.productoBaseId);
  assert.equal(r.filas[1].tipoCoincidencia, TIPO_COINCIDENCIA.ALIAS_CONFIRMADO);
  // Lo que nadie vinculó sigue sin producto: no se adivina.
  assert.equal(r.filas[2].producto, null);
  assert.equal(r.filas[2].estado, ESTADO_LINEA.NO_MACHEADO);

  // El vínculo por nombre de lo que la lista trae NO es un faltante; el de lo
  // que no trae, sí.
  const faltantes = new Set(r.faltantes.map((f) => f.productoBaseId));
  assert.equal(faltantes.has(AGUA.productoBaseId), false);
  assert.equal(faltantes.has(ALCOHOL.productoBaseId), false);
  assert.equal(faltantes.has(GASA.productoBaseId), true);
});

test("con descripción y un código que no está vinculado: el código primero, y después el nombre ya vinculado", () => {
  const filas = renglones({
    titulos: ["COD", "DESCRIPCION", "PRECIO"],
    valores: [["A-77", "AGUA OXIGENADA 20V", "1.050,00"]],
    mapeo: { codigo: 0, codigoBarra: null, descripcion: 1, cantidad: null, descuento: null, precios: [2] },
  });
  const r = conciliar(filas);
  assert.equal(r.filas[0].producto?.productoBaseId, AGUA.productoBaseId);
  assert.equal(r.filas[0].tipoCoincidencia, TIPO_COINCIDENCIA.ALIAS_CONFIRMADO);
});

test("un nombre PARECIDO al vinculado no vincula: el alias es una igualdad, no un parecido", () => {
  const filas = renglones({
    titulos: ["PRODUCTO", "PRECIO"],
    valores: [["AGUA OXIGENADA 10V", "1.050,00"]],
    mapeo: { codigo: 0, codigoBarra: null, descripcion: null, cantidad: null, descuento: null, precios: [1] },
  });
  const r = conciliar(filas);
  assert.equal(r.filas[0].producto, null);
  assert.equal(r.filas[0].estado, ESTADO_LINEA.NO_MACHEADO);
});
