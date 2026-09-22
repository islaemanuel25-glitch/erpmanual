// LA RECEPCIÓN VINCULA POR LA TERMINACIÓN DEL CÓDIGO, CON LÍMITES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/vinculoPorTerminacion.test.mjs
//
// ── EL CASO, MEDIDO CONTRA PRODUCCIÓN EL 2026-09-22 ──────────────────────
//
// Arcor guarda sus códigos con un prefijo "10" que la factura NO imprime: la
// lista de precios dice `1001999` y el papel dice `1999`. Pasa en **232 de sus
// 359 códigos**.
//
// Sobre el pedido 245, veinte renglones, todos con código leído:
//   · macheo EXACTO ................ 5
//   · por TERMINACIÓN, sin ambigüedad 10
//   · sin ninguna fila en la tabla ... 5 (los de Halloween)
//
// La escalera ya existía —la usaba el importador de borradores— y estaba
// apagada en la recepción a propósito. Se enciende con los límites que Emanuel
// fijó, que son los que la escalera ya tenía: mismo proveedor, mínimo 4
// dígitos, y una sola coincidencia posible.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buscarCandidatos, ORIGEN_VINCULO, esAutomatico } from "@/lib/compras-proveedor/comprobante/vinculo";

/** Los vínculos de Arcor, con el prefijo "10" que su lista guarda. */
const DE_ARCOR = [
  { codigoInterno: "1001999", productoBaseId: 424, nombre: "Mogul Ositos", activo: true },
  { codigoInterno: "1002001", productoBaseId: 608, nombre: "Mogul Tiburón", activo: true },
  { codigoInterno: "1011835", productoBaseId: 900, nombre: "Cristal Fresh", activo: true },
];

const enRecepcion = (linea, vinculos = DE_ARCOR) =>
  buscarCandidatos({ linea, vinculos, permitirCodigoAproximado: true });

test("LA TERMINACIÓN ÚNICA VINCULA, Y SE DICE QUE FUE POR AHÍ", () => {
  // El caso real: el papel dice 1999 y la lista guarda 1001999.
  const r = enRecepcion({ codigoProveedor: "1999", descripcion: "MOGUL. OSITOS 12X30G" });
  assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
  assert.equal(r.candidatos.length, 1);
  assert.equal(r.candidatos[0].productoBaseId, 424);
  // Lo que decide si el renglón queda vinculado es `vinculoAutomatico`, no la
  // lista `ORIGENES_AUTOMATICOS`: la escalera lo marca explícitamente y solo
  // cuando hay UN candidato. La lista sigue teniendo el exacto y el alias, que
  // son los que vinculan solos sin necesidad de que nadie encienda nada.
  assert.ok(r.vinculoAutomatico, "no vinculó solo");
  assert.equal(r.vinculoAutomatico.productoBaseId, 424);
});

test("Y EL EXACTO SIGUE GANANDO, Y SE LLAMA DISTINTO", () => {
  // 11835 está exacto en la lista como 1011835, pero si el papel trae el código
  // completo entra por la puerta de adelante.
  const r = enRecepcion({ codigoProveedor: "1011835", descripcion: "CRISTAL FRESH 90u x405g" });
  assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR);
  assert.equal(r.candidatos[0].productoBaseId, 900);
});

test("LA TERMINACIÓN AMBIGUA NO VINCULA: PREGUNTA", () => {
  // Dos productos distintos que terminan igual. Elegir uno sería inventar.
  const dosIguales = [
    { codigoInterno: "1001999", productoBaseId: 424, nombre: "Mogul Ositos", activo: true },
    { codigoInterno: "2001999", productoBaseId: 777, nombre: "Otra cosa", activo: true },
  ];
  const r = enRecepcion({ codigoProveedor: "1999", descripcion: "MOGUL. OSITOS" }, dosIguales);
  assert.notEqual(r.origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
  assert.equal(r.vinculoAutomatico, null, "vinculó solo sobre una coincidencia ambigua");
  assert.match(String(r.problema ?? ""), /más de un producto|Elegí/);
});

test("MENOS DE CUATRO DÍGITOS NO ENTRA POR LA ESCALERA", () => {
  // Un código de tres dígitos es la terminación de demasiadas cosas. El límite
  // lo pone `macheePorSufijo` y esto lo afirma desde la recepción.
  const conCorto = [{ codigoInterno: "1000999", productoBaseId: 424, nombre: "Mogul", activo: true }];
  const r = enRecepcion({ codigoProveedor: "999", descripcion: "ALGO" }, conCorto);
  assert.notEqual(r.origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
  assert.equal(r.vinculoAutomatico, null, "vinculó solo con un código de tres dígitos");
});

test("Y NUNCA CRUZA DE PROVEEDOR: EL ÍNDICE ES DEL QUE FACTURA", () => {
  // `vinculos` son las filas de ESE proveedor y entran por parámetro. Con la
  // lista vacía —un proveedor sin nada cargado— no hay terminación que valga.
  const r = enRecepcion({ codigoProveedor: "1999", descripcion: "MOGUL. OSITOS" }, []);
  assert.equal(r.vinculoAutomatico, null);
  assert.notEqual(r.origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
});

test("SIN LA ESCALERA —COMO ESTABA— EL MISMO RENGLÓN NO VINCULA", () => {
  // CONTRAPRUEBA de que el cambio es el que hace la diferencia, y no otra cosa.
  const apagada = buscarCandidatos({
    linea: { codigoProveedor: "1999", descripcion: "MOGUL. OSITOS 12X30G" },
    vinculos: DE_ARCOR,
  });
  assert.notEqual(apagada.origen, ORIGEN_VINCULO.CODIGO_APROXIMADO);
  assert.equal(apagada.vinculoAutomatico, null);
  // Y el exacto y el alias siguen siendo los únicos que vinculan sin que nadie
  // encienda nada: esa lista no se tocó.
  assert.equal(esAutomatico(ORIGEN_VINCULO.CODIGO_PROVEEDOR), true);
  assert.equal(esAutomatico(ORIGEN_VINCULO.ALIAS_DESCRIPCION), true);
  assert.equal(esAutomatico(ORIGEN_VINCULO.CODIGO_APROXIMADO), false);
});
