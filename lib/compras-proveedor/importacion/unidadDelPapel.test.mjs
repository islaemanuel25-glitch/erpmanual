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
// LA EVIDENCIA POR PRECIO SE MUDÓ a `toleranciaEscala.js`, que contesta lo mismo
// y además informa las dos diferencias en porcentaje y aplica una tolerancia
// configurable. Estos candados siguen acá porque lo que afirman es cómo se
// comporta la PRIORIDAD de este archivo cuando la evidencia dice tal cosa; los
// de la evidencia en sí viven al lado de la función, en su propio archivo.
import { MARGEN_EVIDENCIA, evidenciaDeEscala } from "./toleranciaEscala.js";

// El renglón del caso, y el producto contra el que se lee.
const PAPEL = Object.freeze({ cantidad: 10, precio: 5050, subtotal: 50500 });
const ERP = Object.freeze({ unidadesPorBulto: 10, costoUnidad: 5050, costoBulto: 50500 });

// ── LAS DOS REPRESENTACIONES VÁLIDAS ──────────────────────────────────────

test("PAPEL EN UNIDADES: 10 × $5.050 = $50.500", () => {
  const base = cantidadBaseEnUnidades({
    cantidadPapel: PAPEL.cantidad,
    unidadPapel: "UNIDAD",
    unidadesPorBultoErp: ERP.unidadesPorBulto,
  });
  assert.equal(base, 10);

  const enUnidad = representarPedido({
    cantidadBaseUnidades: base,
    subtotalPapel: PAPEL.subtotal,
    unidadPedido: "UNIDAD",
    unidadesPorBultoErp: ERP.unidadesPorBulto,
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
    unidadesPorBultoErp: ERP.unidadesPorBulto,
  });
  const enBulto = representarPedido({
    cantidadBaseUnidades: base,
    subtotalPapel: PAPEL.subtotal,
    unidadPedido: "BULTO",
    unidadesPorBultoErp: ERP.unidadesPorBulto,
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
    cantidadPapel: 10, unidadPapel: "UNIDAD", unidadesPorBultoErp: 10,
  });
  for (const destino of ["UNIDAD", "BULTO"]) {
    const r = representarPedido({
      cantidadBaseUnidades: base,
      subtotalPapel: PAPEL.subtotal,
      unidadPedido: destino,
      unidadesPorBultoErp: 10,
    });
    assert.notEqual(`${r.cantidad} ${r.unidad}`, "10 BULTO", "volvió a interpretar 10 unidades como 10 bultos");
    assert.notEqual(`${r.cantidad} ${r.unidad}`, "100 UNIDAD", "multiplicó una cantidad que ya estaba en unidades");
    assert.equal(r.subtotal, 50500);
  }
});

test("SI EL PAPEL SÍ DECÍA 10 BULTOS, entonces 100 unidades es lo correcto", () => {
  // La otra mitad: la conversión no está mal, estaba mal la interpretación.
  const base = cantidadBaseEnUnidades({
    cantidadPapel: 10, unidadPapel: "BULTO", unidadesPorBultoErp: 10,
  });
  assert.equal(base, 100);
  const enUnidad = representarPedido({
    cantidadBaseUnidades: base,
    subtotalPapel: 505000,
    unidadPedido: "UNIDAD",
    unidadesPorBultoErp: 10,
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
  const base = cantidadBaseEnUnidades({ cantidadPapel: 10, unidadPapel: "UNIDAD", unidadesPorBultoErp: 10 });
  let ultima = null;
  for (let i = 0; i < 10; i++) {
    for (const destino of ["BULTO", "UNIDAD"]) {
      ultima = representarPedido({
        cantidadBaseUnidades: base,
        subtotalPapel: PAPEL.subtotal,
        unidadPedido: destino,
        unidadesPorBultoErp: 10,
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
  const base = cantidadBaseEnUnidades({ cantidadPapel: 47, unidadPapel: "UNIDAD", unidadesPorBultoErp: 10 });
  const r = representarPedido({
    cantidadBaseUnidades: base, subtotalPapel: 4700, unidadPedido: "BULTO", unidadesPorBultoErp: 10,
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
    costoUnidadErp: ERP.costoUnidad,
    costoBultoErp: ERP.costoBulto,
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
    costoUnidadErp: ERP.costoUnidad,
    costoBultoErp: ERP.costoBulto,
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
  const r = resolverUnidadDelPapel({ unidadesPorBultoErp: 10 });
  assert.equal(r.unidad, null, "eligió una unidad sin ninguna evidencia");
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA);
  assert.equal(r.confirmada, false);
});

test("SIN BASE NO HAY REPRESENTACIÓN: no se calcula sobre una escala desconocida", () => {
  assert.equal(cantidadBaseEnUnidades({ cantidadPapel: 10, unidadPapel: null }), null);
  assert.equal(representarPedido({ cantidadBaseUnidades: null, subtotalPapel: 50500 }), null);
});

// ── LA EVIDENCIA DEL PRECIO, VISTA DESDE LA PRIORIDAD ─────────────────────
//
// El campo se llama `masCercana` y no `unidad`: la evidencia dice qué escala
// explica mejor el precio, que no es lo mismo que decir cuál es la unidad. El
// nombre viejo hacía leer una propuesta como una respuesta.

test("EVIDENCIA. el precio pegado al unitario sugiere UNIDAD", () => {
  const e = evidenciaDeEscala({ precioPapel: 5050, costoUnidadErp: 5050, costoBultoErp: 50500 });
  assert.equal(e.masCercana, "UNIDAD");
  assert.ok(e.margen >= MARGEN_EVIDENCIA, `margen ${e.margen}`);
});

test("EVIDENCIA. el precio pegado al del bulto sugiere BULTO", () => {
  const e = evidenciaDeEscala({ precioPapel: 50500, costoUnidadErp: 5050, costoBultoErp: 50500 });
  assert.equal(e.masCercana, "BULTO");
  assert.ok(e.margen >= MARGEN_EVIDENCIA);
});

test("EVIDENCIA. si las dos referencias están igual de lejos, NO se sugiere", () => {
  // Un producto sin bulto —factor 1— tiene el mismo costo por unidad y por
  // bulto: el precio no puede distinguir, y decir algo sería inventar.
  const e = evidenciaDeEscala({ precioPapel: 5050, costoUnidadErp: 5050, costoBultoErp: 5050 });
  assert.equal(e.margen, 0);
  const r = resolverUnidadDelPapel({ precioPapel: 5050, costoUnidadErp: 5050, costoBultoErp: 5050 });
  assert.equal(r.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA, "sugirió una escala con evidencia que no distingue");
});

test("EVIDENCIA. sin precio o sin costos vigentes no hay evidencia", () => {
  assert.equal(evidenciaDeEscala({ precioPapel: null, costoUnidadErp: 5050 }), null);
  assert.equal(evidenciaDeEscala({ precioPapel: 5050, costoUnidadErp: null, costoBultoErp: null }), null);
  assert.equal(evidenciaDeEscala({ precioPapel: 0, costoUnidadErp: 5050 }), null);
});

test("EL FACTOR PERMANENTE NO ES UNA RAZÓN DE PRECIOS", () => {
  // La evidencia devuelve una ESCALA, nunca un número para guardar. Si alguien
  // hiciera `precioSistema ÷ precioPapel` y lo persistiera, el día que cambien
  // los precios el factor quedaría podrido.
  const e = evidenciaDeEscala({ precioPapel: 5050, costoUnidadErp: 5050, costoBultoErp: 50500 });
  assert.ok(!("factor" in e), "la evidencia devolvió un factor para guardar");
  assert.ok(!("unidadesPorBulto" in e));
  assert.equal(typeof e.masCercana, "string");
});

test("LA PRIORIDAD EXIGE ADEMÁS QUE LA GANADORA ESTÉ DENTRO DE LA TOLERANCIA", () => {
  // Es la condición nueva, y este candado la ejerce DESDE la prioridad: una
  // evidencia que distingue perfectamente pero cuyo ganador está a +140 % del
  // costo vigente ya no interpreta sola. Antes alcanzaba con distinguir.
  const lejos = resolverUnidadDelPapel({
    precioPapel: 12000,
    costoUnidadErp: 5000,
    costoBultoErp: 50000,
  });
  assert.equal(lejos.origen, ORIGEN_UNIDAD_PAPEL.PREGUNTA);
  assert.equal(lejos.unidad, null);

  // CONTRAPRUEBA: con la tolerancia del proveedor ensanchada, la MISMA evidencia
  // sí interpreta. Prueba que lo que frenó fue la tolerancia y no otra cosa.
  const conTolerancia = resolverUnidadDelPapel({
    precioPapel: 12000,
    costoUnidadErp: 5000,
    costoBultoErp: 50000,
    toleranciaEscalaPct: 150,
  });
  assert.equal(conTolerancia.origen, ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO);
  assert.equal(conTolerancia.unidad, "UNIDAD");
  assert.equal(conTolerancia.confirmada, false, "una tolerancia ancha no convierte una sugerencia en decisión");
});

test("LA PREGUNTA DICE EL NÚMERO DEL PAPEL", () => {
  const p = preguntaDeUnidad({ cantidadPapel: 10, unidadesPorBultoErp: 10 });
  assert.equal(p.titulo, "La factura dice 10. ¿Está expresado en?");
  assert.deepEqual(p.opciones.map((o) => o.texto), ["10 unidades", "10 bultos"]);
  assert.equal(p.opciones[1].equivale, 100);
});
