// EL CAMPO DE HORA DEL KIT: "HH:MM" DE 24 HORAS Y SIN EL RELOJ DEL NAVEGADOR.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiCampoHora.test.mjs
//
// En producción, Turnos operativos usaba `<input type="time">`: Android lo
// mostraba como "06:30 p. m." y al tocarlo abría el reloj circular de Chrome,
// que no entra en la pantalla ni respeta el tema. Estos candados afirman que
// el campo cerrado dibuja el valor tal cual, que no queda ningún campo de hora
// nativo y que lo que vuelve a la pantalla es el mismo "HH:MM" que espera el
// servidor.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SunmiCampoHora, { SIN_HORA, digitosDe, horaDePartes, partesDeHora, textoDeHora } from "./SunmiCampoHora.jsx";

const montar = (value, extra = {}) =>
  renderToStaticMarkup(React.createElement(SunmiCampoHora, { value, onChange: () => {}, etiqueta: "Desde", ...extra }));

const sinComentarios = (texto) => texto.replace(/\/\/[^\n]*/g, "");

test("el campo cerrado muestra la hora en 24 h, tal cual, sin AM ni PM", () => {
  for (const hora of ["06:30", "18:30", "00:00", "23:59", "13:00", "00:30"]) {
    assert.equal(textoDeHora(hora), hora);
    const html = montar(hora);
    assert.match(html, new RegExp(`>${hora}</button>`), `${hora} no se dibuja tal cual`);
    assert.doesNotMatch(html, /\b[ap]\.?\s?m\.?(?=[\s<])|\bAM\b|\bPM\b/i, `${hora}: apareció AM/PM`);
  }
});

test("sin hora se dibuja --:--, y una hora rota no se interpreta", () => {
  assert.equal(textoDeHora(""), SIN_HORA);
  assert.equal(textoDeHora(null), SIN_HORA);
  assert.equal(textoDeHora("6:30"), SIN_HORA);
  assert.equal(textoDeHora("24:00"), SIN_HORA);
  assert.match(montar(""), />--:--<\/button>/);
});

test("no hay ningún campo de hora nativo: el campo es un botón que abre la hoja del kit", () => {
  const html = montar("18:30");
  assert.doesNotMatch(html, /type="time"/);
  assert.doesNotMatch(html, /<input/, "cerrado no hay input: no se abre teclado ni selector del navegador");
  assert.match(html, /<button type="button"[^>]*aria-haspopup="dialog"/);
  const fuente = sinComentarios(fs.readFileSync(new URL("./SunmiCampoHora.jsx", import.meta.url), "utf8"));
  assert.doesNotMatch(fuente, /type="time"|showPicker/);
  assert.match(fuente, /forma="hoja-o-centrado"/, "la hoja es la del kit");
});

test("la hoja: hora de 00 a 23, minutos de 00 a 59, de a uno y en dos dígitos", () => {
  assert.deepEqual(partesDeHora("06:30"), { hora: "06", minuto: "30" });
  assert.deepEqual(partesDeHora("23:59"), { hora: "23", minuto: "59" });
  assert.deepEqual(partesDeHora(""), { hora: "00", minuto: "00" });
  // El −/+ de SunmiCampoCantidad devuelve el número sin ceros: vuelven.
  assert.equal(digitosDe("7", 23), "07");
  assert.equal(digitosDe("0", 59), "00");
  // Tipear corre los dígitos; nunca se pasa del tope ni baja de cero.
  assert.equal(digitosDe("018", 23), "18");
  assert.equal(digitosDe("182", 23), "23");
  assert.equal(digitosDe("067", 59), "59");
  assert.equal(digitosDe("", 23), "00");
  assert.equal(digitosDe("-3", 59), "03");
});

test("lo que vuelve a la pantalla es el HH:MM que espera el servidor", () => {
  assert.equal(horaDePartes("06", "30"), "06:30");
  assert.equal(horaDePartes("18", "30"), "18:30");
  assert.equal(horaDePartes("00", "00"), "00:00");
  assert.equal(horaDePartes("23", "59"), "23:59");
  // Cualquier minuto, no solo múltiplos de 5.
  assert.equal(horaDePartes("07", "07"), "07:07");
});

test("Turnos operativos usa la pieza y sigue mandando las mismas horas a la misma API", () => {
  const pagina = sinComentarios(fs.readFileSync(new URL("../../app/modulos/configuracion/pos-ventas/turnos/page.jsx", import.meta.url), "utf8"));
  assert.doesNotMatch(pagina, /type="time"/, "volvió el campo de hora nativo");
  assert.equal((pagina.match(/<SunmiCampoHora\b/g) || []).length, 4, "desde y hasta, del turno nuevo y de cada turno");
  assert.match(pagina, /horaInicioReconocimiento: nuevaVentana\.inicio, horaFinReconocimiento: nuevaVentana\.fin/);
  assert.match(pagina, /pedir\(URL_CATALOGO, "POST", cuerpo\)/);
  assert.match(pagina, /horaInicioReconocimiento: v\.inicio \|\| null, horaFinReconocimiento: v\.fin \|\| null/);
});
