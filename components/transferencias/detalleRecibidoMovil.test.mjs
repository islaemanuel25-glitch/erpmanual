// EL DETALLE RECIBIDO DEL TELÉFONO SE MONTA, Y SUS TARJETAS TIENEN UNA SOLA FORMA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/detalleRecibidoMovil.test.mjs
//
// Se RENDERIZA con `react-dom/server`. No mide píxeles —un render a string no
// tiene layout—; lo que sí afirma es la causa de que dos tarjetas midan
// distinto: que todas tengan los mismos cuatro renglones de alto fijo, sin
// renglones que aparezcan según el caso y sin texto que pueda partirse en dos.
//
// Las líneas tienen la forma de `/api/transferencias/detalle`: ver el
// encabezado de `lib/transferencias/detalleRecibido.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DetalleRecibidoMovil from "./DetalleRecibidoMovil.jsx";

const linea = (extra = {}) => ({
  id: 1,
  nombre: "COCA COLA 1.5L",
  codigoBarra: "7790895000430",
  cantidadEnviada: 6,
  cantidadRecibida: 6,
  recibidoUnidadesSueltas: null,
  precioCosto: 1000,
  subtotal: 6000,
  subtotalRecibido: 6000,
  devolucionOrigen: 0,
  agregadoEnRecepcion: false,
  agregadoEnRecepcionPor: null,
  agregadoEnRecepcionAt: null,
  motivoPrincipal: "",
  motivoDetalle: "",
  unidadEnviada: "UNIDAD",
  factorPack: 1,
  unidadMedida: "unidad",
  esFiambreFijo: false,
  pesoReferenciaKg: null,
  ...extra,
});

const exacta = linea({ id: 10, nombre: "9 DE ORO AGRIDULCE" });
const faltan = linea({
  id: 11, cantidadRecibida: 5, devolucionOrigen: 1, subtotalRecibido: 5000, motivoPrincipal: "Faltante",
});
const agregada = linea({
  id: 12, nombre: "QUILMES STOUT 1L", cantidadEnviada: 0, cantidadRecibida: 1, subtotal: 0, subtotalRecibido: 2780,
  agregadoEnRecepcion: true, agregadoEnRecepcionPor: { id: 3, nombre: "Ana" },
});

const pintar = (items) =>
  renderToStaticMarkup(
    React.createElement(DetalleRecibidoMovil, {
      item: { id: 504, estado: "Recibida", items },
      importeTotal: 1058751.2,
      fecha: "2026-10-23T15:46:00.000Z",
    })
  );

const tarjetas = (html) => html.split("data-tarjeta-recibida").slice(1);

test("con diferencias abre filtrado: solo las tarjetas con diferencia", () => {
  const html = pintar([exacta, faltan, agregada]);
  assert.equal(tarjetas(html).length, 2);
  assert.ok(html.includes("Faltan 1"));
  assert.ok(html.includes("Agregado"));
  assert.ok(html.includes("No venía → Recibida 1"));
  assert.ok(html.includes("Enviada 6 → Recibida 5"));
  assert.ok(html.includes("antes $6.000,00"));
  assert.ok(html.includes("Motivo:"));
  assert.ok(!html.includes("9 DE ORO AGRIDULCE"), "la exacta no va en 'Con diferencia'");
  assert.ok(html.includes("Recibida · 2 con diferencia"));
  assert.ok(html.includes("$1.058.751,20"), "el total con el formateador único");
  assert.ok(html.includes("Viernes 23 · 12:46 · 2 enviados · 1 agregado"));
});

test("sin diferencias abre en 'Todos' y lo dice", () => {
  const html = pintar([exacta]);
  assert.equal(tarjetas(html).length, 1);
  assert.ok(html.includes("Recibida sin diferencias"));
  assert.ok(html.includes("✓ Sin diferencia"));
  assert.ok(!html.includes("antes "), "sin cambio de importe no hay 'antes'");
});

test("todas las tarjetas tienen la misma estructura de alto fijo", () => {
  // Una sola forma para todas: se le sacan los textos y tiene que quedar el
  // mismo esqueleto de clases. Una tarjeta con un renglón de más o un texto que
  // puede partirse cambiaría el esqueleto.
  const esqueleto = (t) => (t.match(/class="[^"]*"/g) || [])
    .map((c) => c.replace(/sunmi-(border-warning|border-base|state-warning|state-success|text-warning|text-success|text-muted|state-warning-soft)/g, "TONO"))
    .filter((c) => /h-7|h-8/.test(c));
  const html = [pintar([exacta]), pintar([faltan, agregada])].join("");
  const formas = tarjetas(html).map((t) => esqueleto(t).join("|"));
  assert.equal(formas.length, 3);
  assert.equal(new Set(formas).size, 1, `las tarjetas difieren:\n${formas.join("\n")}`);
  for (const t of tarjetas(html)) {
    assert.equal((t.match(/\bh-7\b/g) || []).length, 3, "tres renglones de alto fijo");
    assert.equal((t.match(/\bh-8\b/g) || []).length, 1, "y el recuadro de abajo");
  }
});

test("lo que se sacó de la tarjeta vieja no vuelve", () => {
  const html = pintar([exacta, faltan, agregada]);
  assert.ok(!html.includes("font-mono"), "la letra monoespaciada se sacó");
  assert.ok(!/Diferencia\s*<|Devuelto\s*</.test(html), "la fila Diferencia / Devuelto se sacó");
  assert.equal(html.split("<button").length - 1, 4, "los únicos botones son los cuatro filtros");
});
