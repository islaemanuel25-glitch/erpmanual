// LOS IMPORTES QUE LA RECEPCIÓN ESCONDÍA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/importesRecepcion.test.mjs
//
// La recepción móvil dejaba controlar cantidades y ocultaba información
// económica que la transferencia YA TENÍA calculada: el endpoint de detalle
// devuelve `subtotal` por línea y `resumen.costoTotal` del documento, los dos
// resueltos por `valorizarDetalle` —la misma autoridad que usan los dos PDF y
// los agregados por período—.
//
// ── LO QUE MÁS SE CUIDA ACÁ, Y POR QUÉ ────────────────────────────────────
//
// Que la pantalla NO vuelva a calcular. Multiplicar cantidad por costo en el
// navegador se ve inofensivo y es exactamente cómo un documento termina
// mostrando dos totales distintos de sí mismo: una card filtrada que no entra
// en la suma, un redondeo que no coincide, una línea recibida que se valoriza
// distinto que en el PDF. La regla es de CLAUDE.md —una sola autoridad— y acá
// tiene su candado.
//
// Se RENDERIZA de verdad donde se puede: un candado de texto sobre el JSX no ve
// un componente que explota al montarse.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FilaProducto } from "./WorkspaceRecepcion.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** El código SIN comentarios: acá se afirma sobre lo que corre, no sobre prosa. */
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const MOVIL = "components/transferencias/RecepcionMovil.jsx";
const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";

const LINEA = {
  id: 7,
  nombre: "ALA POLVO MATIC 800GR",
  cantidad: 12,
  cantidadEnviada: 12,
  presentacionEnvio: "PACK",
  cantidadPresentada: 2,
  sueltasEnviadas: 0,
  factorPresentacion: 6,
  categoria: { id: 3, nombre: "Limpieza" },
  subtotal: 18600,
  precioCosto: 1550,
};

const render = (d) =>
  renderToStaticMarkup(
    React.createElement(FilaProducto, { d, activa: false, onElegir: () => {} })
  );

// ═══════════════════════════════════════════════════════════════════════════
// 1 y 2 · LOS DOS NÚMEROS APARECEN
// ═══════════════════════════════════════════════════════════════════════════

test("1. el resumen del móvil muestra el costoTotal del documento", () => {
  const src = codigoDe(MOVIL);
  assert.match(src, /Importe total/, "el resumen no muestra el importe del documento");
  assert.match(
    src,
    /fmtMoneda\(item\.resumen\.costoTotal\)/,
    "el total no sale de resumen.costoTotal"
  );
});

test("2. la card muestra el subtotal DE ESA LÍNEA", () => {
  const html = render(LINEA);
  assert.ok(html.includes("Importe"), "la card no dice Importe");
  // 18.600 con el formateador de la app, que es es-AR con dos decimales.
  assert.ok(html.includes("18.600,00"), `la card no muestra el subtotal: ${html}`);
});

test("2b. una línea sin subtotal no inventa un importe", () => {
  // Un "$ 0,00" donde no hay dato es peor que no mostrar nada: se lee como que
  // la mercadería no vale nada, y eso es una afirmación.
  const { subtotal, ...sinImporte } = LINEA;
  const html = render(sinImporte);
  assert.ok(!html.includes("Importe"), "dibujó un importe sobre una línea que no lo trae");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 y 4 · DÓNDE VA CADA COSA
// ═══════════════════════════════════════════════════════════════════════════

test("3. el importe va DEBAJO de la cantidad y la presentación", () => {
  const html = render(LINEA);
  const iCantidad = html.indexOf("PACK x6");
  const iImporte = html.indexOf("Importe");
  assert.ok(iCantidad > -1, "no está la presentación");
  assert.ok(iImporte > iCantidad, "el importe quedó arriba de la cantidad");
});

test("4. EL IMPORTE NO COMPARTE COLUMNA CON EL ESTADO", () => {
  // El estado vive en la columna derecha del primer renglón, adentro del mismo
  // `flex ... justify-between` que el nombre. El importe es un renglón propio.
  // Si alguien lo mete ahí adentro, dos datos de naturaleza distinta pasan a
  // leerse en la misma línea de barrido.
  const html = render(LINEA);
  const iEstado = html.indexOf("Pendiente de revisar");
  const iImporte = html.indexOf("Importe");
  assert.ok(iEstado > -1, "no está el estado");
  assert.ok(iImporte > iEstado, "el importe se metió antes que el estado");

  // Y el estado sigue siendo lo ÚNICO de la derecha: la fila del importe no
  // lleva `justify-between` ni un segundo hijo alineado a la derecha.
  const src = codigoDe(WORKSPACE);
  assert.ok(
    !/Importe[\s\S]{0,200}justify-between/.test(src),
    "el renglón del importe volvió a compartir la fila del estado"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 y 6 · LA PANTALLA NO VUELVE A CALCULAR
// ═══════════════════════════════════════════════════════════════════════════

test("5. LA CARD NO RECALCULA EL SUBTOTAL", () => {
  // `subtotal` sale del servidor. Si la pantalla lo multiplicara de nuevo,
  // bastaría un redondeo distinto para que la card y el PDF del mismo remito
  // dijeran dos números.
  const src = codigoDe(WORKSPACE);
  assert.match(src, /fmtMoneda\(d\.subtotal\)/, "la card dejó de leer el subtotal del servidor");
  for (const inventado of [
    /precioCosto\s*\*/,
    /\*\s*d\.precioCosto/,
    /cantidad\s*\*\s*.*precio/i,
  ]) {
    assert.ok(!inventado.test(src), `la card volvió a calcular el importe: ${inventado}`);
  }
});

test("5b. y el subtotal que muestra es EXACTAMENTE el que llegó", () => {
  // Contraprueba del anterior desde el comportamiento: un subtotal que NO es
  // cantidad × costo tiene que mostrarse igual. Si la pantalla recalculara,
  // acá aparecería 18.600 en vez de 99.
  const html = render({ ...LINEA, subtotal: 99, precioCosto: 1550 });
  assert.ok(html.includes("99,00"), `no mostró el subtotal del servidor: ${html}`);
  assert.ok(!html.includes("18.600"), "recalculó el importe con el costo unitario");
});

test("6. EL RESUMEN NO SUMA LAS CARDS PARA ARMAR EL TOTAL", () => {
  // Sumar en el navegador es cómo el total deja de ser el del documento: una
  // card tapada por un filtro no entra en la suma y el número baja solo.
  const src = codigoDe(MOVIL);
  for (const inventado of [
    /reduce\([^)]*subtotal/,
    /reduce\([^)]*costoTotal/,
    /items[\s\S]{0,60}reduce\([\s\S]{0,80}precio/i,
  ]) {
    assert.ok(!inventado.test(src), `el resumen volvió a sumar en el frontend: ${inventado}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LA AUTORIDAD DEL DOCUMENTO ES UNA SOLA
// ═══════════════════════════════════════════════════════════════════════════

test("el total y los subtotales salen de valorizarDetalle, como los PDF", () => {
  // Si alguna de estas superficies dejara de usar el helper canónico, el mismo
  // documento podría mostrar dos totales distintos según por dónde se lo mire.
  for (const rel of [
    "app/api/transferencias/detalle/route.js",
    "app/api/transferencias/pdf/route.js",
    "app/api/transferencias/pdf-recepcion/route.js",
  ]) {
    assert.match(codigoDe(rel), /valorizarDetalle/, `${rel} dejó de usar la valorización canónica`);
  }
  assert.match(
    codigoDe("app/api/transferencias/detalle/route.js"),
    /costoTotal \+= subtotal/,
    "el total del documento dejó de acumularse con los subtotales que se muestran"
  );
});

test("la moneda se formatea con el MISMO formateador que el escritorio", () => {
  // Dos formateadores es cómo el mismo importe aparece escrito de dos formas en
  // la misma aplicación.
  for (const rel of [MOVIL, WORKSPACE]) {
    assert.match(
      codigoDe(rel),
      /import \{[^}]*fmtMoneda[^}]*\} from "\.\/detallePresentacion"/,
      `${rel} no usa el formateador compartido`
    );
  }
});
