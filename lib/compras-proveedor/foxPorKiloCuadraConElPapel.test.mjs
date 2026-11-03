// EL PEDIDO DE SALAMINES FOX: LA CUENTA DE UN PRODUCTO POR KILO VA CON KILOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/foxPorKiloCuadraConElPapel.test.mjs
//
// Producción, 2026-11-03, "Recibir pedido": los tres renglones de Fox decían
// "La cantidad y el precio no dan el importe del papel" sobre cuentas que
// cierran. La tarjeta muestra "6 u · 4 kg" y "$18.809,21 / kg": `cuadraConElPapel`
// multiplicaba las 6 PIEZAS por el precio del KILO.
//
// La forma de la fila es la de `armarFila` (`comprobante/filasDeConciliacion.js`):
// `cantidad` es lo que el papel dice en piezas, `peso` los kilos impresos,
// `porKilo` lo decide el producto y `cantidadEnKilos` es false porque el papel
// trae columna de kilos aparte (no es el fiambre de Das, donde la cantidad
// MISMA son kilos). Cantidades, kilos, precios e importes de Fino y Grueso son
// los de la pantalla. Del Salame Fox el informe no trae el importe: se usa
// 4,32 × 16.702,84 redondeado al centavo, que es el caso que la regla cubre.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVISO_NO_DA_EL_PAPEL,
  ESTADO_LINEA,
  cuadraConElPapel,
  estadoDeLinea,
  motivoSinComparacion,
  TOLERANCIA_POR_UNIDAD,
  TOLERANCIA_DEL_IMPORTE,
} from "./estadoDeLineaFacturada.js";

const renglon = ({ piezas, kilos, precioKg, importe }) => ({
  lineaId: 1,
  cantidad: piezas,
  peso: kilos,
  cantidadEnKilos: false,
  porKilo: true,
  faltanKilos: false,
  costoFactura: precioKg,
  importeDelPapel: importe,
  cargoDelRenglon: 0,
  unidad: null,
  productoLocalId: 10,
  pedidoDetalleId: 20,
  cantidadPedida: piezas,
  unidadPedido: "UNIDAD",
  factorPack: null,
  // El mismo precio en el pedido: lo único que se mira acá es la cuenta.
  costoCatalogo: precioKg,
});

const PICADO_FINO = renglon({ piezas: 6, kilos: 4, precioKg: 18809.21, importe: 75236.83 });
const PICADO_GRUESO = renglon({ piezas: 6, kilos: 3.76, precioKg: 18809.21, importe: 70722.62 });
const SALAME = renglon({ piezas: 2, kilos: 4.32, precioKg: 16702.84, importe: 72156.27 });

for (const [nombre, f] of [
  ["Salamin Fox Picado Fino (4 × 18.809,21 = 75.236,84 contra 75.236,83)", PICADO_FINO],
  ["Salamin Fox Picado Grueso (3,76 × 18.809,21 = 70.722,63 contra 70.722,62)", PICADO_GRUESO],
  ["Salame Fox (4,32 × 16.702,84 contra 72.156,27)", SALAME],
]) {
  test(`CIERRA, SIN ALERTA: ${nombre}`, () => {
    assert.equal(cuadraConElPapel(f), true);
    assert.notEqual(motivoSinComparacion(f), AVISO_NO_DA_EL_PAPEL);
    assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
  });
}

test("CONTRAPRUEBA: CON LAS PIEZAS EN VEZ DE LOS KILOS, LA MISMA FILA ALERTA", () => {
  // Es la cuenta que hacía la tarjeta: 6 × 18.809,21 = 112.855,26.
  const comoSiFueraPorPieza = { ...PICADO_FINO, porKilo: false };
  assert.equal(cuadraConElPapel(comoSiFueraPorPieza), false);
});

test("UNA DIFERENCIA REAL SIGUE ALERTANDO", () => {
  // Tres pesos de más sobre 4 kg: fuera de 4 × 0,005 + 0,01 = 0,03.
  const f = { ...PICADO_FINO, importeDelPapel: 75240 };
  assert.equal(cuadraConElPapel(f), false);
  assert.equal(motivoSinComparacion(f), AVISO_NO_DA_EL_PAPEL);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
});

test("LA TOLERANCIA ES CANTIDAD × 0,005 + 0,01, Y EL BORDE ES ESE", () => {
  assert.equal(TOLERANCIA_POR_UNIDAD, 0.005);
  assert.equal(TOLERANCIA_DEL_IMPORTE, 0.01);
  // 4 kg → 0,03. A 0,03 cierra; a 0,04 no.
  assert.equal(cuadraConElPapel({ ...PICADO_FINO, importeDelPapel: 75236.81 }), true);
  assert.equal(cuadraConElPapel({ ...PICADO_FINO, importeDelPapel: 75236.80 }), false);
});

test("POR KILO SIN LOS KILOS DEL PAPEL: NO HAY CON QUÉ CUADRAR", () => {
  assert.equal(cuadraConElPapel({ ...PICADO_FINO, peso: null, faltanKilos: true }), null);
});
