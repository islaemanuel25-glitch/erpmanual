// CANDADO: LA CAUSA DEL AJUSTE MANUAL EN LA PANTALLA.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/modalAjusteCausa.test.mjs
//
// El modal se dibuja de verdad para lo que se ve al abrir, y se lee el fuente
// para lo que depende de lo que el usuario toca —la dirección de Fijar, la
// causa que se manda—, que un render estático no puede ejercer.
//
// Que la causa llegue a `AuditoriaStock` y que el servidor la vuelva a juzgar
// contra el stock real lo prueba `scripts/pruebas-db/ajusteStockTrazable.mjs`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import ModalAjuste from "@/components/stock_locales/ModalAjuste";

const sinComentarios = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const FUENTE = sinComentarios(readFileSync("components/stock_locales/ModalAjuste.jsx", "utf8"));

const PRODUCTO = { id: 5, nombre: "Gaseosa", stock: 10, unidadMedida: "unidad", factorPack: 1 };
const LOCAL = { id: 2, nombre: "Local", esDeposito: false };
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const html = renderToStaticMarkup(createElement(ModalAjuste, { open: true, onClose: () => {}, producto: PRODUCTO, local: LOCAL }));
const t = texto(html);

test("al abrir es Sumar: ofrece Sobrante y Otro, y no las causas de una baja", () => {
  assert.match(t, /Sobrante/);
  assert.match(t, /Otro \(especificar\)/);
  assert.doesNotMatch(t, /Producto dañado/);
  assert.doesNotMatch(t, /Faltante/);
});

test("ya no dice 'Motivo (opcional)' sin saber la regla: la causa espera al servidor", () => {
  assert.doesNotMatch(t, /Motivo \(opcional\)/);
  // Mientras la regla no llegó, el rótulo no afirma nada.
  assert.match(t, / Causa /);
  assert.doesNotMatch(t, /Causa \((opcional|obligatoria)\)/);
});

test("el detalle es el textarea del kit, no uno crudo", () => {
  assert.doesNotMatch(FUENTE, /<textarea/);
  assert.match(FUENTE, /<SunmiTextarea/);
  assert.match(html, /aria-label="Detalle del ajuste"/);
});

test("la regla sale del GET de la misma ruta que la aplica", () => {
  assert.match(FUENTE, /fetch\(`\/api\/stock_locales\/ajustar\?localId=/);
  assert.match(FUENTE, /requireMotivoAjusteStock/);
});

test("restar baja, sumar sube, y fijar compara con el stock que se muestra", () => {
  assert.match(FUENTE, /tipo === "sumar"\s*\?\s*DIRECCION_DIFERENCIA\.AUMENTO/);
  assert.match(FUENTE, /tipo === "restar"\s*\?\s*DIRECCION_DIFERENCIA\.DISMINUCION/);
  assert.match(FUENTE, /direccionDeDiferencia\(Number\(producto\.stock \|\| 0\), totalUnidades\)/);
  assert.match(FUENTE, /motivosParaDireccion\(direccion\)/);
});

test("se manda la causa vigente como motivoPrincipal y el texto como detalle", () => {
  assert.match(FUENTE, /motivoPrincipal: causaVigente/);
  assert.match(FUENTE, /causasOfrecidas\.includes\(causa\) \? causa : null/, "una causa que dejó de tener sentido viajaría");
});

test("la pantalla, las reglas y la ruta usan el vocabulario compartido, sin lista propia", () => {
  // La pantalla ofrece las opciones con el vocabulario; el servidor valida con
  // las reglas del ajuste, que a su vez lo usan.
  const reglas = sinComentarios(readFileSync("lib/stock/ajusteManual.js", "utf8"));
  const ruta = sinComentarios(readFileSync("app/api/stock_locales/ajustar/route.js", "utf8"));
  assert.match(FUENTE, /from "@\/lib\/stock\/motivosDeDiferencia"/);
  assert.match(reglas, /from "@\/lib\/stock\/motivosDeDiferencia"/);
  assert.match(reglas, /motivoPermitidoPara\(/, "las reglas no validan la causa contra la dirección real");
  assert.match(ruta, /validarCausaContraElStockReal\(/, "el servidor no valida la causa contra el stock real");
  assert.doesNotMatch(FUENTE, /["']Producto dañado["']/, "el modal escribió su propia lista");
});

test("antes de mandar: causa si es obligatoria y hay diferencia, detalle si es Otro", () => {
  assert.match(FUENTE, /causaObligatoria && causasOfrecidas\.length > 0 && !causaVigente/);
  assert.match(FUENTE, /pideDetalle && !motivo\.trim\(\)/);
});
