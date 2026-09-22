// LA HOJA Y LA TARJETA LEEN LA ESCALA DEL MISMO LUGAR.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/laHojaYLaTarjetaMismaEscala.test.mjs
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Hamburguesa Paty Clásica del pedido 242. La tarjeta decía "Factura 3 PACK
// x30 · el papel dice 90 u" y la hoja de Corregir, abierta desde esa misma
// tarjeta, decía "Unidades 3 · Entra al stock 3 unidades" y pedía el motivo de
// la diferencia. Tres hamburguesas en vez de noventa.
//
// La tarjeta preguntaba por `quedoEnBultos` —el veredicto de la factura, que es
// quien convirtió el número— y la hoja preguntaba por `unidadPedido`. Sobre una
// línea donde esos dos no coinciden, la hoja contradecía a la tarjeta que la
// abrió.
//
// Medido sobre los pedidos abiertos: de once renglones vinculados a una línea
// de pedido, UNO estaba así — éste.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quedoEnBultos, textoDeLaCantidad } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { laCantidadCuadraConElPrecio } from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const HOJA = "components/compras-proveedor/HojaCorregirLinea.jsx";
const CIERRE = "app/api/compras-proveedor/recibir/[id]/route.js";

/**
 * La fila real de la hamburguesa: la línea del pedido está en UNIDAD con 90, y
 * el veredicto de la factura la convirtió a 3 bultos de 30.
 */
const HAMBURGUESA = {
  producto: "Hamburguesa Paty Clasica x2",
  cantidad: 90,
  // MEDIDO contra producción el 2026-09-22: la conciliación manda 90, no 3. El
  // fixture decía 3 y con eso el candado quedaba verde sin ejercer el defecto,
  // que es justo el que se produce cuando las dos cantidades están en escalas
  // distintas. La forma del dato de prueba tiene que ser la del dato real.
  cantidadPedida: 90,
  unidadPedido: "UNIDAD",
  factorPack: 30,
  porKilo: false,
  subtotal: 185110.67,
  costoFactura: 61703.7,
  costoCatalogo: 61703,
  unidad: { unidad: "POR_BULTO", requiereDecision: false, lecturas: { porBulto: { bultos: 3 } } },
};

/** El queso rallado del mismo papel, que siempre estuvo bien: 6 bultos de 20. */
const QUESO = {
  producto: "Queso Rallado Tremblay",
  cantidad: 6,
  cantidadPedida: 6,
  unidadPedido: "BULTO",
  factorPack: 20,
  porKilo: false,
  subtotal: 122714.07,
  costoFactura: 20452.35,
  costoCatalogo: 20600,
  unidad: { unidad: "POR_BULTO", requiereDecision: false, lecturas: { porBulto: { bultos: 6 } } },
};

/**
 * Lo que la hoja calcula hoy, con la escala ya unificada.
 *
 * `completos` es lo que el campo muestra: la cantidad de la FACTURA llevada a
 * la escala del pedido, que es con lo que la hoja arranca.
 */
const comoLaHoja = (fila, completos) => {
  const vaPorPack = quedoEnBultos(fila) && Number(fila.factorPack) > 1;
  const factor = vaPorPack ? Number(fila.factorPack) || 1 : 1;
  const entraAlStock = Number(completos) * factor;
  // La diferencia se mide en FÍSICAS de los dos lados, que es el arreglo.
  const factorDelPedido = (fila.unidadPedido ?? "BULTO") === "BULTO" ? Number(fila.factorPack) || 1 : 1;
  const pedidaFisica = Number(fila.cantidadPedida) * factorDelPedido;
  return {
    rotulo: vaPorPack ? `Bultos de ${fila.factorPack}` : "Unidades",
    entraAlStock,
    pideMotivo: pedidaFisica !== entraAlStock,
  };
};

test("LA HAMBURGUESA: BULTOS DE 30, Y ENTRAN 90 UNIDADES", () => {
  // El campo arranca en 3, que es la cantidad de la factura en la escala del
  // pedido — lo que la tarjeta muestra como "3 PACK x30".
  const hoja = comoLaHoja(HAMBURGUESA, 3);
  assert.equal(hoja.rotulo, "Bultos de 30", "la hoja volvió a decir «Unidades»");
  assert.equal(hoja.entraAlStock, 90, "volvió a meter 3 unidades al stock en vez de 90");
  // Y la tarjeta dice lo mismo.
  assert.equal(textoDeLaCantidad(HAMBURGUESA), "3 PACK x30");
});

test("Y NO PIDE EL MOTIVO DE UNA DIFERENCIA QUE NO EXISTE", () => {
  // La línea del pedido son 90 UNIDADES y el campo muestra 3 BULTOS de 30.
  // Comparados crudos, 90 contra 3 daba "difiere" y la hoja pedía el motivo.
  // En físicas son los dos 90.
  assert.equal(HAMBURGUESA.cantidadPedida, 90);
  assert.equal(HAMBURGUESA.unidadPedido, "UNIDAD");
  assert.equal(comoLaHoja(HAMBURGUESA, 3).pideMotivo, false, "volvió a pedir el motivo de más");
  // Y cuando la diferencia SÍ existe, lo sigue pidiendo: dos bultos en vez de
  // tres son 60 físicas contra 90.
  assert.equal(comoLaHoja(HAMBURGUESA, 2).pideMotivo, true);
});

test("EL QUESO RALLADO NO SE MUEVE: BULTOS DE 20 Y 120 UNIDADES", () => {
  // El renglón que ya estaba bien. Si el arreglo lo cambiara, sería otro
  // defecto en vez de uno menos.
  const hoja = comoLaHoja(QUESO, 6);
  assert.equal(hoja.rotulo, "Bultos de 20");
  assert.equal(hoja.entraAlStock, 120);
  assert.equal(hoja.pideMotivo, false, "el queso coincide y no tiene por qué pedir motivo");
  assert.equal(textoDeLaCantidad(QUESO), "6 PACK x20");
});

test("Y EL PRECIO LO CONFIRMA: 90 CUADRA, 3 NO", () => {
  const cuadra = (fisicas) =>
    laCantidadCuadraConElPrecio({
      subtotal: HAMBURGUESA.subtotal,
      cantidad: HAMBURGUESA.cantidad,
      fisicas,
    }).cuadra;
  assert.equal(cuadra(comoLaHoja(HAMBURGUESA, 3).entraAlStock), true);
  assert.equal(cuadra(3), false, "la escala vieja tiene que seguir dando que no cuadra");
  // Y el queso también cuadra con lo suyo.
  assert.equal(
    laCantidadCuadraConElPrecio({
      subtotal: QUESO.subtotal,
      cantidad: 120,
      fisicas: comoLaHoja(QUESO, 6).entraAlStock,
    }).cuadra,
    true
  );
});

test("LA HOJA NO TIENE SU PROPIA LECTURA DE LA ESCALA", () => {
  // Es lo que produjo el defecto: dos criterios para la misma pregunta.
  const hoja = codigoDe(HOJA);
  assert.match(hoja, /quedoEnBultos\(fila\)/, "la hoja dejó de usar el predicado compartido");
  assert.ok(
    !/unidadPedido \?\? "BULTO"\) === "BULTO" && Number\(fila\?\.factorPack\)/.test(hoja),
    "la hoja volvió a deducir la escala por su cuenta"
  );
  // Y avisa cuando lo que ofrece no cuadra con el precio del papel.
  assert.match(hoja, /laCantidadCuadraConElPrecio\(/);
  assert.match(hoja, /avisoDeEscala/);
  // Y la diferencia se mide en físicas de los dos lados.
  assert.match(hoja, /pedidaFisica !== entraAlStock/);
});

test("Y EL CIERRE USA LO QUE LA HOJA DIJO, NO SU PROPIA CUENTA", () => {
  // El tercer lugar donde se decidía la escala. Ahora la pantalla manda las
  // unidades físicas y el servidor las comprueba contra el precio antes de
  // escribir stock.
  const cierre = codigoDe(CIERRE);
  assert.match(cierre, /body\.fisicas/);
  assert.match(cierre, /laCantidadCuadraConElPrecio\(/);
  assert.match(cierre, /hayFisicas\s*\n?\s*\?\s*Number\(declaradasFisicas\)/);
  // La deducción vieja sigue como respaldo para una línea que nadie abrió, y
  // eso es a propósito: sacarla dejaría sin stock a las líneas no tocadas.
  assert.match(cierre, /det\.unidad === "UNIDAD" \? 1 : factorPack/);
  // Y no se acusa a quien declaró una diferencia a propósito.
  assert.match(cierre, /motivoDeclarado/);
});
