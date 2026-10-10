// UNA BOLETA QUE FLASH NO TERMINA DE LEER SE LEE IGUAL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/flashSinRespuesta.test.mjs
//
// ── LO MEDIDO EN PRODUCCIÓN (sesión del VPS, solo lectura, 2026-10-10) ────
//
// Comprobante 22, Das, pedido 255, una hoja: tres intentos con
// gemini-3.6-flash, los tres cortados por la espera local —45 s, 45 s y
// 90.012 ms—, sin código HTTP ni respuesta de Google. La escalada quedó vacía
// en los tres: Flash que no contesta no escalaba. Y el texto guardado decía
// "tardó más de 45 segundos" con la espera ya en 90.
//
// ── QUÉ FIJAN ESTOS CANDADOS ──────────────────────────────────────────────
//
// 1. Flash lleva el techo de razonamiento verificado en la documentación de
//    Google; el modelo grande, no.
// 2. Flash que vence su espera escala al grande, una vez, con su caso propio.
// 3. Si el grande cierra, la lectura se guarda y la receta queda pendiente
//    cuando corresponde.
// 4. Los tokens de cada llamada llegan a la bitácora.
// 5. El mensaje dice la espera real.
//
// La boleta es la de DYSSA de #153 (`boletaDyssa.fixture.json`) y lo que
// contesta el grande, la misma interpretada (`lecturaInterpretada.fixture.json`):
// los mismos datos que los candados de la escalada, por los lectores de verdad
// y con un `fetch` de mentira que contesta con la forma de `generateContent`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  crearLectorGemini,
  armarInterpretes,
  NIVEL_DE_RAZONAMIENTO,
  MODELO_POR_DEFECTO,
  MODELO_RESPALDO,
  ESPERA_MAX_MS,
} from "./gemini.js";
import { leerConCadena } from "./cadena.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { MOTIVO_LECTURA, queHacerLectura } from "./contrato.js";
import { escalarAlModeloGrande, ESCALADA } from "./escalada.js";
import { medicionDeLaLlamada } from "./medicionDeLaLlamada.js";
import { esperaEnPalabras } from "./esperas.js";

const { _origen, ...BOLETA } = JSON.parse(
  fs.readFileSync(new URL("../boletaDyssa.fixture.json", import.meta.url), "utf8")
);
// Lo que contesta el grande desde la lectura interpretada: la misma boleta con
// el costo final de cada renglón y su explicación (`lecturaInterpretada.fixture.json`).
const { dyssa: DYSSA } = JSON.parse(
  fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const PRO_DYSSA = {
  identidad: DYSSA.identidad, lineasEnElPapel: DYSSA.lineasEnElPapel, hayTotalImpreso: DYSSA.hayTotalImpreso,
  pie: DYSSA.pie, lineas: DYSSA.lineas, explicacion: DYSSA.explicacionPro,
};
/** La receta de DYSSA ya confirmada: su explicación, la misma que da el grande. */
const RECETA_DYSSA = { explicacion: DYSSA.explicacionPro };
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
const USO = { promptTokenCount: 2400, candidatesTokenCount: 1800, thoughtsTokenCount: 900, totalTokenCount: 5100 };

const respuestaDeGoogle = (json) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
    usageMetadata: USO,
  }),
});
/** Lo que hace `fetch` cuando vence `AbortSignal.timeout`: rechaza con TimeoutError. */
const queNoContesta = async () => {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  throw e;
};

/** Todos los pedidos a Google, con el modelo y el cuerpo. */
function espia(responder) {
  const pedidos = [];
  const fetchImpl = async (url, init) => {
    const modelo = String(url).split("/models/")[1].split(":")[0];
    pedidos.push({ modelo, cuerpo: JSON.parse(init.body) });
    return responder(modelo);
  };
  return { pedidos, fetchImpl };
}

const flash = (fetchImpl, modelo = MODELO_POR_DEFECTO) => {
  const lector = crearLectorGemini({ env: { GEMINI_API_KEY: "x", GEMINI_MODELO: modelo }, fetchImpl });
  return () => leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: FOTO, receta: null });
};

/** Flash colgado y el grande contestando lo que diga `grande`. Lo mismo que hace la ruta. */
async function leerConFlashColgado({ grande, receta, recetaVersion = null }) {
  const g = espia(grande);
  const f = espia(queNoContesta);
  const resultado = await flash(f.fetchImpl)();
  // La receta confirmada es la de la factura A de DYSSA, como la guarda
  // `ExplicacionPorTipo`.
  const explicaciones = receta?.explicacion
    ? [{ tipoComprobante: "A", explicacion: receta.explicacion, version: recetaVersion }]
    : [];
  const escalada = await escalarAlModeloGrande({
    resultado, explicaciones,
    interpretes: armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: g.fetchImpl }),
    archivos: FOTO, proveedorNombre: "Dyssa",
  });
  return { resultado, escalada, flash: f.pedidos, grande: g.pedidos };
}

// ══════════════════════════════════════════════════════════════════════════
// 1. EL TECHO DE RAZONAMIENTO
// ══════════════════════════════════════════════════════════════════════════

test("FLASH LLEVA generationConfig.thinkingConfig.thinkingLevel = 'low'; EL GRANDE NO", async () => {
  // Verificado en la documentación de Google: ver `NIVEL_DE_RAZONAMIENTO`.
  assert.deepEqual({ ...NIVEL_DE_RAZONAMIENTO }, { "gemini-3.6-flash": "low" });
  assert.equal(MODELO_POR_DEFECTO, "gemini-3.6-flash");

  const f = espia(() => respuestaDeGoogle(BOLETA));
  await flash(f.fetchImpl)();
  assert.deepEqual(f.pedidos[0].cuerpo.generationConfig.thinkingConfig, { thinkingLevel: "low" });
  // Nunca junto con el presupuesto viejo: da 400.
  assert.equal(f.pedidos[0].cuerpo.generationConfig.thinkingConfig.thinkingBudget, undefined);

  // El grande, titular y respaldo, sin techo: razonar es su trabajo.
  const { grande } = await leerConFlashColgado({
    grande: (m) => (m === "gemini-3.1-pro-preview" ? queNoContesta() : respuestaDeGoogle(PRO_DYSSA)),
    receta: RECETA_DYSSA, esGenerica: false,
  });
  assert.deepEqual(grande.map((p) => p.modelo), ["gemini-3.1-pro-preview", "gemini-2.5-pro"]);
  for (const p of grande) assert.equal(p.cuerpo.generationConfig.thinkingConfig, undefined, p.modelo);
});

test("EL TECHO VA SOLO EN LOS MODELOS VERIFICADOS: el respaldo de Flash no lo lleva", async () => {
  // De `gemini-3.5-flash` la tabla de Google no dice qué niveles acepta.
  const f = espia(() => respuestaDeGoogle(BOLETA));
  await flash(f.fetchImpl, MODELO_RESPALDO)();
  assert.equal(f.pedidos[0].modelo, "gemini-3.5-flash");
  assert.equal(f.pedidos[0].cuerpo.generationConfig.thinkingConfig, undefined);
});

// ══════════════════════════════════════════════════════════════════════════
// 2 y 3. FLASH QUE NO CONTESTA → EL GRANDE, UNA VEZ
// ══════════════════════════════════════════════════════════════════════════

test("FLASH VENCE SU ESPERA → ESCALA UNA VEZ, con FLASH_SIN_RESPUESTA, y el grande no recibe transcripción", async () => {
  const { resultado, escalada, flash: f, grande } = await leerConFlashColgado({
    grande: () => respuestaDeGoogle(PRO_DYSSA),
    receta: RECETA_DYSSA, recetaVersion: 3, esGenerica: false,
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, MOTIVO_LECTURA.TARDO_DEMASIADO);
  assert.equal(f.length, 1, "Flash se llamó una vez");
  assert.equal(escalada.motivo, ESCALADA.FLASH_SIN_RESPUESTA);
  assert.equal(grande.length, 1, "una sola llamada al grande: el titular contestó");
  assert.deepEqual(escalada.llamadas.map((l) => l.escalada), [ESCALADA.FLASH_SIN_RESPUESTA]);
  const pedido = grande[0].cuerpo.contents[0].parts[0].text;
  assert.match(pedido, /no terminó de leerlo en el tiempo que tenía/);
  assert.doesNotMatch(pedido, /<<<LECTURA/, "no hay lectura de Flash que mandar");
});

test("EL GRANDE CIERRA DESPUÉS DE UN FLASH COLGADO → la lectura se guarda, con los nueve renglones", async () => {
  const { escalada } = await leerConFlashColgado({
    grande: () => respuestaDeGoogle(PRO_DYSSA),
    receta: RECETA_DYSSA, recetaVersion: 3, esGenerica: false,
  });
  assert.equal(escalada.cerro, true);
  const puerta = pasarPorLaPuerta({ lectura: escalada.lectura, receta: escalada.receta, recetaVersion: escalada.recetaVersion });
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.aGuardar.totalLeido, 633686.4);
  assert.equal(puerta.aGuardar.lineasTranscriptas, 9);
  // Con su receta ya confirmada e igual a la propuesta: nada pendiente.
  assert.equal(escalada.propuesta, null);
  assert.equal(escalada.recetaVersion, 3);
  // Y la ruta la toma como lectura buena: sin esto iba por la rama de fallo.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /resultado = \{ \.\.\.resultado, ok: true, motivo: null, lectura: escalada\.lectura \};/);
  assert.ok(
    ruta.indexOf("await escalarAlModeloGrande(") < ruta.indexOf("if (!resultado.ok) {"),
    "la escalada tiene que correr antes de decidir que la lectura falló"
  );
});

test("SIN RECETA CONFIRMADA, LO QUE CERRÓ QUEDA PENDIENTE DE CONFIRMAR", async () => {
  const { escalada } = await leerConFlashColgado({
    grande: () => respuestaDeGoogle(PRO_DYSSA),
    receta: null,
  });
  assert.equal(escalada.motivo, ESCALADA.FLASH_SIN_RESPUESTA, "el caso (d) manda sobre el (c)");
  assert.equal(escalada.cerro, true);
  assert.deepEqual(escalada.propuesta, { explicacion: DYSSA.explicacionPro, tipoComprobante: "A" });
  assert.match(escalada.texto, /para confirmar en Recetas de facturas/);
});

test("SI EL GRANDE TAMPOCO TERMINA: titular y respaldo, ni una llamada más, y el mensaje dice las dos cosas", async () => {
  const { escalada, flash: f, grande } = await leerConFlashColgado({
    grande: queNoContesta, receta: RECETA_DYSSA, recetaVersion: 3, esGenerica: false,
  });
  assert.equal(f.length, 1);
  assert.equal(grande.length, 2);
  assert.equal(escalada.cerro, false);
  assert.match(escalada.texto, /No se pudo interpretar el papel con el lector grande/);
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /error: \[queHacerLectura\(resultado\.motivo\), escalada\.texto\]\.filter\(Boolean\)\.join\(" "\)/);
});

test("LOS OTROS FALLOS DE FLASH SIGUEN SIN ESCALAR: cuota, caído, cortada", async () => {
  for (const [responder, motivo] of [
    [() => ({ ok: false, status: 429, text: async () => "free_tier" }), MOTIVO_LECTURA.CUOTA_AGOTADA],
    [() => ({ ok: false, status: 503, text: async () => "high demand" }), MOTIVO_LECTURA.SERVICIO_CAIDO],
  ]) {
    const f = espia(responder);
    const g = espia(() => respuestaDeGoogle(PRO_DYSSA));
    const resultado = await flash(f.fetchImpl)();
    assert.equal(resultado.motivo, motivo);
    const escalada = await escalarAlModeloGrande({
      resultado,
      explicaciones: [{ tipoComprobante: "A", explicacion: RECETA_DYSSA.explicacion, version: 3 }],
      interpretes: armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: g.fetchImpl }), archivos: FOTO,
    });
    assert.equal(escalada.motivo, null, motivo);
    assert.equal(g.pedidos.length, 0, motivo);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 4. LOS TOKENS · 5. EL MENSAJE
// ══════════════════════════════════════════════════════════════════════════

test("LOS TOKENS QUE INFORMA GOOGLE LLEGAN A LA BITÁCORA; UNA LLAMADA COLGADA LOS DEJA VACÍOS", async () => {
  const f = espia(() => respuestaDeGoogle(BOLETA));
  const bien = await flash(f.fetchImpl)();
  const [intento] = bien.intentos;
  assert.deepEqual(intento.tokens, { salida: 1800, razonamiento: 900, total: 5100 });
  const columnas = medicionDeLaLlamada(intento);
  assert.equal(columnas.tokensSalida, 1800);
  assert.equal(columnas.tokensRazonamiento, 900);
  assert.equal(columnas.tokensTotal, 5100);
  assert.ok(Number.isInteger(columnas.duracionMs));

  const colgada = await flash(espia(queNoContesta).fetchImpl)();
  const vacias = medicionDeLaLlamada(colgada.intentos[0]);
  assert.deepEqual(
    { s: vacias.tokensSalida, r: vacias.tokensRazonamiento, t: vacias.tokensTotal },
    { s: null, r: null, t: null },
    "vacío, no cero: no contestó"
  );

  // Las llamadas del grande también.
  const { escalada } = await leerConFlashColgado({
    grande: () => respuestaDeGoogle(PRO_DYSSA), receta: RECETA_DYSSA, esGenerica: false,
  });
  assert.deepEqual(escalada.llamadas[0].tokens, { salida: 1800, razonamiento: 900, total: 5100 });
  // Y las dos rutas escriben las columnas.
  for (const r of ["app/api/compras-proveedor/comprobantes/leer/[id]/route.js", "app/api/compras-proveedor/recetas/explicacion/route.js"]) {
    assert.match(codigoDe(r), /\.\.\.medicionDeLaLlamada\(i\),/, r);
  }
});

test("EL MENSAJE DICE LA ESPERA REAL, NO UN NÚMERO ESCRITO A MANO", () => {
  const texto = queHacerLectura(MOTIVO_LECTURA.TARDO_DEMASIADO);
  assert.match(texto, new RegExp(`tardó más de ${esperaEnPalabras(ESPERA_MAX_MS)}`));
  assert.match(texto, /90 segundos/);
  assert.doesNotMatch(texto, /45/);
  assert.equal(esperaEnPalabras(180_000), "3 minutos");
  // Contraprueba del texto: el contrato no puede tener la espera escrita.
  assert.doesNotMatch(codigoDe("lib/compras-proveedor/comprobante/lector/contrato.js"), /\b\d+ segundos/);
});

function codigoDe(ruta) {
  return fs
    .readFileSync(new URL(`../../../../${ruta}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
