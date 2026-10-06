// Candados de la capa HTTP de Azul Chat que no necesitan base: el tipo de
// contenido, la lectura del cuerpo con tope, la firma sobre BYTES, el JSON
// canónico, el cupo y la traducción a la respuesta pública. La ruta real,
// contra PostgreSQL, la ejerce `scripts/pruebas-db/azulChatVentasResumen.mjs`
// (sección H).
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/http.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { esTipoJson, leerCuerpoAcotado } from "./cuerpoHttp.js";
import { atenderSolicitud, leerPedido, MAX_BYTES_CUERPO } from "./atender.js";
import { autenticarAplicacion, firmarSolicitud, CABECERAS } from "./autenticacionAplicacion.js";
import { crearLimitador, MAX_POR_USUARIO, MAX_POR_APLICACION, VENTANA_MS } from "./limitador.js";
import { aRespuestaPublica, rechazoPublico, TRADUCCION, PUBLICOS } from "./respuestaPublica.js";
import { generarTokenDelegacion, hashTokenDelegacion } from "../vinculos/codigoVinculo.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
const RUTA = "app/api/integraciones/azul-chat/consultar/route.js";
const RUTA_CANJE = "app/api/integraciones/azul-chat/vinculo/canjear/route.js";

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const AHORA = Date.parse("2026-10-06T15:00:00.000Z");
const MARCA = String(Math.floor(AHORA / 1000));
const cabeceras = (bytes) =>
  new Headers({
    [CABECERAS.aplicacion]: "azul-chat",
    [CABECERAS.marca]: MARCA,
    [CABECERAS.firma]: firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: bytes }),
  });

// ── Tipo de contenido ──────────────────────────────────────────────────────

test("17. solo application/json, a lo sumo con charset=utf-8", () => {
  for (const ok of ["application/json", "application/json; charset=utf-8", "Application/JSON;charset=UTF-8"]) {
    assert.equal(esTipoJson(ok), true, ok);
  }
  for (const no of [null, "", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/json; charset=latin1", "application/jsonp", "text/json"]) {
    assert.equal(esTipoJson(no), false, String(no));
  }
});

// ── El cuerpo con tope ─────────────────────────────────────────────────────

const pedidoHttp = (cuerpo, headers = {}) =>
  new Request("http://ci/api/integraciones/azul-chat/consultar", { method: "POST", body: cuerpo, headers, duplex: "half" });

test("el cuerpo se lee como bytes, idéntico a lo enviado", async () => {
  const enviados = new Uint8Array([0x7b, 0x7d, 0xff, 0xfe]);
  const r = await leerCuerpoAcotado(pedidoHttp(enviados), 100);
  assert.equal(r.ok, true);
  assert.deepEqual([...r.bytes], [...enviados], "ni decodificado ni re-codificado");
});

test("18. un cuerpo vacío se rechaza", async () => {
  assert.deepEqual(await leerCuerpoAcotado(pedidoHttp(""), 100), { ok: false, motivo: "VACIO" });
  assert.deepEqual(await leerCuerpoAcotado(new Request("http://ci/x", { method: "POST" }), 100), { ok: false, motivo: "VACIO" });
});

test("19. por encima del tope: por Content-Length y por lo que realmente llega", async () => {
  assert.deepEqual(await leerCuerpoAcotado(pedidoHttp("x".repeat(101)), 100), { ok: false, motivo: "DEMASIADO_GRANDE" });
  // Sin Content-Length (stream): el tope lo pone lo leído.
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(50));
      c.close();
    },
  });
  assert.deepEqual(await leerCuerpoAcotado(pedidoHttp(stream), 100), { ok: false, motivo: "DEMASIADO_GRANDE" });
  // Un Content-Length que miente para abajo no alcanza.
  const mentiroso = pedidoHttp("x".repeat(500));
  const engañado = { headers: new Headers({ "content-length": "10" }), body: mentiroso.body };
  assert.deepEqual(await leerCuerpoAcotado(engañado, 100), { ok: false, motivo: "DEMASIADO_GRANDE" });
  assert.equal(MAX_BYTES_CUERPO, 4096);
});

// ── La firma va sobre los bytes ────────────────────────────────────────────

test("la firma de un string y la de sus bytes UTF-8 son la misma", () => {
  const texto = JSON.stringify({ capacidad: "ventas_resumen", nota: "ñandú" });
  const bytes = new TextEncoder().encode(texto);
  assert.equal(
    firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }),
    firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: bytes })
  );
});

test("4. un byte cambiado después de firmar invalida la firma", () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ a: 1 }));
  const h = cabeceras(bytes);
  const alterado = Uint8Array.from(bytes);
  alterado[5] = 0x32; // "1" → "2"
  assert.equal(autenticarAplicacion({ headers: h, cuerpo: bytes, entorno: ENTORNO, ahora: AHORA }).ok, true);
  assert.equal(autenticarAplicacion({ headers: h, cuerpo: alterado, entorno: ENTORNO, ahora: AHORA }).codigo, "FIRMA_INVALIDA");
});

test("dos cuerpos con bytes distintos que se decodificarían igual con reemplazo no comparten firma", () => {
  // 0xFF y 0xFE son UTF-8 inválido: un decodificador permisivo los vuelve U+FFFD.
  const a = new Uint8Array([0x22, 0xff, 0x22]);
  const b = new Uint8Array([0x22, 0xfe, 0x22]);
  assert.equal(new TextDecoder().decode(a), new TextDecoder().decode(b), "con reemplazo se leen igual");
  const h = cabeceras(a);
  assert.equal(autenticarAplicacion({ headers: h, cuerpo: b, entorno: ENTORNO, ahora: AHORA }).codigo, "FIRMA_INVALIDA");
});

// ── JSON canónico ──────────────────────────────────────────────────────────

const TOKEN = generarTokenDelegacion();
const OTRO_TOKEN = generarTokenDelegacion();
const CANONICO = JSON.stringify({
  capacidad: "ventas_resumen",
  delegacion: { token: TOKEN },
  alcance: { grupoId: 1, localId: 10 },
  parametros: { periodo: { tipo: "hoy" } },
});

test("el cuerpo que escribe JSON.stringify se lee", () => {
  assert.ok(leerPedido(CANONICO).pedido);
  assert.ok(leerPedido(new TextEncoder().encode(CANONICO)).pedido);
});

test("claves repetidas: se rechaza el cuerpo, aunque esté firmado", async () => {
  // JSON.parse se quedaría con el ÚLTIMO token; otro parser, con el primero.
  const repetido = CANONICO.replace(`"token":"${TOKEN}"`, `"token":"${TOKEN}","token":"${OTRO_TOKEN}"`);
  assert.notEqual(repetido, CANONICO);
  assert.equal(JSON.parse(repetido).delegacion.token, OTRO_TOKEN);
  assert.equal(leerPedido(repetido).error?.cuerpo.codigo, "PEDIDO_INVALIDO");
  // Y por la puerta entera, firmado como corresponde: no llega a la base.
  let consultas = 0;
  const cargador = { delegacion: async () => (consultas++, null), usuario: async () => (consultas++, null), grupoDeLocal: async () => (consultas++, null) };
  const bytes = new TextEncoder().encode(repetido);
  const r = await atenderSolicitud({ headers: cabeceras(bytes), cuerpo: bytes }, { cargador, ejecutores: {}, entorno: ENTORNO, ahora: AHORA });
  assert.deepEqual([r.status, r.cuerpo.codigo, consultas], [400, "PEDIDO_INVALIDO", 0]);
});

test("20. espacios, BOM, escapes innecesarios, UTF-8 inválido o JSON roto: se rechaza", () => {
  const casos = [
    JSON.stringify(JSON.parse(CANONICO), null, 2),
    "﻿" + CANONICO,
    CANONICO.replace('"hoy"', '"\\u0068oy"'),
    CANONICO.replace('"grupoId":1', '"grupoId":1.0'),
    CANONICO + " ",
    CANONICO.slice(0, -1),
    "{",
    "",
  ];
  for (const c of casos) assert.equal(leerPedido(c).error?.cuerpo.codigo, "PEDIDO_INVALIDO", JSON.stringify(c.slice(0, 40)));
  const invalido = Uint8Array.from([...new TextEncoder().encode(CANONICO.slice(0, -2)), 0xff, 0x7d, 0x7d]);
  assert.equal(leerPedido(invalido).error?.cuerpo.codigo, "PEDIDO_INVALIDO");
});

// ── El cupo ────────────────────────────────────────────────────────────────

test("el cupo por clave corta, y se repone al pasar la ventana", () => {
  const l = crearLimitador();
  for (let i = 0; i < MAX_POR_USUARIO; i++) assert.equal(l.consumir({ aplicacion: "azul-chat", clave: "del:a" }, AHORA).ok, true);
  const lleno = l.consumir({ aplicacion: "azul-chat", clave: "del:a" }, AHORA + 1000);
  assert.deepEqual(lleno, { ok: false, reintentarEnSegundos: 59 });
  assert.equal(l.consumir({ aplicacion: "azul-chat", clave: "del:b" }, AHORA).ok, true, "otra delegación tiene su cupo");
  assert.equal(l.consumir({ aplicacion: "azul-chat", clave: "del:a" }, AHORA + VENTANA_MS).ok, true);
});

test("el cupo por aplicación corta aunque se roten las claves", () => {
  const l = crearLimitador();
  for (let i = 0; i < MAX_POR_APLICACION; i++) assert.equal(l.consumir({ aplicacion: "azul-chat", clave: `del:${i}` }, AHORA).ok, true);
  assert.equal(l.consumir({ aplicacion: "azul-chat", clave: "del:99999" }, AHORA).ok, false);
});

test("un pedido rechazado por cupo no cuenta ni gasta: el siguiente sigue rechazado igual", () => {
  const l = crearLimitador({ maxPorUsuario: 1 });
  assert.equal(l.consumir({ aplicacion: "a", clave: "1" }, AHORA).ok, true);
  for (let i = 0; i < 5; i++) assert.equal(l.consumir({ aplicacion: "a", clave: "1" }, AHORA).ok, false);
  assert.equal(l.consumir({ aplicacion: "a", clave: "1" }, AHORA + VENTANA_MS).ok, true);
});

test("la consulta cuenta por DELEGACIÓN: la clave es el hash del token, no el token", async () => {
  const claves = [];
  const limitador = { consumir: ({ clave }) => (claves.push(clave), { ok: false, reintentarEnSegundos: 1 }) };
  const bytes = new TextEncoder().encode(CANONICO);
  await atenderSolicitud({ headers: cabeceras(bytes), cuerpo: bytes }, { cargador: {}, ejecutores: {}, limitador, entorno: ENTORNO, ahora: AHORA });
  assert.deepEqual(claves, [`del:${hashTokenDelegacion(TOKEN)}`]);
  assert.ok(!claves[0].includes(TOKEN.slice(5)), "el token no queda en la memoria del limitador");
});

test("el cupo se mira ANTES de la base: con el cupo lleno no se consulta nada", async () => {
  let consultas = 0;
  const cargador = { delegacion: async () => (consultas++, null), usuario: async () => (consultas++, null), grupoDeLocal: async () => (consultas++, null) };
  const limitador = { consumir: () => ({ ok: false, reintentarEnSegundos: 12 }) };
  const bytes = new TextEncoder().encode(CANONICO);
  const r = await atenderSolicitud({ headers: cabeceras(bytes), cuerpo: bytes }, { cargador, ejecutores: {}, limitador, entorno: ENTORNO, ahora: AHORA });
  assert.deepEqual([r.status, r.cuerpo.codigo, r.cuerpo.reintentarEnSegundos, consultas], [429, "LIMITE_EXCEDIDO", 12, 0]);
});

test("sin firma válida, el pedido no gasta cupo", async () => {
  let gastos = 0;
  const limitador = { consumir: () => (gastos++, { ok: true }) };
  const bytes = new TextEncoder().encode(CANONICO);
  const h = cabeceras(new TextEncoder().encode("{}"));
  const r = await atenderSolicitud({ headers: h, cuerpo: bytes }, { cargador: {}, ejecutores: {}, limitador, entorno: ENTORNO, ahora: AHORA });
  assert.deepEqual([r.status, gastos], [401, 0]);
});

// ── La respuesta pública ───────────────────────────────────────────────────

const interno = (status, codigo, error = "detalle interno") => ({ status, cuerpo: { ok: false, codigo, error } });

test("todo código interno de la puerta tiene su traducción pública, y nada se pasa tal cual por accidente", () => {
  const fuentes = [
    ...["atender.js", "autenticacionAplicacion.js", "autorizacion.js", "ventasResumen.js", "miAlcance.js"].map((f) => `lib/integraciones/azul-chat/${f}`),
    "lib/integraciones/vinculos/canje.js",
  ].map(leer).join("\n");
  // Los rechazos: `rechazo(403, "X", …)`, `rechazo("X", …)` y `codigo: "X", error`.
  // Las ADVERTENCIAS (`codigo: "DIA_EN_CURSO", mensaje`) van en una respuesta
  // exitosa y no son rechazos: por eso se exige `error` al lado.
  const emitidos = new Set(
    [...fuentes.matchAll(/(?:codigo:\s*"([A-Z_]+)",\s*error|rechazo\(\s*(?:\d+,\s*)?"([A-Z_]+)")/g)].map((m) => m[1] ?? m[2])
  );
  assert.ok(emitidos.size >= 20, `solo ${emitidos.size}: el patrón dejó de encontrar los códigos`);
  for (const c of emitidos) assert.ok(Object.prototype.hasOwnProperty.call(TRADUCCION, c), `${c} no tiene traducción pública`);
  for (const p of Object.values(TRADUCCION)) assert.ok(PUBLICOS[p], p);
});

test("token inexistente, vínculo revocado y usuario inexistente salen IGUALES desde afuera", () => {
  const sinDelegacion = aRespuestaPublica(interno(403, "DELEGACION_INEXISTENTE", "no presentó una delegación válida"));
  const inexistente = aRespuestaPublica(interno(403, "USUARIO_INEXISTENTE", "La persona delegante no existe en el ERP."));
  const revocado = aRespuestaPublica(interno(403, "VINCULO_REVOCADO", "fue revocado"));
  for (const r of [inexistente, revocado]) {
    assert.deepEqual([r.status, r.cuerpo, r.cabeceras], [sinDelegacion.status, sinDelegacion.cuerpo, sinDelegacion.cabeceras]);
  }
  assert.equal(sinDelegacion.cuerpo.codigo, "VINCULO_NO_VALIDO");
});

test("7. en el canje, código inexistente, vencido, usado, revocado o de una persona inactiva: IDÉNTICOS desde afuera", () => {
  const motivos = ["CANJE_CODIGO_INEXISTENTE", "CANJE_CODIGO_VENCIDO", "CANJE_CODIGO_USADO", "CANJE_VINCULO_REVOCADO", "CANJE_USUARIO_NO_HABILITADO"];
  const rs = motivos.map((c) => aRespuestaPublica(interno(403, c, `detalle de ${c}`)));
  for (const r of rs) assert.deepEqual([r.status, r.cuerpo, r.cabeceras], [rs[0].status, rs[0].cuerpo, rs[0].cabeceras]);
  assert.deepEqual([rs[0].status, rs[0].cuerpo.codigo], [403, "CODIGO_NO_VALIDO"]);
  assert.ok(!JSON.stringify(rs[0].cuerpo).match(/venci|usad|revoc|inactiv/i), "el texto público no dice el motivo");
});

test("las fallas de firma, marca y aplicación salen iguales: 401 sin detalle", () => {
  const rs = ["FIRMA_INVALIDA", "MARCA_VENCIDA", "MARCA_INVALIDA", "APLICACION_DESCONOCIDA"].map((c) => aRespuestaPublica(interno(401, c)));
  for (const r of rs) assert.deepEqual(r.cuerpo, rs[0].cuerpo);
  assert.deepEqual([rs[0].status, rs[0].cuerpo.codigo], [401, "SOLICITUD_NO_AUTENTICADA"]);
});

test("7-9. los tres motivos de integración apagada salen iguales: 503", () => {
  const rs = ["INTEGRACION_DESHABILITADA", "SECRETO_DEBIL", "SECRETO_COMPARTIDO"].map((c) => aRespuestaPublica(interno(503, c, "detalle de configuración")));
  for (const r of rs) assert.deepEqual([r.status, r.cuerpo], [503, { ok: false, codigo: "INTEGRACION_NO_DISPONIBLE", error: "La integración no está disponible." }]);
});

test("23. un error al calcular no deja salir el mensaje interno: sale una referencia", () => {
  const r = aRespuestaPublica(interno(500, "ERROR_AL_CALCULAR", "No se pudo calcular ventas_resumen: Invalid `prisma.venta.findMany()` invocation: SELECT \"Venta\"…"));
  assert.equal(r.status, 500);
  assert.match(r.cuerpo.referencia, /^[0-9a-f-]{36}$/);
  assert.equal(r.referencia, r.cuerpo.referencia);
  const texto = JSON.stringify(r.cuerpo);
  for (const fuga of ["prisma", "SELECT", "Venta", "invocation", "ventas_resumen"]) assert.ok(!texto.includes(fuga), fuga);
});

test("un código interno desconocido sale como 500: falla cerrado", () => {
  const r = aRespuestaPublica(interno(200, "ALGO_NUEVO"));
  assert.deepEqual([r.status, r.cuerpo.codigo], [500, "ERROR_AL_CALCULAR"]);
  assert.deepEqual(aRespuestaPublica(null).status, 500);
});

test("el período inválido conserva su explicación, que no revela nada del ERP", () => {
  const r = aRespuestaPublica(interno(400, "PERIODO_DEMASIADO_LARGO", "El rango no puede pasar de 31 días."));
  assert.deepEqual([r.status, r.cuerpo.codigo, r.cuerpo.error], [400, "PERIODO_DEMASIADO_LARGO", "El rango no puede pasar de 31 días."]);
});

test("el cupo agotado dice cuándo reintentar, también en Retry-After", () => {
  const r = aRespuestaPublica({ status: 429, cuerpo: { ok: false, codigo: "LIMITE_EXCEDIDO", error: "x", reintentarEnSegundos: 42 } });
  assert.deepEqual([r.status, r.cuerpo.reintentarEnSegundos, r.cabeceras["Retry-After"]], [429, 42, "42"]);
});

test("el éxito sale con ok y datos, nada más; toda respuesta sin caché y sin CORS", () => {
  const r = aRespuestaPublica({ status: 200, cuerpo: { ok: true, datos: { totalVendido: "1.00" }, extra: "no" } });
  assert.deepEqual(r.cuerpo, { ok: true, datos: { totalVendido: "1.00" } });
  for (const x of [r, rechazoPublico("SOLICITUD_INVALIDA"), rechazoPublico("LIMITE_EXCEDIDO", { reintentarEnSegundos: 3 })]) {
    assert.equal(x.cabeceras["Cache-Control"], "no-store");
    assert.ok(!Object.keys(x.cabeceras).some((k) => /^access-control-/i.test(k)));
  }
});

// ── La ruta, leída ─────────────────────────────────────────────────────────

test("la ruta solo exporta POST y no lee cookies, Authorization ni el cuerpo como texto", () => {
  const src = leer(RUTA);
  const metodos = [...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(metodos, ["POST"]);
  for (const prohibido of [/req\.json\(/, /req\.text\(/, /req\.formData\(/, /req\.cookies/, /cookies\(\)/, /["']cookie["']/i, /["']authorization["']/i, /getUsuarioSession/, /Access-Control/i, /set-cookie/i]) {
    assert.ok(!prohibido.test(src), `la ruta usa ${prohibido}`);
  }
  assert.match(src, /leerCuerpoAcotado\(req, MAX_BYTES_CUERPO\)/);
  assert.match(src, /atenderSolicitudAzulChat\(\{ headers: req\.headers, cuerpo: leido\.bytes \}\)/);
});

test("la ruta del canje tiene los mismos bordes: solo POST, sin cookies, bytes con tope, la puerta del canje", () => {
  const src = leer(RUTA_CANJE);
  const metodos = [...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(metodos, ["POST"]);
  for (const prohibido of [/req\.json\(/, /req\.text\(/, /req\.formData\(/, /req\.cookies/, /cookies\(\)/, /["']cookie["']/i, /["']authorization["']/i, /getUsuarioSession/, /Access-Control/i, /set-cookie/i, /AUTH_SECRET/, /jsonwebtoken/]) {
    assert.ok(!prohibido.test(src), `la ruta del canje usa ${prohibido}`);
  }
  assert.match(src, /esTipoJson\(/);
  assert.match(src, /leerCuerpoAcotado\(req, MAX_BYTES_CUERPO\)/);
  assert.match(src, /atenderCanje\(\{ headers: req\.headers, cuerpo: leido\.bytes \}/);
  assert.match(src, /aRespuestaPublica\(resultado\)/);
});

test("25. los registros de las rutas no llevan el cuerpo, la firma, el secreto, el código, el token ni un mensaje de Prisma", () => {
  for (const ruta of [RUTA, RUTA_CANJE]) {
    for (const linea of leer(ruta).split("\n").filter((l) => /console\./.test(l))) {
      assert.ok(!/bytes|leido|headers|firma|secreto|vinculo|cuerpo|codigo\b|token|hash/i.test(linea.replace(/publica\.cuerpo\.codigo/g, "")), `${ruta}: ${linea.trim()}`);
    }
  }
  // El canje no imprime `e.message`: un error de validación de Prisma
  // imprimiría los argumentos, y esos argumentos llevan el hash del token.
  const canje = leer(RUTA_CANJE);
  assert.ok(!/console\.\w+\([^)]*e\?\.message/.test(canje), "la ruta del canje imprime el mensaje del error");
});

test("el token de prueba usado arriba tiene la forma real", () => {
  const token = JSON.parse(CANONICO).delegacion.token;
  assert.match(token, /^del1_[A-Za-z0-9_-]{43}$/);
  assert.match(hashTokenDelegacion(token), /^[0-9a-f]{64}$/);
});
