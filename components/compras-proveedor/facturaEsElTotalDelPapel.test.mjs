// "FACTURA" ES LO QUE FACTURA EL PAPEL, NO UNA SUMA PARCIAL.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/facturaEsElTotalDelPapel.test.mjs
//
// ── EL CASO, MEDIDO EN PRODUCCIÓN EL 2026-09-22 ──────────────────────────
//
// Arcor, pedido 246, comprobante 18. El papel dice subtotal $281.219,03, IVA
// $59.056,00, percepción $8.436,58 y **total $348.711,61**, y la lectura
// cierra. La tarjeta de la recepción decía "Factura **$294.249,80**".
//
// Ese número NO ESTÁ EN EL PAPEL y no puede estar: era la suma de los renglones
// COMPARABLES —7 de los 9, porque dos no tienen producto vinculado— valuados a
// su precio final, con IVA y percepción adentro. Es un número útil, pero no es
// lo que factura el proveedor, y el rótulo decía que sí.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gananciaDelDeposito } from "@/lib/compras-proveedor/gananciaDelDeposito";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Tres renglones con la forma real del pedido 246: dos comparables y uno sin
 * producto vinculado, que es el que hace que la suma sea parcial.
 */
const FILAS = [
  { lineaId: 1, cantidad: 21, costoFactura: 2368.35, costoCatalogo: 2500, cantidadPedida: 21, unidadPedido: "UNIDAD", cantidadRecibida: 21 },
  { lineaId: 2, cantidad: 64, costoFactura: 1791.49, costoCatalogo: 1900, cantidadPedida: 64, unidadPedido: "UNIDAD", cantidadRecibida: 64 },
  { lineaId: 3, cantidad: 16, costoFactura: 1361.93, costoCatalogo: null, cantidadPedida: 16, unidadPedido: "UNIDAD", cantidadRecibida: 16 },
];

test("LA CUENTA SIGUE SIENDO PARCIAL, Y LO DICE", () => {
  // Esto no cambia: la ganancia solo se puede calcular sobre lo comparable.
  const c = gananciaDelDeposito(FILAS);
  assert.equal(c.total, 3);
  assert.equal(c.enLaCuenta, 2, "entró en la cuenta algo sin precio interno");
  assert.equal(c.sinPrecioInterno, 1);
  // Y `facturado` es la suma de ESOS dos, no del papel.
  assert.equal(Math.round(c.facturado * 100) / 100, 164390.71);
});

test("EL RÓTULO «Factura» MUESTRA EL TOTAL DEL PAPEL, NO ESA SUMA", () => {
  const lista = codigoDe("components/compras-proveedor/ListaDeLaFactura.jsx");
  assert.match(lista, /rotulo="Factura"/);
  assert.match(lista, /valor=\{totalDelPapel != null \? totalDelPapel : cuenta\.facturado\}/);
  // La suma parcial no desaparece: baja a la línea chica, donde se dice de
  // cuántos productos es.
  assert.match(lista, /Factura de esos \$\{cuenta\.enLaCuenta\}/);
  assert.match(lista, /A tus precios: \$\{formatearMoneda\(cuenta\.interno\)\}/);
});

test("Y LA GANANCIA DICE SOBRE CUÁNTOS SE CALCULÓ, EN EL RÓTULO", () => {
  const lista = codigoDe("components/compras-proveedor/ListaDeLaFactura.jsx");
  assert.match(lista, /Ganancia sobre \$\{cuenta\.enLaCuenta\} de \$\{cuenta\.total\} productos/);
  // Y "Al precio del ERP" ya no va como un importe suelto arriba: se leía como
  // si hablara del papel entero.
  assert.ok(!/rotulo="Al precio del ERP"/.test(lista));
});

test("EL TOTAL DEL PAPEL VIAJA DESDE EL COMPROBANTE, NO SE SUMA", () => {
  const filas = codigoDe("lib/compras-proveedor/comprobante/filasDeConciliacion.js");
  assert.match(filas, /totalDelPapel: num\(c\.totalLeido\)/);
  const ruta = codigoDe("app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
  assert.match(ruta, /totalLeido: true/);
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(pagina, /totalDelPapel=\{comprobanteActivo\?\.totalDelPapel \?\? null\}/);
});

test("SIN TOTAL IMPRESO NO SE INVENTA UNO", () => {
  // El papel de Mauro no trae total. Ahí el rótulo cae a la suma de lo
  // comparable, que es lo único que hay, y no a un cero ni a un guion.
  const lista = codigoDe("components/compras-proveedor/ListaDeLaFactura.jsx");
  assert.match(lista, /totalDelPapel != null \? totalDelPapel : cuenta\.facturado/);
});

test("Y LA PANTALLA DE RECIBIDO DICE LO MISMO, POR EL MISMO CAMINO", () => {
  // El pedido ya recibido tenía el MISMO defecto del otro lado: "Te facturó"
  // era la suma de los renglones comparables. Medido sobre el pedido 245: decía
  // $499.581,75 contra los $511.968,28 impresos, y la diferencia eran los
  // $12.386,53 de la percepción de IVA.
  const recibido = codigoDe("components/compras-proveedor/PedidoRecibido.jsx");
  assert.match(recibido, /valor=\{totalDelPapel != null \? totalDelPapel : cuenta\.facturado\}/);
  // Y la cuenta sigue siendo la misma función en las dos pantallas: lo que
  // cambió es qué se rotula con qué, no cómo se calcula.
  assert.match(recibido, /gananciaDelDeposito\(filas\)/);
  const lista = codigoDe("components/compras-proveedor/ListaDeLaFactura.jsx");
  assert.match(lista, /gananciaDelDeposito\(filas\)/);
  // Las dos sacan el total del MISMO lugar: el comprobante activo. Dos
  // pantallas que dicen "te facturó" no pueden tomar ese número de dos lados.
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.equal(
    (pagina.match(/totalDelPapel=\{comprobanteActivo\?\.totalDelPapel \?\? null\}/g) || []).length,
    2,
    "una de las dos pantallas dejó de recibir el total del papel"
  );
});
