// LA TERMINACIÓN VALE PARA LOS CÓDIGOS INTERNOS; UN CÓDIGO DE BARRAS COINCIDE
// ENTERO O ES OTRO PRODUCTO. EN LA RECEPCIÓN Y EN LISTAS, CON LA MISMA FUNCIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/terminacionSoloCodigosInternos.test.mjs
//
// ── EL CASO Y LA REGLA (Emanuel, 2026-11-07) ──────────────────────────────
//
// SCHNEIDER 710 cc x 24, código 2737378282828, quedó vinculado solo a 361 LATA
// X24, código 2837737282828: compartían "282828". La terminación existe por
// Arcor y está bien para los CÓDIGOS INTERNOS del proveedor, cortos, a los que
// el ERP les agrega un prefijo que el papel no imprime (1999 ↔ 1001999). Un
// código de barras (EAN/UPC, 12 a 14 dígitos) no: coincide entero o es otro.
//
// La comparación es UNA, `macheePorSufijo`, y la usan las dos: Listas por
// `vincularFilaConCatalogo` y la recepción por `buscarCandidatos`. Los
// vínculos de Arcor son los del candado de 2026-09-22
// (`vinculoPorTerminacion.test.mjs`) más la misma forma con prefijo "100".
//
// Medido, código por código, contra el código de antes de 098b7087 con 172
// códigos del papel y 17 vínculos (Arcor con "10" y "100", internos de 5 a 8
// dígitos, ceros a la izquierda y dos códigos de barras): 282 respuestas
// iguales y 62 distintas, y las 62 son contra los dos códigos de barras. Los
// fixtures de `erpazul-fixtures-dev` no están en esta máquina y no corrieron.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esCodigoDeBarras,
  indexarCodigosBarra,
  indexarCodigosProveedor,
  MOTIVO_CONCILIACION,
  vincularFilaConCatalogo,
} from "./conciliarLista.js";
import { buscarCandidatos, ORIGEN_VINCULO } from "@/lib/compras-proveedor/comprobante/vinculo";

const vinculo = (id, codigoInterno, productoBaseId, nombre) => ({ id, codigoInterno, productoBaseId, nombre, activo: true, descripcionProveedor: null });
const VINCULOS = [
  // Arcor, con el prefijo "10" que guarda su lista.
  vinculo(1, "1001999", 424, "Mogul Ositos"),
  vinculo(2, "1002001", 608, "Mogul Tiburón"),
  vinculo(3, "1011835", 900, "Cristal Fresh"),
  // La misma forma con prefijo "100".
  vinculo(4, "10012345", 901, "Bon o Bon"),
  vinculo(5, "1004567", 902, "Rocklets"),
  // Ceros a la izquierda.
  vinculo(6, "00123456", 903, "Cofler"),
  // El código de barras de 361 LATA X24.
  vinculo(7, "2837737282828", 361, "361 LATA X24"),
];
const PRODUCTOS = new Map(VINCULOS.map((v) => [v.productoBaseId, { productoBaseId: v.productoBaseId, nombre: v.nombre }]));

const enLista = (codigo, descripcion = "") =>
  vincularFilaConCatalogo({
    fila: { codigoCrudo: codigo, descripcionProveedor: descripcion },
    indice: indexarCodigosProveedor(VINCULOS),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: PRODUCTOS,
  });
const enRecepcion = (codigo, descripcion = "SIN NOMBRE CONOCIDO") =>
  buscarCandidatos({ linea: { codigoProveedor: codigo, descripcion }, vinculos: VINCULOS, permitirCodigoAproximado: true });

test("QUÉ ES UN CÓDIGO DE BARRAS: solo dígitos, de 12 a 14", () => {
  assert.equal(esCodigoDeBarras("2737378282828"), true);
  assert.equal(esCodigoDeBarras("7790895000997"), true);
  assert.equal(esCodigoDeBarras("123456789012"), true);
  assert.equal(esCodigoDeBarras("12345678901234"), true);
  assert.equal(esCodigoDeBarras("1001999"), false);
  assert.equal(esCodigoDeBarras("12345678901"), false, "11 dígitos es interno");
  assert.equal(esCodigoDeBarras("ABC123456789"), false);
});

test("SCHNEIDER 2737378282828 CONTRA 361 2837737282828: NO VINCULA SOLO EN LISTAS, LO SUGIERE", () => {
  const r = enLista("2737378282828", "SCHNEIDER 710 cc x 24");
  assert.equal(r.producto, null, "se vinculó por la terminación de un código de barras");
  assert.equal(r.sugerencia?.producto?.productoBaseId, 361);
  assert.equal(r.sugerencia?.motivo, MOTIVO_CONCILIACION.SUGERENCIA_TERMINACION_CODIGO);
  assert.equal(r.sugerencia?.confirmada, false);
});

test("SCHNEIDER CONTRA 361: TAMPOCO EN LA RECEPCIÓN, DONDE QUEDA PRIMERO ENTRE LO QUE SE OFRECE", () => {
  const r = enRecepcion("2737378282828", "SCHNEIDER 710 cc x 24");
  assert.equal(r.vinculoAutomatico, null);
  assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
  assert.equal(r.candidatos[0]?.productoBaseId, 361);
});

test("UN CÓDIGO CORTO DEL PAPEL CONTRA UN CÓDIGO DE BARRAS GUARDADO TAMPOCO VINCULA POR LA TERMINACIÓN", () => {
  assert.equal(enLista("282828").producto, null);
  assert.equal(enRecepcion("282828").vinculoAutomatico, null);
});

test("CON EL CÓDIGO DE BARRAS EXACTO, SÍ: EN LAS DOS", () => {
  assert.equal(enLista("2837737282828").producto?.productoBaseId, 361);
  assert.equal(enRecepcion("2837737282828").vinculoAutomatico?.productoBaseId, 361);
});

test("ARCOR: 1999 CONTRA 1001999 VINCULA, EN LA RECEPCIÓN Y EN LISTAS", () => {
  assert.equal(enLista("1999").producto?.productoBaseId, 424);
  assert.equal(enLista("1999").tipoCoincidencia, "SUFIJO_4");
  assert.equal(enRecepcion("1999").vinculoAutomatico?.productoBaseId, 424);
  assert.equal(enRecepcion("1999").origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
});

test("ARCOR CON PREFIJO 100: SUFIJOS DE 5 Y DE 4 SIGUEN VINCULANDO, EN LAS DOS", () => {
  assert.equal(enLista("12345").producto?.productoBaseId, 901, "10012345 por los últimos 5");
  assert.equal(enRecepcion("12345").vinculoAutomatico?.productoBaseId, 901);
  assert.equal(enLista("4567").producto?.productoBaseId, 902, "1004567 por los últimos 4");
  assert.equal(enRecepcion("4567").vinculoAutomatico?.productoBaseId, 902);
});

test("EL MISMO CÓDIGO SIN CEROS, Y UN INTERNO QUE SOLO COMPARTE LA TERMINACIÓN, VINCULAN COMO ANTES", () => {
  assert.equal(enLista("123456").producto?.productoBaseId, 903, "00123456 sin ceros");
  assert.equal(enRecepcion("123456").vinculoAutomatico?.productoBaseId, 903);
  // 098b7087 lo había dejado como sugerencia en la recepción; con códigos
  // internos vuelve a ser como era: 991835 termina como 1011835.
  assert.equal(enLista("991835").producto?.productoBaseId, 900);
  assert.equal(enRecepcion("991835").vinculoAutomatico?.productoBaseId, 900);
});
