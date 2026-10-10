// EL NÚMERO DE ABAJO A LA DERECHA ES EL TOTAL, EN LA BASE DEL "PAPEL".
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/totalDeLaTarjeta.test.mjs
//
// ── QUÉ ESTABA MAL ────────────────────────────────────────────────────────
//
// La tarjeta de cada producto mostraba en esa esquina `fila.subtotal`, que es
// el subtotal IMPRESO del papel: el neto, sin IVA ni los conceptos del pie. Dos
// centímetros más arriba, el renglón "Papel" muestra el costo unitario CON los
// impuestos repartidos, que es la regla de negocio vigente desde `9af324bf`.
//
// Medido sobre el pedido 246: "SERRANAS SANDWICH 324 · 1 PACK x16 · Papel
// $21.790,88 / pack" y abajo, sin rótulo, "$17.573,34" — el mismo importe
// dividido por 1,24. Dos bases en la misma tarjeta, y la de abajo sin nombre.
//
// ── LO QUE NO SE TOCÓ ─────────────────────────────────────────────────────
//
// `fila.subtotal` sigue siendo el neto y lo sigue leyendo como neto la hoja de
// Corregir, que lo compara contra lo que está impreso en el papel. El total de
// la tarjeta se calcula aparte.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { totalDeLaLinea, renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";

/**
 * La boleta de DYSSA #153 como la da la lectura interpretada (#165): cada
 * renglón con su costo final, todo adentro. Antes estos candados usaban el
 * comprobante 18 armado con el reparto del pie, un motor de formato que se
 * borró; la propiedad que defienden es la misma.
 */
const DYSSA = JSON.parse(
  fs.readFileSync(new URL("./comprobante/lecturaInterpretada.fixture.json", import.meta.url), "utf8")
).dyssa;
const TOTAL_IMPRESO = DYSSA.pie.total;

/**
 * Las filas de la conciliación tal como llegan a la tarjeta, armadas con el
 * MOTOR y no a mano: `costoFactura` sale de `analizarPrecioDeLinea` con el
 * costo final del renglón, que es exactamente lo que hace la ruta.
 *
 * El producto se declara por unidad y sin bulto para que la comparación quede
 * en la escala del papel: lo que se está afirmando acá es la aritmética del
 * total, no la conversión de escalas, que tiene sus propios candados en
 * `tarjetaDeRecepcion.test.mjs`.
 */
function filasDeLaBoleta() {
  return DYSSA.lineas.map((l, i) => {
    const a = analizarPrecioDeLinea({
      linea: { cantidad: l.cantidad, netoUnitario: l.precioImpreso, subtotalImpreso: l.importeImpreso, costoFinal: l.costoFinal },
      producto: { id: i + 1, nombre: l.descripcion, factor_pack: null, unidad_medida: "unidad", precio_costo: 1 },
    });
    return {
      lineaId: i + 1,
      producto: l.descripcion,
      cantidad: l.cantidad,
      cantidadRecibida: l.cantidad,
      unidadPedido: "UNIDAD",
      subtotal: l.importeImpreso,
      costoFactura: a.precioAEscribir ?? a.precioFinal,
      costoCatalogo: null,
      factorPack: null,
      porKilo: false,
    };
  });
}

test("LA SUMA DE LOS TOTALES DE LAS TARJETAS DA EL TOTAL IMPRESO DEL PAPEL", () => {
  // Es la propiedad que hace que el número sirva: nueve tarjetas que suman lo
  // que el proveedor factura. Con el neto no suman ni cerca (la contraprueba).
  // El Dr. Lemon bonificado no tiene total: vale cero.
  const filas = filasDeLaBoleta();
  assert.equal(filas.length, 9);

  const suma = filas.reduce((s, f) => s + (totalDeLaLinea(f) ?? 0), 0);
  const impreso = TOTAL_IMPRESO;

  // La tolerancia es de un peso por línea, y es por el redondeo del unitario:
  // el papel imprime el subtotal de la línea y la tarjeta muestra un costo POR
  // UNIDAD, que al multiplicarse de vuelta puede no dar el centavo exacto.
  const tolerancia = filas.length;
  assert.ok(
    Math.abs(suma - impreso) <= tolerancia,
    `los totales suman ${suma.toFixed(2)} y el papel dice ${impreso} (diferencia ${(suma - impreso).toFixed(2)})`
  );
});

test("CONTRAPRUEBA: CON EL NETO NO CIERRA NI CERCA", () => {
  // Si esta afirmación se pusiera en verde, el candado de arriba no estaría
  // probando nada: daría igual qué número muestre la tarjeta.
  const filas = filasDeLaBoleta();
  const conNeto = filas.reduce((s, f) => s + f.subtotal, 0);
  assert.ok(
    Math.abs(conNeto - TOTAL_IMPRESO) > 60000,
    "el neto y el total del papel dieron parecido, así que el fixture no tiene impuestos"
  );
});

test("CON CANTIDAD 1, EL TOTAL ES IGUAL AL PAPEL", () => {
  // Un renglón de una unidad vale lo que vale esa unidad. Es la comprobación
  // más chica de que las dos cifras de la tarjeta están en la misma base.
  const fila = {
    lineaId: 1,
    producto: "MOGUL. OSITOS 12X30G",
    cantidad: 1,
    cantidadRecibida: 1,
    unidadPedido: "UNIDAD",
    subtotal: 5067.62,
    costoFactura: 6283.85,
    costoCatalogo: 6777.28,
    factorPack: 12,
    porKilo: false,
  };
  const r = renglonesDeLaTarjeta(fila);
  assert.equal(r.papel.importe, 6283.85);
  assert.equal(r.total, 6283.85);
  assert.equal(totalDeLaLinea(fila), r.papel.importe);
});

test("Y ES EL COSTO CON IMPUESTOS, NO EL SUBTOTAL IMPRESO", () => {
  // El caso real del pedido 246, con los dos números que se veían en pantalla.
  const fila = {
    lineaId: 1,
    producto: "SERRANAS SANDWICH 324",
    cantidad: 1,
    cantidadRecibida: 1,
    unidadPedido: "BULTO",
    subtotal: 17573.28,
    costoFactura: 21790.88,
    costoCatalogo: 27200,
    factorPack: 16,
    porKilo: false,
  };
  assert.equal(totalDeLaLinea(fila), 21790.88);
  assert.notEqual(totalDeLaLinea(fila), fila.subtotal);
});

test("UN PRODUCTO POR KILO SE VALORIZA POR SUS KILOS, NO POR SUS PIEZAS", () => {
  // `cuantoSeValoriza` ya resolvía esto y por eso se reusa: el costo está por
  // kilo y las piezas son otra cosa. Multiplicar piezas por precio del kilo
  // daría un total inventado. Caso del #242: 3 piezas, 2,100 kg.
  const fila = {
    lineaId: 9,
    producto: "FOX SAL PIC FINO X 4U",
    cantidad: 3,
    cantidadRecibida: 3,
    unidadPedido: "UNIDAD",
    peso: 2.1,
    subtotal: 37633.23,
    costoFactura: 17920.59,
    factorPack: null,
    porKilo: true,
  };
  assert.equal(Number(totalDeLaLinea(fila).toFixed(2)), 37633.24);
});

test("SIN COSTO CON IMPUESTOS NO SE MUESTRA EL NETO EN SU LUGAR", () => {
  // Un renglón sin vincular no tiene producto, así que no tiene "Papel" ni
  // total. Poner ahí el subtotal impreso sería volver a mezclar las dos bases,
  // ahora con un rótulo que afirma que no.
  const sinVincular = {
    lineaId: 3,
    producto: null,
    cantidad: 5,
    cantidadRecibida: 5,
    unidadPedido: "UNIDAD",
    subtotal: 1234.56,
    costoFactura: null,
    costoCatalogo: null,
    porKilo: false,
  };
  assert.equal(totalDeLaLinea(sinVincular), null);
  assert.equal(renglonesDeLaTarjeta(sinVincular).total, null);
  assert.equal(renglonesDeLaTarjeta(sinVincular).papel, null);
});

test("LA TARJETA DIBUJA EL TOTAL CON SU RÓTULO, Y YA NO EL SUBTOTAL", () => {
  const jsx = fs
    .readFileSync(
      new URL("../../components/compras-proveedor/TarjetaLineaFactura.jsx", import.meta.url),
      "utf8"
    )
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  assert.match(jsx, /<span className="text-xs sunmi-text-muted shrink-0">Total<\/span>/);
  assert.match(jsx, /formatearMoneda\(renglones\.total\)/);
  // Y el neto no se dibuja en ninguna de las dos caras de la tarjeta: ni en la
  // abierta ni en la colapsada, que son la misma y tienen que decir lo mismo.
  assert.ok(
    !/formatearMoneda\(fila\?\.subtotal/.test(jsx),
    "la tarjeta volvió a mostrar el subtotal impreso"
  );
});
