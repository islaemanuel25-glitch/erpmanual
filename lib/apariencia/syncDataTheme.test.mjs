import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSyncDataTheme } from "./syncDataTheme.js";
import { resolverTemaEfectivo } from "./resolver.js";

const VALIDOS = new Set(["A", "B", "def"]);
const esValido = (k) => VALIDOS.has(k);
const opts = { esValido, porDefecto: "def" };

// ---------------------------------------------------------------------------
// crearSyncDataTheme: salta el primer sync, aplica los siguientes.
// ---------------------------------------------------------------------------
test("crearSyncDataTheme: NO escribe en el primer sync (respeta script/SSR)", () => {
  const writes = [];
  const sync = crearSyncDataTheme((k) => writes.push(k));
  assert.equal(sync("A"), false); // primer sync → no escribe
  assert.deepEqual(writes, []);
});

test("crearSyncDataTheme: escribe del segundo sync en adelante", () => {
  const writes = [];
  const sync = crearSyncDataTheme((k) => writes.push(k));
  sync("A"); // skip
  assert.equal(sync("B"), true);
  assert.equal(sync("B"), true);
  assert.deepEqual(writes, ["B", "B"]);
});

// ---------------------------------------------------------------------------
// Simulación del MONTAJE de SunmiThemeProvider — usa las MISMAS funciones que el
// componente (resolverTemaEfectivo + crearSyncDataTheme). Modela el orden real:
//   0) SSR pinta data-theme = institucional (o default).
//   1) <script> pre-hidratación pisa con la preferencia personal si es válida.
//   2) Primer render: personalKey=null, institucionalKey=SSR(sembrada) → themeKey.
//      Efecto data-theme = PRIMER sync → SKIP (no pisa lo que dejó script/SSR).
//   3) Efecto de hidratación de localStorage → personalKey.
//   4) Re-render: themeKey = resolver(personal, institucional). Efecto → escribe si cambió.
//   5) AparienciaInstitucionalSync confirma la MISMA institucional sembrada → sin cambio.
// ---------------------------------------------------------------------------
function simularMontaje({ personalEnLS, institucionalInicial, skipPrimerSync }) {
  const ssrValue = institucionalInicial && esValido(institucionalInicial) ? institucionalInicial : "def";
  const dom = { value: ssrValue }; // lo que pintó el SSR en <html data-theme>
  const writes = [];
  const aplicar = (k) => { dom.value = k; writes.push(k); };
  const sync = skipPrimerSync ? crearSyncDataTheme(aplicar) : (k) => aplicar(k);

  // <script> pre-hidratación: aplica la preferencia personal si es válida.
  if (personalEnLS && esValido(personalEnLS)) dom.value = personalEnLS;
  const domTrasScript = dom.value;

  // Estado inicial del provider: personal aún sin leer; institucional sembrada del SSR.
  let personalKey = null;
  const institucionalKey =
    institucionalInicial && esValido(institucionalInicial) ? institucionalInicial : null;

  // 1) Primer render + primer efecto data-theme.
  let themeKey = resolverTemaEfectivo(personalKey, institucionalKey, opts).key;
  sync(themeKey);

  // 2) Efecto de hidratación de localStorage.
  if (personalEnLS && esValido(personalEnLS)) personalKey = personalEnLS;

  // 3) Re-render + efecto data-theme (solo si el tema efectivo cambió).
  const themeKey2 = resolverTemaEfectivo(personalKey, institucionalKey, opts).key;
  if (themeKey2 !== themeKey) { themeKey = themeKey2; sync(themeKey); }

  // 4) Institucional confirmada = misma sembrada → sin cambio (no re-sync).

  // Secuencia de valores que el DOM llegó a mostrar: el del script + cada escritura.
  return { domTrasScript, domFinal: dom.value, writes, secuencia: [domTrasScript, ...writes] };
}

test("ESCENARIO PEDIDO: personal B sobre institucional A → data-theme queda en B, sin B→A→B", () => {
  const r = simularMontaje({ personalEnLS: "B", institucionalInicial: "A", skipPrimerSync: true });
  assert.equal(r.domTrasScript, "B", "el <script> dejó la preferencia personal B");
  assert.equal(r.domFinal, "B", "termina en B (personal gana)");
  assert.ok(!r.writes.includes("A"), "el provider NUNCA escribe A durante el montaje");
  assert.deepEqual(r.secuencia, ["B", "B"], "el DOM solo ve B; jamás vuelve a A (no hay B→A→B)");
});

test("CONTROL (demuestra la necesidad del skip): SIN skip aparecería el flash B→A→B", () => {
  const r = simularMontaje({ personalEnLS: "B", institucionalInicial: "A", skipPrimerSync: false });
  assert.deepEqual(r.secuencia, ["B", "A", "B"], "sin el skip, el primer sync pisa B con A → flash");
  assert.ok(r.writes.includes("A"), "sin skip, A se escribe (esto es el bug que evitamos)");
});

test("sin preferencia personal: data-theme queda en la institucional A (sin flash, sin default)", () => {
  const r = simularMontaje({ personalEnLS: null, institucionalInicial: "A", skipPrimerSync: true });
  assert.equal(r.domTrasScript, "A", "el SSR dejó A y el <script> no lo pisa");
  assert.equal(r.domFinal, "A");
  assert.ok(!r.writes.includes("def"), "no cae a default");
  assert.deepEqual(r.secuencia, ["A"], "solo A; sin cambios");
});

test("personal inválido en localStorage: el <script> no lo aplica → queda la institucional A", () => {
  const r = simularMontaje({ personalEnLS: "xxx", institucionalInicial: "A", skipPrimerSync: true });
  assert.equal(r.domTrasScript, "A");
  assert.equal(r.domFinal, "A");
  assert.deepEqual(r.secuencia, ["A"]);
});
