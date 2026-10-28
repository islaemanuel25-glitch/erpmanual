// LO QUE PIDIÓ EL LOCAL SE RESALTA IGUAL QUE LO ENVIADO EN LA RECEPCIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/cantidadPedidaDestacada.test.mjs
//
// Pedido de Emanuel (2026-10-23): en la tarjeta de preparar, "Pidió 2 BULTO de
// 24 u" en una línea chica y suave no se distinguía. Ahora es como "Enviado 2
// PACK x10" en la recepción: el rótulo chico en suave y la cantidad en su
// presentación comercial, grande, en negrita y en el color de acento — con la
// MISMA pieza (`CantidadDestacada`) y el MISMO texto (`rotuloConSueltasCorto`).
//
// Sobre renglones REALES de la sección 14 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`: el agua, pedida por bulto, y
// el aceite, por unidad; y del lado de la recepción, la tarjeta del agua en la
// transferencia que salió de ese mismo pedido.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./nueva/page.jsx");
const { default: TarjetaRecepcionMovil } = await import("../../../components/transferencias/TarjetaRecepcionMovil.jsx");

afterEach(A.desmontarTodo);

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const fotoRecepcion = JSON.parse(readFileSync("components/transferencias/tarjetaRecepcionAntes.fixture.json", "utf8"));

/** Sin comentarios: acá la prosa nombra las mismas funciones que se buscan. */
const codigo = (rel) =>
  readFileSync(rel, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** El renglón resaltado de una tarjeta: el `<p>` cuyo primer hijo es el rótulo. */
function renglon(raiz, rotulo) {
  const p = [...raiz.querySelectorAll("p")].find((x) => x.firstElementChild?.textContent === rotulo);
  if (!p) return null;
  const [r, c] = p.children;
  return { p, clases: [p.className, r.className, c.className], cantidad: c.textContent.trim() };
}

/** El mismo renglón en la tarjeta de la RECEPCIÓN, pintada con su línea real. */
function delaRecepcion(nombre) {
  const caso = fotoRecepcion.casos.find((c) => c.momento === "antes" && c.nombre === nombre && c.puedeRecibir);
  const caja = document.createElement("div");
  caja.innerHTML = renderToStaticMarkup(React.createElement(TarjetaRecepcionMovil, { d: caso.d, puedeRecibir: true, onRevisar: () => {}, onAbrirFicha: () => {} }));
  return renglon(caja, "Enviado");
}

const montarPreparar = (detalle) =>
  A.montar({
    pagina: Pagina,
    busqueda: `posId=${dep.depositoIds.p1}`,
    inicio: A.real.carritoVacio,
    otras: {
      "/api/me": dep.depositoMe,
      "/api/operador/me": dep.depositoOperadorMe,
      "/api/pos-transferencias/opciones": dep.depositoOpciones,
      "/api/pos-transferencias/solicitados": dep.depositoSolicitadosNuevo,
      "/api/pos-transferencias/detalle": detalle,
    },
  });
const tarjeta = (nombre) => document.querySelector(`[data-linea-preparar="${nombre}"]`);

test("el fixture: un renglón por bulto y uno por unidad, como los manda la ruta", () => {
  const lineas = Object.fromEntries(dep.depositoDetalleNuevo.cuerpo.item.detalles.map((d) => [d.productoNombre, d]));
  assert.deepEqual([lineas["AGUA X6"].unidadMedida, lineas["AGUA X6"].factorPack, lineas["AGUA X6"].unidadSugerida, lineas["AGUA X6"].sugerido], ["pack", 6, "BULTO", 2]);
  assert.deepEqual([lineas.ACEITE.unidadMedida, lineas.ACEITE.unidadSugerida, lineas.ACEITE.sugerido], ["unidad", "UNIDAD", 2]);
});

test("por bulto: «Pidió» y «2 PACK x6», con las MISMAS clases que «Enviado» y su cantidad en la recepción", async () => {
  await montarPreparar(dep.depositoDetalleNuevo);
  const deposito = renglon(tarjeta("AGUA X6"), "Pidió");
  assert.ok(deposito, "la tarjeta del agua no tiene el renglón de lo pedido");
  assert.equal(deposito.cantidad, "2 PACK x6");
  const recepcion = delaRecepcion("AGUA X6");
  assert.ok(recepcion, "la tarjeta de la recepción no tiene su renglón de lo enviado");
  assert.deepEqual(deposito.clases, recepcion.clases);
  // Y la misma presentación dicha igual en los dos lados: el agua salió como se pidió.
  assert.equal(recepcion.cantidad, deposito.cantidad);
  // La clase de la cantidad: grande, en negrita y en acento.
  assert.match(deposito.clases[2], /\btext-base2\b/);
  assert.match(deposito.clases[2], /\bfont-semibold\b/);
  assert.match(deposito.clases[2], /\bsunmi-text-accent\b/);
  assert.match(deposito.clases[1], /\bsunmi-text-muted\b/);
});

test("por unidad: «Pidió» y «2 UNIDAD», con las mismas clases", async () => {
  await montarPreparar(dep.depositoDetalleNuevo);
  const deposito = renglon(tarjeta("ACEITE"), "Pidió");
  assert.equal(deposito.cantidad, "2 UNIDAD");
  assert.deepEqual(deposito.clases, delaRecepcion("ACEITE").clases);
});

test("una corregida: lo pedido arriba y «Va X de N · falta Y» debajo, como estaba", async () => {
  await montarPreparar(dep.depositoDetalleTrabajando);
  await A.tocar(A.botones().find((b) => b.textContent.startsWith("Con cambios")));
  const t = tarjeta("ARROZ");
  const pidio = renglon(t, "Pidió");
  assert.equal(pidio.cantidad, "3 UNIDAD");
  const cambio = [...t.querySelectorAll("p")].find((p) => /^Va 1 de 3 · falta 2$/.test(p.textContent));
  assert.ok(cambio, "se perdió la línea del cambio");
  assert.equal(pidio.p.compareDocumentPosition(cambio) & 4, 4, "la línea del cambio no quedó debajo");
  assert.match(cambio.className, /\bsunmi-text-accent\b/);
});

test("la misma pieza y la misma función en los dos lados, no copias", () => {
  const preparar = codigo("components/pos-transferencias/PrepararPedidoCelular.jsx");
  const recepcion = codigo("components/transferencias/TarjetaRecepcionMovil.jsx");
  const texto = codigo("lib/pedidos/preparacionDelPedido.js");
  assert.match(preparar, /<CantidadDestacada rotulo="Pidió" cantidad=\{rotuloDeLoPedido\(l\)\} \/>/);
  assert.match(recepcion, /<CantidadDestacada rotulo="Enviado" cantidad=\{rotuloConSueltasCorto\(mostrado\)\}>/);
  for (const [rel, src] of [["preparar", preparar], ["recepción", recepcion]]) {
    assert.match(src, /from "@\/components\/revision\/PiezasDeRevision"/, `${rel} no toma la pieza compartida`);
    assert.doesNotMatch(src, /text-base2 font-semibold tabular-nums sunmi-text-accent/, `${rel} escribe la clase de la cantidad a mano`);
  }
  // Del módulo compartido, junto con lo que haga falta de él (desde el
  // 2026-10-28 también `fmtCantidadDeEnvio`, para los kilos de lo que se pesa).
  assert.match(texto, /import \{[^}]*\brotuloConSueltasCorto\b[^}]*\} from "@\/lib\/transferencias\/presentacionEnvio";/);
  assert.match(texto, /return rotuloConSueltasCorto\(\{/);
  assert.match(texto, /presentacionDeProducto\(\{/);
});
