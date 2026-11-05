// LA UNIDAD DEL PAPEL Y LA UNIDAD DEL PEDIDO SON DOS COSAS.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// De una importación real:
//
//   papel: cantidad 10, precio $5.050, total del renglón $50.500
//   ERP:   bulto x10
//
// El sistema interpretaba "10 bultos" y, al tocar el selector para pasarlo a
// unidades, hacía 10 × 10 = 100 unidades. Esa conversión sería correcta SI
// realmente fueran 10 bultos. No lo son, y la prueba está en el propio papel:
// 10 × 5.050 = 50.500.
//
// El defecto de fondo era que un solo selector servía para dos preguntas
// distintas: qué significa la cantidad del papel, y cómo se guarda el pedido.
//
// Datos sintéticos que reproducen esa aritmética.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ORIGEN_UNIDAD_PAPEL,
  cantidadBaseEnUnidades,
  preguntaDeUnidad,
  representarPedido,
  resolverUnidadDelPapel,
} from "./unidadDelPapel.js";
// LA EVIDENCIA POR PRECIO ES LA DE LA REGLA ÚNICA DE UNIDADES desde la tanda 3
// (2026-11-05): `escalaDelPrecio`, el decisor de la recepción con su umbral
// único. Hasta ahí vivía en `toleranciaEscala.js`, con un 40 % propio y
// configurable, que se borró. Estos candados afirman cómo se comporta la
// PRIORIDAD de este archivo cuando la evidencia dice tal cosa.
import { escalaDelPrecio } from "../../unidades/reglaDeUnidades.js";

// El renglón del caso, y el producto contra el que se lee.
const PAPEL = Object.freeze({ cantidad: 10, precio: 5050, subtotal: 50500 });
const ERP = Object.freeze({ costoBulto: 50500 });
// La ficha del producto: un pack de 10. Hasta la tanda 3 el bulto viajaba como
// un número suelto que cada llamador sacaba a mano de `factor_pack`.
const FICHA = Object.freeze({ factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" });

// ── LAS DOS REPRESENTACIONES VÁLIDAS ──────────────────────────────────────

test("PAPEL EN UNIDADES: 10 × $5.050 = $50.500", () => {
  const base = cantidadBaseEnUnidades({
    cantidadPapel: PAPEL.cantidad,
    unidadPapel: "UNIDAD",
    base: FICHA,
  });
  assert.equal(base, 10);

  const enUnidad = representarPedido({
    cantidadBaseUnidades: base,
    subtotalPapel: PAPEL.subtotal,
    unidadPedido: "UNIDAD",
    base: FICHA,
  });
  assert.deepEqual(
    { c: enUnidad.cantidad, u: enUnidad.unidad, p: enUnidad.precio, s: enUnidad.subtotal },
    { c: 10, u: "UNIDAD", p: 5050, s: 50500 }
  );
});

test("PEDIDO EN BULTOS: 1 × $50.500 = $50.500", () => {
  const base = cantidadBaseEnUnidades({
    cantidadPapel: PAPEL.cantidad,
    unidadPapel: "UNIDAD",
    base: FICHA,
  });
  const enBulto = representarPedido({
    cantidadBaseUnidades: base,
    subtotalPapel: PAPEL.subtotal,
    unidadPedido: "BULTO",
    base: FICHA,
  });
  assert.deepEqual(
    { c: enBulto.cantidad, u: enBulto.unidad, p: enBulto.precio, s: enBulto.subtotal },
    { c: 1, u: "BULTO", p: 50500, s: 50500 }
  );
});

test("NUNCA 10 BULTOS NI 100 UNIDADES si el papel decía 10 unidades", () => {
  // Los dos números del defecto, en un solo candado. Ninguna representación
  // puede producirlos partiendo de una base de 10 unidades.
  const base = cantidadBaseEnUnidades({
    cantidadPapel: 10, unidadPapel: "UNIDAD", base: FICHA,
  });
  for (const destino of ["UNIDAD", "BULTO"]) {
    const r = representarPedido({
      cantidadBaseUnidades: base,
      subtotalPapel: PAPEL.subtotal,
      unidadPedido: destino,
      base: FICHA,
    });
    assert.notEqual(`${r.cantidad} ${r.unidad}`, "10 BULTO", "volvió a interpretar 10 unidades como 10 bultos");
    assert.notEqual(`${r.cantidad} ${r.unidad}`, "100 UNIDAD", "multiplicó una cantidad que ya estaba en unidades");
    assert.equal(r.subtotal, 50500);
  }
});

test("SI EL PAPEL SÍ DECÍA 10 BULTOS, entonces 100 unidades es lo correcto", () => {
  // La otra mitad: la conversión no está mal, estaba mal la interpretación.
  const base = cantidadBaseEnUnidades({
    cantidadPapel: 10, unidadPapel: "BULTO", base: FICHA,
  });
  assert.equal(base, 100);
  const enUnidad = representarPedido({
    cantidadBaseUnidades: base,
    subtotalPapel: 505000,
    unidadPedido: "UNIDAD",
    base: FICHA,
  });
  assert.equal(enUnidad.cantidad, 100);
  assert.equal(enUnidad.precio, 5050);
  assert.equal(enUnidad.subtotal, 505000);
});

test("ALTERNAR MUCHAS VECES no acumula multiplicaciones ni redondeos", () => {
  // ── POR QUÉ TODO SALE DE LA BASE ────────────────────────────────────────
  //
  // Si cada representación se calculara sobre la anterior, ir y volver diez
  // veces multiplicaría y dividiría por diez cada vez, y cualquier redondeo
  // intermedio se acumularía. Acá las dos salen del mismo par original.
  const base = cantidadBaseEnUnidades({ cantidadPapel: 10, unidadPapel: "UNIDAD", base: FICHA });
  let ultima = null;
  for (let i = 0; i < 10; i++) {
    for (const destino of ["BULTO", "UNIDAD"]) {
      ultima = representarPedido({
        cantidadBaseUnidades: base,
        subtotalPapel: PAPEL.subtotal,
        unidadPedido: destino,
        base: FICHA,
      });
      assert.equal(ultima.subtotal, 50500, `el subtotal se movió en la vuelta ${i + 1}`);
      assert.equal(
        Math.round(ultima.cantidad * ultima.precio * 100) / 100,
        50500,
        `cantidad × precio dejó de dar el subtotal en la vuelta ${i + 1}`
      );
    }
  }
  assert.equal(ultima.cantidad, 10);
  assert.equal(ultima.unidad, "UNIDAD");
});

test("UNA CANTIDAD NO DIVISIBLE no se redondea sola", () => {
  const base = cantidadBaseEnUnidades({ cantidadPapel: 47, unidadPapel: "UNIDAD", base: FICHA });
  const r = representarPedido({
    cantidadBaseUnidades: base, subtotalPapel: 4700, unidadPedido: "BULTO", base: FICHA,
  });
  assert.equal(r.requiereConfirmacion, true);
  assert.equal(r.cantidad, null, "eligió una cantidad de bultos por su cuenta");
  assert.equal(r.unidades, 47);
  assert.equal(r.bultos, 5);
});

// ── LA PRIORIDAD PARA RESOLVER LA UNIDAD DEL PAPEL ────────────────────────

test("PRIORIDAD. la receta gana sobre todo lo demás", () => {
  const r = resolverUnidadDelPapel({
    unidadReceta: "UNIDAD",
    presentacionConfirmada: "BULTO",
    unidadDocumento: "BULTO",
    precioPapel: 50500,
    base: FICHA,
    costoErp: ERP.costoBulto,
  });
  assert.equal(r.unidad, "UNIDAD");
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.RECETA);
  assert.equal(r.confirmada, true);
});

test("PRIORIDAD. sin receta manda la presentación confirmada; después el documento", () => {
  const conPresentacion = resolverUnidadDelPapel({
    presentacionConfirmada: "UNIDAD", unidadDocumento: "BULTO",
  });
  assert.equal(conPresentacion.origen, ORIGEN_UNIDAD_PAPEL.PRESENTACION_CONFIRMADA);
  assert.equal(conPresentacion.unidad, "UNIDAD");

  const soloDocumento = resolverUnidadDelPapel({ unidadDocumento: "BULTO" });
  assert.equal(soloDocumento.origen, ORIGEN_UNIDAD_PAPEL.DOCUMENTO);
  assert.equal(soloDocumento.unidad, "BULTO");
  assert.equal(soloDocumento.confirmada, true);
});

test("PRIORIDAD. el precio SUGIERE y no confirma", () => {
  // $5.050 está pegado al costo por unidad y a diez veces del costo por bulto.
  const r = resolverUnidadDelPapel({
    precioPapel: PAPEL.precio,
    base: FICHA,
    costoErp: ERP.costoBulto,
  });
  assert.equal(r.unidad, "UNIDAD");
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO);
  assert.equal(r.confirmada, false, "una evidencia de precio se guardó como decisión humana");
});

test("EL BULTO DEL PRODUCTO NUNCA ES EL DEFAULT: sin nada, se pregunta", () => {
  // ── LA CAUSA DEL DEFECTO, EN UNA LÍNEA ──────────────────────────────────
  //
  // Que el ERP compre por bulto no dice NADA sobre cómo cotiza el proveedor.
  // Usarlo como default es lo que convirtió 10 unidades en 10 bultos.
  const r = resolverUnidadDelPapel({ base: FICHA });
  assert.equal(r.unidad, null, "eligió una unidad sin ninguna evidencia");
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA);
  assert.equal(r.confirmada, false);
});

test("SIN BASE NO HAY REPRESENTACIÓN: no se calcula sobre una escala desconocida", () => {
  assert.equal(cantidadBaseEnUnidades({ cantidadPapel: 10, unidadPapel: null }), null);
  assert.equal(representarPedido({ cantidadBaseUnidades: null, subtotalPapel: 50500 }), null);
});

// ── LA EVIDENCIA DEL PRECIO, VISTA DESDE LA PRIORIDAD ─────────────────────

test("EVIDENCIA. el precio pegado al unitario sugiere UNIDAD", () => {
  const r = resolverUnidadDelPapel({ precioPapel: 5050, base: FICHA, costoErp: 50500 });
  assert.equal(r.unidad, "UNIDAD");
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO);
});

test("EVIDENCIA. el precio pegado al del bulto sugiere BULTO", () => {
  const r = resolverUnidadDelPapel({ precioPapel: 50500, base: FICHA, costoErp: 50500 });
  assert.equal(r.unidad, "BULTO");
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO);
});

test("EVIDENCIA. un producto sin bulto NO sugiere: unidad y bulto son lo mismo", () => {
  // Factor 1: el precio no puede distinguir una escala de la otra, y decir
  // algo sería inventar. Se pregunta, como siempre.
  const sinBulto = { factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
  const r = resolverUnidadDelPapel({ precioPapel: 5050, base: sinBulto, costoErp: 5050 });
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA, "sugirió una escala con evidencia que no distingue");
});

test("EVIDENCIA. sin precio o sin costo vigente no hay sugerencia: se pregunta", () => {
  for (const caso of [
    { precioPapel: null, base: FICHA, costoErp: 50500 },
    { precioPapel: 5050, base: FICHA, costoErp: null },
    { precioPapel: 0, base: FICHA, costoErp: 50500 },
  ]) {
    const r = resolverUnidadDelPapel(caso);
    assert.equal(r.unidad, null, JSON.stringify(caso));
    assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA);
  }
});

test("EL FACTOR PERMANENTE NO ES UNA RAZÓN DE PRECIOS", () => {
  // La evidencia devuelve una ESCALA, nunca un número para guardar. Si alguien
  // hiciera `precioSistema ÷ precioPapel` y lo persistiera, el día que cambien
  // los precios el factor quedaría podrido.
  const e = escalaDelPrecio({ precio: 5050, base: FICHA, costoActual: 50500 });
  assert.ok(!("factor" in e), "la evidencia devolvió un factor para guardar");
  assert.ok(!("cociente" in e), "la evidencia devolvió el cociente de esta compra");
  const cociente = 50500 / 5050;
  for (const [clave, valor] of Object.entries(e)) {
    if (typeof valor !== "number") continue;
    assert.ok(Math.abs(valor - cociente) > 0.01 && Math.abs(valor - 1 / cociente) > 0.001, `"${clave}" es la razón de precios`);
  }
  assert.equal(typeof e.unidad, "string");
});

test("LA FRONTERA DE LA SUGERENCIA ES EL UMBRAL ÚNICO, Y LO QUE NO ENTRA SE PREGUNTA", () => {
  // ── ESTE CANDADO CAMBIÓ DE REGLA (2026-11-05) ──────────────────────────
  //
  // Afirmaba una tolerancia del proveedor, ensanchable, sobre el ganador de una
  // distancia logarítmica. Ahora la escala la decide el umbral único de la
  // recepción: $6.700 la unidad de un pack de 10 a $50.000 (+34 % sobre $5.000)
  // se sugiere; $6.800 (+36 %) ya no es la unidad —el precio lo explica un pack
  // de 2— y se pregunta.
  const adentro = resolverUnidadDelPapel({ precioPapel: 6700, base: FICHA, costoErp: 50000 });
  assert.equal(adentro.unidad, "UNIDAD");
  assert.equal(adentro.confirmada, false, "una sugerencia no se convierte en decisión");
  const afuera = resolverUnidadDelPapel({ precioPapel: 6800, base: FICHA, costoErp: 50000 });
  assert.equal(afuera.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA);
  assert.equal(afuera.unidad, null);
  // Y $12.000, a +140 % de la unidad y −76 % del bulto: se pregunta.
  assert.equal(resolverUnidadDelPapel({ precioPapel: 12000, base: FICHA, costoErp: 50000 }).unidad, null);
});

test("LA PREGUNTA DICE EL NÚMERO DEL PAPEL", () => {
  const p = preguntaDeUnidad({ cantidadPapel: 10, base: FICHA });
  assert.equal(p.titulo, "La factura dice 10. ¿Está expresado en?");
  assert.deepEqual(p.opciones.map((o) => o.texto), ["10 unidades", "10 bultos"]);
  assert.equal(p.opciones[1].equivale, 100);
});
