// Candados de que el lector sea INTERCAMBIABLE.
//
// Lo que se protege: que el proveedor salga de la configuración y no del código,
// que la receta guíe qué se pide, y que la clave no se filtre en ningún mensaje.
//
// El motivo está en contrato.js: en abril de 2026 Google sacó los modelos Pro
// del nivel gratuito. Lo que hoy sale cero puede dejar de estar mañana, y ese
// día no se puede tener que tocar el código que decide qué costos entran al ERP.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  elegirLector,
  registrarLector,
  lectoresRegistrados,
  normalizarLectura,
  lecturaUtilizable,
  queHacerLectura,
  MOTIVO_LECTURA,
} from "./contrato.js";
import { crearLectorGemini, MODELO_POR_DEFECTO } from "./gemini.js";
import { esquemaDeSalida, instruccionesDesdeReceta } from "./promptDesdeReceta.js";

const RECETA_DYSSA = {
  ivaPorLinea: true,
  alicuotaIvaPct: 21,
  tieneImpuestoInterno: true,
  percepciones: [{ nombre: "IIBB", pct: 3 }, { nombre: "IVA", pct: 3 }],
};
const RECETA_DAS = {
  ivaPorLinea: false,
  alicuotaIvaPct: 21,
  tieneImpuestoInterno: false,
  percepciones: [{ nombre: "IVA", pct: 3 }],
};

// ── El proveedor sale de la configuración ──────────────────────────────────

test("EL LECTOR SE ELIGE POR CONFIGURACIÓN, NO ESTÁ CABLEADO", () => {
  const r = elegirLector({ nombre: "gemini", env: { GEMINI_API_KEY: "x" } });
  assert.equal(r.ok, true, r.queHacer);
  assert.equal(r.lector.nombre, MODELO_POR_DEFECTO);
});

test("SIN CONFIGURACIÓN NO HAY LECTOR: no cae a Gemini por default", () => {
  // Un default silencioso haría que el día que cambien las condiciones —otra
  // vez— el módulo siguiera llamando al proveedor viejo sin que nadie lo haya
  // elegido.
  for (const nombre of ["", "   ", undefined, null]) {
    const r = elegirLector({ nombre, env: { GEMINI_API_KEY: "x" } });
    assert.equal(r.ok, false, String(nombre));
    assert.equal(r.motivo, MOTIVO_LECTURA.SIN_LECTOR, String(nombre));
  }
});

test("un lector que no existe lo dice, y dice cuáles hay", () => {
  const r = elegirLector({ nombre: "el-que-no-existe", env: {} });
  assert.equal(r.ok, false);
  assert.match(r.queHacer, /no existe/i);
  assert.match(r.queHacer, /gemini/);
});

test("SE PUEDE ENCHUFAR OTRO PROVEEDOR SIN TOCAR NADA MÁS", () => {
  // El candado central de la tanda. Si esto pasa, cambiar de proveedor es
  // escribir un archivo y cambiar una variable.
  registrarLector("inventado-para-el-candado", () => ({
    nombre: "otro-modelo-v1",
    disponible: () => ({ ok: true }),
    leer: async () => ({ ok: true, lectura: normalizarLectura({ lineas: [], pie: {} }) }),
  }));
  const r = elegirLector({ nombre: "inventado-para-el-candado", env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.lector.nombre, "otro-modelo-v1");
  assert.ok(lectoresRegistrados().includes("gemini"));
});

test("sin clave, el lector avisa que falta — y NO muestra ninguna clave", () => {
  const r = elegirLector({ nombre: "gemini", env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.NO_CONFIGURADO);
  assert.match(r.queHacer, /clave/i);
});

test("LA CLAVE NO APARECE EN NINGÚN MENSAJE", () => {
  // Un mensaje de error que muestre parte de una clave la publica en el log.
  const secreto = "AIzaSyCLAVE-SUPER-SECRETA-123";
  const r = elegirLector({ nombre: "gemini", env: { GEMINI_API_KEY: secreto } });
  const todo = JSON.stringify({ ...r, lector: r.lector?.nombre });
  assert.ok(!todo.includes(secreto), "la clave se filtró");
  assert.ok(!todo.includes("AIzaSy"), "se filtró un fragmento de la clave");
});

test("el modelo se puede cambiar por variable, sin tocar el código", () => {
  const l = crearLectorGemini({ env: { GEMINI_API_KEY: "x", GEMINI_MODELO: "gemini-3-flash" } });
  assert.equal(l.nombre, "gemini-3-flash");
});

test("el default es un FLASH, que es lo que cubre el nivel gratuito", () => {
  assert.match(MODELO_POR_DEFECTO, /flash/i);
});

// ── La receta guía qué se pide ─────────────────────────────────────────────

test("A DYSSA SE LE PIDE INTERNO; A DAS NO SE LE OFRECE EL CASILLERO", () => {
  // Pedir un campo que ese proveedor no tiene es ofrecerle al modelo un
  // casillero vacío para llenar, y así aparecen los números inventados.
  const dyssa = esquemaDeSalida(RECETA_DYSSA);
  const das = esquemaDeSalida(RECETA_DAS);
  assert.ok(dyssa.properties.lineas.items.properties.internoUnitario);
  assert.equal(das.properties.lineas.items.properties.internoUnitario, undefined);
  assert.ok(dyssa.properties.pie.properties.interno);
  assert.equal(das.properties.pie.properties.interno, undefined);
});

test("las percepciones se piden solo si el proveedor las tiene", () => {
  assert.ok(esquemaDeSalida(RECETA_DAS).properties.pie.properties.percepciones);
  const sinPerc = esquemaDeSalida({ ...RECETA_DAS, percepciones: [] });
  assert.equal(sinPerc.properties.pie.properties.percepciones, undefined);
});

test("las instrucciones dicen si el IVA viene por línea o al pie", () => {
  assert.match(instruccionesDesdeReceta(RECETA_DYSSA), /POR LÍNEA/);
  assert.match(instruccionesDesdeReceta(RECETA_DAS), /solo al pie/i);
  assert.match(instruccionesDesdeReceta(RECETA_DAS), /NO tiene impuesto interno/i);
});

test("LAS INSTRUCCIONES PROHÍBEN CALCULAR EL SUBTOTAL", () => {
  // Si el modelo completara el subtotal multiplicando, la segunda ecuación de la
  // puerta dejaría de ser independiente y el candado perdería el 82 % de su
  // alcance. Está medido en cobertura.test.mjs.
  const t = instruccionesDesdeReceta(RECETA_DYSSA);
  assert.match(t, /nunca reemplaces un subtotal impreso/i);
  assert.match(t, /no calcules/i);
});

test("las instrucciones prohíben poner cero en lo que no se lee", () => {
  assert.match(instruccionesDesdeReceta(RECETA_DAS), /NO pongas cero/i);
});

test("la salida se pide en JSON con esquema, nunca texto libre", () => {
  const e = esquemaDeSalida(RECETA_DAS);
  assert.equal(e.type, "object");
  assert.deepEqual(e.required, ["identidad", "lineas", "pie"]);
});

// ── La forma de la lectura ─────────────────────────────────────────────────

test("LO QUE NO SE ENTIENDE QUEDA EN null, NUNCA EN CERO", () => {
  // Un 0 en un importe se suma y desplaza el total; un null se ve.
  const l = normalizarLectura({
    lineas: [{ descripcion: "x", cantidad: "no se lee", netoUnitario: "", subtotalImpreso: "abc" }],
    pie: { neto: "", total: null },
  });
  assert.equal(l.lineas[0].cantidad, null);
  assert.equal(l.lineas[0].netoUnitario, null);
  assert.equal(l.lineas[0].subtotalImpreso, null);
  assert.equal(l.pie.neto, null);
});

test("los números con coma decimal se entienden", () => {
  const l = normalizarLectura({ lineas: [{ netoUnitario: "2580,57" }], pie: { total: "572095,46" } });
  assert.equal(l.lineas[0].netoUnitario, 2580.57);
  assert.equal(l.pie.total, 572095.46);
});

test("el CUIT se queda solo con los dígitos", () => {
  const l = normalizarLectura({ identidad: { cuit: "30-71234567-9" }, lineas: [], pie: {} });
  assert.equal(l.identidad.cuit, "30712345679");
});

test("una lectura vacía no se toma por utilizable", () => {
  assert.equal(lecturaUtilizable(normalizarLectura({ lineas: [], pie: { total: 1 } })).ok, false);
  assert.equal(lecturaUtilizable(normalizarLectura({ lineas: [{ cantidad: 1, netoUnitario: 2 }], pie: {} })).ok, false);
  assert.equal(lecturaUtilizable(null).ok, false);
});

test("cada motivo de fallo dice que el comprobante NO se perdió", () => {
  // El que sube tiene que saber que el archivo quedó guardado aunque la lectura
  // falle: si cree que se perdió, lo sube de nuevo y duplica.
  for (const m of Object.values(MOTIVO_LECTURA)) {
    const t = queHacerLectura(m);
    assert.ok(t.length > 20, m);
    if (m !== MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO && m !== MOTIVO_LECTURA.RESPUESTA_ILEGIBLE) {
      assert.match(t, /quedó subido|no se perdió/i, m);
    }
  }
});

// ── El lector de Gemini, sin llamar a Google ───────────────────────────────

test("un Excel no lo lee este lector, y lo dice con su motivo", async () => {
  const l = crearLectorGemini({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => {
    throw new Error("no se tendría que haber llamado");
  } });
  const r = await l.leer({
    archivo: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: Buffer.from("x") },
    receta: RECETA_DAS,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO);
});

test("LA CUOTA AGOTADA SE DISTINGUE DEL SERVICIO CAÍDO", () => {
  // Son dos consejos opuestos: una se resuelve esperando a mañana, la otra
  // probando de nuevo en un rato.
  assert.match(queHacerLectura(MOTIVO_LECTURA.CUOTA_AGOTADA), /mañana|a mano/i);
  assert.match(queHacerLectura(MOTIVO_LECTURA.SERVICIO_CAIDO), /en un rato/i);
});

test("una respuesta ilegible no se toma por lectura buena", async () => {
  const l = crearLectorGemini({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) }),
  });
  const r = await l.leer({ archivo: { mime: "image/jpeg", bytes: Buffer.from("x") }, receta: RECETA_DAS });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.RESPUESTA_ILEGIBLE);
});

test("EL CONSUMO SE REGISTRA AUNQUE NO SE PAGUE", async () => {
  // Aunque hoy sea gratis: es el único dato que va a permitir decidir, dentro de
  // unos meses, si conviene pasar a uno pago y cuánto costaría.
  const l = crearLectorGemini({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ lineas: [], pie: {} }) }] } }],
        usageMetadata: { promptTokenCount: 1834, candidatesTokenCount: 402 },
      }),
    }),
  });
  const r = await l.leer({ archivo: { mime: "image/jpeg", bytes: Buffer.from("x") }, receta: RECETA_DAS });
  assert.equal(r.ok, true);
  assert.equal(r.lectura.consumo.tokensEntrada, 1834);
  assert.equal(r.lectura.consumo.tokensSalida, 402);
  assert.equal(r.lectura.consumo.costoMicroUsd, 0);
  assert.equal(r.lectura.modelo, MODELO_POR_DEFECTO);
});

// ── Groq: la segunda implementación del mismo contrato ─────────────────────

test("GROQ SE ELIGE POR CONFIGURACIÓN, igual que Gemini", async () => {
  // La prueba de que lo intercambiable servía: agregar Groq fue un archivo.
  const { elegirLector: elegir } = await import("./index.js");
  const r = elegir({ nombre: "groq", env: { GROQ_API_KEY: "x" } });
  assert.equal(r.ok, true, r.queHacer);
  assert.match(r.lector.nombre, /qwen/);
});

test("EL MODELO DE GROQ SALIÓ DE MEDIR, y está anotado con su límite", async () => {
  const { MODELO_POR_DEFECTO: M, LIMITE_MEDIDO } = await import("./groq.js");
  // Medido el 2026-08-11 contra la API real: es el único con visión de los 15
  // que ofrece la cuenta.
  assert.equal(M, "qwen/qwen3.6-27b");
  assert.equal(LIMITE_MEDIDO.tokensPorMinuto, 8000);
  assert.equal(LIMITE_MEDIDO.tokensPorImagen, 1805);
  // Cuatro por minuto: es el cuello real y por eso no se manda una tanda junta.
  assert.equal(LIMITE_MEDIDO.imagenesPorMinuto, 4);
});

test("el 429 de Groq es CUOTA_AGOTADA, no «servicio caído»", async () => {
  // Acá el 429 es el caso frecuente, no el raro: la quinta imagen del minuto ya
  // lo toca. Confundirlo con un servicio caído daría el consejo opuesto.
  const { crearLectorGroq } = await import("./groq.js");
  const l = crearLectorGroq({ env: { GROQ_API_KEY: "x" }, fetchImpl: async () => ({ ok: false, status: 429 }) });
  const r = await l.leer({ archivo: { mime: "image/jpeg", bytes: Buffer.from("x") }, receta: { percepciones: [] } });
  assert.equal(r.motivo, MOTIVO_LECTURA.CUOTA_AGOTADA);
});

test("Groq pide json_schema, no json_object", async () => {
  // Medido: con `json_object` el modelo respetó el JSON pero NO el esquema
  // —devolvió un arreglo donde se pedía un texto—. Un campo con el tipo cambiado
  // es un número que después no se puede sumar.
  const { crearLectorGroq } = await import("./groq.js");
  let enviado = null;
  const l = crearLectorGroq({
    env: { GROQ_API_KEY: "x" },
    fetchImpl: async (_u, opciones) => {
      enviado = JSON.parse(opciones.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }], usage: {} }) };
    },
  });
  await l.leer({ archivo: { mime: "image/jpeg", bytes: Buffer.from("x") }, receta: { percepciones: [] } });
  assert.equal(enviado.response_format.type, "json_schema");
  assert.equal(enviado.temperature, 0);
});

test("LA CLAVE DE GROQ TAMPOCO SE FILTRA", async () => {
  const { elegirLector: elegir } = await import("./index.js");
  const secreto = "gsk_UNA-CLAVE-QUE-NO-DEBE-APARECER";
  const r = elegir({ nombre: "groq", env: { GROQ_API_KEY: secreto } });
  const todo = JSON.stringify({ ...r, lector: r.lector?.nombre });
  assert.ok(!todo.includes(secreto));
  assert.ok(!todo.includes("gsk_"));
});
