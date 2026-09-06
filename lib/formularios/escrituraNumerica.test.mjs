// CANDADO: ESCRIBIR Y PEGAR SOBRE UN CAMPO QUE MUESTRA 0.
//
//   node --import ./scripts/alias-loader.mjs --test lib/formularios/escrituraNumerica.test.mjs
//
// ── LOS DOS DEFECTOS QUE FIJA ──────────────────────────────────────────────
//
// 1. El campo mostraba `0`, la persona TECLEABA un `1` y quedaba `10`.
// 2. El campo mostraba `0`, la persona PEGABA `"12"` y quedaba `"012"`.
//
// El segundo apareció midiendo, no leyendo: el reporte original no lo
// mencionaba.
//
// ── POR QUÉ LOS EVENTOS DE ACÁ SON FIELES ──────────────────────────────────
//
// No están inventados. Cada uno es lo que `scripts/sonda-escritura-en-cero.mjs`
// midió en el navegador sobre este mismo campo —`type="number"`, controlado por
// React—, y está anotado al lado del caso. Un fixture escrito de memoria probaría
// una forma de evento que no ocurre; ese error ya está anotado en CLAUDE.md.
//
// ── LO QUE ESTE CANDADO CUIDA ADEMÁS ───────────────────────────────────────
//
// La diferencia entre VACÍO y CERO en la comisión: vacío significa "heredá la
// del grupo" —se guarda `null`— y cero significa "en este local es 0 %" —se
// guarda `0`—. Cualquier atajo que confunda una con otra cambia plata sin que
// nadie lo pida, así que el viaje hasta el cuerpo que se manda al servidor
// también se ejerce acá.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { alEscribirNumero } from "@/lib/formularios/escrituraNumerica.js";
import { cuerpoParaGuardar, estadoInicialDeMedio } from "@/lib/pos-ventas/mediosCobroPantalla.js";

/** Un evento de cambio con la forma exacta que entrega React. */
const evento = (value, inputType, data) => ({ target: { value }, nativeEvent: { inputType, data } });

/** Teclear un carácter: `insertText`, con el carácter en `data`. */
const tecla = (value, caracter) => evento(value, "insertText", caracter);

/** Pegar un texto: `insertFromPaste`, con el texto entero en `data`. */
const pegado = (value, texto) => evento(value, "insertFromPaste", texto);

// ══════════════════════════════════════════════════════════════════════════
// TECLEAR SOBRE EL CERO
// ══════════════════════════════════════════════════════════════════════════

test("0 + tecla 1 → 1, con el cursor ANTES del cero", () => {
  // Medido: inputType="insertText" data="1" value="10"
  assert.equal(alEscribirNumero("0", tecla("10", "1")), "1");
});

test("0 + tecla 1 → 1, con el cursor DESPUÉS del cero", () => {
  // Medido: inputType="insertText" data="1" value="01"
  assert.equal(alEscribirNumero("0", tecla("01", "1")), "1");
});

test("0 + tecla 7 → 7", () => {
  assert.equal(alEscribirNumero("0", tecla("70", "7")), "7");
});

test("7 + tecla 5 → 75, con normalidad", () => {
  assert.equal(alEscribirNumero("7", tecla("75", "5")), "75");
});

test("1 + tecla 0 → 10: el 10 se sigue pudiendo escribir", () => {
  const trasElUno = alEscribirNumero("0", tecla("10", "1"));
  assert.equal(trasElUno, "1");
  assert.equal(alEscribirNumero(trasElUno, tecla("10", "0")), "10");
});

// ══════════════════════════════════════════════════════════════════════════
// PEGAR SOBRE EL CERO — EL CASO QUE EL TEXTO SOLO NO PODÍA RESOLVER
// ══════════════════════════════════════════════════════════════════════════

test('0 + pegar "10" → 10', () => {
  // Medido: inputType="insertFromPaste" data="10" value="010"
  assert.equal(alEscribirNumero("0", pegado("010", "10")), "10");
});

test('0 + pegar "12" → 12', () => {
  // Medido: inputType="insertFromPaste" data="12" value="012"
  assert.equal(alEscribirNumero("0", pegado("012", "12")), "12");
});

test("CONTRAPRUEBA: teclear y pegar pueden dejar EL MISMO texto y terminan distinto", () => {
  // Es el caso que hace que mirar solo los caracteres no alcance. Si alguien
  // sacara la señal del evento, estas dos líneas darían lo mismo y una de las
  // dos estaría mal.
  const tecleado = alEscribirNumero("0", tecla("10", "1"));
  const pegadoIgual = alEscribirNumero("0", pegado("10", "10"));

  assert.equal(tecleado, "1", "teclear un 1 sobre el cero tiene que dejar 1");
  assert.equal(pegadoIgual, "10", 'pegar "10" sobre el cero tiene que dejar 10');
  assert.notEqual(tecleado, pegadoIgual, "sin el evento, los dos casos son indistinguibles");
});

test('pegar un decimal sobre el cero: "1.5" queda 1.5', () => {
  assert.equal(alEscribirNumero("0", pegado("01.5", "1.5")), "1.5");
});

test("pegar algo que no es un número no se acepta como valor", () => {
  // El campo es numérico y el navegador ya lo rechaza; la regla no lo empeora
  // metiéndole texto suelto.
  assert.equal(alEscribirNumero("0", pegado("", "abc")), "");
  assert.equal(alEscribirNumero("0", pegado("0", "-")), "0");
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE LA REGLA NO TOCA
// ══════════════════════════════════════════════════════════════════════════

test("los decimales se siguen escribiendo: 0 → 0. → 0.5", () => {
  // El punto no es un número, así que la regla lo deja pasar.
  assert.equal(alEscribirNumero("0", tecla("0.", ".")), "0.");
  assert.equal(alEscribirNumero("0.", tecla("0.5", "5")), "0.5");
});

test("BORRAR no es insertar: el campo se puede vaciar", () => {
  // `deleteContentBackward` no trae `data`. Si la regla lo tomara por una
  // inserción, un campo en 0 no se podría vaciar nunca.
  assert.equal(alEscribirNumero("0", evento("", "deleteContentBackward", null)), "");
  assert.equal(alEscribirNumero("50", evento("5", "deleteContentBackward", null)), "5");
});

test("un evento sin señal devuelve el valor tal cual: no se adivina", () => {
  assert.equal(alEscribirNumero("0", { target: { value: "10" } }), "10");
  assert.equal(alEscribirNumero("0", { target: { value: "10" }, nativeEvent: {} }), "10");
});

test("con cualquier otro valor previo devuelve exactamente lo que llegó", () => {
  assert.equal(alEscribirNumero("12", tecla("125", "5")), "125");
  assert.equal(alEscribirNumero("3", pegado("399", "99")), "399");
  assert.equal(alEscribirNumero("0.5", tecla("0.55", "5")), "0.55");
});

// ══════════════════════════════════════════════════════════════════════════
// LA COMISIÓN: VACÍO Y CERO SIGUEN SIENDO COSAS DISTINTAS
// ══════════════════════════════════════════════════════════════════════════

test("LA COMISIÓN VACÍA SIGUE VACÍA: la regla no la toca", () => {
  assert.equal(alEscribirNumero("", tecla("5", "5")), "5");
  assert.equal(alEscribirNumero("5", evento("", "deleteContentBackward", null)), "");
});

test("el 0 explícito se sigue pudiendo escribir en un campo vacío", () => {
  // "en este local la comisión es 0 %", que no es lo mismo que heredarla.
  assert.equal(alEscribirNumero("", tecla("0", "0")), "0");
});

test("y desde el 0 explícito se puede volver a vaciar para heredar", () => {
  assert.equal(alEscribirNumero("0", evento("", "deleteContentBackward", null)), "");
});

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

test("escribir sobre el cero guarda el número escrito, no el pegado al lado", () => {
  const form = estadoInicialDeMedio({ ...BASE, recargoPct: 0, comisionHeredada: true });
  assert.equal(form.recargoPct, "0");

  const conElUno = { ...form, recargoPct: alEscribirNumero(form.recargoPct, tecla("10", "1")) };
  assert.equal(cuerpoParaGuardar(conElUno).recargoPct, 1);
  // Y la comisión de ese mismo medio sigue heredando: no se tocó.
  assert.equal(cuerpoParaGuardar(conElUno).comisionPct, null);
});

test("y pegar sobre el cero guarda lo pegado", () => {
  const form = estadoInicialDeMedio({ ...BASE, recargoPct: 0, comisionHeredada: true });
  const conElDoce = { ...form, recargoPct: alEscribirNumero(form.recargoPct, pegado("012", "12")) };
  assert.equal(cuerpoParaGuardar(conElDoce).recargoPct, 12);
});

test("el resto del cuerpo no cambia", () => {
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
// LOS DOS CAMPOS DEL FORMULARIO LO USAN, Y RECIBEN EL EVENTO
// ══════════════════════════════════════════════════════════════════════════

test("recargo y comisión pasan los dos por la misma regla, con el evento entero", () => {
  const form = readFileSync("components/configuracion-pos/FormularioMedio.jsx", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.match(form, /set\("recargoPct", alEscribirNumero\(form\.recargoPct, e\)\)/);
  assert.match(form, /set\("comisionPct", alEscribirNumero\(form\.comisionPct, e\)\)/);
  // Si se le pasara `e.target.value`, la regla perdería la señal que la hace
  // funcionar y volvería a ser una heurística de caracteres.
  assert.doesNotMatch(form, /alEscribirNumero\([^)]*e\.target\.value/);
  // Y no se resolvió tocando el DOM ni con un temporizador.
  assert.doesNotMatch(form, /setTimeout|\.select\(\)|document\.querySelector/);
});

test("los otros campos numéricos no se tocaron", () => {
  // `orden` sigue con su handler de siempre: esta tanda es de los porcentajes.
  const form = readFileSync("components/configuracion-pos/FormularioMedio.jsx", "utf8");
  assert.match(form, /set\("orden", e\.target\.value\)/);
});
