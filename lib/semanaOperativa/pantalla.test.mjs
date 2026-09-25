// LA PANTALLA DE SEMANA OPERATIVA: SUS SIETE ESTADOS, SIN CALENDARIO PROPIO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/pantalla.test.mjs
//
// La pantalla depende del contexto de usuario y del shell, así que no se monta
// acá: se afirma sobre su código —sin comentarios— lo que ningún otro candado ve.
// Lo que dibuja cada pieza del kit lo afirman los candados del kit, y lo que dice
// cada texto, `textos.test.mjs`. Contra el servidor real, `pruebas-db`.
//
// Diseño: Figma `fYqIEZxHRb6yx6pIUrUG2h`, página 48:11.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sinComentarios = (t) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PAGINA = sinComentarios(readFileSync("app/modulos/configuracion/semana-operativa/page.jsx", "utf8"));

test("los siete estados del diseño están en la pantalla", () => {
  const estados = [
    ["01 · Configurada", ["Semana actual", "Cambiar día de inicio"]],
    ["02 · Sin configurar", ["Todavía no está configurada", "Configurar semana"]],
    ["03 · Cambio programado", ["Cambio programado", "Cambiar el cambio programado", "Cancelar cambio programado"]],
    ["04 · Elegir día", ["¿Qué día empieza tu semana?", "Tu semana iría de", "Continuar"]],
    ["05 · Confirmar cambio", ["Confirmar cambio", "confirmacionDelCambio("]],
    ["06 · Reemplazar o cancelar", ["Si confirmás otro día, lo reemplaza", "confirmacionDeCancelar("]],
    ["07 · Admin sin ubicación", ["Sin ubicación seleccionada", "Elegí una ubicación"]],
  ];
  for (const [estado, marcas] of estados) {
    for (const m of marcas) assert.ok(PAGINA.includes(m), `${estado}: falta «${m}»`);
  }
});

test("la vista previa sale de la función del servidor, no de un calendario propio", () => {
  assert.match(PAGINA, /previsualizarCambio\(\{ vigencias: datos\.vigencias, diaDeCorte: Number\(dia\), hoy: datos\.hoy \}\)/);
  for (const prohibido of [/sumarDias\(/, /rangoDelPeriodo\(/, /new Date\(/, /fechaAR\(/, /fechaLargaAR\(/, /getDay\(/]) {
    assert.doesNotMatch(PAGINA, prohibido, `la pantalla calcula fechas por su cuenta: ${prohibido}`);
  }
});

test("el selector es el del kit, con los siete días, y FUERA de una tarjeta", () => {
  assert.match(PAGINA, /<SunmiSelectorDeOpciones\s+opciones=\{OPCIONES_DE_DIA\}/);
  // Adentro de una tarjeta, a 360 px, el grupo mide 274 y las siete teclas no
  // llegan a 44 px de área táctil ni cubriendo el gap. En la columna de la
  // página mide 304 y cada una da 44,0 (medido con elementFromPoint).
  assert.doesNotMatch(PAGINA, /<SunmiCard\b/, "el selector volvió adentro de una tarjeta");
});

test("la ubicación NUNCA viaja en el pedido: la resuelve el servidor", () => {
  assert.doesNotMatch(PAGINA, /localId/, "la pantalla manda o lee un localId");
  assert.match(PAGINA, /escribir\("PUT", \{ diaDeCorte: Number\(dia\), reemplazarPendiente: Boolean\(programado\) \}\)/);
  assert.match(PAGINA, /escribir\("DELETE"\)/);
  assert.doesNotMatch(PAGINA, /selector de local|SunmiSelectAdv/i, "apareció un selector de ubicación");
});

test("cancelar y cambiar pasan SIEMPRE por la confirmación", () => {
  // Las dos escrituras viven adentro del `onConfirmar` de la hoja, y a la hoja se
  // llega solo tocando el botón de su estado.
  const onConfirmar = PAGINA.slice(PAGINA.indexOf("onConfirmar="), PAGINA.indexOf("onVolver={() => setHoja(null)}"));
  assert.match(onConfirmar, /escribir\("DELETE"\)/);
  assert.match(onConfirmar, /escribir\("PUT"/);
  assert.equal((PAGINA.match(/escribir\(/g) || []).length, 2, "hay una escritura fuera de la confirmación");
  assert.match(PAGINA, /onClick=\{\(\) => setHoja\("cancelar"\)\}/);
  assert.match(PAGINA, /onClick=\{\(\) => setHoja\("cambio"\)\}/);
});

test("sin elementos crudos ni colores fijos", () => {
  assert.doesNotMatch(PAGINA, /<(button|select|input|textarea)\b/, "un elemento crudo con reemplazo en el kit");
  assert.doesNotMatch(PAGINA, /(text|bg|border)-(red|amber|yellow|green|slate|gray|orange|blue)-\d/, "un color fijo de Tailwind");
});

test("el número del día de corte nunca se dibuja", () => {
  // Se muestra siempre como nombre de día, con `nombreDeLaSemana`. Se mira el
  // TEXTO de los elementos —lo que queda entre `>` y `<`—, no los props: `valor=
  // {dia}` es la clave elegida del selector, y ésa sí tiene que ser el número.
  const textos = [...PAGINA.matchAll(/>([^<>]*)</g)].map((m) => m[1]).join("\n");
  assert.doesNotMatch(textos, /\{\s*(dia|semana\.diaDeCorte|programado\.diaDeCorte|datos\.semana\.diaDeCorte)\s*\}/);
  // Contraprueba del recorte: la frase del día elegido SÍ está entre los textos.
  assert.match(textos, /Tu semana iría de \{nombreDeLaSemana\(Number\(dia\)\)\.toLowerCase\(\)\}/);
});
