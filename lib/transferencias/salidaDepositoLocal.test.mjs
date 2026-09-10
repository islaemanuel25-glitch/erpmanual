// Candados de LA ESCALA CON LA QUE EL DEPÓSITO DESPACHA AL LOCAL.
//
// ── LA PREGUNTA QUE LA RECEPCIÓN TIENE DERECHO A HACER ─────────────────────
//
// El local que recibe pregunta UNA cosa: ¿cómo salió esto del depósito hacia
// acá? No pregunta —ni le sirve— cómo el depósito se lo compró al proveedor.
// Son dos relaciones comerciales distintas y el catálogo las guarda en campos
// distintos:
//
//   proveedor → depósito : `modoCompraProveedor`, y la presentación por vínculo
//                          en `ProductoCodigoProveedor`.
//   depósito  → local    : `unidad_medida`, `factor_pack`, `modo_envio` y
//                          `modoVentaDeposito`. Son los mismos con los que el POS
//                          del depósito arma la venta interna.
//
// ── LO QUE ESTABA MEZCLADO, MEDIDO EL 2026-09-10 ──────────────────────────
//
// 1. `modo_envio` es la política de salida y la recepción NO LA MIRABA NUNCA.
//    291 productos son `pack` o `cajon` con factor mayor que uno y
//    `modo_envio = SOLO_UNIDAD`: el depósito solo los despacha sueltos y la
//    recepción los ofrecía como "PACK xN". Otros 27 son `unidad` o `kg` con
//    `SOLO_BULTO`.
//
// 2. PIEZA dependía de `modoCompraProveedor` a través de `esFiambreFijo`. Un
//    fiambre de pieza fija comprado por bulto se habría leído como producto a
//    granel en la recepción — un dato de la compra cambiando lo que ve el local.
//
// ── Y LO QUE NO SE TOCA ───────────────────────────────────────────────────
//
// Una histórica sin snapshot NO se reinterpreta con la política de hoy. No
// sabemos cómo salió aquel día, y aplicarle `modo_envio` actual sería reescribir
// el pasado en silencio sobre 291 líneas. La reconstrucción se conserva y la
// única forma de cambiarla sigue siendo que alguien ADOPTE explícitamente.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/transferencias/salidaDepositoLocal.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRESENTACION,
  presentacionDeProducto,
  presentacionDeSalida,
  DIAGNOSTICO_SALIDA,
} from "@/lib/productos/presentacionDeProducto";
import { esFiambreFijo, elDepositoDespachaPorPieza } from "@/lib/conversiones/stock";
import { descriptorDeEnvio, rotuloConSueltas } from "@/lib/transferencias/presentacionEnvio";
import { snapshotDeLineas } from "@/lib/ventas-internas/snapshotDePresentacion";

/** Una línea comercial del POS, como la recibe el snapshot. */
const linea = (cantidad, modoVentaLinea, baseStock) => ({
  cantidad,
  modoVentaLinea,
  baseStock,
  consumoFisico: { cantidadStock: cantidad, productoLocalId: 1 },
  productoLocalId: 1,
});

// ═══════════════════════════════════════════════════════════════════════════
// LOS SIETE CASOS OBLIGATORIOS, SOBRE LO QUE LA PANTALLA MUESTRA
// ═══════════════════════════════════════════════════════════════════════════

test("A · UNIDAD · una salida de 6 unidades se lee «6 UNIDAD»", () => {
  const d = descriptorDeEnvio({
    presentacionEnvio: "UNIDAD", cantidadPresentada: 6, sueltasEnviadas: 0,
    factorPresentacion: null, cantidad: 6,
  });
  assert.equal(rotuloConSueltas(d), "6 UNIDAD");
});

test("B · PACK · 2 packs de 6 se leen «2 PACK x6», no «12 UNIDAD»", () => {
  const d = descriptorDeEnvio({
    presentacionEnvio: "PACK", cantidadPresentada: 2, sueltasEnviadas: 0,
    factorPresentacion: 6, cantidad: 12,
  });
  assert.equal(rotuloConSueltas(d), "2 PACK x6");
});

test("C · CAJÓN · 5 cajones de 8 conservan el cajón", () => {
  const d = descriptorDeEnvio({
    presentacionEnvio: "CAJON", cantidadPresentada: 5, sueltasEnviadas: 0,
    factorPresentacion: 8, cantidad: 40,
  });
  assert.equal(rotuloConSueltas(d), "5 CAJÓN x8");
});

test("D · MIXTO · 4 packs de 6 más 5 sueltas se conservan enteros", () => {
  // 29 unidades físicas de las que no se puede volver: 29/6 no es entero. Por
  // eso son dos números y no uno.
  const d = descriptorDeEnvio({
    presentacionEnvio: "PACK", cantidadPresentada: 4, sueltasEnviadas: 5,
    factorPresentacion: 6, cantidad: 29,
  });
  assert.equal(rotuloConSueltas(d), "4 PACK x6 + 5 unidades sueltas");
  assert.equal(d.cantidad, 4);
  assert.equal(d.sueltas, 5);
});

test("E · KG · 3,250 kg se leen en kilos", () => {
  const d = descriptorDeEnvio({
    presentacionEnvio: "KG", cantidadPresentada: 3.25, sueltasEnviadas: 0,
    factorPresentacion: null, cantidad: 3.25,
  });
  assert.equal(rotuloConSueltas(d), "3,25 KG");
});

test("F · PIEZA · 2 piezas se leen en piezas, no en kilos", () => {
  const d = descriptorDeEnvio({
    presentacionEnvio: "PIEZA", cantidadPresentada: 2, sueltasEnviadas: 0,
    factorPresentacion: null, pesoPiezaKg: 3.5, cantidad: 2,
  });
  assert.equal(rotuloConSueltas(d), "2 PIEZA");
  assert.equal(d.pesoPiezaKg, 3.5);
});

// ═══════════════════════════════════════════════════════════════════════════
// G · COMPRA ≠ SALIDA — EL CANDADO QUE NADIE PUEDE VOLVER A MEZCLAR
// ═══════════════════════════════════════════════════════════════════════════

test("G · LA COMPRA AL PROVEEDOR NO DECIDE LA PRESENTACIÓN DE LA RECEPCIÓN", () => {
  // El mismo producto, con la misma salida del depósito, comprado de las tres
  // formas posibles. La recepción tiene que ver siempre lo mismo.
  const salida = {
    unidadMedida: "pack",
    factorPack: 6,
    modoEnvio: "SOLO_BULTO",
    modoVentaDeposito: "PESO",
  };
  for (const compra of ["BULTO", "UNIDAD", null]) {
    const p = presentacionDeSalida({ ...salida, modoCompraProveedor: compra });
    assert.equal(p.presentacion, PRESENTACION.PACK, `comprado por ${compra}`);
    assert.equal(p.factor, 6, `comprado por ${compra}`);
  }
});

test("G · y tampoco puede convertir una PIEZA en un kilo", () => {
  // Es el caso concreto que estaba mal: `esFiambreFijo` exige
  // `modoCompraProveedor === "UNIDAD"`, así que un fiambre de pieza fija
  // comprado por bulto se leía como producto a granel en la recepción.
  const fiambre = { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5 };

  assert.equal(elDepositoDespachaPorPieza({ ...fiambre, modoCompraProveedor: "BULTO" }), true);
  assert.equal(elDepositoDespachaPorPieza({ ...fiambre, modoCompraProveedor: "UNIDAD" }), true);

  for (const compra of ["BULTO", "UNIDAD", null]) {
    const p = presentacionDeProducto({
      unidadMedida: "kg",
      modoVentaDeposito: "PIEZA",
      pesoReferenciaKg: 3.5,
      modoCompraProveedor: compra,
    });
    assert.equal(p.presentacion, PRESENTACION.PIEZA, `comprado por ${compra}`);
    assert.equal(p.pesoPiezaKg, 3.5, `comprado por ${compra}`);
  }
});

test("G · EL PREDICADO DEL STOCK NO CAMBIÓ DE VALOR", () => {
  // `esFiambreFijo` sigue gobernando la aritmética de fiambres y sigue exigiendo
  // la compra por unidad. Lo único que pasó es que su mitad de venta ahora vive
  // aparte para que la recepción pueda preguntar solo por ésa. Si esto cambia,
  // cambió el stock, que es lo que esta tanda tenía prohibido tocar.
  const base = { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5 };
  assert.equal(esFiambreFijo({ ...base, modoCompraProveedor: "UNIDAD" }), true);
  assert.equal(esFiambreFijo({ ...base, modoCompraProveedor: "BULTO" }), false);
  assert.equal(esFiambreFijo({ ...base, modoCompraProveedor: null }), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// `modo_envio` COMO POLÍTICA DE SALIDA
// ═══════════════════════════════════════════════════════════════════════════

test("SOLO_UNIDAD · un producto que agrupa se propone en UNIDAD, sin factor", () => {
  // 291 productos del catálogo. El depósito solo los despacha sueltos: ofrecer
  // "PACK x6" es ofrecer una escala que la operación no puede producir.
  const p = presentacionDeSalida({ unidadMedida: "pack", factorPack: 6, modoEnvio: "SOLO_UNIDAD" });
  assert.equal(p.presentacion, PRESENTACION.UNIDAD);
  assert.equal(p.factor, null);
  assert.equal(p.politica, "SOLO_UNIDAD");
});

test("SOLO_BULTO · agrupa solo cuando hay un bulto real que ofrecer", () => {
  const conFactor = presentacionDeSalida({ unidadMedida: "cajon", factorPack: 8, modoEnvio: "SOLO_BULTO" });
  assert.equal(conFactor.presentacion, PRESENTACION.CAJON);
  assert.equal(conFactor.factor, 8);
  assert.equal(conFactor.diagnostico, null);
});

test("SOLO_BULTO SOBRE ALGO QUE NO AGRUPA NO INVENTA UN BULTO", () => {
  // Los 27 casos medidos: `unidad` o `kg` con SOLO_BULTO. El catálogo dice que
  // solo sale en bulto y no dice de cuántos. Fabricar un factor sería inventar
  // el dato que falta, así que se conserva lo que sí se puede afirmar y se avisa.
  const p = presentacionDeSalida({ unidadMedida: "unidad", factorPack: 1, modoEnvio: "SOLO_BULTO" });
  assert.equal(p.presentacion, PRESENTACION.UNIDAD);
  assert.equal(p.factor, null);
  assert.equal(p.diagnostico, DIAGNOSTICO_SALIDA.SIN_BULTO_POSIBLE);

  const enKilos = presentacionDeSalida({ unidadMedida: "kg", modoEnvio: "SOLO_BULTO" });
  assert.equal(enKilos.presentacion, PRESENTACION.KG);
  assert.equal(enKilos.diagnostico, null, "el peso no tiene bulto que completar: no es un desacuerdo");
});

test("MIXTO · la política no alcanza para decidir y devuelve lo que el producto es", () => {
  const p = presentacionDeSalida({ unidadMedida: "pack", factorPack: 6, modoEnvio: "MIXTO" });
  assert.equal(p.presentacion, PRESENTACION.PACK);
  assert.equal(p.factor, 6);
});

test("ninguna política mueve a KG ni a PIEZA", () => {
  for (const modoEnvio of ["SOLO_UNIDAD", "SOLO_BULTO", "MIXTO", null]) {
    assert.equal(presentacionDeSalida({ unidadMedida: "kg", modoEnvio }).presentacion, PRESENTACION.KG);
    assert.equal(
      presentacionDeSalida({
        unidadMedida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5, modoEnvio,
      }).presentacion,
      PRESENTACION.PIEZA
    );
  }
});

test("la política de salida nunca inventa un factor que el catálogo no tiene", () => {
  for (const modoEnvio of ["SOLO_BULTO", "MIXTO", "SOLO_UNIDAD"]) {
    const p = presentacionDeSalida({ unidadMedida: "pack", factorPack: 1, modoEnvio });
    assert.equal(p.factor, null, modoEnvio);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// QUIÉN GANA: SNAPSHOT, DESPUÉS POLÍTICA, NUNCA COMPRA
// ═══════════════════════════════════════════════════════════════════════════

test("UNA TRANSFERENCIA NUEVA CONGELA LA SALIDA REAL, NO LA POLÍTICA", () => {
  // El POS ya sabe si la línea salió en packs o suelta: `modoVentaLinea`. Eso
  // es la operación, y la operación le gana a cualquier política del catálogo.
  const base = { unidad_medida: "pack", factorPack: 6, modoVentaDeposito: "PESO" };
  const s = snapshotDeLineas([linea(4, "MODO_PACK", base), linea(5, "UNIDAD_REMANENTE", base)]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PACK);
  assert.equal(s.cantidadPresentada, 4);
  assert.equal(s.sueltasEnviadas, 5);
  assert.equal(s.factorPresentacion, 6);
});

test("UN SNAPSHOT CONGELADO NO LO MUEVE NINGÚN CAMBIO POSTERIOR DEL CATÁLOGO", () => {
  // Cambiar `factor_pack`, `modo_envio` o lo que sea después NO puede cambiar
  // una recepción ya registrada: el snapshot es el hecho de aquella salida.
  const conSnapshot = {
    presentacionEnvio: "PACK", cantidadPresentada: 2, sueltasEnviadas: 0,
    factorPresentacion: 6, cantidad: 12,
    // Catálogo de HOY, que dice otra cosa. No tiene que ganar.
    unidadMedida: "cajon", factorPack: 24, modoEnvio: "SOLO_UNIDAD",
  };
  const d = descriptorDeEnvio(conSnapshot);
  assert.equal(d.presentacion, PRESENTACION.PACK);
  assert.equal(d.factor, 6);
  assert.equal(d.registrado, true);
  assert.equal(rotuloConSueltas(d), "2 PACK x6");
});

test("UNA HISTÓRICA SIN SNAPSHOT NO SE REINTERPRETA CON LA POLÍTICA DE HOY", () => {
  // Son las 291 líneas. No sabemos cómo salió aquel día, así que aplicarles
  // `modo_envio` de hoy sería reescribir el pasado en silencio. La
  // reconstrucción se conserva y solo cambia si alguien ADOPTA explícitamente.
  const historica = {
    cantidad: 12,
    unidadEnviada: "BULTO",
    unidadMedida: "pack",
    factorPack: 6,
    modoEnvio: "SOLO_UNIDAD",
  };
  const d = descriptorDeEnvio(historica);
  assert.equal(d.registrado, false, "sigue marcada como reconstrucción");
  assert.equal(d.presentacion, PRESENTACION.PACK, "la política de hoy no la tocó");
  assert.equal(d.factor, 6);
});

test("pero LA PROPUESTA DE ADOPCIÓN sí usa la política de salida de hoy", () => {
  // Ahí no se afirma nada sobre el pasado: se le ofrece al operador la escala en
  // que el depósito despacha HOY, y él decide.
  const p = presentacionDeSalida({ unidadMedida: "pack", factorPack: 6, modoEnvio: "SOLO_UNIDAD" });
  assert.equal(p.presentacion, PRESENTACION.UNIDAD, "se propone lo que el depósito puede despachar");
});
