// LO QUE NO COMPLETA UN BULTO VIAJA COMO SUELTAS, NUNCA COMO BULTOS CON DECIMALES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/bultosQueNoSeCompletan.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN ────────────────────────────────────────────────
//
// Arcor, 2026-10-27: "Confirmar cierre de compra" frenaba la compra entera con
// "cantidad debe ser un entero >= 0 (detalleId: 3270)". El cierre manda, por
// línea del pedido, lo que dice el papel en la ESCALA DEL PEDIDO, y esa
// conversión puede no completar un bulto: 30 unidades de un bulto de 12 son
// 2,5 bultos. `deducirUnidad` lo deja así a propósito —se dice, no se
// redondea— y el campo de bultos del cierre solo admite enteros.
//
// La fila se arma con las MISMAS funciones que la conciliación
// —`analizarPrecioDeLinea`, `aplanarDetalles` y `filasDeConciliacion`—, no a
// mano: el veredicto de la escala sale de la deducción real.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { aplanarDetalles } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  cantidadEnEscalaDelPedido,
  unidadesFisicasDeLaFactura,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { recibidosDelCierre, sueltasDelCierre, LLEGADA } from "@/lib/compras-proveedor/cierreDeRecepcion";
import { unidadesFisicasDe } from "@/lib/transferencias/recepcion";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Una golosina que viene en cajas de 12 y cuesta $12.000 la caja. */
const CAJA_DE_12 = { id: 90, nombre: "BON O BON LECHE", factor_pack: 12, precio_costo: 12000, unidad_medida: "unidad" };

/** La fila de la conciliación de un renglón del papel que cobra POR UNIDAD. */
function filaDe({ cantidad, precioUnidad = 1000 }) {
  const linea = {
    id: 5000, orden: 1, textoCrudo: "BON O BON LECHE", cantidad,
    netoUnitario: precioUnidad, subtotalImpreso: cantidad * precioUnidad, ivaPct: 0,
    costoFinalRenglon: cantidad * precioUnidad,
  };
  const a = analizarPrecioDeLinea({ linea, producto: CAJA_DE_12, proveedor: { id: 7, nombre: "Arcor" } });
  const [plano] = aplanarDetalles([
    { id: 3270, precioCosto: 12000, cantidad: 3, unidad: "BULTO",
      producto: { baseId: CAJA_DE_12.id, base: { ...CAJA_DE_12 } } },
  ]);
  const { grupos } = filasDeConciliacion({
    comprobantes: [{
      id: 1, proveedor: { id: 7, nombre: "Arcor" },
      lineas: [{ ...linea, productoLocalId: 5, productoBaseId: CAJA_DE_12.id, pedidoDetalleId: 3270,
        pedidoDetalle: plano, unidad: a.unidad, precio: { precioAEscribir: a.precioAEscribir, precioFinal: a.precioFinal } }],
    }],
    detalles: [plano],
  });
  return grupos[0].filas[0];
}

test("EL CASO: 30 unidades del papel en cajas de 12 son 2,5 bultos en la escala del pedido", () => {
  const fila = filaDe({ cantidad: 30 });
  assert.equal(cantidadEnEscalaDelPedido(fila), 2.5, "la deducción deja los bultos con decimales, a propósito");
  assert.equal(unidadesFisicasDeLaFactura(fila), 30);
});

test("AL CIERRE VIAJAN 2 BULTOS Y 6 SUELTAS: enteros, y las mismas 30 unidades", () => {
  const fila = filaDe({ cantidad: 30 });
  const recibidos = recibidosDelCierre({ filas: [fila] });
  const sueltas = sueltasDelCierre({ filas: [fila] });
  assert.equal(recibidos[3270], 2);
  assert.equal(sueltas[3270], 6);
  assert.ok(Number.isInteger(recibidos[3270]), "el campo de bultos del cierre solo admite enteros");
  // Lo que el servidor entra al stock con eso: la cuenta de la recepción.
  assert.equal(
    unidadesFisicasDe({ cantidad: recibidos[3270], sueltas: sueltas[3270], unidad: "BULTO", factorPack: 12 }),
    30,
    "no se pierde ni se inventa una unidad"
  );
});

test("un papel que completa los bultos no manda sueltas", () => {
  const fila = filaDe({ cantidad: 36 });
  assert.equal(recibidosDelCierre({ filas: [fila] })[3270], 3);
  assert.equal(sueltasDelCierre({ filas: [fila] })[3270], undefined);
});

test("dos renglones que juntos completan un bulto suman el bulto, no 12 sueltas", () => {
  const a = { ...filaDe({ cantidad: 18 }), lineaId: 1 };
  const b = { ...filaDe({ cantidad: 18 }), lineaId: 2 };
  assert.equal(recibidosDelCierre({ filas: [a, b] })[3270], 3);
  assert.equal(sueltasDelCierre({ filas: [a, b] })[3270], 0);
});

test("lo que una persona contó en Corregir manda: sus bultos y sus sueltas, no las del papel", () => {
  const fila = filaDe({ cantidad: 30 });
  const contados = { 3270: 2 };
  assert.equal(recibidosDelCierre({ filas: [fila], contados })[3270], 2);
  assert.equal(sueltasDelCierre({ filas: [fila], contados, sueltas: { 3270: 4 } })[3270], 4);
  assert.equal(sueltasDelCierre({ filas: [fila], contados })[3270], undefined, "sin sueltas anotadas, no se inventan");
});

test("una línea que llegó sin papel con lo pedido fraccionario también se parte", () => {
  const huerfana = { pedidoDetalleId: 3271, cantidadPedida: 1.5, unidad: "BULTO", factorPack: 12, llegoSinPapel: true };
  const llegadas = { 3271: LLEGADA.LLEGO };
  assert.equal(recibidosDelCierre({ sinComprobante: [huerfana], llegadas })[3271], 1);
  assert.equal(sueltasDelCierre({ sinComprobante: [huerfana], llegadas })[3271], 6);
});

test("EL CIERRE FRENA NOMBRANDO EL PRODUCTO, NUNCA CON UN NÚMERO DE LÍNEA", () => {
  // Sin comentarios: un candado que busca texto encuentra la prosa (regla 5).
  const ruta = fs
    .readFileSync(path.join(RAIZ, "app/api/compras-proveedor/recibir/[id]/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  assert.doesNotMatch(ruta, /detalleId: \$\{/, "un mensaje vuelve a decir el detalleId");
  // Los cinco frenos de la validación, con el nombre adelante.
  const frenos = ruta.match(/return frenar\(\s*`\$\{nombreDeLinea\(detId\)\}:/g) ?? [];
  assert.equal(frenos.length, 5);
  assert.match(ruta, /pedido\.detalles\.find\(\(d\) => String\(d\.id\) === String\(detId\)\)\?\.producto\?\.base\?\.nombre/);
  // Y la cantidad con decimales dice qué hacer, sin redondear.
  assert.match(ruta, /con decimales, y se ` \+\s*`recibe en bultos o unidades enteras/);
  assert.doesNotMatch(ruta, /Math\.(round|floor|trunc)\(\s*Number\(cant\)/, "el cierre no puede redondear lo recibido");
});

test("si las unidades no dan un número entero, NO se redondea: va como vino y el cierre lo frena", () => {
  const huerfana = { pedidoDetalleId: 3272, cantidadPedida: 1.55, unidad: "BULTO", factorPack: 12, llegoSinPapel: true };
  const llegadas = { 3272: LLEGADA.LLEGO };
  assert.equal(recibidosDelCierre({ sinComprobante: [huerfana], llegadas })[3272], 1.55);
  assert.equal(sueltasDelCierre({ sinComprobante: [huerfana], llegadas })[3272], undefined);
});
