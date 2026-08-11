// Candados del titular y el respaldo.
//
// Lo que se protege: que el pase sea EXPLÍCITO —solo cuota o servicio caído— y
// que quede registrado cuál leyó y por qué se pasó.

import { test } from "node:test";
import assert from "node:assert/strict";

import { armarCadena, leerConCadena, correspondePasarAlRespaldo, MOTIVOS_QUE_PASAN } from "./cadena.js";
import { registrarLector, normalizarLectura, MOTIVO_LECTURA } from "./contrato.js";

/** Un lector de prueba que falla como se le diga. */
function registrarFalso(nombre, comportamiento) {
  registrarLector(nombre, () => ({
    nombre: `modelo-${nombre}`,
    disponible: () => ({ ok: true }),
    leer: async () => comportamiento(),
  }));
}

const LECTURA_OK = () => ({
  ok: true,
  lectura: normalizarLectura({ lineas: [{ cantidad: 1, netoUnitario: 2, subtotalImpreso: 2 }], pie: { total: 2 } }),
});

registrarFalso("t-ok", LECTURA_OK);
registrarFalso("t-sin-cuota", () => ({ ok: false, motivo: MOTIVO_LECTURA.CUOTA_AGOTADA }));
registrarFalso("t-caido", () => ({ ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO }));
registrarFalso("t-ilegible", () => ({ ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE }));
registrarFalso("t-no-soportado", () => ({ ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO }));
registrarFalso("r-ok", LECTURA_OK);

const leer = (titular, respaldo) =>
  leerConCadena({ cadena: armarCadena({ titular, respaldo, env: {} }), archivo: {}, receta: {} });

// ── Cuándo se pasa y cuándo no ─────────────────────────────────────────────

test("si el titular anda, el respaldo NI SE TOCA", async () => {
  const r = await leer("t-ok", "r-ok");
  assert.equal(r.ok, true);
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.lector, "modelo-t-ok");
});

test("SIN CUOTA SE PASA AL RESPALDO, y queda por qué", async () => {
  const r = await leer("t-sin-cuota", "r-ok");
  assert.equal(r.ok, true);
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.porQuePaso, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(r.lector, "modelo-r-ok");
});

test("con el servicio caído también se pasa", async () => {
  const r = await leer("t-caido", "r-ok");
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.porQuePaso, MOTIVO_LECTURA.SERVICIO_CAIDO);
});

test("UNA RESPUESTA ILEGIBLE NO PASA AL RESPALDO", () => {
  // El candado que importa. El titular CONTESTÓ, pero mal: eso es calidad de
  // lectura, no disponibilidad. Pasar al respaldo convertiría "el modelo se
  // equivocó" en "probemos hasta que alguno diga algo", y el que dijera algo
  // ganaría por insistencia y no por acertar.
  return leer("t-ilegible", "r-ok").then((r) => {
    assert.equal(r.ok, false);
    assert.equal(r.usoRespaldo, false);
    assert.equal(r.motivo, MOTIVO_LECTURA.RESPUESTA_ILEGIBLE);
  });
});

test("un archivo no soportado tampoco pasa: es capacidad, no falla", async () => {
  const r = await leer("t-no-soportado", "r-ok");
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO);
});

test("LA LISTA DE MOTIVOS QUE PASAN ES CERRADA, y son los de NO HABER CONTESTADO", () => {
  // La lista va completa a propósito: agregar un motivo tiene que caer acá en
  // rojo y obligar a justificarlo, en vez de entrar de contrabando.
  //
  // El 2026-08-11 se sumó TARDO_DEMASIADO, con el mismo criterio que los otros
  // dos: el titular NO DIO NINGUNA LECTURA, ni buena ni mala. Lo que sigue sin
  // pasar es lo que sí es una lectura —RESPUESTA_ILEGIBLE— y lo que es una
  // diferencia de capacidad —ARCHIVO_NO_SOPORTADO—.
  assert.deepEqual(
    [...MOTIVOS_QUE_PASAN].sort(),
    [
      MOTIVO_LECTURA.CUOTA_AGOTADA,
      MOTIVO_LECTURA.SERVICIO_CAIDO,
      MOTIVO_LECTURA.TARDO_DEMASIADO,
    ].sort()
  );
  assert.equal(correspondePasarAlRespaldo(MOTIVO_LECTURA.RESPUESTA_ILEGIBLE), false);
  assert.equal(correspondePasarAlRespaldo(MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO), false);
  assert.equal(correspondePasarAlRespaldo(MOTIVO_LECTURA.NO_CONFIGURADO), false);
  assert.equal(correspondePasarAlRespaldo(undefined), false);
});

// ── Los casos degenerados ──────────────────────────────────────────────────

test("SIN RESPALDO CONFIGURADO la cadena tiene un eslabón y se comporta igual", async () => {
  const r = await leer("t-sin-cuota", undefined);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(r.respaldoDisponible, false);
});

test("NO HAY RESPALDO POR DEFECTO", () => {
  // Elegir en silencio un segundo proveedor sería mandarle datos a un servicio
  // que nadie eligió.
  const c = armarCadena({ titular: "t-ok", respaldo: undefined, env: {} });
  assert.equal(c.respaldo, null);
});

test("EL MISMO LECTOR DE LOS DOS LADOS NO ES UN RESPALDO", () => {
  // Si se quedó sin cuota, se va a quedar sin cuota otra vez.
  const c = armarCadena({ titular: "t-ok", respaldo: "t-ok", env: {} });
  assert.equal(c.respaldoInutil, true);
});

test("con respaldo inútil no se intenta dos veces", async () => {
  const r = await leer("t-sin-cuota", "t-sin-cuota");
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.respaldoDisponible, false);
});

test("SI EL TITULAR NO ESTÁ CONFIGURADO, NO LO TAPA EL RESPALDO", async () => {
  // Taparlo dejaría al titular sin usar sin que nadie se entere: el sistema
  // andaría, con el proveedor equivocado, para siempre.
  const r = await leerConCadena({
    cadena: armarCadena({ titular: "", respaldo: "r-ok", env: {} }),
    archivo: {},
    receta: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.SIN_LECTOR);
});

test("si fallan los dos, se informa el fallo del SEGUNDO", async () => {
  const r = await leer("t-sin-cuota", "t-caido");
  assert.equal(r.ok, false);
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.porQuePaso, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(r.motivo, MOTIVO_LECTURA.SERVICIO_CAIDO);
});

test("el respaldo mal configurado se detecta al ARMAR, no al necesitarlo", () => {
  // Descubrirlo justo cuando el titular se cayó es el peor momento.
  const c = armarCadena({ titular: "t-ok", respaldo: "no-existe-este", env: {} });
  assert.equal(c.respaldo.ok, false);
  assert.match(c.respaldo.queHacer, /no existe/i);
});

// ── EL CANDADO QUE FALTABA: LA FIRMA REAL, DE PUNTA A PUNTA ────────────────
//
// Los candados de arriba usan lectores de mentira que aceptan cualquier cosa,
// así que NO podían ver el desajuste que rompió la lectura el 2026-08-11: la
// ruta mandaba `archivos`, los lectores esperaban `archivos`, y esta cadena
// pasaba `archivo` en singular. El lector recibía la lista vacía y devolvía
// ARCHIVO_NO_SOPORTADO — un motivo que a propósito NO pasa al respaldo, así que
// además el respaldo nunca se intentaba.
//
// Estos ejercen las implementaciones DE VERDAD, con su firma real, sin llamar a
// ningún servicio.

test("LA CADENA LE PASA LAS FOTOS AL LECTOR, EN PLURAL", async () => {
  const { crearLectorGemini } = await import("./gemini.js");
  let recibido = "NO SE LLAMÓ";
  const l = crearLectorGemini({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }) }),
  });
  const original = l.leer.bind(l);
  l.leer = async (args) => { recibido = args; return original(args); };

  const cadena = { titular: { ok: true, lector: l }, respaldo: null, respaldoInutil: false };
  await leerConCadena({
    cadena,
    archivos: [{ mime: "image/jpeg", bytes: Buffer.from("a") }, { mime: "image/jpeg", bytes: Buffer.from("b") }],
    receta: { percepciones: [] },
  });
  assert.notEqual(recibido, "NO SE LLAMÓ");
  assert.ok(Array.isArray(recibido.archivos), "la cadena tiene que pasar `archivos`, no `archivo`");
  assert.equal(recibido.archivos.length, 2, "y las DOS fotos, no una");
  assert.equal(recibido.archivo, undefined, "no puede quedar el nombre viejo en singular");
});

test("CON LA FIRMA BIEN, UNA FOTO VÁLIDA NO DA ARCHIVO_NO_SOPORTADO", async () => {
  // El síntoma exacto del bug: si la cadena vuelve a tirar las fotos, el lector
  // ve la lista vacía y contesta esto. Que este candado esté verde significa que
  // las fotos llegaron.
  const { crearLectorGemini } = await import("./gemini.js");
  const l = crearLectorGemini({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lineas: [], pie: {} }) }] } }], usageMetadata: {} }),
    }),
  });
  const r = await leerConCadena({
    cadena: { titular: { ok: true, lector: l }, respaldo: null },
    archivos: [{ mime: "image/jpeg", bytes: Buffer.from("a") }],
    receta: { percepciones: [] },
  });
  assert.notEqual(r.motivo, MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO, "las fotos no llegaron al lector");
  assert.equal(r.ok, true);
});

test("EL RESPALDO ES OTRO MODELO Y RECIBE LAS MISMAS FOTOS", async () => {
  const { crearLectorGemini, MODELO_RESPALDO, MODELO_POR_DEFECTO } = await import("./gemini.js");
  assert.notEqual(MODELO_RESPALDO, MODELO_POR_DEFECTO, "titular y respaldo no pueden ser el mismo modelo");

  let fotosDelRespaldo = null;
  const titular = { nombre: "titular", disponible: () => ({ ok: true }),
    leer: async () => ({ ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO }) };
  const respaldo = crearLectorGemini({
    env: { GEMINI_API_KEY: "x", GEMINI_MODELO: MODELO_RESPALDO },
    fetchImpl: async () => ({ ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lineas: [], pie: {} }) }] } }], usageMetadata: {} }) }),
  });
  const orig = respaldo.leer.bind(respaldo);
  respaldo.leer = async (a) => { fotosDelRespaldo = a.archivos; return orig(a); };

  const r = await leerConCadena({
    cadena: { titular: { ok: true, lector: titular }, respaldo: { ok: true, lector: respaldo }, respaldoInutil: false },
    archivos: [{ mime: "image/jpeg", bytes: Buffer.from("a") }],
    receta: { percepciones: [] },
  });
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.lector, MODELO_RESPALDO);
  assert.equal(fotosDelRespaldo?.length, 1, "el respaldo tiene que recibir las mismas fotos");
});

test("TARDAR DEMASIADO PASA AL RESPALDO: no es una lectura mala, es no haber contestado", () => {
  assert.equal(correspondePasarAlRespaldo(MOTIVO_LECTURA.TARDO_DEMASIADO), true);
});

test("la espera es MENOR que el tiempo del proxy", async () => {
  // 45 s contra los 60 de `proxy_read_timeout` de nginx. Si fuera al revés,
  // cortaría el proxy con una página HTML y la pantalla perdería el mensaje —
  // que es exactamente lo que pasó con el 413.
  const { ESPERA_MAX_MS } = await import("./gemini.js");
  assert.equal(ESPERA_MAX_MS, 45_000);
  assert.ok(ESPERA_MAX_MS < 60_000);
});
