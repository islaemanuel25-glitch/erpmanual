// UN PEDIDO QUE NACE DE UNA FACTURA: QUÉ LÍNEAS HACEN FALTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/pedidoDesdeFactura.test.mjs
//
// Las filas tienen la forma que produce `analizarLineas` —la misma que consume
// la pantalla—, no una escrita a mano: `productoBaseId` ya resuelto por la
// cascada, `unidad` con las dos lecturas, y `cantidad` como la trae el papel.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cantidadParaElPedido,
  loQueHayQueSembrar,
  resumenDeLaSiembra,
} from "@/lib/compras-proveedor/pedidoDesdeFactura";

/** Una línea leída, con la unidad ya resuelta: el papel cobra por unidad. */
const porUnidad = (extra = {}) => ({
  id: 110,
  textoCrudo: "PHILIPS MORRIS 10",
  productoBaseId: 2031,
  cantidad: 80,
  unidad: {
    unidad: "POR_UNIDAD",
    requiereDecision: false,
    lecturas: { porUnidad: { bultos: 8 }, porBulto: { bultos: 80 } },
  },
  ...extra,
});

/** Una que el análisis no supo resolver: no hay conversión que aplicar. */
const sinResolver = (extra = {}) => ({
  id: 120,
  textoCrudo: "M.CRAFTED 20 BOX",
  productoBaseId: 2019,
  cantidad: 4,
  unidad: { unidad: "POR_BULTO", requiereDecision: true, lecturas: {} },
  ...extra,
});

test("LA CANTIDAD ENTRA EN LA ESCALA QUE LA LECTURA RESOLVIÓ", () => {
  // 80 unidades del papel son 8 bultos, y el pedido se cuenta en bultos.
  assert.deepEqual(cantidadParaElPedido(porUnidad()), { cantidad: 8, unidad: "BULTO" });
});

test("si el análisis NO resolvió la unidad, se guarda el número crudo y se dice", () => {
  // No se inventa ninguna conversión: el número del papel, en unidades.
  assert.deepEqual(cantidadParaElPedido(sinResolver()), { cantidad: 4, unidad: "UNIDAD" });
});

test("sin ningún número no hay línea que crear", () => {
  assert.equal(cantidadParaElPedido({ cantidad: null, unidad: null }), null);
  assert.equal(cantidadParaElPedido(undefined), null);
});

test("UNA LÍNEA SIN PRODUCTO NO CREA NADA, y se cuenta aparte", () => {
  // Es la decisión que más importa: crear una línea de pedido contra un
  // producto adivinado escribe un costo en el producto equivocado, que es el
  // daño que la cascada existe para evitar.
  const r = loQueHayQueSembrar({
    filas: [porUnidad(), { id: 112, textoCrudo: "PHILIPS SELECT RED KS", productoBaseId: null, cantidad: 3 }],
    detalles: [],
  });
  assert.equal(r.aCrear.length, 1);
  assert.equal(r.sinProducto, 1);
  assert.equal(r.aCrear[0].productoBaseId, 2031);
});

test("EL MISMO PRODUCTO EN DOS RENGLONES ES UNA SOLA LÍNEA, con la suma", () => {
  const r = loQueHayQueSembrar({
    filas: [porUnidad(), porUnidad({ id: 111 })],
    detalles: [],
  });
  assert.equal(r.aCrear.length, 1, "no se duplica el producto en el pedido");
  assert.equal(r.aCrear[0].cantidad, 16, "8 + 8");
  assert.deepEqual(r.aCrear[0].lineas, [110, 111]);
});

test("las escalas NO se suman entre sí, y queda dicho que se mezclaron", () => {
  // Sumar 8 bultos con 4 unidades daría 12 de nada. La segunda no suma y la
  // mezcla queda marcada, que es lo que permite mirarla después.
  const r = loQueHayQueSembrar({
    filas: [porUnidad(), sinResolver({ id: 111, productoBaseId: 2031 })],
    detalles: [],
  });
  assert.equal(r.aCrear.length, 1);
  assert.equal(r.aCrear[0].cantidad, 8);
  assert.equal(r.aCrear[0].unidad, "BULTO");
  assert.equal(r.aCrear[0].escalasMezcladas, true);
});

test("si el producto YA tiene línea en el pedido, solo se ata", () => {
  // Es lo que hace que releer el papel no duplique nada, y lo que permite que
  // una segunda hoja del mismo papel caiga sobre las líneas que ya están.
  const r = loQueHayQueSembrar({
    filas: [porUnidad()],
    detalles: [{ id: 900, productoBaseId: 2031 }],
  });
  assert.equal(r.aCrear.length, 0);
  assert.deepEqual(r.aEnlazar, [{ lineaId: 110, productoBaseId: 2031, detalleId: 900 }]);
});

test("el resumen contesta cuánto trabajo quedó", () => {
  const plan = loQueHayQueSembrar({
    filas: [
      porUnidad(),
      porUnidad({ id: 111, productoBaseId: 2044 }),
      { id: 112, productoBaseId: null, cantidad: 3 },
    ],
    detalles: [],
  });
  const r = resumenDeLaSiembra(plan);
  assert.deepEqual(r, { productos: 2, vincularonSolas: 2, sinVincular: 1, renglones: 3 });
});

test("CONTRAPRUEBA: sin agrupar por producto, el pedido tendría dos líneas del mismo", () => {
  // El número que este módulo evita, escrito como número.
  const porRenglon = [porUnidad(), porUnidad({ id: 111 })].length;
  const agrupado = loQueHayQueSembrar({
    filas: [porUnidad(), porUnidad({ id: 111 })],
    detalles: [],
  }).aCrear.length;
  assert.equal(porRenglon, 2);
  assert.equal(agrupado, 1);
});
