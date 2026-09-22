// UN PEDIDO CERRADO SE LEE POR PRODUCTO, NO POR RENGLÓN DEL PAPEL.
//
// Los números son los del comprobante 5 del pedido 232, medidos: las líneas 120
// y 121 van las dos al detalle 2565, y lo que entró al stock se escribió UNA vez
// en esa línea del pedido. Listando por renglón, ese producto aparecería dos
// veces con la misma cantidad y la columna sumaría el doble de lo que entró.

import { test } from "node:test";
import assert from "node:assert/strict";

import { cuantosProductos, loQueEntro, textoDeCantidad } from "@/lib/compras-proveedor/loQueEntro";

const FILA_120 = {
  lineaId: 120,
  producto: "Marlboro 20 Crafted Box",
  productoLocalId: 6100,
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
  productoLocalId: 6079,
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

test("el número va con su palabra, y la palabra sale del PRODUCTO", () => {
  // ── ESTE CANDADO CAMBIÓ DE CRITERIO, Y POR UNA MEDICIÓN ─────────────
  //
  // Afirmaba que la palabra salía de `unidadPedido`. Sobre el pedido 242 eso
  // daba las dos mal: la Hamburguesa está declarada en UNIDAD y sus 3 son
  // BULTOS de 30, y las Papas están en BULTO y sus 12 son PIEZAS. Lo que dice
  // cómo se llama la cantidad es el TAMAÑO DEL BULTO del producto.
  assert.equal(textoDeCantidad({ cantidad: 8, factorPack: 20 }), "8 bultos de 20");
  assert.equal(textoDeCantidad({ cantidad: 1, factorPack: 60 }), "1 bulto de 60");
  assert.equal(textoDeCantidad({ cantidad: 10, factorPack: 1 }), "10 piezas");
  assert.equal(textoDeCantidad({ cantidad: 1, factorPack: null }), "1 pieza");
  assert.equal(textoDeCantidad({ cantidad: 2.9, porKilo: true }), "2,9 kg");
  assert.equal(textoDeCantidad({ cantidad: null }), "no se contó");
});

// ── CUÁNTOS PRODUCTOS TRAE EL PAPEL, QUE ES LO QUE DICE LA PANTALLA ───────

test("EL PAPEL SE CUENTA POR PRODUCTO: dos renglones del mismo producto son UNO", () => {
  // La tarjeta dice "El papel de Mauro · N productos". Con el conteo por
  // renglón, un producto repartido en dos diría 3 sobre 2 productos distintos.
  assert.equal(cuantosProductos([FILA_120, FILA_121, FILA_110]), 2);
  assert.equal(cuantosProductos([FILA_110]), 1);
  assert.equal(cuantosProductos([]), 0);
});

test("un renglón SIN VINCULAR cuenta como propio, y no se funde con los otros", () => {
  // Medido en el comprobante 5: dos de sus quince renglones no tienen vínculo
  // —"PHILIPS SELECT RED KS" y "PHILIPS MORRIS 20 KS"—. No se puede probar que
  // sean el mismo producto que ningún otro, y están impresos en el papel: cada
  // uno cuenta.
  const sueltoA = { lineaId: 112, textoCrudo: "PHILIPS SELECT RED KS", productoLocalId: null };
  const sueltoB = { lineaId: 113, textoCrudo: "PHILIPS MORRIS 20 KS", productoLocalId: null };
  assert.equal(cuantosProductos([sueltoA, sueltoB]), 2);
  assert.equal(cuantosProductos([FILA_120, FILA_121, sueltoA, sueltoB]), 3);
});

test("EL NÚMERO DEL 232, MEDIDO CONTRA PRODUCCIÓN", () => {
  // El 2026-09-21: 15 renglones, 13 con vínculo y los 13 a productos distintos,
  // más 2 sin vincular. Los dos conteos dan 15 hoy, y por eso el que se puso no
  // se nota — se nota el día que un producto venga en dos renglones.
  const trece = Array.from({ length: 13 }, (_, i) => ({ lineaId: 110 + i, productoLocalId: 6000 + i }));
  const dosSueltos = [
    { lineaId: 112, productoLocalId: null },
    { lineaId: 113, productoLocalId: null },
  ];
  assert.equal(cuantosProductos([...trece, ...dosSueltos]), 15);
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

// ── LA PANTALLA DEL PEDIDO RECIBIDO VALORIZA CON LA CUENTA DE LA RECEPCIÓN ──

import { textoDelPrecioPorUnidad } from "@/lib/compras-proveedor/loQueEntro";
import { gananciaDelDeposito } from "@/lib/compras-proveedor/gananciaDelDeposito";

/**
 * Los once renglones del pedido 242 ya recibido, COPIADOS DE PRODUCCIÓN el
 * 2026-09-22, con `costoCatalogo` ya convertido a la unidad del depósito —que
 * es como llegan a la pantalla— y los kilos que se pesaron al recibir.
 */
const DEL_242 = [
  { pedidoDetalleId: 2812, producto: "Papas Congeladas", cantidadRecibida: 12, costoCatalogo: 9500, subtotal: 97998.47, costoFactura: 8166.539167, porKilo: false, unidadPedido: "BULTO", cantidadPedida: 12, cantidad: 12 },
  { pedidoDetalleId: 2813, producto: "Manteca Tremblay 100g", cantidadRecibida: 1, costoCatalogo: 90600, subtotal: 90481.03, costoFactura: 90481.03, porKilo: false, unidadPedido: "BULTO", factorPack: 60, cantidadPedida: 1, cantidad: 60 },
  { pedidoDetalleId: 2815, producto: "Queso Rallado Tremblay 20 U 40G", cantidadRecibida: 6, costoCatalogo: 20600, subtotal: 122714.07, costoFactura: 20452.345, porKilo: false, unidadPedido: "BULTO", factorPack: 20, cantidadPedida: 6, cantidad: 6 },
  { pedidoDetalleId: 2814, producto: "Hamburguesa Paty Clasica x2", cantidadRecibida: 3, costoCatalogo: 61703, subtotal: 185110.67, costoFactura: 61703.556, porKilo: false, unidadPedido: "UNIDAD", factorPack: 30, cantidadPedida: 90, cantidad: 90 },
  { pedidoDetalleId: 2816, producto: "Yogurt Tremblay Vainilla", cantidadRecibida: 3, costoCatalogo: 15629, subtotal: 46886.55, costoFactura: 15628.85, porKilo: false, unidadPedido: "BULTO", factorPack: 10, cantidadPedida: 3, cantidad: 30 },
  { pedidoDetalleId: 2817, producto: "Yogurt Tremblay Frutilla", cantidadRecibida: 4, costoCatalogo: 15629, subtotal: 62515.42, costoFactura: 15628.855, porKilo: false, unidadPedido: "BULTO", factorPack: 10, cantidadPedida: 4, cantidad: 40 },
  { pedidoDetalleId: 2818, producto: "Untable tremblay clasico", cantidadRecibida: 12, costoCatalogo: 1752, subtotal: 21020.17, costoFactura: 1751.68, porKilo: false, unidadPedido: "BULTO", factorPack: 1, cantidadPedida: 12, cantidad: 12 },
  { pedidoDetalleId: 2819, producto: "Untable tremblay salame", cantidadRecibida: 12, costoCatalogo: 1752, subtotal: 21020.17, costoFactura: 1751.68, porKilo: false, unidadPedido: "BULTO", factorPack: 1, cantidadPedida: 12, cantidad: 12 },
  { pedidoDetalleId: 2820, producto: "Salametro", cantidadRecibida: 2, kgRecibidos: 2.9, costoCatalogo: 16500, subtotal: 47245.18, costoFactura: 16291.44, porKilo: true, peso: 2.9, unidadPedido: "UNIDAD", cantidadPedida: 2, cantidad: 2 },
  { pedidoDetalleId: 2821, producto: "Salamin Fox Picado Fino", cantidadRecibida: 3, kgRecibidos: 2.1, costoCatalogo: 18000, subtotal: 37633.23, costoFactura: 17920.585714, porKilo: true, peso: 2.1, unidadPedido: "UNIDAD", cantidadPedida: 3, cantidad: 3 },
  { pedidoDetalleId: 2822, producto: "BARRA TREMBLAY", cantidadRecibida: 3, kgRecibidos: 11.685, costoCatalogo: 11018.49, subtotal: 128751.11, costoFactura: 11018.4867, porKilo: true, peso: 11.685, unidadPedido: "UNIDAD", cantidadPedida: 3, cantidad: 3 },
];

test("CADA RENGLÓN DICE SU UNIDAD Y SU PRECIO EN ESA UNIDAD", () => {
  const { delPapel } = loQueEntro({ filas: DEL_242 });
  const por = (nombre) => delPapel.find((r) => r.producto.startsWith(nombre));

  // Los tres que el depósito maneja por peso: kilos, no piezas.
  assert.equal(textoDeCantidad(por("Salametro")), "2,9 kg");
  assert.equal(textoDelPrecioPorUnidad(por("Salametro")), "el kilo");
  assert.equal(por("Salametro").total, 47850);
  assert.equal(textoDeCantidad(por("Salamin")), "2,1 kg");
  assert.equal(textoDeCantidad(por("BARRA")), "11,685 kg");
  assert.equal(Math.round(por("BARRA").total * 100) / 100, 128751.06);

  // El que va por bulto dice de cuánto es el bulto.
  assert.equal(textoDeCantidad(por("Hamburguesa")), "3 bultos de 30");
  assert.equal(por("Hamburguesa").total, 185109);
  assert.equal(textoDeCantidad(por("Manteca")), "1 bulto de 60");

  // Y el que entra por pieza, piezas.
  assert.equal(textoDeCantidad(por("Papas")), "12 piezas");
  assert.equal(textoDelPrecioPorUnidad(por("Papas")), "cada una");
  assert.equal(por("Papas").total, 114000);
});

test("«A TUS PRECIOS VALE» ES LA SUMA DE «ENTRÓ ESTO»", () => {
  const { delPapel } = loQueEntro({ filas: DEL_242 });
  const suma = delPapel.reduce((a, r) => a + (r.total ?? 0), 0);
  const cuenta = gananciaDelDeposito(DEL_242);
  assert.equal(Math.round(suma * 100) / 100, Math.round(cuenta.interno * 100) / 100);
  // Y el número es el que mostró la recepción antes de cerrar: $879.161,06.
  assert.equal(Math.round(cuenta.interno * 100) / 100, 879161.06);
});

test("Y NO VUELVE EL $6.247.322 DE LA ESCALA EQUIVOCADA", () => {
  // CONTRAPRUEBA: valorizar la Hamburguesa con las 90 unidades del papel contra
  // el costo del BULTO de 30 da $5.553.270 de un renglón que vale $185.109. Eso
  // es lo que inflaba la pantalla del pedido recibido.
  const { delPapel } = loQueEntro({ filas: DEL_242 });
  const hamb = delPapel.find((r) => r.producto.startsWith("Hamburguesa"));
  assert.notEqual(hamb.total, 90 * 61703);
  assert.equal(hamb.cantidad, 3, "volvió a valorizar con la cantidad del papel");
});
