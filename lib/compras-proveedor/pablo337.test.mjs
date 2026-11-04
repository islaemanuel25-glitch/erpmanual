// EL PAPEL DE MILAGROS PARA PABLO #337: SANTA JULIA, CHANDON Y EL "COINCIDE" FALSO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/pablo337.test.mjs
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// De la base de producción, el 2026-10-26, de solo lectura: el comprobante 36
// del pedido 337 y sus líneas de pedido.
//
//   · El papel (Emanuel, fila por fila): 30 · A665 · Santa Julia · $3.890 ·
//     $116.700; y 72 · A1051 · chandon precio x2 15400 · $7.700 · $554.400.
//   · El lector leyó esas dos filas BIEN (`LlamadaLector` 97). La de Santa
//     Julia quedó en 5 a $23.340 porque una persona corrigió la cantidad a mano
//     (`CorreccionManualRenglon` 1); eso no se pisa.
//   · Santa Julia Malbec: pack de 6 a $40.140 en el ERP, pedido 30 por unidad, y
//     el vínculo de Pablo confirmado a mano como "pack de 3".
//   · Chandon Delice: pack de 6, y la línea del pedido: 72 por unidad a $90.000.
//   · En las dos se había tocado "dejar el mío" y la tarjeta decía "✓ Coincide".
//   · El pedido 337 NACIÓ DE LA FACTURA (`nacidoDeFactura`).

import { test } from "node:test";
import assert from "node:assert/strict";

import { analizarPrecioDeLinea } from "./comprobante/precioDeLinea.js";
import { explicarVeredicto } from "./comprobante/unidadPorPrecio.js";
import { filasDeConciliacion } from "./comprobante/filasDeConciliacion.js";
import { renglonesDeLaTarjeta } from "./tarjetaDeRecepcion.js";
import {
  AVISO_ESCALA,
  ESTADO_LINEA,
  cuadraConElPapel,
  escalaSinDeducir,
  estadoDeLinea,
  hayDiferenciaDePrecio,
  motivoSinComparacion,
} from "./estadoDeLineaFacturada.js";

const SANTA_JULIA = { precio_costo: 40140, factor_pack: 6, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const CHANDON = { precio_costo: 90000, factor_pack: 6, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const DEJA_EL_MIO = (precioFacturado, precioPropio) => ({
  decision: "DEJA_EL_MIO", precioFacturado, precioPropio, costoMaestroObservado: precioPropio, decididaEn: "2026-10-26T10:48:51.510Z",
});

/** La fila como la arma la conciliación: el análisis de precio + la línea del pedido. */
function fila({ texto, cantidad, neto, importe, producto, unidadesGuardadas = null, detalle, decision }) {
  const linea = { orden: 1, textoCrudo: texto, cantidad, netoUnitario: neto, subtotalImpreso: importe, costoFinalRenglon: importe, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Pablo" }, unidadesGuardadas });
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 36, estado: "CARGADO", lineas: [{ ...linea, id: 1, pedidoDetalleId: detalle.id, productoLocalId: 1, pedidoDetalle: detalle, precio, unidad: precio.unidad, decisionPrecio: decision, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [detalle],
    // El pedido 337 nació de la factura: lo esperado es lo que dice el papel,
    // así que la cantidad "coincide" siempre y lo único que decide es el resto.
    nacidoDeFactura: true,
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

const DETALLE_SANTA_JULIA = { id: 3218, cantidad: 30, precioCosto: 40140, unidad: "UNIDAD", productoBaseId: 1792, factorPack: 6, cantidadRecibida: 5 };
const DETALLE_CHANDON = { id: 3216, cantidad: 72, precioCosto: 90000, unidad: "UNIDAD", productoBaseId: 163, factorPack: 6, cantidadRecibida: 72 };

test("SANTA JULIA COMO QUEDÓ (5 a $23.340): EL TOTAL ES EL DEL PAPEL Y NO DICE COINCIDE", () => {
  const f = fila({
    texto: "Santa Julia", cantidad: 5, neto: 23340, importe: 116700, producto: SANTA_JULIA, unidadesGuardadas: 3,
    detalle: DETALLE_SANTA_JULIA, decision: DEJA_EL_MIO(46680, 40140),
  });
  const r = renglonesDeLaTarjeta(f);
  assert.equal(r.total, 116700, "decía $233.400: 5 recibidos por $46.680");
  assert.equal(cuadraConElPapel(f), true, "2,5 bultos de 6 a $46.680 dan los $116.700 del papel");
  assert.equal(r.erp.texto, "−16,3 %");
  // Con 2,5 packs y −16,3 % nunca puede decir "Coincide", aunque se haya decidido.
  assert.notEqual(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
  // Y la hoja de Corregir lo dice simple, con un solo tamaño de pack.
  const e = explicarVeredicto({ veredicto: f.unidad, cantidad: 5, precioFinal: 23340, factorPack: 6, proveedor: "Pablo" });
  assert.equal(e.frase, "El papel dice 15 unidades. No completan packs de 6: cargá cuántas entraron.");
});

test("SANTA JULIA COMO LA LEYÓ EL LECTOR (30 a $3.890): FRENA, Y DICE QUE LO QUE NO CUADRA ES EL PRECIO", () => {
  const f = fila({
    texto: "Santa Julia", cantidad: 30, neto: 3890, importe: 116700, producto: SANTA_JULIA, unidadesGuardadas: 3,
    detalle: { ...DETALLE_SANTA_JULIA, cantidadRecibida: null }, decision: null,
  });
  assert.equal(renglonesDeLaTarjeta(f).total, 116700);
  assert.equal(escalaSinDeducir(f), true, "$3.890 contra el pack de 6 a $40.140: ninguna escala lo explica");
  // Hasta el 2026-10-26 decía "revisá la cantidad". Pero 30 × $3.890 cierra con
  // el importe: lo que no cuadra es el precio (Emanuel; `loQueNoCuadra`).
  // Sin "Fijate si es este producto" desde el 2026-10-29: la alerta es visual.
  assert.match(motivoSinComparacion(f), /^El papel cobra .* la unidad y vos la tenés a .* \(42 % menos\)\.$/);
  assert.notEqual(motivoSinComparacion(f), AVISO_ESCALA);
  assert.equal(hayDiferenciaDePrecio(f), false, "no propone costo");
});

test("CHANDON: $7.700 CONTRA $90.000 NO ES UN «+91,4 %» VERDE: FRENA Y NO PROPONE COSTO", () => {
  const f = fila({
    texto: "chandon precio x2 15400", cantidad: 72, neto: 7700, importe: 554400, producto: CHANDON,
    detalle: DETALLE_CHANDON, decision: DEJA_EL_MIO(7700, 90000),
  });
  const r = renglonesDeLaTarjeta(f);
  assert.equal(escalaSinDeducir(f), true);
  assert.equal(r.erp.pct, null, "ningún porcentaje absurdo como si fuera normal");
  assert.equal(r.erp.texto, null);
  assert.equal(motivoSinComparacion(f), AVISO_ESCALA);
  assert.equal(AVISO_ESCALA, "No se puede saber en qué viene: revisá la cantidad.");
  assert.equal(hayDiferenciaDePrecio(f), false, "un costo que salta así nunca puede entrar");
  assert.notEqual(estadoDeLinea(f), ESTADO_LINEA.COINCIDE, "dejar el mío no lo hace coincidir");
  assert.equal(r.total, 554400, "el total es el del papel");
});

test("CONTRAPRUEBA: UNA FILA QUE COINCIDE DE VERDAD SIGUE DICIENDO COINCIDE", () => {
  // Prófugo, del mismo papel: 24 a $2.550, 4 packs de 6 a $15.300 contra $15.600 (+1,9 %).
  const PROFUGO = { precio_costo: 15600, factor_pack: 6, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
  const f = fila({
    texto: "profugo", cantidad: 24, neto: 2550, importe: 61200, producto: PROFUGO,
    detalle: { id: 3219, cantidad: 4, precioCosto: 15600, unidad: "BULTO", productoBaseId: 1445, factorPack: 6, cantidadRecibida: null },
    decision: DEJA_EL_MIO(15300, 15600),
  });
  assert.equal(escalaSinDeducir(f), false);
  assert.equal(cuadraConElPapel(f), true);
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "+1,9 %");
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
});
