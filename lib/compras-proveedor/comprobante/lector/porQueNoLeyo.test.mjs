// CADA ERROR DEL LECTOR DICE LO QUE ES, Y QUEDA LA PRUEBA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/porQueNoLeyo.test.mjs
//
// ── EL DÍA QUE NADIE PUDO CONTESTAR "POR QUÉ NO LEE" ──────────────────────
//
// El 2026-09-21 el lector de facturas no leyó en toda la jornada. La bitácora
// tenía diecinueve filas SERVICIO_CAIDO y dos TARDO_DEMASIADO, y con eso no se
// podía decidir nada: "el servicio no respondió" invita a tocar «Leer» de
// nuevo, y cada toque gasta una de las veinte consultas del día.
//
// El lector mapeaba CUALQUIER respuesta que no fuera 200 ni 429 a SERVICIO_CAIDO
// y tiraba el cuerpo del error. Llamando a la API a mano, con la clave de
// producción y la misma foto, aparecieron DOS causas distintas debajo de esa
// única palabra —medidas, no supuestas—:
//
//   HTTP 503  UNAVAILABLE        "This model is currently experiencing high
//                                 demand. Spikes in demand are usually
//                                 temporary. Please try again later."
//   HTTP 429  RESOURCE_EXHAUSTED "Quota exceeded for metric: ...
//                                 generate_content_free_tier_requests,
//                                 limit: 20, model: gemini-3.6-flash"
//
// Una se arregla esperando un rato. La otra no se arregla hasta mañana, y cada
// reintento la empeora. Con la misma etiqueta para las dos, la única salida
// visible era la que hacía daño.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  crearLectorGemini,
  detalleDelError,
  LARGO_DETALLE,
  motivoPorEstado,
} from "@/lib/compras-proveedor/comprobante/lector/gemini";
import {
  estadoDeLaFalla,
  MOTIVO_LECTURA,
  queHacerLectura,
} from "@/lib/compras-proveedor/comprobante/lector/contrato";

/** Una respuesta como la que devuelve `fetch`, con el cuerpo de Google. */
const respuestaDe = (status, cuerpo) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)),
  json: async () => (typeof cuerpo === "string" ? JSON.parse(cuerpo) : cuerpo),
});

/** El cuerpo REAL del 429 del 2026-09-21, recortado. */
const CUERPO_429 = {
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. " +
      "* Quota exceeded for metric: generativelanguage.googleapis.com/" +
      "generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash",
    status: "RESOURCE_EXHAUSTED",
  },
};

/** El cuerpo REAL del 503 del mismo día. */
const CUERPO_503 = {
  error: {
    code: 503,
    message:
      "This model is currently experiencing high demand. Spikes in demand are usually " +
      "temporary. Please try again later.",
    status: "UNAVAILABLE",
  },
};

// ── EL MAPEO ──────────────────────────────────────────────────────────────

test("CADA ESTADO DE GOOGLE DICE LO QUE ES", () => {
  assert.equal(motivoPorEstado(429), MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(motivoPorEstado(404), MOTIVO_LECTURA.MODELO_NO_EXISTE);
  assert.equal(motivoPorEstado(403), MOTIVO_LECTURA.NO_AUTORIZADO);
  assert.equal(motivoPorEstado(401), MOTIVO_LECTURA.NO_AUTORIZADO);
  assert.equal(motivoPorEstado(400), MOTIVO_LECTURA.PEDIDO_RECHAZADO);
  assert.equal(motivoPorEstado(413), MOTIVO_LECTURA.PEDIDO_RECHAZADO);
});

test("y un 5xx SÍ es el servicio caído: la etiqueta no desaparece, se acota", () => {
  assert.equal(motivoPorEstado(503), MOTIVO_LECTURA.SERVICIO_CAIDO);
  assert.equal(motivoPorEstado(500), MOTIVO_LECTURA.SERVICIO_CAIDO);
  assert.equal(motivoPorEstado(502), MOTIVO_LECTURA.SERVICIO_CAIDO);
});

test("CONTRAPRUEBA: con el mapeo viejo, los cuatro daban la misma palabra", () => {
  // El mapeo viejo era `!respuesta.ok → SERVICIO_CAIDO`. Escrito como el número
  // que importa: cuatro causas distintas, una sola etiqueta.
  const viejo = [404, 403, 400, 503].map(() => MOTIVO_LECTURA.SERVICIO_CAIDO);
  const nuevo = [404, 403, 400, 503].map(motivoPorEstado);
  assert.equal(new Set(viejo).size, 1, "así se veía el día que nadie pudo contestar por qué");
  assert.equal(new Set(nuevo).size, 4, "ahora cada una se distingue de las otras");
});

test("cada motivo nuevo tiene su texto, y dice si esperar sirve o no", () => {
  const esperar = queHacerLectura(MOTIVO_LECTURA.SERVICIO_CAIDO);
  assert.match(esperar, /en un rato/i, "el que se arregla esperando tiene que decirlo");

  for (const motivo of [MOTIVO_LECTURA.MODELO_NO_EXISTE, MOTIVO_LECTURA.NO_AUTORIZADO]) {
    const texto = queHacerLectura(motivo);
    assert.ok(texto && texto.length > 30, `sin texto para ${motivo}`);
    assert.match(
      texto,
      /no se arregla esperando/i,
      `${motivo} tiene que decir que reintentar no sirve: cada reintento gasta cuota`
    );
  }
  assert.match(queHacerLectura(MOTIVO_LECTURA.PEDIDO_RECHAZADO), /foto/i);
  assert.match(queHacerLectura(MOTIVO_LECTURA.CUOTA_AGOTADA), /cuota|mañana/i);
});

// ── LA PRUEBA QUE ANTES SE TIRABA ─────────────────────────────────────────

test("EL CUERPO DEL ERROR SE GUARDA, CON EL ESTADO ADELANTE", async () => {
  const d = await detalleDelError(respuestaDe(429, CUERPO_429));
  assert.match(d, /^429 /, "sin el estado adelante, el detalle no dice de dónde salió");
  assert.match(d, /limit: 20/, "se perdió el número que explica todo");
  assert.match(d, /gemini-3\.6-flash/);
  assert.ok(d.length <= LARGO_DETALLE, "el detalle tiene que estar acotado");
});

test("un cuerpo que no es JSON no rompe nada", () => {
  // Una página HTML de un proxy, por ejemplo: el diagnóstico no puede convertir
  // un error del servicio en un error de la lectura.
  return detalleDelError(respuestaDe(502, "<html>502 Bad Gateway</html>")).then((d) => {
    assert.match(d, /^502 /);
    assert.match(d, /Bad Gateway/);
  });
});

test("si ni el cuerpo se puede leer, el detalle lo dice en vez de explotar", async () => {
  const rota = { status: 500, ok: false, text: async () => { throw new Error("se cortó"); } };
  const d = await detalleDelError(rota);
  assert.match(d, /500/);
  assert.match(d, /no se pudo leer el cuerpo/i);
});

// ── Y EL LECTOR ENTERO, CON UN `fetch` DE MENTIRA ─────────────────────────

const lectorCon = (status, cuerpo) =>
  crearLectorGemini({
    env: { GEMINI_API_KEY: "no-es-una-clave" },
    fetchImpl: async () => respuestaDe(status, cuerpo),
  });

const UNA_FOTO = [{ mime: "image/jpeg", bytes: Buffer.from([1, 2, 3]) }];

test("EL LECTOR DEVUELVE EL MOTIVO REAL Y EL DETALLE, NO UNA ETIQUETA SOLA", async () => {
  const cuota = await lectorCon(429, CUERPO_429).leer({ archivos: UNA_FOTO, receta: {} });
  assert.equal(cuota.ok, false);
  assert.equal(cuota.motivo, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.match(cuota.detalle, /limit: 20/);

  const caido = await lectorCon(503, CUERPO_503).leer({ archivos: UNA_FOTO, receta: {} });
  assert.equal(caido.motivo, MOTIVO_LECTURA.SERVICIO_CAIDO);
  assert.match(caido.detalle, /high demand/i);

  const sinModelo = await lectorCon(404, {
    error: { code: 404, message: "models/gemini-2.5-flash is not found for API version v1beta" },
  }).leer({ archivos: UNA_FOTO, receta: {} });
  assert.equal(sinModelo.motivo, MOTIVO_LECTURA.MODELO_NO_EXISTE);
  assert.match(sinModelo.detalle, /is not found/);
});

test("el detalle NUNCA lleva la clave: sale del cuerpo, que no la tiene", async () => {
  const r = await lectorCon(403, {
    error: { code: 403, message: "API key not valid. Please pass a valid API key." },
  }).leer({ archivos: UNA_FOTO, receta: {} });
  assert.equal(r.motivo, MOTIVO_LECTURA.NO_AUTORIZADO);
  assert.ok(!r.detalle.includes("no-es-una-clave"), "se coló la clave en el detalle");
});


// ── Y EL ESTADO HTTP CON EL QUE SE CONTESTA ───────────────────────────────

test("LA CUOTA AGOTADA NO SE CONTESTA CON 'LA APLICACIÓN NO RESPONDE'", () => {
  // 502 es el estado de "la aplicación no responde", y además es el que el
  // proxy reemplaza por su propia página de error, perdiendo el cuerpo con el
  // motivo. Con la cuota agotada eso es falso dos veces: la aplicación contestó
  // perfecto, y reintentar es lo único que no hay que hacer.
  assert.equal(estadoDeLaFalla(MOTIVO_LECTURA.CUOTA_AGOTADA), 429);
  assert.equal(estadoDeLaFalla(MOTIVO_LECTURA.PEDIDO_RECHAZADO), 422);
  assert.equal(estadoDeLaFalla(MOTIVO_LECTURA.TARDO_DEMASIADO), 504);
  // Lo que es nuestro se contesta como nuestro.
  assert.equal(estadoDeLaFalla(MOTIVO_LECTURA.MODELO_NO_EXISTE), 500);
  assert.equal(estadoDeLaFalla(MOTIVO_LECTURA.NO_AUTORIZADO), 500);
});

test("CONTRAPRUEBA: el servicio caído SÍ sigue siendo 502", () => {
  // Sin esto, el candado de arriba pasaría devolviendo cualquier cosa menos 502
  // para todo, y se perdería el único caso en que 502 es la verdad.
  assert.equal(estadoDeLaFalla(MOTIVO_LECTURA.SERVICIO_CAIDO), 502);
  assert.equal(estadoDeLaFalla("UN_MOTIVO_QUE_NO_EXISTE"), 502);
});
