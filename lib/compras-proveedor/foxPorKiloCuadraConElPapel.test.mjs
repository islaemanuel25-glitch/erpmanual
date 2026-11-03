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
  // La tolerancia de este renglón es un milésimo del importe, unos $75: tres
  // pesos de diferencia cierran. $163,16 de más (papel $75.400) la superan.
  const f = { ...PICADO_FINO, importeDelPapel: 75400 };
  assert.equal(cuadraConElPapel(f), false);
  assert.equal(motivoSinComparacion(f), AVISO_NO_DA_EL_PAPEL);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
});

test("LA TOLERANCIA ES UN PESO O UN MILÉSIMO DEL IMPORTE, LA MAYOR, Y EL BORDE ES ESE", () => {
  // Milésimo: 4 × 18.809,21 = 75.236,84. Con papel $75.161,68 la diferencia es
  // $75,16 y la tolerancia $75,16168: cierra. Un centavo menos, ya no.
  assert.equal(cuadraConElPapel({ ...PICADO_FINO, importeDelPapel: 75161.68 }), true);
  assert.equal(cuadraConElPapel({ ...PICADO_FINO, importeDelPapel: 75161.67 }), false);
  // Peso: 1 kg a $500 contra un papel de $499, la diferencia es justo $1.
  const chico = renglon({ piezas: 1, kilos: 1, precioKg: 500, importe: 499 });
  assert.equal(cuadraConElPapel(chico), true);
  assert.equal(cuadraConElPapel({ ...chico, importeDelPapel: 498.99 }), false);
});

test("POR KILO SIN LOS KILOS DEL PAPEL: NO HAY CON QUÉ CUADRAR", () => {
  assert.equal(cuadraConElPapel({ ...PICADO_FINO, peso: null, faltanKilos: true }), null);
});
