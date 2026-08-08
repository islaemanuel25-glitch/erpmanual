// La forma del panel: qué se elige en cada fila.
//
// Lo que se protege acá es el acuerdo de diseño, que es fácil de romper sin
// darse cuenta:
//   · son DOS preguntas, no ocho casos;
//   · la forma sale de los hechos y NO de `estado`, porque ERROR tapa al resto;
//   · una fila sana no entra en la cola pero se puede abrir igual;
//   · elegir producto nunca cierra la decisión: encadena con la interpretación.

import test from "node:test";
import assert from "node:assert/strict";

import { ESTADO_LINEA } from "./estados.js";
import { formaDelPanel, tonoDeFila, PREGUNTA } from "./panelDecision.js";

// ── Pregunta de PRODUCTO ────────────────────────────────────────────────────

test("sin machear se pregunta a qué producto corresponde", () => {
  const f = formaDelPanel({ estado: ESTADO_LINEA.NO_MACHEADO });
  assert.equal(f.pregunta, PREGUNTA.PRODUCTO);
  assert.equal(f.enCola, true);
});

test("código duplicado también pregunta por el producto", () => {
  const f = formaDelPanel({ estado: ESTADO_LINEA.CODIGO_DUPLICADO });
  assert.equal(f.pregunta, PREGUNTA.PRODUCTO);
});

test("elegir producto NO cierra la decisión: siempre son dos pasos", () => {
  const antes = formaDelPanel({ estado: ESTADO_LINEA.NO_MACHEADO });
  assert.deepEqual(antes.paso, { actual: 1, total: 2 });

  const despues = formaDelPanel({ estado: ESTADO_LINEA.NO_MACHEADO, productoElegido: true });
  assert.deepEqual(despues.paso, { actual: 2, total: 2 });
});

// ── Pregunta de INTERPRETACIÓN ──────────────────────────────────────────────

test("factor dudoso pregunta cómo se interpreta el precio", () => {
  const f = formaDelPanel({ estado: ESTADO_LINEA.FACTOR_DUDOSO, tieneProducto: true });
  assert.equal(f.pregunta, PREGUNTA.INTERPRETACION);
  assert.equal(f.enCola, true);
  assert.equal(f.paso, null, "la interpretación sola no es un flujo de dos pasos");
});

test("ambigua pregunta aunque el estado sea sano", () => {
  // Este es el caso que se pierde si se mapea por `estado`: la línea es
  // aplicable, pero hay dos lecturas creíbles y nadie eligió.
  const f = formaDelPanel({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    tieneProducto: true,
    resultado: "AMBIGUA",
  });
  assert.equal(f.pregunta, PREGUNTA.INTERPRETACION);
  assert.equal(f.enCola, true, "no puede aplicarse sola: nadie eligió la lectura");
});

test("revisar también entra en la cola", () => {
  const f = formaDelPanel({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    tieneProducto: true,
    resultado: "REVISAR",
  });
  assert.equal(f.pregunta, PREGUNTA.INTERPRETACION);
  assert.equal(f.enCola, true);
});

// ── La fila sana ────────────────────────────────────────────────────────────

test("recomendada NO entra en la cola pero conserva la forma del panel", () => {
  const f = formaDelPanel({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    tieneProducto: true,
    resultado: "RECOMENDADA",
  });
  assert.equal(f.enCola, false, "se aplica en lote desde la cabecera");
  assert.equal(f.pregunta, PREGUNTA.INTERPRETACION, "abrirla muestra la cuenta y deja cambiarla");
  assert.equal(f.abrePorDefecto, false);
});

// ── Sin pregunta ────────────────────────────────────────────────────────────

test("sin cambios, excluido y bloqueado se muestran pero no preguntan nada", () => {
  for (const estado of [ESTADO_LINEA.SIN_CAMBIOS, ESTADO_LINEA.EXCLUIDO, ESTADO_LINEA.BLOQUEADO]) {
    const f = formaDelPanel({ estado, tieneProducto: true });
    assert.equal(f.pregunta, null, estado);
    assert.equal(f.enCola, true, `${estado} sigue estando en la lista`);
    assert.equal(f.abrePorDefecto, false, `${estado} no se abre sola`);
  }
});

// ── ERROR es una capa, no un caso ───────────────────────────────────────────

test("con error hay cartel, y la forma la siguen dando los hechos", () => {
  // El MOGUL con factor_pack 450: hay producto y hay hipótesis, una da
  // $4.011.570. Se pregunta la interpretación igual, con el cartel arriba.
  const conProducto = formaDelPanel({ estado: ESTADO_LINEA.ERROR, tieneProducto: true });
  assert.equal(conProducto.error, true);
  assert.equal(conProducto.pregunta, PREGUNTA.INTERPRETACION);

  // Un error sin producto sigue siendo primero un problema de producto.
  const sinProducto = formaDelPanel({ estado: ESTADO_LINEA.ERROR, tieneProducto: false });
  assert.equal(sinProducto.error, true);
  assert.equal(sinProducto.pregunta, PREGUNTA.PRODUCTO);
});

test("el error no bloquea la cola: hay que poder resolverlo", () => {
  assert.equal(formaDelPanel({ estado: ESTADO_LINEA.ERROR, tieneProducto: true }).enCola, true);
});

// ── Aplicada ────────────────────────────────────────────────────────────────

test("una fila aplicada no pregunta nada ni ocupa la cola", () => {
  const f = formaDelPanel({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    tieneProducto: true,
    resultado: "AMBIGUA",
    aplicada: true,
  });
  assert.equal(f.pregunta, null);
  assert.equal(f.enCola, false);
  assert.equal(f.error, false);
});

// ── Tono ────────────────────────────────────────────────────────────────────

test("el tono separa lo que alarma de lo que solo informa", () => {
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.ERROR }), "alerta");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.NO_MACHEADO }), "alerta");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.CODIGO_DUPLICADO }), "alerta");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.FACTOR_DUDOSO }), "atencion");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.BLOQUEADO }), "atencion");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.EXCLUIDO }), "apagado");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR }), null, "lo sano no se tiñe");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.ERROR, aplicada: true }), "apagado");
});

// ── El candado del acuerdo ──────────────────────────────────────────────────

test("los ocho estados tienen forma definida, ninguno queda sin resolver", () => {
  for (const estado of Object.values(ESTADO_LINEA)) {
    const f = formaDelPanel({ estado, tieneProducto: true, resultado: "RECOMENDADA" });
    assert.ok(
      f.pregunta === null || f.pregunta === PREGUNTA.INTERPRETACION || f.pregunta === PREGUNTA.PRODUCTO,
      `${estado} devolvió una pregunta desconocida: ${f.pregunta}`
    );
    assert.equal(typeof f.enCola, "boolean", estado);
  }
});
