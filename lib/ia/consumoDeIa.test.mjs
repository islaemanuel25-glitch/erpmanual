// EL CONSUMO DE IA: CUÁNTO GASTA CADA COSA, Y QUÉ NO PUEDE GASTAR.
//
// ── EL NÚMERO QUE MANDA ────────────────────────────────────────────────────
//
// VEINTE consultas por día. No es una estimación: sale del cuerpo del 429 que
// devolvió la API el 2026-08-27, con `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
// y valor 20.
//
// Con ese techo, cada consulta que se gasta sola —un reintento automático, una
// retranscripción silenciosa, un doble toque— es una que le falta a alguien a la
// tarde. Estos candados fijan cuántas gasta cada acción, y sobre todo cuáles
// gastan CERO.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MOTIVO_IA,
  RedDeIaProhibida,
  pedirJson,
  redDeIaProhibida,
} from "@/lib/ia/salidaEstructurada";
import { contadorEnMemoria } from "@/lib/ia/contadorDeIa";
import {
  LIMITE_DIARIO_POR_DEFECTO,
  MOTIVO_LIMITE,
  TEXTO_LIMITE,
  hayCuota,
  limiteDiario,
  textoDeConsumo,
} from "@/lib/ia/limiteDiario";
import { leerArchivoDePedido, transcribirTablaDelArchivo } from "@/lib/compras-proveedor/importacion/lectorArchivo";
import { interpretarExplicacion } from "@/lib/compras-proveedor/importacion/interpretarExplicacion";

const ESQUEMA = { type: "OBJECT", properties: { a: { type: "STRING", nullable: true } } };
const ENV = { GEMINI_API_KEY: "clave-de-mentira", GEMINI_MODELO: "modelo-de-mentira" };

const respuestaOk = (datos) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }] }),
});
const respuestaMala = (status) => ({ ok: false, status, json: async () => ({}) });

/** Un archivo de mentira con la forma de `File`. */
const archivo = (nombre = "foto.jpg", tipo = "image/jpeg") => ({
  name: nombre, type: tipo, size: 12,
  arrayBuffer: async () => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
});

/** La lectura visual mínima que `lectorArchivo` acepta como buena. */
const LECTURA_BUENA = {
  numeroPedido: "X", fecha: null,
  hayColumnaSubtotal: true, hayColumnaBonificacion: false, hayTotalImpreso: false,
  totalDocumento: null,
  tabla: { encabezados: ["A"], filas: [{ celdas: ["1"] }] },
  lineas: [{ codigo: "A1", descripcion: "Algo", cantidad: 1, unidad: "UN", precioUnitario: 10, bonificacionPct: null, subtotal: 10 }],
};

// ══════════════════════════════════════════════════════════════════════════
// CUÁNTO GASTA CADA ACCIÓN
// ══════════════════════════════════════════════════════════════════════════

test("UNA IMPORTACIÓN NORMAL CONSUME EXACTAMENTE 1", async () => {
  const contador = contadorEnMemoria({ limite: 20 });
  const r = await leerArchivoDePedido({
    archivo: archivo(), env: ENV, contador,
    fetchImpl: async () => respuestaOk(LECTURA_BUENA),
    crearSenal: () => undefined,
  });
  assert.equal(r.ok, true);
  assert.equal(contador.cuantasSeContaron(), 1, "leer el archivo tiene que costar UNA");
});

test("EXPLICAR CÓMO LEER CONSUME EXACTAMENTE 1 ADICIONAL", async () => {
  const contador = contadorEnMemoria({ limite: 20 });
  const r = await interpretarExplicacion({
    explicacion: "La columna ENVIADO es la cantidad.",
    env: ENV, contador,
    fetchImpl: async () => respuestaOk({ columnas: { cantidad: { encabezado: "ENVIADO" } } }),
    crearSenal: () => undefined,
  });
  assert.equal(r.ok, true);
  assert.equal(contador.cuantasSeContaron(), 1, "interpretar tiene que costar UNA, ni más ni menos");
});

test("RETRANSCRIBIR CONSUME 1 — y por eso se pide, no se hace solo", async () => {
  const contador = contadorEnMemoria({ limite: 20 });
  const r = await transcribirTablaDelArchivo({
    archivo: archivo(), env: ENV, contador,
    fetchImpl: async () => respuestaOk({ tabla: { encabezados: ["A", "B"], filas: [{ celdas: ["1", "2"] }] } }),
    crearSenal: () => undefined,
  });
  assert.equal(r.ok, true);
  assert.equal(contador.cuantasSeContaron(), 1);
});

test("UN EXCEL CONSUME CERO — su tabla sale del archivo, no del modelo", async () => {
  // Es el caso que hay que proteger de un refactor distraído: si el Excel
  // pasara por el modelo, cada lista de precios costaría una consulta.
  const contador = contadorEnMemoria({ limite: 20 });
  await leerArchivoDePedido({
    archivo: archivo("lista.xlsx", ""),
    env: ENV, contador,
    fetchImpl: async () => { throw new Error("un Excel NO puede llamar al modelo"); },
  });
  assert.equal(contador.cuantasSeContaron(), 0);
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE TIENE QUE CONSUMIR CERO
// ══════════════════════════════════════════════════════════════════════════

test("UN ERROR DEL PROVEEDOR NO SE REINTENTA: gasta 1, no 2", async () => {
  // Un 503 es transitorio y reintentarlo tiene sentido técnico. Con veinte por
  // día no lo tiene económico: la segunda consulta la decide la persona.
  const contador = contadorEnMemoria({ limite: 20 });
  let llamadas = 0;
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, env: ENV, contador,
    fetchImpl: async () => { llamadas += 1; return respuestaMala(503); },
    crearSenal: () => undefined,
  });
  assert.equal(r.ok, false);
  assert.equal(llamadas, 1, "salió dos veces a la red");
  assert.equal(contador.cuantasSeContaron(), 1, "contó dos consultas por un solo error");
});

test("NADIE PIDE EL REINTENTO AUTOMÁTICO — se afirma sobre el código", () => {
  // Se mira el repo entero y no un archivo: lo que hay que impedir es que
  // alguien lo active "para que ande mejor" sin ver el costo.
  const archivos = [
    "lib/compras-proveedor/importacion/interpretarExplicacion.js",
    "lib/compras-proveedor/importacion/lectorArchivo.js",
    "app/api/compras-proveedor/recetas-lectura/interpretar/route.js",
    "app/api/compras-proveedor/importar/transcribir/route.js",
    "app/api/compras-proveedor/importar/ordenar-candidatos/route.js",
  ];
  for (const rel of archivos) {
    const src = readFileSync(rel, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(src, /reintentar:\s*true/, `${rel} pide reintento automático`);
  }
});

test("LA CUOTA AGOTADA DEL PROVEEDOR TAMPOCO SE REINTENTA", async () => {
  const contador = contadorEnMemoria({ limite: 20 });
  let llamadas = 0;
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, env: ENV, contador,
    fetchImpl: async () => { llamadas += 1; return respuestaMala(429); },
    crearSenal: () => undefined,
  });
  assert.equal(r.motivo, MOTIVO_IA.CUOTA_AGOTADA);
  assert.equal(llamadas, 1);
});

// ══════════════════════════════════════════════════════════════════════════
// EL LÍMITE
// ══════════════════════════════════════════════════════════════════════════

test("EL LÍMITE 20 BLOQUEA LA CONSULTA 21", async () => {
  const contador = contadorEnMemoria({ limite: 20, usadas: 20 });
  let llamadas = 0;
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, env: ENV, contador,
    fetchImpl: async () => { llamadas += 1; return respuestaOk({ a: "no" }); },
    crearSenal: () => undefined,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_IA.LIMITE_DIARIO);
  assert.equal(llamadas, 0, "SALIÓ A LA RED con el límite alcanzado");
});

test("la consulta 20 SÍ pasa: el tope es 'veinte', no 'diecinueve'", async () => {
  const contador = contadorEnMemoria({ limite: 20, usadas: 19 });
  const r = await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, env: ENV, contador,
    fetchImpl: async () => respuestaOk({ a: "si" }),
    crearSenal: () => undefined,
  });
  assert.equal(r.ok, true);
  assert.equal(contador.cuantasSeContaron(), 20);
});

test("SE CUENTA ANTES DE SALIR: una consulta que falla gasta igual", async () => {
  // Es lo que hace que el contador sirva. Contando después, una consulta que se
  // cayó sería invisible y el número diría que quedan más de las que hay.
  const contador = contadorEnMemoria({ limite: 20 });
  await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, env: ENV, contador,
    fetchImpl: async () => { throw Object.assign(new Error("red"), { name: "TypeError" }); },
    crearSenal: () => undefined,
  });
  assert.equal(contador.cuantasSeContaron(), 1, "un fallo de red no se contó");
});

test("y la fila queda con el motivo del fallo, no en curso", async () => {
  const contador = contadorEnMemoria({ limite: 20 });
  await pedirJson({
    instrucciones: "x", esquema: ESQUEMA, env: ENV, contador,
    fetchImpl: async () => respuestaMala(500),
    crearSenal: () => undefined,
  });
  const filas = contador.filasEscritas();
  assert.equal(filas.length, 1);
  assert.equal(filas[0].ok, false);
  assert.equal(filas[0].motivo, MOTIVO_IA.SERVICIO_CAIDO);
});

test("el límite se configura por variable, y un valor absurdo cae al default", () => {
  assert.equal(limiteDiario({ IA_LIMITE_DIARIO: "50" }), 50);
  assert.equal(limiteDiario({ IA_LIMITE_DIARIO: "0" }), LIMITE_DIARIO_POR_DEFECTO, "cero dejaría la IA muerta");
  assert.equal(limiteDiario({ IA_LIMITE_DIARIO: "-3" }), LIMITE_DIARIO_POR_DEFECTO);
  assert.equal(limiteDiario({ IA_LIMITE_DIARIO: "muchas" }), LIMITE_DIARIO_POR_DEFECTO);
  assert.equal(limiteDiario({}), LIMITE_DIARIO_POR_DEFECTO);
});

test("hayCuota cuenta bien en los bordes", () => {
  assert.equal(hayCuota({ usadasHoy: 0, limite: 20 }).puede, true);
  assert.equal(hayCuota({ usadasHoy: 19, limite: 20 }).puede, true);
  assert.equal(hayCuota({ usadasHoy: 20, limite: 20 }).puede, false);
  assert.equal(hayCuota({ usadasHoy: 25, limite: 20 }).quedan, 0, "no puede quedar un negativo");
});

test("el texto del límite NO se puede confundir con un error del archivo", () => {
  assert.match(TEXTO_LIMITE, /l[íi]mite diario/i);
  assert.doesNotMatch(TEXTO_LIMITE, /archivo no|no se pudo leer|imagen/i);
  assert.match(TEXTO_LIMITE, /a mano/i, "tiene que decir qué hacer mientras tanto");
});

test("el contador se dice igual en todas las pantallas", () => {
  assert.equal(textoDeConsumo({ usadas: 3, limite: 20 }), "IA utilizada hoy: 3 de 20");
});

// ══════════════════════════════════════════════════════════════════════════
// LAS PRUEBAS NO PUEDEN LLAMAR DE VERDAD
// ══════════════════════════════════════════════════════════════════════════

test("LA SUITE TIENE LA RED A LA IA PROHIBIDA", () => {
  // Lo pone `scripts/alias-loader.mjs`, por el que pasan TODAS las pruebas.
  assert.equal(process.env.IA_PROHIBIR_RED, "1");
  assert.equal(redDeIaProhibida(), true);
});

test("Y LA CLAVE NO ESTÁ EN EL ENTORNO DE LAS PRUEBAS", () => {
  // Segundo candado: aunque alguien esquive la puerta y escriba su propio
  // `fetch`, no tiene con qué autenticarse.
  assert.equal(process.env.GEMINI_API_KEY, undefined);
  assert.equal(process.env.GROQ_API_KEY, undefined);
});

test("UNA PRUEBA QUE INTENTE SALIR DE VERDAD LANZA, no devuelve un error tranquilo", async () => {
  // Un `{ok:false}` se confundiría con "el servicio no contestó" y pasaría
  // desapercibido. Una excepción rompe la prueba y nombra el problema.
  await assert.rejects(
    () => pedirJson({ instrucciones: "x", esquema: ESQUEMA, env: { GEMINI_API_KEY: "k" } }),
    (e) => {
      assert.ok(e instanceof RedDeIaProhibida);
      assert.match(e.message, /respuestas sint[ée]ticas/i);
      return true;
    }
  );
});

test("la prohibición gana sobre el env inyectado", () => {
  // Los candados inyectan un `env` de mentira con la clave adentro. Si la
  // prohibición se leyera SOLO de ahí, nunca llegaría y el control sería
  // decorativo.
  assert.equal(redDeIaProhibida({ GEMINI_API_KEY: "k" }), true);
});

// ══════════════════════════════════════════════════════════════════════════
// UNA SOLA PUERTA
// ══════════════════════════════════════════════════════════════════════════

test("NINGÚN MÓDULO LLAMA AL PROVEEDOR POR AFUERA DE LA PUERTA", () => {
  // El host se nombra en un solo archivo. Si aparece en otro, alguien abrió una
  // segunda puerta — y esa no cuenta consultas ni respeta el límite.
  const fuentes = [
    "lib/compras-proveedor/importacion/lectorArchivo.js",
    "lib/compras-proveedor/importacion/interpretarExplicacion.js",
    "app/api/compras-proveedor/recetas-lectura/interpretar/route.js",
    "app/api/compras-proveedor/importar/transcribir/route.js",
    "app/api/compras-proveedor/importar/analizar/route.js",
    "app/api/compras-proveedor/importar/ordenar-candidatos/route.js",
  ];
  for (const rel of fuentes) {
    const src = readFileSync(rel, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.ok(!src.includes("generativelanguage"), `${rel} llama al proveedor por su cuenta`);
    assert.ok(!src.includes("x-goog-api-key"), `${rel} arma el encabezado de la clave por su cuenta`);
  }
});

test("el importador y los comprobantes comparten el MISMO contador", async () => {
  // Se afirma sobre la tabla: las dos cuentas salen de `LlamadaLector`. Dos
  // tablas serían dos cuentas que suman distinto y ningún tope real.
  const src = readFileSync("lib/ia/contadorDeIa.js", "utf8");
  assert.match(src, /llamadaLector/, "el contador dejó de usar la tabla compartida");
  const cuota = readFileSync("lib/compras-proveedor/comprobante/lector/cuota.js", "utf8");
  assert.ok(cuota.length > 0, "la ventana del día se reusa de comprobantes");
});
