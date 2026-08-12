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
  // La lista va completa a propósito: un campo nuevo cae acá en rojo y obliga a
  // decidirlo. El 2026-08-12 se sumó `lineasEnElPapel`, el conteo de renglones
  // que Emanuel pidió como tercer control.
  // El 2026-08-12 se sumó además `hayTotalImpreso`, por lo de abajo.
  assert.deepEqual(e.required, [
    "identidad", "lineas", "pie", "lineasEnElPapel", "hayTotalImpreso",
  ]);
});

test("EL PIE NO EXIGE `total` NI `neto`, Y ESO NO ES UN DESCUIDO", () => {
  // Lo exigía, y era el agujero más grande del módulo. Obligado a poner un
  // número donde no hay ninguno —un remito, una planilla—, el modelo pone el más
  // plausible: LA SUMA DE LAS LÍNEAS. Con eso la verificación compara la suma
  // contra sí misma, cierra siempre con cero de diferencia, y el candado central
  // queda desactivado justo en los papeles donde más falta hace.
  //
  // Medido sobre la planilla real: tres corridas seguidas devolvieron la suma
  // exacta de las 21 líneas como si fuera el total del pie.
  const e = esquemaDeSalida(RECETA_DAS);
  assert.equal(e.properties.pie.required, undefined, "un campo obligatorio se completa inventando");
  // Los campos siguen existiendo: lo que se sacó es la OBLIGACIÓN de llenarlos.
  assert.ok(e.properties.pie.properties.total, "el campo sigue estando");
  assert.ok(e.properties.pie.properties.neto);
  // Y la pregunta que no se puede contestar sumando.
  assert.equal(e.properties.hayTotalImpreso.type, "boolean");
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
    archivos: [{ mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: Buffer.from("x") }],
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
  const r = await l.leer({ archivos: [{ mime: "image/jpeg", bytes: Buffer.from("x") }], receta: RECETA_DAS });
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
  const r = await l.leer({ archivos: [{ mime: "image/jpeg", bytes: Buffer.from("x") }], receta: RECETA_DAS });
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
  const r = await l.leer({ archivos: [{ mime: "image/jpeg", bytes: Buffer.from("x") }], receta: { percepciones: [] } });
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
  await l.leer({ archivos: [{ mime: "image/jpeg", bytes: Buffer.from("x") }], receta: { percepciones: [] } });
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

// ── VARIAS FOTOS SON UN SOLO PAPEL ─────────────────────────────────────────

test("SE MANDAN TODAS LAS FOTOS EN UN SOLO PEDIDO", async () => {
  // El candado central del cambio. La factura de DAS son dos fotos: encabezado
  // con las líneas y pie con los totales. Mandarlas por separado haría que el
  // total quedara en una lectura y las líneas que tiene que sumar en la otra,
  // así que NINGUNA cerraría — y la puerta las marcaría como mal leídas con el
  // modelo habiendo leído perfecto.
  const { crearLectorGroq } = await import("./groq.js");
  let enviado = null;
  const l = crearLectorGroq({
    env: { GROQ_API_KEY: "x" },
    fetchImpl: async (_u, o) => {
      enviado = JSON.parse(o.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }], usage: {} }) };
    },
  });
  await l.leer({
    archivos: [
      { mime: "image/jpeg", bytes: Buffer.from("encabezado") },
      { mime: "image/jpeg", bytes: Buffer.from("pie") },
    ],
    receta: { percepciones: [] },
  });
  // Un solo pedido, con las dos imágenes adentro.
  const partes = enviado.messages[0].content;
  assert.equal(partes.filter((p) => p.type === "image_url").length, 2);
  assert.equal(enviado.messages.length, 1);
});

test("EL PROMPT AVISA QUE SON PÁGINAS DEL MISMO COMPROBANTE", () => {
  // Sin esto el modelo puede tratar cada imagen como un comprobante aparte y
  // devolver el pie de la segunda como si fuera de otra factura.
  const dos = instruccionesDesdeReceta(RECETA_DAS, { paginas: 2 });
  assert.match(dos, /NO son 2 comprobantes/i);
  assert.match(dos, /FOTOS DEL MISMO/i);
  assert.match(dos, /UN SOLO resultado/i);
  assert.match(dos, /no la repitas/i);
});

test("con una sola foto NO se le habla de páginas", () => {
  // Decirle "te paso 1 imágenes, no es 1 comprobante" sería ruido que empeora
  // el caso común.
  const una = instruccionesDesdeReceta(RECETA_DAS, { paginas: 1 });
  assert.doesNotMatch(una, /FOTOS DEL MISMO/i);
  assert.doesNotMatch(una, /páginas/i);
});

test("SI UNA SOLA FOTO NO SE PUEDE LEER, NO SE MANDA MEDIA FACTURA", async () => {
  // Media factura leída daría una cuenta que no cierra por el motivo
  // equivocado, y la puerta culparía al modelo.
  const { crearLectorGemini: crear } = await import("./gemini.js");
  const l = crear({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => { throw new Error("no debía llamarse"); } });
  const r = await l.leer({
    archivos: [
      { mime: "image/jpeg", bytes: Buffer.from("a") },
      { mime: "application/zip", bytes: Buffer.from("b") },
    ],
    receta: { percepciones: [] },
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO);
});

test("sin ninguna foto no se llama al servicio", async () => {
  const { crearLectorGroq } = await import("./groq.js");
  const l = crearLectorGroq({ env: { GROQ_API_KEY: "x" }, fetchImpl: async () => { throw new Error("no debía llamarse"); } });
  for (const archivos of [[], null, undefined]) {
    const r = await l.leer({ archivos, receta: { percepciones: [] } });
    assert.equal(r.ok, false);
  }
});

// ── EL NOMBRE DEL MODELO NO SE ESCRIBE DE MEMORIA ──────────────────────────

test("EL MODELO DADO DE BAJA SE DETECTA AL ARRANCAR, no en medio de una recepción", async () => {
  // El 2026-08-11 gemini-2.5-flash devolvió 404 —"no longer available to new
  // users"— y nos enteramos porque falló una lectura con el camión en la puerta.
  const { verificarModelo } = await import("./gemini.js");
  const r = await verificarModelo({
    env: { GEMINI_API_KEY: "x", GEMINI_MODELO: "un-modelo-viejo" },
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "DADO_DE_BAJA");
  assert.match(r.queHacer, /ya no existe/i);
  assert.match(r.queHacer, /NO se van a poder leer/i);
});

test("NO PODER PREGUNTAR NO ES ESTAR DADO DE BAJA", () => {
  // Decirlo como baja mandaría a cambiar un modelo que probablemente esté bien.
  return import("./gemini.js").then(async ({ verificarModelo }) => {
    const caido = await verificarModelo({
      env: { GEMINI_API_KEY: "x" },
      fetchImpl: async () => { throw new Error("sin red"); },
    });
    assert.equal(caido.motivo, "NO_SE_PUDO_PREGUNTAR");
    assert.notEqual(caido.motivo, "DADO_DE_BAJA");
  });
});

test("un modelo vigente se verifica y no molesta", async () => {
  const { verificarModelo, MODELO_POR_DEFECTO: M } = await import("./gemini.js");
  const r = await verificarModelo({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => ({ ok: true, status: 200 }) });
  assert.equal(r.ok, true);
  assert.equal(r.modelo, M);
});

test("EL MODELO POR DEFECTO ES UNO QUE SE MIDIÓ VIGENTE", async () => {
  // Los que dieron 404 el 2026-08-11 no pueden volver por descuido.
  const { MODELO_POR_DEFECTO: M, MODELO_RESPALDO: R } = await import("./gemini.js");
  const DADOS_DE_BAJA = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  for (const viejo of DADOS_DE_BAJA) {
    assert.notEqual(M, viejo, `${viejo} está dado de baja: Google devuelve 404`);
    assert.notEqual(R, viejo, `${viejo} está dado de baja: Google devuelve 404`);
  }
  assert.match(M, /flash/i, "el titular tiene que ser un Flash: es lo que cubre el nivel gratuito");
});

test("EL RESPALDO NO ES UN ALIAS MÓVIL", () => {
  // `gemini-flash-latest` cambia de modelo abajo sin que nadie lo decida, que es
  // justo la clase de sorpresa que este módulo existe para evitar.
  return import("./gemini.js").then(({ MODELO_RESPALDO: R }) => {
    assert.doesNotMatch(R, /latest/i);
  });
});

// ── EL CONTEO SE PIDE COMO TAREA APARTE ────────────────────────────────────

test("EL CONTEO VA EN EL ESQUEMA, AL MISMO NIVEL QUE LAS LÍNEAS", () => {
  // Adentro de la lista sería un dato de cada línea; acá es una observación
  // sobre el papel. Y es obligatorio: si fuera opcional el modelo lo omitiría y
  // el control no existiría nunca.
  const e = esquemaDeSalida(RECETA_DAS);
  assert.equal(e.properties.lineasEnElPapel.type, "integer");
  assert.ok(e.required.includes("lineasEnElPapel"));
  assert.equal(e.properties.lineas.items.properties.lineasEnElPapel, undefined);
});

test("EL PROMPT PIDE CONTAR ANTES, Y PROHÍBE SACARLO DE LO TRANSCRIPTO", () => {
  // Es lo que hace que el control controle algo. Un número sacado de contar el
  // arreglo que devolvió coincide siempre consigo mismo.
  const t = instruccionesDesdeReceta(RECETA_DAS);
  assert.match(t, /TAREA APARTE/);
  assert.match(t, /ANTES de mirar lo que transcribiste/i);
  assert.match(t, /NO lo saques de contar/i);
  // Un renglón que NO se pudo transcribir sigue contando: es todo el motivo del
  // control. Si solo contara lo legible, el número coincidiría siempre.
  assert.match(t, /borrosos o cortados/i);
  // Y dice explícitamente que está BIEN que los números difieran.
  assert.match(t, /está bien que así sea/i);
});

test("EL CONTEO ES DE RENGLONES CON CANTIDAD, Y LO DICE", () => {
  // Medido contra la primera planilla real: 31 filas en la grilla, 10 de ellas
  // con la cantidad vacía e importe cero —productos ofrecidos que no se
  // pidieron—. Contando las 31, el aviso salía en rojo diciendo que faltaban 10
  // sobre una transcripción completa y correcta. Un aviso que se equivoca la
  // primera vez que alguien lo usa deja de mirarse.
  const t = instruccionesDesdeReceta(RECETA_DAS);
  assert.match(t, /RENGLONES CON CANTIDAD/);
  assert.match(t, /NO CUENTES/);
  assert.match(t, /cantidad vacía, en blanco o en cero/i);
  // Y dice POR QUÉ, que es lo que hace que el modelo lo aplique al caso nuevo y
  // no solo al que está nombrado.
  assert.match(t, /ofrecidos que no se pidieron/i);
});

test("el conteo sobrevive la normalización, y lo que no es número queda en null", () => {
  assert.equal(normalizarLectura({ lineasEnElPapel: 22, lineas: [], pie: {} }).lineasEnElPapel, 22);
  for (const v of [null, undefined, "no sé", ""]) {
    assert.equal(normalizarLectura({ lineasEnElPapel: v, lineas: [], pie: {} }).lineasEnElPapel, null, String(v));
  }
});
