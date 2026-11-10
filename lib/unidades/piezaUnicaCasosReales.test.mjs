// UNA SOLA FORMA DE ENTENDER LAS UNIDADES: LOS CASOS REALES, CONTRA LA PIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/piezaUnicaCasosReales.test.mjs
//
// Regla de Emanuel (2026-11-10): la FICHA DEL PRODUCTO manda —cómo se compra,
// cómo se maneja en el depósito, cómo se vende, con su factor y su peso—. Lo
// único que no se sabe de antemano es en qué unidad factura o cotiza cada
// proveedor, y eso se resuelve probando las lecturas contra el costo de hoy y
// quedándose con la de menor %. Todas las conversiones se piden a
// `lib/unidades/reglaDeUnidades.js`.
//
// Las fichas son las de los candados de cada caso, copiadas de la base: la
// Mortadela de `fiambrePorPieza.test.mjs`, el Cheddar de
// `cheddarBultoDelPapel.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  bultosYSueltas,
  comoViene,
  lecturaDeMenorDiferencia,
  precioDeLaPieza,
  toUnidades,
  unidadDelBulto,
} from "./reglaDeUnidades.js";
import { costoDelDepositoEnLaUnidadDelCatalogo, costoDelCatalogoEnLaUnidadDelDeposito } from "../conversiones/stock.js";

const MORTADELA = {
  id: 2099, nombre: "Mortadela Paladini", unidad_medida: "kg", modoCompraProveedor: "UNIDAD",
  modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 4.5, factor_pack: null, precio_costo: 8888.89,
};
const MANI = { id: 1881, nombre: "MANI CON CASCARA X2KG", unidad_medida: "kg", modoCompraProveedor: "UNIDAD", factor_pack: 2 };

test("CHEDDAR FETA TONADITA X8UNI (pedido 564): 54 unidades en bultos de 18 son 3, no 54", () => {
  assert.deepEqual(bultosYSueltas({ unidades: 54, factor: 18 }), { completos: 3, sueltas: 0 });
  // El 8 del nombre no es el bulto: manda el factor de la ficha.
  assert.deepEqual(bultosYSueltas({ unidades: 55, factor: 18 }), { completos: 3, sueltas: 1 });
  // Sin bulto, todo es completo.
  assert.deepEqual(bultosYSueltas({ unidades: 54, factor: 1 }), { completos: 54, sueltas: 0 });
  // Parte con piso: una nota de crédito sigue dando negativo y el cierre la frena.
  assert.deepEqual(bultosYSueltas({ unidades: -6, factor: 12 }), { completos: -1, sueltas: 6 });
});

test("MORTADELA PALADINI (pedido 530): la pieza de 4,5 kg vuelve al kilo antes de ser costo", () => {
  // $41.330,09 la pieza es $9.184,46 el kilo, no $41.330,09 el kilo (×4,65).
  const kilo = costoDelDepositoEnLaUnidadDelCatalogo({ base: MORTADELA, costo: 41330.09 });
  assert.equal(Math.round(kilo * 100) / 100, 9184.46);
  // Y la ida: el kilo del catálogo, en la pieza del depósito.
  assert.equal(Math.round(costoDelCatalogoEnLaUnidadDelDeposito({ base: MORTADELA, costo: 8888.89 }) * 100) / 100, 40000);
  // El precio de una pieza para vender por pieza, desde el del kilo.
  assert.equal(precioDeLaPieza({ precioPorKilo: 9184.46, pesoKg: 4.5 }), 41330.07);
  assert.equal(precioDeLaPieza({ precioPorKilo: 9184.46, pesoKg: 0 }), null);
});

test("LA VENTA DE UN BULTO DESCUENTA EL BULTO ENTERO, NO 1", () => {
  // El faltante de 266 unidades: se vendía un bulto y salía 1 del stock.
  assert.equal(toUnidades({ cantidad: 1, unidad: "BULTO", factorPack: 12 }), 12);
  assert.equal(toUnidades({ cantidad: 3, unidad: "BULTO", factorPack: 18 }), 54);
  assert.equal(toUnidades({ cantidad: 5, unidad: "UNIDAD", factorPack: 12 }), 5);
});

test("DR LEMON 473: LA FICHA LO TIENE POR PACK DE 24 Y DYSSA LO COTIZA POR PACK DE 6 — GANA EL 6", () => {
  // Pack de 24 a $48.000 ($2.000 la unidad); DYSSA cotiza $12.300 el pack de 6.
  const r = lecturaDeMenorDiferencia({ precioPorFacturado: 12300, costoPorUnidad: 48000 / 24, candidatos: [1, 24, 6], variacionPct: 10 });
  assert.equal(r.ganadora?.unidadesPorFacturada, 6);
  assert.equal(r.ganadora.diferenciaPct.toFixed(1), "2.5");
  // Sin el 6 entre las lecturas —un papel que no lo imprime—, gana el bulto de
  // 24 a −74,4 %: fuera de la variación, así que es un salto de precio que
  // alguien tiene que aceptar, nunca un costo escrito solo.
  const sinElPapel = lecturaDeMenorDiferencia({ precioPorFacturado: 12300, costoPorUnidad: 2000, candidatos: [1, 24], variacionPct: 10 });
  assert.equal(sinElPapel.ganadora?.unidadesPorFacturada, 24);
  assert.ok(Math.abs(sinElPapel.ganadora.diferenciaPct) > sinElPapel.variacion);
});

test("FIAMBRE Y MANÍ: EN EL DEPÓSITO VAN POR PIEZA O BOLSA, EN LOS LOCALES POR KILO", () => {
  // El maní trae factor 2 y se compra por unidad: no tiene bulto.
  assert.equal(comoViene(MANI).factor, 1);
  assert.equal(comoViene(MORTADELA).naturaleza, "FIAMBRE");
  // El costo de una unidad del bulto, con la pieza: un pack de 12 a $38.400.
  assert.equal(unidadDelBulto({ precio: 38400, factor: 12 }), 3200);
});

// ── NADIE VUELVE A HACER SU PROPIA CUENTA EN LOS LUGARES YA PASADOS ─────────
//
// Cada archivo de esta lista hacía a mano una cuenta que hoy pide a la pieza
// (tanda 17). Si alguien la vuelve a escribir, se pone en rojo. Se lee sin
// comentarios: un candado que busca texto encuentra la prosa (regla 5).
const sinComentarios = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PASADOS = {
  "lib/compras-proveedor/estadoDeLineaFacturada.js": [/Math\.floor\(\w+ \/ factor\)/],
  "lib/compras-proveedor/cierreDeRecepcion.js": [/Math\.floor\([\w[\]]+ \/ factor/],
  "components/pos-transferencias/PrepararPedidoCelular.jsx": [/\/ pedido\.factorPack/, /% pedido\.factorPack/, /\* pedido\.factorPack/],
  "app/api/compras-proveedor/productos/route.js": [/Math\.floor\(\w+ \/ factorPack\)/],
  "app/api/pos-ventas/buscar-producto/route.js": [/\* pesoReferenciaKg\)\.toFixed/],
  "lib/stock/preciosDeStock.js": [/\* pesoReferenciaKg\)\.toFixed/],
  "lib/compras-proveedor/comprobante/propuestaIa.js": [/costo \/ factor/],
  "lib/compras-proveedor/comprobante/razonarRenglones.js": [/precio \/ factor/],
};

test("LOS LUGARES YA PASADOS A LA PIEZA NO VUELVEN A HACER SU PROPIA CUENTA", () => {
  const vuelven = [];
  for (const [rel, patrones] of Object.entries(PASADOS)) {
    const codigo = sinComentarios(rel);
    for (const p of patrones) if (p.test(codigo)) vuelven.push(`${rel}: ${p}`);
    assert.match(codigo, /@\/lib\/unidades\/reglaDeUnidades/, `${rel} dejó de pedirle a la pieza`);
  }
  assert.deepEqual(vuelven, []);
});

test("LOS ARCHIVOS DEL CENSO EXISTEN (trackeados o recién escritos)", () => {
  const todos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n");
  for (const rel of Object.keys(PASADOS)) assert.ok(todos.includes(rel), `no existe ${rel}`);
});
