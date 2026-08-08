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
import { formaDelPanel, tonoDeFila, esDeLaCola, PREGUNTA } from "./panelDecision.js";

const T = (iso) => new Date(iso);
const ANTES = "2026-08-01T10:00:00.000Z";
const DESPUES = "2026-08-02T10:00:00.000Z";

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

test("sin cambios y bloqueado se muestran pero no preguntan nada", () => {
  for (const estado of [ESTADO_LINEA.SIN_CAMBIOS, ESTADO_LINEA.BLOQUEADO]) {
    const f = formaDelPanel({ estado, tieneProducto: true });
    assert.equal(f.pregunta, null, estado);
    assert.equal(f.enCola, true, `${estado} sigue estando en la lista`);
    assert.equal(f.abrePorDefecto, false, `${estado} no se abre sola`);
  }
});

// ── La exclusión es una MARCA, no un estado ─────────────────────────────────

test("una fila excluida no pregunta nada, cualquiera sea su estado", () => {
  // Este es el bug que se arregló: `EXCLUIDO` estaba en la lista de estados sin
  // pregunta, pero nada lo escribe nunca. Una fila excluida a mano conserva su
  // estado original, así que el panel le seguía preguntando.
  for (const estado of [ESTADO_LINEA.NO_MACHEADO, ESTADO_LINEA.FACTOR_DUDOSO, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR]) {
    const f = formaDelPanel({ estado, tieneProducto: true, resultado: "AMBIGUA", excluida: true });
    assert.equal(f.pregunta, null, `${estado} excluida no debería preguntar`);
    assert.equal(f.enCola, true, "sigue visible: excluir es reversible y hay que poder deshacerlo");
  }
});

test("excluida se apaga en la tabla", () => {
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.NO_MACHEADO, excluida: true }), "apagado");
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.NO_MACHEADO }), "alerta", "sin excluir sigue alertando");
});

test("aplicada le gana a excluida: es historia y ya no está en la cola", () => {
  const f = formaDelPanel({ estado: ESTADO_LINEA.NO_MACHEADO, aplicada: true, excluida: true });
  assert.equal(f.enCola, false);
});

// PENDIENTE — se activa cuando EXCLUIDO salga de ESTADO_LINEA.
//
// Sacarlo rompe 6 candados de estados.test.mjs y 1 de conciliarLista.test.mjs,
// que afirman el contrato viejo: que `clasificarLinea({excluido:true})` devuelve
// EXCLUIDO. Hay que invertirlos —afirmar que la exclusión NO cambia el estado—
// y recién ahí borrar el valor del enum JS y la rama de clasificarLinea.
//
// El valor NO se saca del enum de PostgreSQL: no se pueden quitar valores de un
// enum y habría que recrear el tipo. Ver el comentario en schema.prisma.
test("EXCLUIDO ya no es un estado del enum", { todo: "quedan 7 candados del contrato viejo por reescribir" }, () => {
  // El valor sigue en el enum de PostgreSQL porque no se pueden quitar valores
  // de un enum, pero del lado JS no existe más. Si alguien lo vuelve a agregar
  // acá, este candado lo frena: la exclusión va en `excluidaManual`.
  assert.equal(
    ESTADO_LINEA.EXCLUIDO,
    undefined,
    "EXCLUIDO volvió a ESTADO_LINEA. La exclusión es una marca, no un estado: usá excluidaManual."
  );
  assert.ok(
    !Object.values(ESTADO_LINEA).includes("EXCLUIDO"),
    "alguien reintrodujo el valor EXCLUIDO en ESTADO_LINEA"
  );
});

// ── La confirmación responde JUSTO la pregunta de interpretación ────────────

test("confirmada saca la fila de la cola aunque el motor la haya dado por ambigua", () => {
  // Confirmar es responder esta pregunta. Volver a hacerla sería pedirle dos
  // veces lo mismo a la misma persona.
  const f = formaDelPanel({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    tieneProducto: true,
    resultado: "AMBIGUA",
    confirmada: true,
  });
  assert.equal(f.enCola, false, "ya se decidió: va al lote de la cabecera");
  assert.equal(f.pregunta, PREGUNTA.INTERPRETACION, "se puede abrir y cambiar igual");
});

test("confirmada no tapa el error: eso sigue habiendo que mirarlo", () => {
  const f = formaDelPanel({ estado: ESTADO_LINEA.ERROR, tieneProducto: true, confirmada: true });
  assert.equal(f.enCola, true);
  assert.equal(f.error, true);
});

test("confirmada no le gana a excluida ni a aplicada", () => {
  assert.equal(
    formaDelPanel({ estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, tieneProducto: true, confirmada: true, aplicada: true }).enCola,
    false
  );
  const excluida = formaDelPanel({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, tieneProducto: true, confirmada: true, excluida: true,
  });
  assert.equal(excluida.enCola, true, "excluir es reversible: la fila sigue visible");
  assert.equal(excluida.pregunta, null);
});

// ── esDeLaCola: la fila persistida, con su vocabulario ──────────────────────
//
// Es el único punto que traduce los nombres de la tabla a los hechos. Antes se
// le pasaba la fila cruda a `formaDelPanel` y los nombres no coincidían, así que
// `excluida`, `tieneProducto` y `resultado` llegaban siempre en false o en null.

test("esDeLaCola traduce el vocabulario de la tabla", () => {
  // Los tres nombres que no coinciden. Pasarle la fila cruda a `formaDelPanel`
  // los perdía en silencio: la fila entraba con todos los hechos en false.
  const fila = {
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    productoBaseId: 5,
    resultadoInterpretacion: "AMBIGUA",
    excluidaManual: false,
    aplicada: false,
  };
  assert.equal(esDeLaCola(fila), true);
  assert.equal(esDeLaCola({ ...fila, aplicada: true }), false, "aplicada es historia");

  // `excluidaManual` se ve en una fila que si no estaría fuera de la cola.
  const sana = { ...fila, resultadoInterpretacion: "RECOMENDADA" };
  assert.equal(esDeLaCola(sana), false);
  assert.equal(
    esDeLaCola({ ...sana, excluidaManual: true }),
    true,
    "excluir es reversible: la fila tiene que verse para poder deshacerlo"
  );

  // `productoBaseId` es lo que hace `tieneProducto`. Sin él la pregunta cambia
  // de eje: primero hay que saber de qué producto se habla.
  const sinProducto = { ...fila, productoBaseId: null, estado: ESTADO_LINEA.NO_MACHEADO };
  assert.equal(esDeLaCola(sinProducto), true);
  assert.equal(
    formaDelPanel({ estado: ESTADO_LINEA.NO_MACHEADO, tieneProducto: false }).pregunta,
    PREGUNTA.PRODUCTO
  );
});

test("esDeLaCola lee el veredicto del motor de su columna", () => {
  const base = { estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, productoBaseId: 5 };
  assert.equal(esDeLaCola({ ...base, resultadoInterpretacion: "AMBIGUA" }), true);
  assert.equal(esDeLaCola({ ...base, resultadoInterpretacion: "REVISAR" }), true);
  assert.equal(esDeLaCola({ ...base, resultadoInterpretacion: "RECOMENDADA" }), false);
});

test("esDeLaCola lee los DOS hechos: el veredicto del motor y la decisión vigente", () => {
  // El caso caro: el motor no pudo decidir, una persona decidió, y esa decisión
  // sigue valiendo para el producto que la fila tiene hoy.
  const ambigua = { estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, productoBaseId: 5, resultadoInterpretacion: "AMBIGUA" };
  assert.equal(esDeLaCola(ambigua), true, "sin confirmar, pendiente");
  assert.equal(
    esDeLaCola({ ...ambigua, confirmadoEn: T(DESPUES), vinculadoEn: T(ANTES) }),
    false,
    "confirmada después de vincular: ya se decidió"
  );
});

test("una confirmación VENCIDA devuelve la fila a la cola", () => {
  // Revincular no borra la confirmación: la vence. Nadie decidió todavía sobre
  // el producto que la fila tiene ahora, así que vuelve a preguntar.
  const fila = {
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    productoBaseId: 9,
    resultadoInterpretacion: "AMBIGUA",
    confirmadoEn: T(ANTES),
    vinculadoEn: T(DESPUES),
    confirmadoPorUsuarioId: 7,
  };
  assert.equal(esDeLaCola(fila), true);
  assert.equal(fila.confirmadoPorUsuarioId, 7, "y la autoría sigue ahí");
});

// ── `seleccionada` no cambia la forma, y es una decisión ────────────────────

test("seleccionada no cambia la forma del panel", () => {
  // Seleccionar es para el lote: dice qué entra en el próximo aplicar, no qué
  // hay que decidir. Se fija para que la omisión no pase por decisión, que es
  // como apareció el bug de excluida.
  const base = { estado: ESTADO_LINEA.FACTOR_DUDOSO, tieneProducto: true };
  const sin = formaDelPanel(base);
  const con = formaDelPanel({ ...base, seleccionada: true });
  assert.deepEqual(con, sin, "el tilde de selección no puede cambiar qué se pregunta");
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
  assert.equal(tonoDeFila({ estado: ESTADO_LINEA.NO_MACHEADO, excluida: true }), "apagado");
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
