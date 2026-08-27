import assert from "node:assert/strict";
import test from "node:test";

import {
  RESPUESTA_NO_JSON,
  jsonOrError,
  leerJson,
  mensajeDeRespuestaRara,
  pareceHtml,
  prometeJson,
} from "@/lib/red/leerJson";

/** Una respuesta de mentira con la misma forma que la de `fetch`. */
const respuestaFalsa = ({ status = 200, ok = null, contentType = "application/json", cuerpo = "" } = {}) => ({
  status,
  ok: ok === null ? status >= 200 && status < 300 : ok,
  headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? contentType : null) },
  text: async () => cuerpo,
});

// ── EL CASO QUE ROMPIÓ EN PRODUCCIÓN ───────────────────────────────────────

test("una página HTML NO se parsea como json y produce un mensaje legible", async () => {
  const html = '<!DOCTYPE html><html lang="es"><head><title>404</title></head><body>no</body></html>';
  const { datos, error } = await leerJson(
    respuestaFalsa({ status: 404, contentType: "text/html; charset=utf-8", cuerpo: html }),
    "interpretar la explicación"
  );
  assert.equal(datos, undefined, "no puede devolver datos: no había json");
  assert.ok(error, "tiene que informar un error");
  assert.equal(error.codigo, RESPUESTA_NO_JSON);
  assert.equal(error.status, 404);
});

test("EL HTML NO SE FILTRA AL MENSAJE — ni una etiqueta, ni el título", async () => {
  const html =
    '<!DOCTYPE html><html><head><title>Error interno</title></head>' +
    "<body>/app/.next/server/chunks/secreto.js linea 42</body></html>";
  const { error } = await leerJson(
    respuestaFalsa({ status: 500, contentType: "text/html", cuerpo: html }),
    "guardar la receta"
  );
  const m = error.message;
  assert.ok(!m.includes("<"), "no puede salir una sola etiqueta");
  assert.ok(!m.includes("DOCTYPE"), "no puede salir el DOCTYPE");
  assert.ok(!m.includes("secreto.js"), "no puede salir una ruta interna del servidor");
  assert.ok(!m.includes("/app/"), "no puede salir una ruta del contenedor");
  // Y sí tiene que decir lo que hace falta para entender qué pasó.
  assert.ok(m.includes("guardar la receta"), "tiene que nombrar la operación");
  assert.ok(m.includes("500"), "tiene que decir el código");
});

test("el mensaje dice SIEMPRE la operación y el código", () => {
  for (const status of [500, 502, 504, 520, 524]) {
    const m = mensajeDeRespuestaRara({ status, operacion: "interpretar la explicación" });
    assert.ok(m.includes("interpretar la explicación"), `sin operación en ${status}`);
    assert.ok(m.includes(String(status)), `sin código en ${status}`);
  }
});

test("401 no se explica como un error del servidor: se explica como sesión vencida", () => {
  const m = mensajeDeRespuestaRara({ status: 401, operacion: "interpretar la explicación" });
  assert.ok(/sesi[oó]n/i.test(m), "tiene que hablar de la sesión");
  assert.ok(/volv[eé]/i.test(m), "tiene que decir qué hacer");
});

test("404 sugiere recargar, que es lo que lo arregla cuando la pantalla quedó vieja", () => {
  const m = mensajeDeRespuestaRara({ status: 404, operacion: "interpretar la explicación" });
  assert.ok(/recarg/i.test(m));
});

test("TODOS los mensajes dicen que no se guardó nada", () => {
  // Interpretar no escribe. Que el mensaje lo diga es la mitad de la tranquilidad
  // de quien lo lee: un error rojo sin eso deja pensando si quedó algo a medias.
  for (const status of [401, 403, 404, 500, 502]) {
    const m = mensajeDeRespuestaRara({ status, operacion: "interpretar la explicación" });
    assert.ok(/no se guard/i.test(m), `falta en ${status}`);
  }
});

// ── LO QUE NO TIENE QUE ROMPER ─────────────────────────────────────────────

test("un JSON de error del servidor GANA sobre el estado HTTP", async () => {
  // Es la razón por la que no se corta por `respuesta.ok` antes de leer: el
  // texto que escribió la ruta es mejor que cualquiera que se arme acá.
  const { datos, error } = await leerJson(
    respuestaFalsa({ status: 409, cuerpo: JSON.stringify({ ok: false, error: "Seleccioná un contexto operativo." }) }),
    "interpretar la explicación"
  );
  assert.equal(error, undefined);
  assert.equal(datos.error, "Seleccioná un contexto operativo.");
});

test("jsonOrError propaga el texto del servidor, no uno inventado", async () => {
  await assert.rejects(
    () =>
      jsonOrError(
        respuestaFalsa({ status: 502, cuerpo: JSON.stringify({ ok: false, error: "La lectura asistida no está configurada.", motivo: "NO_CONFIGURADO" }) }),
        "interpretar la explicación"
      ),
    (e) => {
      assert.equal(e.message, "La lectura asistida no está configurada.");
      assert.equal(e.motivo, "NO_CONFIGURADO", "el motivo viaja aparte del texto");
      return true;
    }
  );
});

test("jsonOrError devuelve los datos cuando salió bien", async () => {
  const datos = await jsonOrError(
    respuestaFalsa({ cuerpo: JSON.stringify({ ok: true, receta: { cantidadEn: "UNIDAD" } }) }),
    "interpretar la explicación"
  );
  assert.equal(datos.receta.cantidadEn, "UNIDAD");
});

test("un json con el Content-Type mal rotulado se lee igual", async () => {
  // El cuerpo manda sobre el rótulo: romperse por un encabezado mal puesto sería
  // inventar una falla que no existe.
  const { datos, error } = await leerJson(
    respuestaFalsa({ contentType: "text/plain", cuerpo: JSON.stringify({ ok: true, a: 1 }) }),
    "listar recetas"
  );
  assert.equal(error, undefined);
  assert.equal(datos.a, 1);
});

test("un cuerpo vacío no se confunde con json válido", async () => {
  const { error } = await leerJson(respuestaFalsa({ status: 204, cuerpo: "" }), "guardar la receta");
  assert.ok(error, "un cuerpo vacío no es un objeto");
});

test("pareceHtml reconoce las formas que llegan de verdad", () => {
  assert.equal(pareceHtml("<!DOCTYPE html><html>"), true);
  assert.equal(pareceHtml("  \n<!doctype HTML>"), true, "con espacios adelante y en minúscula");
  assert.equal(pareceHtml("<html><head>"), true);
  assert.equal(pareceHtml('{"ok":true}'), false);
  assert.equal(pareceHtml(""), false);
  assert.equal(pareceHtml(null), false);
});

test("prometeJson acepta las variantes reales y rechaza el html", () => {
  assert.equal(prometeJson("application/json"), true);
  assert.equal(prometeJson("application/json; charset=utf-8"), true);
  assert.equal(prometeJson("application/problem+json"), true);
  assert.equal(prometeJson("text/html; charset=utf-8"), false);
  assert.equal(prometeJson(""), false);
});

test("un texto que no es json NI html tampoco pasa", async () => {
  // El 504 de nginx por defecto no arranca con DOCTYPE, y tiene que frenar igual.
  const { error } = await leerJson(
    respuestaFalsa({ status: 504, contentType: "text/html", cuerpo: "504 Gateway Time-out" }),
    "interpretar la explicación"
  );
  assert.ok(error);
  assert.ok(error.message.includes("504"));
  assert.ok(!error.message.includes("Gateway"), "el cuerpo no se muestra");
});

test("si el cuerpo no se puede leer, igual sale un mensaje y no una excepción cruda", async () => {
  const rota = {
    status: 500,
    ok: false,
    headers: { get: () => "text/html" },
    text: async () => {
      throw new Error("stream cortado");
    },
  };
  const { error } = await leerJson(rota, "interpretar la explicación");
  assert.ok(error);
  assert.ok(!error.message.includes("stream cortado"), "no se propaga el error interno");
});
