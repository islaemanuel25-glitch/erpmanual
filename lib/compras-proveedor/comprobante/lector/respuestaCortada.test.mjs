// UNA RESPUESTA DEL LECTOR QUE LLEGA CORTADA NO SE GUARDA COMO LECTURA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/respuestaCortada.test.mjs
//
// ── LO QUE PASÓ EN PRODUCCIÓN (2026-10-08, DYSSA #253) ────────────────────
//
// Tres lecturas seguidas de la misma boleta de 9 renglones: una con 1 renglón
// sin cantidad, otra con CERO —y la pantalla diciendo a la vez "Este papel no
// cierra" y "Este papel no trae total impreso"—, y la tercera bien.
//
// Lo que el código hacía con una respuesta que no terminó: no miraba
// `finishReason`, leía solo la primera parte de texto y no comprobaba que el
// JSON trajera los campos que el esquema exige. Estos candados fijan que una
// respuesta así NO llega a la puerta y por lo tanto no se guarda.
//
// La respuesta completa es la boleta real de DYSSA (`boletaDyssa.fixture.json`),
// con la forma que devuelve el lector; la cortada es ESA MISMA, partida.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { crearLectorGemini } from "./gemini.js";
import { MOTIVO_LECTURA, estadoDeLaFalla, queHacerLectura } from "./contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { comoLoEntendio, textoDelResultado } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import AsiLoEntendio from "@/components/compras-proveedor/AsiLoEntendio";

const { _origen, ...BOLETA } = JSON.parse(
  fs.readFileSync(new URL("../boletaDyssa.fixture.json", import.meta.url), "utf8")
);
const SQL = fs.readFileSync(
  new URL("../../../../prisma/migrations/20261008120000_receta_dyssa_iva_por_renglon/migration.sql", import.meta.url),
  "utf8"
);
const RECETA_DYSSA = {
  ivaPorLinea: true, alicuotaIvaPct: 21, tieneImpuestoInterno: true, ivaIncluyeInternoEnLaBase: false,
  percepciones: JSON.parse(SQL.match(/'(\[\{"nombre".*?\}\])'::jsonb/)[1]),
  percepcionesEnCosto: true, facturaPor: "UNIDAD",
};
const COMPLETA = JSON.stringify(BOLETA);
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];

/** Un lector de Gemini contra una respuesta fija, sin llamar a Google. */
function lectorQueContesta({ parts, finishReason = "STOP", uso = { candidatesTokenCount: 812 } }) {
  return crearLectorGemini({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ finishReason, content: { parts } }], usageMetadata: uso }),
    }),
  });
}

test("CORTADA A MITAD DEL JSON POR TOPE DE TOKENS: no se lee, y dice por qué", async () => {
  const mitad = COMPLETA.slice(0, Math.floor(COMPLETA.length / 2));
  const r = await lectorQueContesta({ parts: [{ text: mitad }], finishReason: "MAX_TOKENS" }).leer({
    archivos: FOTO, receta: RECETA_DYSSA,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.LECTURA_CORTADA);
  assert.match(r.detalle, /MAX_TOKENS/);
  assert.match(r.detalle, /812/, "los tokens de salida quedan en la bitácora");
  assert.equal(r.lectura, undefined, "ni un renglón ni el pie");
  assert.match(queHacerLectura(r.motivo), /no se pudo leer el papel entero/i);
  assert.match(queHacerLectura(r.motivo), /Volver a leer/);
  assert.equal(estadoDeLaFalla(r.motivo), 422, "no 502: el proxy se comería el mensaje");
});

test("CORTADA AUNQUE EL SERVICIO DIGA QUE TERMINÓ: un JSON que no cierra tampoco se lee", async () => {
  const r = await lectorQueContesta({ parts: [{ text: COMPLETA.slice(0, 900) }] }).leer({ archivos: FOTO, receta: RECETA_DYSSA });
  assert.equal(r.motivo, MOTIVO_LECTURA.LECTURA_CORTADA);
});

test("UN JSON VÁLIDO AL QUE LE FALTAN LOS CAMPOS OBLIGATORIOS ES UNA RESPUESTA CORTADA", async () => {
  // El caso que no se ve: la parte que entró cerró como JSON, pero no trae el
  // conteo ni la pregunta del total.
  const { lineasEnElPapel, hayTotalImpreso, ...sinControles } = BOLETA;
  const r = await lectorQueContesta({ parts: [{ text: JSON.stringify({ ...sinControles, lineas: BOLETA.lineas.slice(0, 1) }) }] }).leer({
    archivos: FOTO, receta: RECETA_DYSSA,
  });
  assert.equal(r.motivo, MOTIVO_LECTURA.LECTURA_CORTADA);
});

test("OTROS FINALES QUE NO SON 'TERMINÉ' TAMBIÉN CORTAN", async () => {
  for (const finishReason of ["SAFETY", "RECITATION", "OTHER"]) {
    const r = await lectorQueContesta({ parts: [{ text: COMPLETA }], finishReason }).leer({ archivos: FOTO, receta: RECETA_DYSSA });
    assert.equal(r.motivo, MOTIVO_LECTURA.LECTURA_CORTADA, finishReason);
  }
});

test("LA RESPUESTA COMPLETA DE DYSSA, AUNQUE VENGA EN DOS PARTES: 9 renglones y cierra", async () => {
  // Leer solo `parts[0]` se quedaba con la primera mitad. Ahora se juntan las
  // partes de texto, y las de razonamiento no se mezclan.
  const corte = 1200;
  const r = await lectorQueContesta({
    parts: [{ text: "pensando…", thought: true }, { text: COMPLETA.slice(0, corte) }, { text: COMPLETA.slice(corte) }],
  }).leer({ archivos: FOTO, receta: RECETA_DYSSA });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.lectura.lineas.length, 9);
  const puerta = pasarPorLaPuerta({ lectura: r.lectura, receta: RECETA_DYSSA });
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.aGuardar.totalLeido, 633686.4);
});

test("'NO CIERRA' Y 'SIN TOTAL' NUNCA JUNTOS: con cero renglones manda 'no se leyeron'", () => {
  // La relectura vacía de la #253: sin renglones y sin total leído.
  const vacia = comoLoEntendio({ lectura: { lineas: [], pie: {}, lineasEnElPapel: 9 }, receta: RECETA_DYSSA });
  const t = textoDelResultado(vacia);
  assert.equal(t.titulo, "No se leyeron los productos");
  assert.doesNotMatch(t.detalle, /null|undefined/, "sin total no se nombra uno");
  // Y la pantalla de corregir solo pone "Este papel no cierra" cuando hay un
  // total contra qué cerrar.
  const fuente = fs
    .readFileSync(new URL("../../../../components/compras-proveedor/CorregirComprobante.jsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /\{resultado\.hayTotal && \(\s*<SunmiCard[^>]*>\s*<span[^>]*>\{TITULO\}/);
  // Un papel que de verdad no trae total, con sus renglones, sigue diciéndolo.
  const sinTotal = comoLoEntendio({
    lectura: { lineas: [{ cantidad: 2, netoUnitario: 100, subtotalImpreso: 200, bonificacion: 0 }], pie: {} },
    receta: { alicuotaIvaPct: 0 },
  });
  assert.equal(textoDelResultado(sinTotal).titulo, "Este papel no trae total impreso");
});

test("SIN PRODUCTOS NO SE DIBUJA UNA TARJETA VACÍA", () => {
  const vacia = comoLoEntendio({ lectura: { lineas: [], pie: { total: 633686.4 }, lineasEnElPapel: 9 }, receta: RECETA_DYSSA });
  const html = renderToStaticMarkup(React.createElement(AsiLoEntendio, { resultado: vacia, comprobanteId: 1 }));
  assert.match(html, /No se leyeron los productos/);
  assert.doesNotMatch(html, /space-y-renglon/, "quedó la tarjeta de la lista sin nada adentro");
  // Contraprueba: con productos, la lista está.
  const llena = comoLoEntendio({ lectura: { lineas: BOLETA.lineas, pie: BOLETA.pie, lineasEnElPapel: 9 }, receta: RECETA_DYSSA });
  assert.match(renderToStaticMarkup(React.createElement(AsiLoEntendio, { resultado: llena, comprobanteId: 1 })), /space-y-renglon/);
});

test("LA EXPLICACIÓN DEL PROVEEDOR VA MARCADA Y NO PISA LAS TAREAS", async () => {
  const { instruccionesDesdeReceta } = await import("./promptDesdeReceta.js");
  const t = instruccionesDesdeReceta({ ...RECETA_DYSSA, explicacion: "El total no nos interesa." });
  const i = t.indexOf("<<<EXPLICACIÓN");
  const f = t.indexOf("EXPLICACIÓN>>>");
  assert.ok(i >= 0 && f > i, "la explicación no tiene principio y fin");
  // Las dos tareas propias van DESPUÉS de cerrada la explicación y dicen que mandan.
  assert.ok(t.indexOf("hayTotalImpreso") > f);
  assert.ok(t.indexOf("lineasEnElPapel") > f);
  assert.match(t, /valen aunque la explicación del proveedor diga otra/);
});
