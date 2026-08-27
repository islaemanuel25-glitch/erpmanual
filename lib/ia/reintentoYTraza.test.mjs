// EL REINTENTO ACOTADO Y LA TRAZA, CON LA MEDICIÓN QUE LOS ORIGINÓ.
//
// ── LO QUE SE MIDIÓ EL 2026-08-27 ──────────────────────────────────────────
//
// Desde un contenedor descartable, contra la configuración de producción y con
// texto sintético:
//
//   · `gemini-3.6-flash` contestó **503 UNAVAILABLE** ("high demand") y tardó
//     entre 6,7 y 54 segundos en decirlo.
//   · Contestó **429 RESOURCE_EXHAUSTED** en 9 de 15 llamadas, con el detalle
//     `GenerateRequestsPerDayPerProjectPerModel-FreeTier` **valor 20**: es la
//     cuota del DÍA.
//   · Las respuestas BUENAS tardaron 2,3 / 2,6 / 2,6 / 10,3 segundos.
//
// De ahí salen las dos decisiones que estos candados fijan: se reintenta el 503
// —transitorio— y NO se reintenta el 429 —cuota diaria, insistir no la
// devuelve—; y el corte por intento es de 20 s, casi el doble de la peor
// respuesta buena, para que dos intentos entren en el presupuesto del proxy.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CORTE_POR_INTENTO_MS, MOTIVO_IA, pedirJson } from "@/lib/ia/salidaEstructurada";
import { CABECERA_REQUEST_ID, crearTraza, lineaDeTraza, nuevoRequestId } from "@/lib/ia/trazaDePedido";

const ESQUEMA = { type: "OBJECT", properties: { a: { type: "STRING", nullable: true } } };

/** Un `fetch` de mentira que devuelve la lista de respuestas, en orden. */
function fetchQueDevuelve(respuestas) {
  const llamadas = [];
  const impl = async () => {
    llamadas.push(1);
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    if (typeof r === "function") return r();
    return r;
  };
  impl.cuantas = () => llamadas.length;
  return impl;
}

const respuestaOk = (datos = { a: "x" }) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }] }),
});
const respuestaMala = (status) => ({ ok: false, status, json: async () => ({}) });

// ── EL REINTENTO ───────────────────────────────────────────────────────────

test("un 503 se reintenta UNA vez, y si el segundo sale bien devuelve el dato", async () => {
  const impl = fetchQueDevuelve([respuestaMala(503), respuestaOk({ a: "vino" })]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.datos.a, "vino");
  assert.equal(impl.cuantas(), 2, "tiene que haber intentado dos veces");
});

test("un 503 seguido de otro 503 NO intenta una tercera vez", async () => {
  // "Único reintento acotado". Un bucle de reintentos contra un servicio caído
  // es una forma de tardar más en dar el mismo error.
  const impl = fetchQueDevuelve([respuestaMala(503)]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_IA.SERVICIO_CAIDO);
  assert.equal(impl.cuantas(), 2, "dos intentos, ni uno más");
});

test("EL 429 NO SE REINTENTA — es la cuota del día, no un pico", async () => {
  const impl = fetchQueDevuelve([respuestaMala(429), respuestaOk()]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_IA.CUOTA_AGOTADA);
  assert.equal(impl.cuantas(), 1, "insistir sobre una cuota diaria solo hace esperar");
});

test("un 400 tampoco se reintenta: es un contrato mal armado", async () => {
  const impl = fetchQueDevuelve([respuestaMala(400), respuestaOk()]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true,
  });
  assert.equal(r.ok, false);
  assert.equal(impl.cuantas(), 1);
});

test("un 401 tampoco: la clave no mejora insistiendo", async () => {
  const impl = fetchQueDevuelve([respuestaMala(401), respuestaOk()]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true,
  });
  assert.equal(r.ok, false);
  assert.equal(impl.cuantas(), 1);
});

test("CADA intento se corta a 20 s, no el presupuesto entero de una", async () => {
  // Es lo que evita que un 503 de 54 segundos se coma el pedido completo.
  const pedidos = [];
  await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, timeoutMs: 45_000,
    env: { GEMINI_API_KEY: "k" },
    fetchImpl: fetchQueDevuelve([respuestaMala(503)]), reintentar: true,
    crearSenal: (ms) => { pedidos.push(ms); return undefined; },
  });
  assert.deepEqual(pedidos, [CORTE_POR_INTENTO_MS, CORTE_POR_INTENTO_MS]);
  assert.ok(
    CORTE_POR_INTENTO_MS * 2 < 60_000,
    "dos intentos tienen que entrar en el corte de nginx, que son 60 s"
  );
});

test("no se reintenta si el presupuesto ya no da para un intento ENTERO", async () => {
  // Salir con dos segundos de margen no es reintentar: es garantizar un
  // vencimiento y hacerle perder el tiempo al que espera.
  let t = 0;
  const reloj = () => t;
  const impl = fetchQueDevuelve([
    () => { t += 19_000; return respuestaMala(503); },
    respuestaOk(),
  ]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, timeoutMs: 25_000,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true, ahora: reloj,
  });
  assert.equal(r.ok, false);
  assert.equal(impl.cuantas(), 1, "quedaban 6 s y un intento pide 20");
});

test("la traza del resultado dice cuántos intentos hubo y qué contestó cada uno", async () => {
  const impl = fetchQueDevuelve([respuestaMala(503), respuestaOk()]);
  let t = 0;
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined, reintentar: true,
    ahora: () => { t += 1000; return t; },
  });
  assert.equal(r.intentos.length, 2);
  assert.equal(r.intentos[0].estado, 503);
  assert.equal(r.intentos[1].estado, 200);
  assert.ok(Number.isFinite(r.msTotal));
});

test("EL REINTENTO NO VIENE PUESTO — hay que pedirlo", async () => {
  // ── LA REGRESIÓN QUE CASI ENTRA ────────────────────────────────────────
  //
  // La primera versión reintentaba SIEMPRE. `lectorArchivo` ya tiene su propio
  // reintento —para cuando la foto vuelve sin renglones— así que los dos se
  // multiplicaban: hasta CUATRO llamadas al modelo en un solo pedido, contra
  // una cuota de veinte por día, y hasta ochenta segundos contra un corte de
  // proxy de sesenta.
  //
  // Lo atrapó un candado del lector que decía que un 500 no se reintenta. Sin
  // ese candado viejo, esto habría llegado a producción como un arreglo.
  const impl = fetchQueDevuelve([respuestaMala(503), respuestaOk()]);
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA,
    env: { GEMINI_API_KEY: "k" }, fetchImpl: impl, crearSenal: () => undefined,
  });
  assert.equal(r.ok, false);
  assert.equal(impl.cuantas(), 1, "sin pedirlo, un solo intento");
});

test("sin reintento, el intento recibe el presupuesto ENTERO", async () => {
  // Recortarlo a 20 s le cambiaría el contrato a `lectorArchivo`, que pide 45 y
  // tiene candados que lo afirman. El recorte existe para que quepan DOS.
  const pedidos = [];
  await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, timeoutMs: 45_000,
    env: { GEMINI_API_KEY: "k" },
    fetchImpl: fetchQueDevuelve([respuestaMala(503)]),
    crearSenal: (ms) => { pedidos.push(ms); return undefined; },
  });
  assert.deepEqual(pedidos, [45_000]);
});

test("EL LECTOR DE ARCHIVO NO PIDE REINTENTO — se afirma sobre el código", () => {
  // Se mira el archivo y no el comportamiento: el comportamiento ya lo cubren
  // los candados del lector, y lo que se quiere impedir es que alguien lo
  // active "para que ande mejor" sin ver que se multiplica con el de al lado.
  const src = readFileSync("lib/compras-proveedor/importacion/lectorArchivo.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /reintentar:\s*true/, "el lector activó el reintento de pedirJson");
});

test("sin clave no se intenta NADA, ni una vez", async () => {
  const impl = fetchQueDevuelve([respuestaOk()]);
  const r = await pedirJson({ instrucciones: "x", esquema: ESQUEMA, env: {}, fetchImpl: impl });
  assert.equal(r.motivo, MOTIVO_IA.NO_CONFIGURADO);
  assert.equal(impl.cuantas(), 0);
});

// ── LA TRAZA ───────────────────────────────────────────────────────────────

test("el identificador es corto y sin caracteres que se confundan al leerlos", () => {
  const id = nuevoRequestId();
  assert.equal(id.length, 12, "tiene que entrar de un vistazo en una captura");
  assert.doesNotMatch(id, /[loi01]/, "l, o, i, 0 y 1 se confunden al copiarlos a mano");
});

test("dos identificadores seguidos no son iguales", () => {
  assert.notEqual(nuevoRequestId(), nuevoRequestId());
});

test("LA LÍNEA DE LOG NO LLEVA NADA DEL DOCUMENTO NI NINGÚN SECRETO", () => {
  // El candado que importa. Un log con la explicación escrita es una copia de
  // datos del proveedor en un archivo que nadie borra.
  const linea = lineaDeTraza({
    requestId: "abc123def456",
    ruta: "recetas-lectura/interpretar",
    etapa: "proveedor",
    ms: 2345,
    clase: "ia:SERVICIO_CAIDO",
    estadoProveedor: 503,
    intentos: [{ estado: 503, ms: 20000 }, { estado: 200, ms: 2300 }],
  });
  for (const prohibido of ["ENVIADO", "Marlboro", "explicacion", "AIza", "x-goog-api-key"]) {
    assert.ok(!linea.includes(prohibido), `la línea filtra "${prohibido}": ${linea}`);
  }
  // Un correo sí está prohibido, pero el `@` suelto NO: el formato de los
  // intentos lo usa —`503@20000ms`—. Prohibir el símbolo hacía que este candado
  // diera rojo por su propio formato, que es afirmar sobre la forma en vez de
  // sobre lo que se quiere impedir.
  assert.doesNotMatch(linea, /[\w.-]+@[\w.-]+\.\w+/, "no puede salir un correo");
  // Y sí tiene lo que hace falta para diagnosticar.
  assert.match(linea, /req=abc123def456/);
  assert.match(linea, /etapa=proveedor/);
  assert.match(linea, /ms=2345/);
  assert.match(linea, /proveedor=503/);
  assert.match(linea, /intentos=503@20000ms\+200@2300ms/);
});

test("un estado 0 del proveedor se registra, no se come", () => {
  // `if (estado)` habría borrado el cero, que significa "no hubo respuesta" — el
  // caso más informativo de todos. Es el mismo tropiezo del falsy que ya costó
  // cinco veces en este módulo.
  const linea = lineaDeTraza({ requestId: "x", ruta: "r", etapa: "e", estadoProveedor: 0 });
  assert.match(linea, /proveedor=0/);
});

test("crearTraza escribe una línea al ENTRAR y otra al SALIR, siempre", () => {
  const escritas = [];
  let t = 0;
  const traza = crearTraza({ ruta: "r", ahora: () => { t += 100; return t; }, escribir: (l) => escritas.push(l) });
  traza.etapa("validado");
  traza.fin({ clase: "ok" });
  assert.equal(escritas.length, 3, "entra, una etapa, sale");
  assert.match(escritas[0], /etapa=entra/);
  assert.match(escritas[2], /etapa=sale/);
  assert.match(escritas[2], /clase=ok/);
});

test("cada etapa mide DESDE LA ANTERIOR, no desde el principio", () => {
  // Con acumulados no se puede ver cuál de tres llamadas fue la lenta, que es
  // justamente la pregunta que se hace mirando esto.
  const escritas = [];
  const marcas = [0, 1000, 6000, 6500];
  let i = 0;
  const traza = crearTraza({ ruta: "r", ahora: () => marcas[i++], escribir: (l) => escritas.push(l) });
  traza.etapa("uno");
  traza.etapa("dos");
  assert.match(escritas[1], /etapa=uno ms=1000/);
  assert.match(escritas[2], /etapa=dos ms=5000/, "la segunda dura 5000, no 6000");
});

test("el encabezado se llama igual en el servidor y en el cliente", async () => {
  // Se declara en dos archivos a propósito —uno viaja al navegador y el otro
  // no—, así que hay que comprobar que digan lo mismo. Si divergen, el
  // identificador deja de llegar a la pantalla y nadie se entera.
  const { CABECERA_REQUEST_ID: delCliente } = await import("@/lib/red/leerJson");
  assert.equal(delCliente, CABECERA_REQUEST_ID);
  assert.equal(delCliente, "x-request-id");
});
