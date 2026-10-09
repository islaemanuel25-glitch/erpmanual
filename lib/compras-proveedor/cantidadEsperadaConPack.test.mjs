// LO ESPERADO PASA POR LA MISMA CONVERSIÓN DE PACK QUE LO QUE ENTRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/cantidadEsperadaConPack.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN ────────────────────────────────────────────────
//
// Recepción de DYSSA #253, "llegó sin pedido · nació de una factura", después
// del PR #155. La hoja del Gancia decía bien "8 packs = 2 bultos de 24 · Entra
// al stock 48 unidades", y aun así pintaba los campos en rojo y pedía "Motivo
// de la diferencia". El Pronto, lo mismo con 1 bulto.
//
// La causa: el pedido se sembró ANTES de que la deducción supiera leer el pack,
// así que su línea quedó con la cantidad cruda del papel —8, en UNIDAD—. La
// hoja comparaba esas 8 latas contra las 48 que entran, y la tarjeta comparaba
// 2 bultos contra 8 sin mirar la unidad: dos cuentas de lo esperado, y ninguna
// pasaba por la conversión.
//
// La fila se arma con las MISMAS funciones que la conciliación —`aplanarDetalles`
// y `filasDeConciliacion`— sobre el análisis de la boleta real, y la línea del
// pedido tiene la forma con que quedó en la base: cantidad 8, unidad UNIDAD.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizarLectura } from "@/lib/compras-proveedor/comprobante/lector/contrato";
import { pasarPorLaPuerta } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import { repartoDelPie } from "@/lib/compras-proveedor/comprobante/repartoDelPie";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { aplanarDetalles } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  ESTADO_LINEA,
  diferenciaDeCantidad,
  estadoDeLinea,
  unidadesFisicasDeLaFactura,
  unidadesFisicasEsperadas,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { cantidadParaElPedido, loQueHayQueSembrar } from "@/lib/compras-proveedor/pedidoDesdeFactura";

const CRUDA = JSON.parse(
  fs.readFileSync(new URL("./comprobante/boletaDyssa.fixture.json", import.meta.url), "utf8")
);
const SQL = fs.readFileSync(
  new URL("../../prisma/migrations/20261008120000_receta_dyssa_iva_por_renglon/migration.sql", import.meta.url),
  "utf8"
);
const RECETA_DYSSA = {
  ivaPorLinea: true, alicuotaIvaPct: 21, tieneImpuestoInterno: true, ivaIncluyeInternoEnLaBase: false,
  percepciones: JSON.parse(SQL.match(/'(\[\{"nombre".*?\}\])'::jsonb/)[1]),
  percepcionesEnCosto: true, facturaPor: "UNIDAD",
};

/** La boleta como queda guardada, con el mismo mapeo de columnas que la ruta de leer. */
function boletaGuardada() {
  const lectura = normalizarLectura(CRUDA);
  const r = pasarPorLaPuerta({ lectura, receta: RECETA_DYSSA });
  return {
    ...r.aGuardar,
    id: 253,
    proveedor: { id: 1, nombre: "Dyssa" },
    lineas: lectura.lineas.map((l, i) => ({
      id: 1000 + i, orden: i + 1, textoCrudo: l.descripcion, codigoProveedor: l.codigoProveedor,
      cantidad: l.cantidad, netoUnitario: l.netoUnitario, subtotalImpreso: l.subtotalImpreso,
      internoUnitario: l.internoUnitario, bonificacionPct: l.bonificacion ?? null, ivaPct: l.alicuotaIva ?? null,
    })),
  };
}

const PLANCHA = (id, costo) => ({ id, nombre: `PLANCHA ${id}`, factor_pack: 24, precio_costo: costo, unidad_medida: "pack" });

/**
 * La fila de la conciliación de un renglón, contra una línea del pedido con la
 * forma que tiene en la base.
 */
function filaDe({ orden, producto, detalle, nacidoDeFactura }) {
  const c = boletaGuardada();
  const l = c.lineas.find((x) => x.orden === orden);
  const a = analizarPrecioDeLinea({
    linea: l, producto, receta: c.recetaUsada, proveedor: c.proveedor, percepcionDeLaLinea: repartoDelPie(c).get(orden),
  });
  const [plano] = aplanarDetalles([
    { id: 77, precioCosto: detalle.precioCosto, cantidad: detalle.cantidad, unidad: detalle.unidad,
      producto: { baseId: producto.id, base: { ...producto } } },
  ]);
  const { grupos } = filasDeConciliacion({
    comprobantes: [{ ...c, lineas: [{ ...l, productoLocalId: 5, productoBaseId: producto.id, pedidoDetalleId: 77,
      pedidoDetalle: plano, unidad: a.unidad, precio: { precioAEscribir: a.precioAEscribir, precioFinal: a.precioFinal } }] }],
    detalles: [plano],
    nacidoDeFactura,
  });
  return grupos[0].filas[0];
}

/** La pregunta de la hoja, con su forma: piezas contadas contra lo esperado. */
const pideMotivo = (fila, { bultos, sueltas = "" }) =>
  unidadesFisicasEsperadas(fila) !== (Number(bultos) || 0) * Number(fila.factorPack) + (Number(sueltas) || 0);

// La línea del pedido de la #253 tal como quedó: la cantidad cruda del papel, en UNIDAD.
const GANCIA_253 = { orden: 5, producto: PLANCHA(70, 48000), detalle: { cantidad: 8, unidad: "UNIDAD", precioCosto: 2000 }, nacidoDeFactura: true };
const PRONTO_253 = { orden: 4, producto: PLANCHA(71, 52000), detalle: { cantidad: 4, unidad: "UNIDAD", precioCosto: 2166.67 }, nacidoDeFactura: true };

test("LA #253 TAL COMO QUEDÓ: GANCIA, 8 packs = 2 bultos = 48 latas, sin motivo", () => {
  const fila = filaDe(GANCIA_253);
  assert.equal(fila.nacidoDeFactura, true);
  assert.equal(unidadesFisicasDeLaFactura(fila), 48);
  assert.equal(unidadesFisicasEsperadas(fila), 48, "lo esperado es el papel convertido, no las 8 de la línea");
  assert.equal(pideMotivo(fila, { bultos: 2, sueltas: "" }), false, "Sueltas vacío es cero");
  assert.equal(diferenciaDeCantidad(fila), 0);
  assert.notEqual(estadoDeLinea(fila), ESTADO_LINEA.SOBRA);
  assert.notEqual(estadoDeLinea(fila), ESTADO_LINEA.FALTA);
});

test("LA #253: PRONTO, 4 packs = 1 bulto = 24 latas, sin motivo", () => {
  const fila = filaDe(PRONTO_253);
  assert.equal(unidadesFisicasEsperadas(fila), 24);
  assert.equal(pideMotivo(fila, { bultos: 1 }), false);
  assert.equal(diferenciaDeCantidad(fila), 0);
});

test("GANCIA CON 1 BULTO CARGADO SÍ PIDE MOTIVO", () => {
  const fila = filaDe(GANCIA_253);
  assert.equal(pideMotivo(fila, { bultos: 1 }), true, "llegaron 24 de 48");
});

test("CONTRAPRUEBA: la cuenta vieja de la hoja pedía motivo sobre la #253", () => {
  // Lo pedido por el factor del pedido, que es lo que hacía la hoja: 8 en
  // UNIDAD son 8 latas, contra las 48 que entran.
  const fila = filaDe(GANCIA_253);
  const vieja = Number(fila.cantidadPedida) * (fila.unidadPedido === "BULTO" ? 24 : 1);
  assert.equal(vieja, 8);
  assert.notEqual(vieja, 2 * 24);
});

test("UN PEDIDO QUE NACE DE UNA FACTURA CON PACKS GUARDA LA CANTIDAD CONVERTIDA", () => {
  const fila = filaDe({ ...GANCIA_253 });
  assert.deepEqual(cantidadParaElPedido(fila), { cantidad: 2, unidad: "BULTO" });
  const { aCrear } = loQueHayQueSembrar({ filas: [{ ...fila, id: 1, productoBaseId: 70 }] });
  assert.equal(aCrear[0].cantidad, 2);
  assert.equal(aCrear[0].unidad, "BULTO");
});

test("UN PRODUCTO SIN CONVERSIÓN DE PACK SIGUE IGUAL QUE HOY", () => {
  // El Sussex de la misma boleta, contra un producto que se costea por unidad
  // sin bulto, en un pedido de una persona de 30 unidades.
  const suelto = { id: 72, nombre: "SUSSEX", factor_pack: 1, precio_costo: 1700, unidad_medida: "unidad" };
  const igual = filaDe({ orden: 2, producto: suelto, detalle: { cantidad: 30, unidad: "UNIDAD", precioCosto: 1700 }, nacidoDeFactura: false });
  assert.equal(unidadesFisicasEsperadas(igual), 30);
  assert.equal(diferenciaDeCantidad(igual), 0);
  assert.equal(pideMotivo(igual, { bultos: 30 }), false);
  // Y un pedido normal que pidió 40: faltan 10, como siempre.
  const falta = filaDe({ orden: 2, producto: suelto, detalle: { cantidad: 40, unidad: "UNIDAD", precioCosto: 1700 }, nacidoDeFactura: false });
  assert.equal(diferenciaDeCantidad(falta), 10);
  assert.equal(estadoDeLinea(falta), ESTADO_LINEA.FALTA);
  assert.equal(pideMotivo(falta, { bultos: 30 }), true);
});

test("UN PEDIDO NORMAL EN BULTOS COMPARA EN BULTOS, COMO SIEMPRE", () => {
  // El Amargo: 36 botellas = 3 bultos de 12, y una persona pidió 3 bultos.
  const amargo = { id: 73, nombre: "AMARGO", factor_pack: 12, precio_costo: 47000, unidad_medida: "pack" };
  const fila = filaDe({ orden: 1, producto: amargo, detalle: { cantidad: 3, unidad: "BULTO", precioCosto: 47000 }, nacidoDeFactura: false });
  assert.equal(unidadesFisicasEsperadas(fila), 36);
  assert.equal(diferenciaDeCantidad(fila), 0);
  const menos = filaDe({ orden: 1, producto: amargo, detalle: { cantidad: 4, unidad: "BULTO", precioCosto: 47000 }, nacidoDeFactura: false });
  assert.equal(diferenciaDeCantidad(menos), 1, "falta 1 bulto");
});
