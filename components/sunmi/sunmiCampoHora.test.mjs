// EL CAMPO DE HORA DEL KIT: "HH:MM" DE 24 HORAS, DOS RUEDAS Y SIN EL RELOJ DEL
// NAVEGADOR.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiCampoHora.test.mjs
//
// En producción, Turnos operativos usaba `<input type="time">`: Android lo
// mostraba como "06:30 p. m." y al tocarlo abría el reloj circular de Chrome.
// La primera versión propia —dos campos con − y +— se rechazó al verla; el
// diseño aprobado son dos ruedas (Figma `uptcbzbnV5M4q32kgmupF9`, nodo
// `22:2`). Estos candados afirman el campo cerrado, las ruedas, que Cancelar
// no escribe y que la pantalla manda lo mismo a la misma API.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SunmiCampoHora, {
  RuedasDeHora,
  SIN_HORA,
  VALORES_HORA,
  VALORES_MINUTO,
  horaDePartes,
  indiceDeScroll,
  partesDeHora,
  textoDeHora,
} from "./SunmiCampoHora.jsx";

const HORAS = ["00:00", "06:30", "13:00", "18:30", "23:59"];
const AM_PM = /\b[ap]\.?\s?m\.?(?=[\s<])|\bAM\b|\bPM\b/i;

const montar = (value) =>
  renderToStaticMarkup(React.createElement(SunmiCampoHora, { value, onChange: () => {}, etiqueta: "Desde" }));
const ruedas = (value) =>
  renderToStaticMarkup(React.createElement(RuedasDeHora, { partes: partesDeHora(value), onPartes: () => {}, etiqueta: "Desde" }));
const sinComentarios = (texto) => texto.replace(/\/\/[^\n]*/g, "");
const FUENTE = sinComentarios(fs.readFileSync(new URL("./SunmiCampoHora.jsx", import.meta.url), "utf8"));

test("el campo cerrado muestra la hora en 24 h, tal cual, sin AM ni PM", () => {
  for (const hora of HORAS) {
    assert.equal(textoDeHora(hora), hora);
    const html = montar(hora);
    assert.match(html, new RegExp(`>${hora}</button>`), `${hora} no se dibuja tal cual`);
    assert.doesNotMatch(html, AM_PM, `${hora}: apareció AM/PM`);
  }
  assert.equal(textoDeHora(""), SIN_HORA);
  assert.equal(textoDeHora("6:30"), SIN_HORA);
  assert.match(montar(""), />--:--<\/button>/);
});

test("no hay ningún campo de hora nativo: el campo es un botón que abre la hoja del kit", () => {
  const html = montar("18:30");
  assert.doesNotMatch(html, /type="time"|<input/);
  assert.match(html, /<button type="button"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(FUENTE, /type="time"|showPicker/);
  assert.match(FUENTE, /forma="hoja-o-centrado"/);
  assert.match(FUENTE, /title="Elegir hora"/);
  assert.match(FUENTE, />Formato 24 horas</);
});

test("dos ruedas: Hora 00–23 y Minutos 00–59, de a uno, sin − ni +", () => {
  assert.equal(VALORES_HORA.length, 24);
  assert.equal(VALORES_HORA[0], "00");
  assert.equal(VALORES_HORA[23], "23");
  assert.equal(VALORES_MINUTO.length, 60);
  assert.equal(VALORES_MINUTO[59], "59");
  const html = ruedas("06:30");
  assert.equal((html.match(/role="listbox"/g) || []).length, 2);
  assert.match(html, /role="listbox" aria-label="Hora, Desde"/);
  assert.match(html, /role="listbox" aria-label="Minutos, Desde"/);
  assert.equal((html.match(/role="option"/g) || []).length, 24 + 60);
  assert.doesNotMatch(html, /[−+]<|Sumar uno|Restar uno/, "volvieron los botones − / +");
  assert.doesNotMatch(FUENTE, /SunmiCampoCantidad/);
  assert.doesNotMatch(html, AM_PM);
});

test("con una hora cargada, cada rueda abre en su valor", () => {
  for (const hora of HORAS) {
    const [h, m] = hora.split(":");
    const elegidos = [...ruedas(hora).matchAll(/aria-selected="true"[^>]*>([0-9]{2})</g)].map((x) => x[1]);
    assert.deepEqual(elegidos, [h, m], hora);
  }
  assert.deepEqual(partesDeHora("18:30"), { hora: 18, minuto: 30 });
  assert.deepEqual(partesDeHora(""), { hora: 0, minuto: 0 });
});

test("el renglón elegido es el que quedó en el medio de la rueda", () => {
  assert.equal(indiceDeScroll(0, 44, 24), 0);
  assert.equal(indiceDeScroll(6 * 44, 44, 24), 6);
  assert.equal(indiceDeScroll(6 * 44 + 20, 44, 24), 6);
  assert.equal(indiceDeScroll(6 * 44 + 23, 44, 24), 7);
  assert.equal(indiceDeScroll(99999, 44, 60), 59);
  assert.equal(indiceDeScroll(-30, 44, 60), 0);
  assert.equal(indiceDeScroll(100, 0, 60), 0, "sin medir el renglón no inventa un índice");
});

test("Confirmar devuelve HH:MM; Cancelar y tocar afuera no llaman a onChange", () => {
  for (const hora of HORAS) assert.equal(horaDePartes(partesDeHora(hora)), hora);
  assert.equal(horaDePartes({ hora: 7, minuto: 7 }), "07:07", "cualquier minuto, no solo múltiplos de 5");
  const cerrar = FUENTE.match(/const cerrar = \(\) => ([^;]*);/);
  assert.ok(cerrar, "se fue `cerrar`");
  // Cerrar solo cierra: cualquier otra cosa —llamar a `onChange`, a `elegir`—
  // escribiría el valor al cancelar.
  assert.equal(cerrar[1].trim(), "setAbierta(false)", "cerrar hace algo más que cerrar");
  assert.match(FUENTE, /onClose=\{cerrar\}/);
  assert.match(FUENTE, /<SunmiButton color="slate" onClick=\{cerrar\}[^>]*>\s*Cancelar/);
  assert.match(FUENTE, /onClick=\{\(\) => elegir\(horaDePartes\(partes\)\)\}[^>]*>\s*Confirmar/);
});

test("Turnos operativos usa la pieza y sigue mandando las mismas horas a la misma API", () => {
  const pagina = sinComentarios(fs.readFileSync(new URL("../../app/modulos/configuracion/pos-ventas/turnos/page.jsx", import.meta.url), "utf8"));
  assert.doesNotMatch(pagina, /type="time"/, "volvió el campo de hora nativo");
  assert.equal((pagina.match(/<SunmiCampoHora\b/g) || []).length, 4, "desde y hasta, del turno nuevo y de cada turno");
  assert.match(pagina, /horaInicioReconocimiento: nuevaVentana\.inicio, horaFinReconocimiento: nuevaVentana\.fin/);
  assert.match(pagina, /pedir\(URL_CATALOGO, "POST", cuerpo\)/);
  assert.match(pagina, /horaInicioReconocimiento: v\.inicio \|\| null, horaFinReconocimiento: v\.fin \|\| null/);
});
