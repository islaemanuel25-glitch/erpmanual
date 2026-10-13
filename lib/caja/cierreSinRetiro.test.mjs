// CANDADO: UN CIERRE SE CONFIRMA CON RETIRO $0 SOLO SI SE DECLARA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cierreSinRetiro.test.mjs
//
// ── EL DEFECTO, MEDIDO ──────────────────────────────────────────────────────
//
// Con todo el efectivo retirado en los arqueos, el retiro del cierre es $0. La
// pantalla del cierre habilitaba "Confirmar" solo con un desglose no vacío
// (`hayRetiroContado = !desgloseVacio(desgloseRetiro)`), así que los cajeros
// cargaban $0,01 en "Monedas" para destrabarlo, y ese centavo aparecía como
// sobrante en casi todas las cajas.
//
// El arreglo: "No queda nada para retirar" deja el retiro en $0 EXPLÍCITO. Sin
// esa declaración, un desglose vacío sigue sin habilitar: que no se confirme un
// cierre sin contar por descuido. Las cajas viejas no se corrigen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { retiroListoParaConfirmar } from "./conteoBilletes.js";
import { calcularCierreDesdeRetiro } from "./cierreRelevo.js";
import { evaluarDesproporcionDesglose, validarDesgloseServidor } from "./desgloseServidor.js";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGINA = "app/modulos/pos-ventas/cierres/[token]/page.jsx";
const RUTA = "app/api/pos-ventas/cierres/[token]/confirmar/route.js";

test("vacío NO habilita; vacío declarado sí; algo contado sí", () => {
  assert.equal(retiroListoParaConfirmar({}), false, "un desglose vacío habilitó sin declararlo");
  assert.equal(retiroListoParaConfirmar({}, { sinRetiroExplicito: false }), false);
  assert.equal(retiroListoParaConfirmar({}, { sinRetiroExplicito: true }), true, "el $0 declarado no habilita");
  assert.equal(retiroListoParaConfirmar({ 1000: 2 }), true);
  // Solo un `true` declara: un valor cualquiera no.
  assert.equal(retiroListoParaConfirmar({}, { sinRetiroExplicito: "si" }), false);
});

test("la pantalla habilita confirmar con esa regla y el botón la declara", () => {
  const src = sinComentarios(PAGINA);
  assert.match(src, /const hayRetiroContado = retiroListoParaConfirmar\(desgloseRetiro, \{ sinRetiroExplicito: sinRetiro \}\);/);
  assert.match(src, /puedeConfirmar = conCorteNuevo\s*\?\s*hayRetiroContado && proporcion\.valido/);
  // El botón existe y declara el $0.
  assert.match(src, /onClick=\{declararSinRetiro\}[\s\S]{0,200}No queda nada para retirar/);
  assert.match(src, /const declararSinRetiro = \(\) => \{\s*setDesgloseRetiro\(\{\}\);\s*setSinRetiro\(true\);/);
  // Cargar algo después deshace la declaración: vale lo contado.
  assert.match(src, /const actualizarRetiro = \(nuevo\) => \{\s*setDesgloseRetiro\(nuevo\);\s*setSinRetiro\(false\);/);
  // Y ya no se habilita por el desglose a secas.
  assert.doesNotMatch(src, /hayRetiroContado = !desgloseVacio\(desgloseRetiro\)/);
});

test("el servidor acepta el retiro vacío y lo cierra en $0, sin movimiento", () => {
  // Lo que hace la ruta con un desglose vacío, ejercido con sus mismas piezas.
  const retiro = validarDesgloseServidor({}, { etiqueta: "conteo del dinero retirado", permitirVacio: true });
  assert.equal(retiro.valido, true, retiro.error);
  assert.equal(retiro.total, 0);
  const proporcion = evaluarDesproporcionDesglose({ desglose: retiro.desglose, referencia: 0, etiquetaReferencia: "x" });
  assert.equal(proporcion.valido, true);
  const cuentas = calcularCierreDesdeRetiro({ totalRetiroContado: retiro.total, totalCambio: 20000, efectivoRetiradoEsperado: 0 });
  assert.equal(cuentas.valido, true, cuentas.error);
  assert.equal(cuentas.retiroFinal, 0);
  assert.equal(cuentas.diferencia, 0, "un $0 declarado con $0 esperado tiene que dar sin diferencia, no un sobrante");

  // Y la ruta usa esas piezas así: vacío permitido, y el movimiento de caja
  // solo si se retiró algo.
  const src = sinComentarios(RUTA);
  assert.match(src, /validarDesgloseServidor\(body\?\.desgloseRetiroContado, \{[\s\S]{0,120}permitirVacio: true/);
  assert.match(src, /if \(cuentas\.retiroFinal > 0\) \{/);
});
