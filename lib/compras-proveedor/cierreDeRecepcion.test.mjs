// EL CIERRE NO PUEDE RECIBIR LO QUE NADIE VIO.
//
// ── EL DAÑO, MEDIDO SOBRE PRODUCCIÓN ──────────────────────────────────────
//
// El pedido 232 se cerró con 24 líneas y las 24 entraron al stock con la
// cantidad PEDIDA. Nueve no las trajo ningún comprobante y metieron 620
// unidades valorizadas en $1.263.705,60 que nadie vio llegar. El servidor
// completaba lo que la pantalla no mandaba con `det.cantidad`.
//
// Los fixtures de acá son esas líneas reales, con los números medidos.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LLEGADA,
  hayQueAvisar,
  recibidosDeLasHuerfanas,
  recibidosDelCierre,
  resumenDelCierre,
  textoDeLoQueQueda,
} from "@/lib/compras-proveedor/cierreDeRecepcion";

/** Tres de las nueve que ningún comprobante trajo, con sus números reales. */
const HUERFANAS = [
  { pedidoDetalleId: 2560, producto: "Lucky 10 mentolado", cantidadPedida: 3, costoCatalogo: 35035.2 },
  { pedidoDetalleId: 2573, producto: "Milenio uva", cantidadPedida: 10, costoCatalogo: 18300 },
  { pedidoDetalleId: 2578, producto: "Liverpool rojo", cantidadPedida: 25, costoCatalogo: 13200 },
];

/** Dos renglones del papel que van a la MISMA línea del pedido: 120 y 121. */
const FILA_120 = {
  lineaId: 120,
  producto: "Marlboro 20 Crafted Box",
  productoLocalId: 6100,
  pedidoDetalleId: 2565,
  cantidad: 2,
  cantidadPedida: 4,
  costoFactura: 40500,
  costoCatalogo: 40500,
  revisada: true,
};
const FILA_121 = { ...FILA_120, lineaId: 121, revisada: false };

test("SIN RESPUESTA, UNA LÍNEA QUE NADIE VIO ENTRA EN CERO", () => {
  // Es la regla entera en una afirmación: el default no inventa mercadería.
  const r = recibidosDeLasHuerfanas({ sinComprobante: HUERFANAS, llegadas: {} });
  assert.deepEqual(r, { 2560: 0, 2573: 0, 2578: 0 });
});

test("la que se dice que llegó entra con lo PEDIDO, que es lo único que se sabe", () => {
  const r = recibidosDeLasHuerfanas({
    sinComprobante: HUERFANAS,
    llegadas: { 2560: LLEGADA.LLEGO, 2573: LLEGADA.NO_LLEGO },
  });
  assert.equal(r[2560], 3, "llegó sin papel: entra lo pedido");
  assert.equal(r[2573], 0, "dijo que no llegó");
  assert.equal(r[2578], 0, "no se contestó: no entra");
});

test("el resumen cuenta lo que queda a medias, y no lo esconde", () => {
  const r = resumenDelCierre({
    filas: [FILA_120, FILA_121],
    sinComprobante: HUERFANAS,
    llegadas: { 2560: LLEGADA.LLEGO },
  });
  assert.equal(r.renglones, 2);
  // LOS DOS RENGLONES SON UN SOLO PRODUCTO, y el texto lo dice así: la 120 y la
  // 121 comparten `productoLocalId`. Con el conteo por renglón, la hoja de
  // cierre diría "de los 2 productos del papel" sobre uno solo.
  assert.equal(r.productos, 1);
  assert.equal(r.sinRevisar, 1, "la 121 no la miró nadie");
  assert.equal(r.sinComprobante, 3);
  assert.equal(r.llegaron, 1);
  assert.equal(r.noLlegaron, 2);
  assert.equal(r.unidadesQueEntran, 3);
  assert.equal(hayQueAvisar(r), true);
  assert.match(textoDeLoQueQueda(r), /1 sin mirar/);
  assert.match(
    textoDeLoQueQueda(r),
    /^Del único producto del papel/,
    "el texto habla de productos, y el número es el de productos"
  );
});

test("sin nada a medias, no hay frase que inventar", () => {
  const r = resumenDelCierre({ filas: [FILA_120], sinComprobante: [] });
  assert.equal(r.sinRevisar, 0);
  assert.equal(textoDeLoQueQueda(r), null);
  assert.equal(hayQueAvisar(r), false);
});

// ── LO QUE SE LE MANDA AL SERVIDOR ────────────────────────────────────────

test("DOS RENGLONES A LA MISMA LÍNEA DEL PEDIDO SE SUMAN, no se pisan", () => {
  // Las 120 y 121 traen 2 bultos cada una del detalle 2565. Pisar en vez de
  // sumar recibiría la mitad de lo que el papel declara.
  const r = recibidosDelCierre({ filas: [FILA_120, FILA_121], sinComprobante: [] });
  assert.equal(r[2565], 4);
});

test("LO CONTADO POR UNA PERSONA PISA LO QUE DICE EL PAPEL", () => {
  // Alguien contó 3 donde el papel declara 4: manda quien miró la mercadería.
  const r = recibidosDelCierre({
    filas: [FILA_120, FILA_121],
    sinComprobante: [],
    contados: { 2565: 3 },
  });
  assert.equal(r[2565], 3);
});

test("el mapa que se manda tiene TODAS las líneas, y las huérfanas en cero", () => {
  const r = recibidosDelCierre({
    filas: [FILA_120],
    sinComprobante: HUERFANAS,
    llegadas: { 2578: LLEGADA.LLEGO },
  });
  assert.deepEqual(r, { 2565: 2, 2560: 0, 2573: 0, 2578: 25 });
});

test("CONTRAPRUEBA: con el criterio viejo, las nueve entraban con lo pedido", () => {
  // El servidor hacía `recibidos[det.id] ?? det.cantidad`. Reconstruido sobre
  // las tres líneas reales, eso son 38 bultos que nadie vio; con la regla nueva
  // y sin respuesta, cero. Sin esta comparación, el candado de arriba no dice
  // cuánto cambió.
  const viejo = HUERFANAS.reduce((a, d) => a + Number(d.cantidadPedida), 0);
  const nuevo = Object.values(recibidosDeLasHuerfanas({ sinComprobante: HUERFANAS, llegadas: {} }))
    .reduce((a, n) => a + n, 0);
  assert.equal(viejo, 38);
  assert.equal(nuevo, 0);
});
