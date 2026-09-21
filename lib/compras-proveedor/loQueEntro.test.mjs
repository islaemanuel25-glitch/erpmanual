// UN PEDIDO CERRADO SE LEE POR PRODUCTO, NO POR RENGLÓN DEL PAPEL.
//
// Los números son los del comprobante 5 del pedido 232, medidos: las líneas 120
// y 121 van las dos al detalle 2565, y lo que entró al stock se escribió UNA vez
// en esa línea del pedido. Listando por renglón, ese producto aparecería dos
// veces con la misma cantidad y la columna sumaría el doble de lo que entró.

import { test } from "node:test";
import assert from "node:assert/strict";

import { loQueEntro, textoDeCantidad } from "@/lib/compras-proveedor/loQueEntro";

const FILA_120 = {
  lineaId: 120,
  producto: "Marlboro 20 Crafted Box",
  pedidoDetalleId: 2565,
  cantidadPedida: 4,
  cantidadRecibida: 2,
  unidadPedido: "BULTO",
  costoCatalogo: 40500,
};
const FILA_121 = { ...FILA_120, lineaId: 121 };
const FILA_110 = {
  lineaId: 110,
  producto: "Philips 10",
  pedidoDetalleId: 2574,
  cantidadPedida: 8,
  cantidadRecibida: 8,
  unidadPedido: "BULTO",
  costoCatalogo: 34603.2,
};

test("DOS RENGLONES DEL MISMO PRODUCTO SE MUESTRAN UNA VEZ", () => {
  const r = loQueEntro({ filas: [FILA_120, FILA_121, FILA_110] });
  assert.equal(r.delPapel.length, 2, "el 2565 aparece una sola vez");
  assert.deepEqual(
    r.delPapel.map((x) => x.pedidoDetalleId),
    [2565, 2574]
  );
});

test("la cuenta de cada renglón sale de lo que ENTRÓ, no de lo pedido", () => {
  const r = loQueEntro({ filas: [FILA_110] });
  const [x] = r.delPapel;
  assert.equal(x.cantidad, 8);
  assert.equal(x.costo, 34603.2);
  assert.equal(Math.round(x.total * 100) / 100, 276825.6);
});

test("lo que nunca se contó se dice, y no se convierte en cero", () => {
  // `null` es "nunca se contó" y 0 es "se contó y no llegó". Mostrar un cero
  // donde no hay dato afirma que alguien miró.
  const r = loQueEntro({ filas: [{ ...FILA_110, cantidadRecibida: null }] });
  assert.equal(r.delPapel[0].cantidad, null);
  assert.equal(r.delPapel[0].total, null);
  assert.equal(textoDeCantidad(r.delPapel[0]), "no se contó");
});

test("las que ningún comprobante trajo van aparte y con la misma forma", () => {
  const r = loQueEntro({
    filas: [FILA_110],
    sinComprobante: [
      {
        pedidoDetalleId: 2578,
        producto: "Liverpool rojo",
        cantidadPedida: 25,
        cantidadRecibida: 25,
        unidad: "BULTO",
        costoCatalogo: 13200,
      },
    ],
  });
  assert.equal(r.delPapel.length, 1);
  assert.equal(r.sinPapel.length, 1);
  assert.equal(r.sinPapel[0].producto, "Liverpool rojo");
  assert.equal(r.sinPapel[0].total, 330000);
});

test("el número va con su palabra, y la palabra sale de la unidad del pedido", () => {
  assert.equal(textoDeCantidad({ cantidad: 8, unidad: "BULTO" }), "8 bultos");
  assert.equal(textoDeCantidad({ cantidad: 1, unidad: "BULTO" }), "1 bulto");
  assert.equal(textoDeCantidad({ cantidad: 10, unidad: "UNIDAD" }), "10 unidades");
  assert.equal(textoDeCantidad({ cantidad: 1, unidad: "UNIDAD" }), "1 unidad");
});

test("CONTRAPRUEBA: sin agrupar, el mismo producto se contaría dos veces", () => {
  // Es el defecto que la función existe para evitar, escrito como número: la
  // suma por renglón da 4 bultos del 2565 cuando entraron 2.
  const porRenglon = [FILA_120, FILA_121].reduce((a, f) => a + Number(f.cantidadRecibida), 0);
  const agrupado = loQueEntro({ filas: [FILA_120, FILA_121] }).delPapel.reduce(
    (a, x) => a + Number(x.cantidad),
    0
  );
  assert.equal(porRenglon, 4);
  assert.equal(agrupado, 2);
});
