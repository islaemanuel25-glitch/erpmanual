// CANDADO: ESCRIBIR SOBRE UN CAMPO QUE MUESTRA 0.
//
//   node --import ./scripts/alias-loader.mjs --test lib/formularios/escrituraNumerica.test.mjs
//
// ── EL DEFECTO QUE FIJA ────────────────────────────────────────────────────
//
// Un campo de porcentaje con `0` cargado: la persona escribe `1` y quedaba `10`.
// El cero que había no era un dato suyo, era el valor por defecto que estaba
// mirando, y el dígito nuevo se le sumaba al lado en vez de reemplazarlo.
//
// ── LO QUE ESTE CANDADO CUIDA ADEMÁS, Y ES LO QUE PODRÍA ROMPERSE ──────────
//
// La diferencia entre VACÍO y CERO en la comisión. Vacío significa "heredá la
// del grupo" y cero significa "en este local la comisión es 0 %". Son dos cosas
// distintas que se guardan distinto —`null` y `0`—, y cualquier atajo que
// convierta una en otra cambia plata sin que nadie lo pida. Por eso el viaje
// hasta el cuerpo que se manda al servidor también se ejerce acá.
//
// Se escribe tecla por tecla: cada caso simula lo que el navegador deja en el
// campo y lo pasa por el mismo handler que usa el formulario.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { reemplazarCeroInicial } from "@/lib/formularios/escrituraNumerica.js";
import { cuerpoParaGuardar, estadoInicialDeMedio } from "@/lib/pos-ventas/mediosCobroPantalla.js";

/**
 * Lo que el navegador deja en un campo controlado al escribir un dígito.
 *
 * `cursor: "izquierda"` es el caso que reportó el local: el cursor quedó ANTES
 * del cero, así que el dígito entra adelante y el valor pasa a ser `10`. Con el
 * cursor a la derecha entra atrás y queda `01`. Los dos son la misma pulsación.
 */
const teclear = (valor, digito, cursor = "izquierda") =>
  cursor === "izquierda" ? `${digito}${valor}` : `${valor}${digito}`;

/** El handler tal como lo tiene el formulario. */
const escribir = (valor, digito, cursor) =>
  reemplazarCeroInicial(valor, teclear(valor, digito, cursor));

// ══════════════════════════════════════════════════════════════════════════
// 1 A 3 — EL RECARGO
// ══════════════════════════════════════════════════════════════════════════

test("recargo en 0: escribir 1 deja 1, no 10", () => {
  assert.equal(escribir("0", "1"), "1");
});

test("recargo en 0: escribir 7 deja 7", () => {
  assert.equal(escribir("0", "7"), "7");
});

test("y da igual de qué lado del cero haya quedado el cursor", () => {
  // Es la misma pulsación vista de las dos formas posibles.
  assert.equal(escribir("0", "5", "izquierda"), "5");
  assert.equal(escribir("0", "5", "derecha"), "5");
});

test("con 7 escrito, seguir escribiendo un 5 da 75 con normalidad", () => {
  // La regla ya no aplica: lo que hay dejó de ser el cero.
  assert.equal(escribir("7", "5", "derecha"), "75");
});

test("y el 10 se sigue pudiendo escribir: 0 → 1 → 10", () => {
  // El caso que parecía perderse con este arreglo. No se pierde: se teclea el
  // 1, queda 1, y recién ahí el 0 se suma.
  const trasElUno = escribir("0", "1");
  assert.equal(trasElUno, "1");
  assert.equal(escribir(trasElUno, "0", "derecha"), "10");
});

test("los decimales se siguen escribiendo", () => {
  // `0` → `0.` no son dos dígitos, así que la regla no lo toca.
  assert.equal(reemplazarCeroInicial("0", "0."), "0.");
  assert.equal(reemplazarCeroInicial("0.", "0.5"), "0.5");
});

// ══════════════════════════════════════════════════════════════════════════
// 4 A 6 — LA COMISIÓN, DONDE VACÍO Y CERO NO SON LO MISMO
// ══════════════════════════════════════════════════════════════════════════

test("comisión en 0: escribir 1 deja 1", () => {
  assert.equal(escribir("0", "1"), "1");
});

test("LA COMISIÓN VACÍA SIGUE VACÍA: la regla no la toca", () => {
  // Si esto se rompiera, un medio que hereda la comisión del grupo pasaría a
  // tener una propia sin que nadie la haya decidido.
  assert.equal(reemplazarCeroInicial("", ""), "");
  assert.equal(reemplazarCeroInicial("", "5"), "5");
  assert.equal(reemplazarCeroInicial("5", ""), "");
});

test("borrar hasta dejarlo vacío devuelve la herencia, y no pasa por 0", () => {
  assert.equal(reemplazarCeroInicial("50", "5"), "5");
  assert.equal(reemplazarCeroInicial("5", ""), "");
});

test("el 0 explícito se sigue pudiendo escribir en un campo vacío", () => {
  // Es el caso "en este local la comisión es 0 %", que no es lo mismo que
  // heredarla. Un campo vacío no es "0", así que la regla no interviene.
  assert.equal(reemplazarCeroInicial("", "0"), "0");
});

// ══════════════════════════════════════════════════════════════════════════
// 7 — LO QUE SE GUARDA NO CAMBIÓ
// ══════════════════════════════════════════════════════════════════════════

const BASE = {
  nombre: "Débito",
  activo: true,
  orden: 2,
  tipoContable: "DEBITO",
  procesador: "BANCO",
  recargoPct: 0,
  comisionPct: 7,
};

test("vacío se sigue guardando como null: hereda", () => {
  const form = estadoInicialDeMedio({ ...BASE, comisionHeredada: true });
  assert.equal(form.comisionPct, "");
  assert.equal(cuerpoParaGuardar(form).comisionPct, null);
});

test("cero explícito se sigue guardando como 0, y son distinguibles", () => {
  const form = estadoInicialDeMedio({ ...BASE, comisionPct: 0, comisionHeredada: false });
  assert.equal(form.comisionPct, "0");

  const guardado = cuerpoParaGuardar(form);
  assert.equal(guardado.comisionPct, 0);
  assert.notEqual(guardado.comisionPct, null);
});

test("escribir sobre el cero guarda el número escrito, no el pegado", () => {
  // El viaje entero: el campo mostraba 0, se escribe un 1, y lo que sale para el
  // servidor es 1. Antes salía 10.
  const form = estadoInicialDeMedio({ ...BASE, recargoPct: 0, comisionHeredada: true });
  assert.equal(form.recargoPct, "0");

  const conElUno = { ...form, recargoPct: escribir(form.recargoPct, "1") };
  assert.equal(cuerpoParaGuardar(conElUno).recargoPct, 1);
  // Y la comisión de ese mismo medio sigue heredando: no se tocó.
  assert.equal(cuerpoParaGuardar(conElUno).comisionPct, null);
});

test("y el resto del cuerpo no cambia", () => {
  const form = estadoInicialDeMedio({ ...BASE, comisionHeredada: false });
  assert.deepEqual(cuerpoParaGuardar(form), {
    nombre: "Débito",
    activo: true,
    orden: 2,
    tipoContable: "DEBITO",
    procesador: "BANCO",
    recargoPct: 0,
    comisionPct: 7,
  });
});

// ══════════════════════════════════════════════════════════════════════════
// LA REGLA NO SE PASA DE LISTA
// ══════════════════════════════════════════════════════════════════════════

test("dos dígitos pegados de una vez no se recortan", () => {
  // Un pegado no es alguien reemplazando el cero, así que se respeta.
  assert.equal(reemplazarCeroInicial("0", "12"), "12");
});

test("un valor de tres dígitos no se toca", () => {
  assert.equal(reemplazarCeroInicial("0", "100"), "100");
});

test("00 se resuelve a 0", () => {
  assert.equal(reemplazarCeroInicial("0", "00"), "0");
});

test("y con cualquier otro valor previo devuelve exactamente lo que llegó", () => {
  for (const [antes, ahora] of [["12", "125"], ["3", "35"], ["", "0"], ["0.5", "0.55"]]) {
    assert.equal(reemplazarCeroInicial(antes, ahora), ahora);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LOS DOS CAMPOS DEL FORMULARIO LO USAN
// ══════════════════════════════════════════════════════════════════════════

test("recargo y comisión pasan los dos por la misma regla", () => {
  const form = readFileSync("components/configuracion-pos/FormularioMedio.jsx", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.match(
    form,
    /set\("recargoPct", reemplazarCeroInicial\(form\.recargoPct, e\.target\.value\)\)/
  );
  assert.match(
    form,
    /set\("comisionPct", reemplazarCeroInicial\(form\.comisionPct, e\.target\.value\)\)/
  );
  // Y no se resolvió tocando el DOM ni con un temporizador.
  assert.doesNotMatch(form, /setTimeout|\.select\(\)|document\.querySelector/);
});
