// EL DINERO DE UNA LÍNEA, EN LA MISMA ESCALA QUE LA PRESENTACIÓN QUE ROTULA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/valorizacionDelRemito.test.mjs
//
// ── EL DEFECTO QUE ESTOS CANDADOS CIERRAN ──────────────────────────────────
//
// La transferencia #198 de producción mostraba, para "Pancho 24 Als":
//
//     Enviado 6 PACK x24
//     Costo PACK x24 · $ 218,75
//     Total · $ 1.312,50
//
// Los tres renglones son falsos menos el primero. Un PACK x24 de ese producto
// cuesta **$5.250** —lo dice la venta 16836 que generó el remito, con
// `subtotal = 31500` para 6 packs— y el total de la línea es **$31.500**.
//
// ── LA CAUSA: DOS ESCALAS MULTIPLICADAS ENTRE SÍ ──────────────────────────
//
// La fila real tiene `cantidad = 144` —unidades físicas— y `recibido = 6`
// —packs—. Son dos columnas de la MISMA fila en dos escalas distintas, y eso
// pasó cuando llegó el snapshot: `escalaDeRecepcion` aprendió a leerlo y el
// camino del stock se actualizó, pero el camino del dinero siguió mirando
// `detalle.unidadEnviada` + `base.factor_pack` por su cuenta.
//
// Con `unidadEnviada = "UNIDAD"` el costo se normalizaba a la unidad
// —5250/24 = 218,75, que está bien— y después se multiplicaba por `recibido = 6`,
// que está en packs. 6 × 218,75 = 1.312,50: le faltan los 24 de un lado.
//
// ── Y LA DECISIÓN FUNCIONAL QUE SE FIJA ACÁ ───────────────────────────────
//
// La recepción muestra el VALOR DEL REMITO: lo que salió del depósito y quedó
// valorizado al enviar. Es inmutable durante el conteo. Que falte o sobre
// mercadería se informa por el flujo de diferencias, no cambiándole el importe
// al documento — un remito cuyo total se mueve mientras alguien cuenta no sirve
// para controlar nada.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  valorizarLineaDelRemito,
  valorizarDetalle,
} from "@/lib/transferencias/costoTransferencia";
import { PRESENTACION } from "@/lib/transferencias/presentacionEnvio";

/** El catálogo de Pancho 24 Als, tal como está en producción. */
const PANCHO = Object.freeze({
  unidad_medida: "pack",
  factor_pack: 24,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
});

/** Un cajón de 8, para el mismo caso con otro factor y otro vocabulario. */
const CAJON8 = Object.freeze({
  unidad_medida: "cajon",
  factor_pack: 8,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
});

const UNITARIO = Object.freeze({
  unidad_medida: "unidad",
  factor_pack: 1,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
});

const A_GRANEL = Object.freeze({
  unidad_medida: "kg",
  factor_pack: null,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
});

/** Fiambre de pieza fija: `unidad_medida` dice kg y se despacha por piezas. */
const FIAMBRE = Object.freeze({
  unidad_medida: "kg",
  factor_pack: null,
  modoVentaDeposito: "PIEZA",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 3.5,
  pesoEsFijo: false,
});

const DEPOSITO = { origenEsDeposito: true };

/**
 * LA FILA REAL DE PRODUCCIÓN, copiada tal cual.
 *
 * `TransferenciaDetalle` id 6698 de la transferencia #198. Los valores no están
 * inventados para que la cuenta cierre: son los que devolvió la base.
 */
const LINEA_198 = Object.freeze({
  cantidad: 144, // unidades FÍSICAS
  unidadEnviada: "UNIDAD",
  precioCosto: 5250, // el `precio_costo` del catálogo: por PACK
  recibido: 6, // packs — otra escala, en la misma fila
  recibidoUnidadesSueltas: 0,
  presentacionEnvio: "PACK",
  cantidadPresentada: 6,
  factorPresentacion: 24,
  sueltasEnviadas: 0,
  pesoPiezaKg: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CASO #198, QUE ES EL QUE SE VIO EN PRODUCCIÓN
// ═══════════════════════════════════════════════════════════════════════════

test("T198 ·LA LÍNEA REAL: PACK x24, costo 5.250, subtotal 31.500", () => {
  const v = valorizarLineaDelRemito(LINEA_198, PANCHO, DEPOSITO);

  assert.equal(v.presentacion, PRESENTACION.PACK);
  assert.equal(v.factor, 24);
  // El costo de LA PRESENTACIÓN QUE SE ROTULA, no el de la unidad.
  assert.equal(v.costoPresentacion, 5250, "la card rotula PACK x24 y mostraría el costo de una unidad");
  // El de la unidad física sigue estando, para las sueltas.
  assert.equal(v.costoUnitarioFisico, 218.75);
  assert.equal(v.cantidadPresentada, 6);
  assert.equal(v.unidadesFisicas, 144);
  assert.equal(v.subtotal, 31500, "el total de la línea no es el del remito");
});

test("T198 ·Y NO CAMBIA PORQUE YA SE HAYA CONTADO", () => {
  // Es la decisión funcional: la recepción muestra el valor del REMITO, que es
  // inmutable mientras se cuenta. Antes, cargar `recibido` lo llevaba a 1.312,50.
  const sinContar = valorizarLineaDelRemito(
    { ...LINEA_198, recibido: null, recibidoUnidadesSueltas: null },
    PANCHO,
    DEPOSITO
  );
  const contadoCompleto = valorizarLineaDelRemito(LINEA_198, PANCHO, DEPOSITO);
  const conFaltante = valorizarLineaDelRemito({ ...LINEA_198, recibido: 4 }, PANCHO, DEPOSITO);
  const conSobrante = valorizarLineaDelRemito({ ...LINEA_198, recibido: 9 }, PANCHO, DEPOSITO);
  const conSueltas = valorizarLineaDelRemito(
    { ...LINEA_198, recibido: 5, recibidoUnidadesSueltas: 7 },
    PANCHO,
    DEPOSITO
  );

  for (const [caso, v] of Object.entries({
    sinContar, contadoCompleto, conFaltante, conSobrante, conSueltas,
  })) {
    assert.equal(v.subtotal, 31500, `el remito cambió de valor al contar (${caso})`);
    assert.equal(v.costoPresentacion, 5250, `el costo cambió al contar (${caso})`);
  }
});

test("T198 ·el subtotal es exactamente el de la venta que generó el remito", () => {
  // `VentaDetalle` de la venta 16836: cantidad 6, precioCosto 5250,
  // subtotal 31500. Es la fuente independiente, y tiene que coincidir.
  const v = valorizarLineaDelRemito(LINEA_198, PANCHO, DEPOSITO);
  assert.equal(v.cantidadPresentada * v.costoPresentacion, 31500);
  assert.equal(v.subtotal, 31500);
});

// ═══════════════════════════════════════════════════════════════════════════
// LAS CINCO PRESENTACIONES, POR CONSTRUCCIÓN Y NO POR CASO
// ═══════════════════════════════════════════════════════════════════════════

test("CAJÓN x8 · el mismo caso con otro factor y otro vocabulario", () => {
  const v = valorizarLineaDelRemito(
    {
      cantidad: 40, unidadEnviada: "UNIDAD", precioCosto: 23333.33, recibido: 5,
      recibidoUnidadesSueltas: 0, presentacionEnvio: "CAJON", cantidadPresentada: 5,
      factorPresentacion: 8, sueltasEnviadas: 0,
    },
    CAJON8,
    DEPOSITO
  );
  assert.equal(v.presentacion, PRESENTACION.CAJON);
  assert.equal(v.factor, 8);
  assert.equal(v.costoPresentacion, 23333.33);
  assert.equal(v.unidadesFisicas, 40);
  assert.equal(round2(v.subtotal), 116666.65);
});

test("UNIDAD · el costo ya es el de la unidad y no se convierte nada", () => {
  const v = valorizarLineaDelRemito(
    {
      cantidad: 6, unidadEnviada: "UNIDAD", precioCosto: 3100, recibido: null,
      presentacionEnvio: "UNIDAD", cantidadPresentada: 6, factorPresentacion: null,
      sueltasEnviadas: 0,
    },
    UNITARIO,
    DEPOSITO
  );
  assert.equal(v.presentacion, PRESENTACION.UNIDAD);
  assert.equal(v.factor, null);
  assert.equal(v.costoPresentacion, 3100);
  assert.equal(v.subtotal, 18600);
});

test("KG · el costo es por kilo y la cantidad son kilos", () => {
  const v = valorizarLineaDelRemito(
    {
      cantidad: 3.25, unidadEnviada: "UNIDAD", precioCosto: 18000, recibido: null,
      presentacionEnvio: "KG", cantidadPresentada: 3.25, factorPresentacion: null,
      sueltasEnviadas: 0,
    },
    A_GRANEL,
    DEPOSITO
  );
  assert.equal(v.presentacion, PRESENTACION.KG);
  assert.equal(v.costoPresentacion, 18000);
  assert.equal(v.subtotal, 58500);
});

test("PIEZA · el costo de una pieza sale del peso congelado, no del kilo", () => {
  // El catálogo guarda el costo POR KILO; una pieza de 3,5 kg cuesta 3,5 veces
  // eso. Sin la conversión, la card diría el precio de un kilo bajo el rótulo
  // "PIEZA".
  const v = valorizarLineaDelRemito(
    {
      cantidad: 2, unidadEnviada: "UNIDAD", precioCosto: 10000, recibido: null,
      presentacionEnvio: "PIEZA", cantidadPresentada: 2, factorPresentacion: null,
      sueltasEnviadas: 0, pesoPiezaKg: 3.5,
    },
    FIAMBRE,
    DEPOSITO
  );
  assert.equal(v.presentacion, PRESENTACION.PIEZA);
  assert.equal(v.costoPresentacion, 35000, "una pieza de 3,5 kg a 10.000 el kilo");
  assert.equal(v.subtotal, 70000);
});

test("PACK MIXTO · los bultos completos y las sueltas, cada uno en su escala", () => {
  // 4 packs de 6 más 5 sueltas: 29 unidades. Las sueltas valen por unidad, no
  // por pack, y no se pueden perder ni contar como packs.
  const v = valorizarLineaDelRemito(
    {
      cantidad: 29, unidadEnviada: "UNIDAD", precioCosto: 600, recibido: null,
      presentacionEnvio: "PACK", cantidadPresentada: 4, factorPresentacion: 6,
      sueltasEnviadas: 5,
    },
    { ...UNITARIO, unidad_medida: "pack", factor_pack: 6 },
    DEPOSITO
  );
  assert.equal(v.costoPresentacion, 600, "el costo del pack");
  assert.equal(v.costoUnitarioFisico, 100, "600 / 6");
  assert.equal(v.unidadesFisicas, 29, "4 × 6 + 5");
  assert.equal(v.subtotal, 2900, "29 × 100, y no 4 × 600 que perdería las sueltas");
});

// ═══════════════════════════════════════════════════════════════════════════
// LAS LÍNEAS HISTÓRICAS NO SE REINTERPRETAN
// ═══════════════════════════════════════════════════════════════════════════

test("HISTÓRICA sin snapshot, despachada suelta: se valoriza como antes", () => {
  // 1.665 líneas de producción tienen esta forma. Ahí `recibido` SÍ está en la
  // misma escala que `cantidad` —las dos físicas— y el cálculo de siempre es el
  // correcto. Reinterpretarlas con la semántica nueva las rompería.
  const v = valorizarLineaDelRemito(
    {
      cantidad: 144, unidadEnviada: "UNIDAD", precioCosto: 5250, recibido: 140,
      recibidoUnidadesSueltas: 0, presentacionEnvio: null,
    },
    PANCHO,
    DEPOSITO
  );
  assert.equal(v.registrado, false, "una línea sin snapshot no puede decir que lo tiene");
  assert.equal(v.presentacion, PRESENTACION.UNIDAD, "la reconstrucción no inventa un pack");
  assert.equal(v.costoPresentacion, 218.75);
  assert.equal(v.unidadesFisicas, 144);
  assert.equal(v.subtotal, 31500);
});

test("HISTÓRICA sin snapshot, despachada por BULTO: la cantidad ya está en bultos", () => {
  const v = valorizarLineaDelRemito(
    {
      cantidad: 3, unidadEnviada: "BULTO", precioCosto: 23500, recibido: 3,
      recibidoUnidadesSueltas: 0, presentacionEnvio: null,
    },
    { ...PANCHO, factor_pack: 24 },
    DEPOSITO
  );
  assert.equal(v.registrado, false);
  assert.equal(v.presentacion, PRESENTACION.PACK);
  assert.equal(v.factor, 24);
  assert.equal(v.costoPresentacion, 23500, "el costo del bulto, sin dividir ni multiplicar");
  assert.equal(v.unidadesFisicas, 72);
  assert.equal(v.subtotal, 70500, "3 × 23.500");
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE `valorizarDetalle` SIGUE HACIENDO, PARA NO ROMPER A NADIE
// ═══════════════════════════════════════════════════════════════════════════

test("valorizarDetalle en modo ENVIADA coincide con el remito", () => {
  // Es lo que usa el PDF de envío. Tiene que dar el mismo número que la card.
  const v = valorizarDetalle(LINEA_198, PANCHO, { ...DEPOSITO, cantidadModo: "ENVIADA" });
  assert.equal(v.subtotal, 31500);
});

test("valorizarDetalle en modo VALORIZAR mide lo RECIBIDO, y ahora en la escala correcta", () => {
  // Ese modo es otro concepto y sigue existiendo: lo usan el PDF de recepción y
  // los agregados por período. Lo que se corrigió es la escala, no el concepto.
  // 6 packs recibidos de 6 enviados: el valor recibido coincide con el remito.
  const completo = valorizarDetalle(LINEA_198, PANCHO, DEPOSITO);
  assert.equal(completo.subtotal, 31500);

  // 4 de 6: dos packs menos.
  const faltan = valorizarDetalle({ ...LINEA_198, recibido: 4 }, PANCHO, DEPOSITO);
  assert.equal(faltan.subtotal, 21000, "4 × 5.250");

  // Y las sueltas cuentan: 5 packs + 7 sueltas son 127 unidades.
  const mixto = valorizarDetalle(
    { ...LINEA_198, recibido: 5, recibidoUnidadesSueltas: 7 },
    PANCHO,
    DEPOSITO
  );
  assert.equal(mixto.subtotal, 127 * 218.75);
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
