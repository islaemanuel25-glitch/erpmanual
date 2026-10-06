// Candados del CANJE: el código humano se cambia una vez por un token de
// delegación.
//
// La base de mentira devuelve el vínculo con la forma EXACTA del `select` de
// canje.js, y simula lo único que hace la base de verdad en el insert: el índice
// único de `vinculoId` (P2002) y los RAISE del trigger. Que la base REAL haga
// eso —incluidos dos canjes concurrentes y un canje contra una revocación— lo
// ejerce `scripts/pruebas-db/azulChatVentasResumen.mjs` (secciones I y K).
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/vinculos/canje.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { atenderCanje, canjearCodigo, decidirCanje, CLAVE_DE_CUPO_CANJE, MAX_CANJES_POR_MINUTO, crearLimitadorCanje } from "./canje.js";
import {
  generarCodigoVinculo,
  hashCodigoVinculo,
  generarTokenDelegacion,
  hashTokenDelegacion,
  esTokenDelegacion,
  esCodigoVinculo,
  VIDA_CODIGO_CANJE_MS,
  BYTES_DE_CREDENCIAL,
  vencimientoDelCodigo,
} from "./codigoVinculo.js";
import { firmarSolicitud, CABECERAS } from "../azul-chat/autenticacionAplicacion.js";
import { aRespuestaPublica } from "../azul-chat/respuestaPublica.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRACION = "prisma/migrations/20261006150000_delegacion_integracion/migration.sql";

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const AUTORIZADO = new Date("2026-10-06T15:00:00.000Z");
const AHORA = AUTORIZADO.getTime() + 60 * 1000;
const MARCA = String(Math.floor(AHORA / 1000));

// ── Las credenciales ───────────────────────────────────────────────────────

test("1 y 11. código y token: 32 bytes al azar, sin repetirse, con prefijos que no se confunden", () => {
  assert.equal(BYTES_DE_CREDENCIAL, 32);
  for (const [generar, es, prefijo] of [[generarCodigoVinculo, esCodigoVinculo, "vin1_"], [generarTokenDelegacion, esTokenDelegacion, "del1_"]]) {
    const vistos = new Set(Array.from({ length: 500 }, generar));
    assert.equal(vistos.size, 500, prefijo);
    for (const v of vistos) {
      assert.ok(v.startsWith(prefijo) && es(v), v);
      // 43 caracteres base64url = 32 bytes: el prefijo no le quita entropía.
      assert.equal(Buffer.from(v.slice(prefijo.length), "base64url").length, 32, v);
    }
  }
  const codigo = generarCodigoVinculo();
  const token = generarTokenDelegacion();
  assert.equal(esTokenDelegacion(codigo), false, "un código no pasa por token");
  assert.equal(esCodigoVinculo(token), false, "un token no pasa por código");
});

test("2 y 12. lo que se guarda de cada uno es su SHA-256 en hex, nunca el valor", () => {
  const t = generarTokenDelegacion();
  assert.match(hashTokenDelegacion(t), /^[0-9a-f]{64}$/);
  assert.ok(!hashTokenDelegacion(t).includes(t.slice(5)));
  assert.equal(hashTokenDelegacion(t), hashTokenDelegacion(t), "determinista: se busca por índice");
});

test("3. el código vence a los 10 minutos, y la base usa el MISMO número", () => {
  assert.equal(VIDA_CODIGO_CANJE_MS, 10 * 60 * 1000);
  assert.equal(vencimientoDelCodigo(AUTORIZADO).toISOString(), "2026-10-06T15:10:00.000Z");
  const sql = fs.readFileSync(path.join(RAIZ, MIGRACION), "utf8");
  const m = sql.match(/"autorizadoEn" \+ interval '(\d+) minutes'/);
  assert.ok(m, "el trigger dejó de comparar contra autorizadoEn + interval");
  assert.equal(Number(m[1]) * 60 * 1000, VIDA_CODIGO_CANJE_MS, "el JS y el SQL dicen cosas distintas");
});

// ── La decisión ────────────────────────────────────────────────────────────

const vinculo = (extra = {}) => ({
  id: 3,
  usuarioId: 7,
  aplicacion: "AZUL_CHAT",
  autorizadoEn: AUTORIZADO,
  revocadoEn: null,
  delegacion: null,
  usuario: { id: 7, activo: true },
  ...extra,
});

test("decidirCanje: vigente, sin canjear, a tiempo y de una persona activa", () => {
  assert.deepEqual(decidirCanje(vinculo(), "AZUL_CHAT", AHORA), { ok: true });
  const limite = vencimientoDelCodigo(AUTORIZADO).getTime();
  assert.equal(decidirCanje(vinculo(), "AZUL_CHAT", limite).ok, true, "al minuto 10 justo todavía vale");
  const casos = [
    [null, AHORA, "CANJE_CODIGO_INEXISTENTE"],
    [vinculo({ aplicacion: "OTRA" }), AHORA, "CANJE_CODIGO_INEXISTENTE"],
    [vinculo({ revocadoEn: new Date(AHORA) }), AHORA, "CANJE_VINCULO_REVOCADO"],
    [vinculo({ delegacion: { id: 1 } }), AHORA, "CANJE_CODIGO_USADO"],
    [vinculo(), limite + 1, "CANJE_CODIGO_VENCIDO"],
    [vinculo({ usuario: { id: 7, activo: false } }), AHORA, "CANJE_USUARIO_NO_HABILITADO"],
    [vinculo({ usuario: null }), AHORA, "CANJE_USUARIO_NO_HABILITADO"],
  ];
  for (const [v, ahora, codigo] of casos) assert.equal(decidirCanje(v, "AZUL_CHAT", ahora).codigo, codigo, codigo);
  assert.equal(decidirCanje(vinculo(), undefined, AHORA).codigo, "CANJE_CODIGO_INEXISTENTE");
});

// ── El canje contra una base de mentira ────────────────────────────────────

function dbDeMentira({ fila = vinculo(), errorAlInsertar = null } = {}) {
  const escrito = [];
  const buscado = [];
  let filaActual = fila;
  const tx = {
    vinculoIntegracion: {
      findUnique: async (a) => (buscado.push(a), a.where.codigoHash === filaActual?.__hash ? filaActual : null),
    },
    delegacionIntegracion: {
      create: async (a) => {
        if (errorAlInsertar) throw errorAlInsertar;
        // El índice único de vinculoId: un segundo insert para el mismo vínculo choca.
        if (escrito.some(([, x]) => x.data.vinculoId === a.data.vinculoId)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        escrito.push(["create", a]);
        filaActual = { ...filaActual, delegacion: { id: 1 } };
        return { id: 1, canjeadoEn: new Date(AHORA) };
      },
    },
  };
  return { escrito, buscado, db: { ...tx, $transaction: (fn) => fn(tx) } };
}
const conCodigo = (codigo, extra) => ({ ...vinculo(extra), __hash: hashCodigoVinculo(codigo) });

test("4. un código válido se canjea: la base recibe solo el hash del token, y el token vuelve una vez", async () => {
  const codigo = generarCodigoVinculo();
  const { db, escrito, buscado } = dbDeMentira({ fila: conCodigo(codigo) });
  const r = await canjearCodigo(db, { codigo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.datos).sort(), ["autorizadoEn", "canjeadoEn", "tokenDelegacion", "usuarioId", "vinculoId"]);
  assert.equal(r.datos.usuarioId, 7, "la identidad sale del VÍNCULO");
  assert.ok(esTokenDelegacion(r.datos.tokenDelegacion));
  assert.deepEqual(buscado[0].where, { codigoHash: hashCodigoVinculo(codigo) }, "se busca por el hash del código");
  assert.equal(escrito.length, 1);
  assert.deepEqual(escrito[0][1].data, { vinculoId: 3, tokenHash: hashTokenDelegacion(r.datos.tokenDelegacion) });
  const todo = JSON.stringify({ escrito, buscado });
  assert.ok(!todo.includes(r.datos.tokenDelegacion) && !todo.includes(codigo), "ni el token ni el código viajan a la base");
  assert.ok(!JSON.stringify(r.datos).match(/permisos|rol|localId|grupoId/), "no devuelve rol, permisos ni alcance");
});

test("5. el segundo canje del mismo código falla, y no hay segundo token", async () => {
  const codigo = generarCodigoVinculo();
  const { db, escrito } = dbDeMentira({ fila: conCodigo(codigo) });
  const a = await canjearCodigo(db, { codigo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA });
  const b = await canjearCodigo(db, { codigo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA });
  assert.deepEqual([a.ok, b.ok, b.codigo, escrito.length], [true, false, "CANJE_CODIGO_USADO", 1]);
});

test("6. si la base rechaza por el índice único (dos canjes a la vez), sale como código usado", async () => {
  const codigo = generarCodigoVinculo();
  const p2002 = Object.assign(new Error("Unique constraint failed on the fields: (`vinculoId`)"), { code: "P2002" });
  const { db } = dbDeMentira({ fila: conCodigo(codigo), errorAlInsertar: p2002 });
  const r = await canjearCodigo(db, { codigo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA });
  assert.equal(r.codigo, "CANJE_CODIGO_USADO");
});

test("si la base rechaza por el trigger (vencido o revocado mientras tanto), se explica; otro error sube", async () => {
  const codigo = generarCodigoVinculo();
  for (const [mensaje, codigoEsperado] of [
    ["db error: ERROR: El código de canje venció (vínculo 3)", "CANJE_CODIGO_VENCIDO"],
    ["db error: ERROR: No se canjea el código de un vínculo revocado (vínculo 3)", "CANJE_VINCULO_REVOCADO"],
  ]) {
    const { db } = dbDeMentira({ fila: conCodigo(codigo), errorAlInsertar: new Error(mensaje) });
    assert.equal((await canjearCodigo(db, { codigo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA })).codigo, codigoEsperado);
  }
  const { db } = dbDeMentira({ fila: conCodigo(codigo), errorAlInsertar: new Error("la base se cayó") });
  await assert.rejects(canjearCodigo(db, { codigo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA }), /la base se cayó/);
  // Los textos que se reconocen son los del trigger real.
  const sql = fs.readFileSync(path.join(RAIZ, MIGRACION), "utf8");
  assert.ok(sql.includes("El código de canje venció") && sql.includes("No se canjea el código de un vínculo revocado"));
});

test("un código con otra forma —incluido un token— no se busca", async () => {
  for (const malo of [undefined, null, "", 123, "vin1_corto", generarTokenDelegacion(), hashCodigoVinculo("x")]) {
    const { db, buscado } = dbDeMentira();
    const r = await canjearCodigo(db, { codigo: malo, aplicacionVinculo: "AZUL_CHAT" }, { ahora: AHORA });
    assert.equal(r.codigo, "CANJE_CODIGO_INEXISTENTE", String(malo));
    assert.equal(buscado.length, 0, String(malo));
  }
});

// ── La puerta del canje ────────────────────────────────────────────────────

function armar({ cuerpo, firmar = true, extra = {}, db, limitador = null, secreto = SECRETO }) {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const headers = new Headers({ [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: MARCA, ...extra });
  if (firmar) headers.set(CABECERAS.firma, firmarSolicitud({ secreto, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }));
  return () => atenderCanje({ headers, cuerpo: new TextEncoder().encode(texto) }, { db, limitador, entorno: ENTORNO, ahora: AHORA });
}

test("canje válido por la puerta entera: 200 con { ok, datos }", async () => {
  const codigo = generarCodigoVinculo();
  const { db } = dbDeMentira({ fila: conCodigo(codigo) });
  const r = await armar({ cuerpo: { codigo }, db })();
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.ok, true);
  assert.equal(r.cuerpo.datos.usuarioId, 7);
});

test("replay: la MISMA solicitud firmada, repetida dentro de la ventana, no produce un segundo token", async () => {
  const codigo = generarCodigoVinculo();
  const { db, escrito } = dbDeMentira({ fila: conCodigo(codigo) });
  const misma = armar({ cuerpo: { codigo }, db });
  const a = await misma();
  const b = await misma();
  assert.deepEqual([a.status, b.status, b.cuerpo.codigo, escrito.length], [200, 403, "CANJE_CODIGO_USADO", 1]);
  assert.equal(aRespuestaPublica(b).cuerpo.codigo, "CODIGO_NO_VALIDO");
});

test("8. sin firma válida no se canjea, y no se toca la base", async () => {
  const codigo = generarCodigoVinculo();
  for (const opciones of [{ firmar: false }, { secreto: "otro-secreto-cualquiera-0123456789abcdefgh" }]) {
    const { db, buscado } = dbDeMentira({ fila: conCodigo(codigo) });
    const r = await armar({ cuerpo: { codigo }, db, ...opciones })();
    assert.deepEqual([r.status, r.cuerpo.codigo, buscado.length], [401, "FIRMA_INVALIDA", 0]);
    assert.equal(aRespuestaPublica(r).cuerpo.codigo, "SOLICITUD_NO_AUTENTICADA");
  }
});

test("9. una cookie o un JWT del ERP no reemplazan la firma", async () => {
  const codigo = generarCodigoVinculo();
  const { db, buscado } = dbDeMentira({ fila: conCodigo(codigo) });
  const r = await armar({
    cuerpo: { codigo },
    db,
    firmar: false,
    extra: { cookie: "erpazul_sesion=eyJhbGciOi.admin.jwt", authorization: "Bearer eyJhbGciOi.admin.jwt", [CABECERAS.firma]: "eyJhbGciOi.admin.jwt" },
  })();
  assert.deepEqual([r.status, buscado.length], [401, 0]);
});

test("10. el canje no acepta usuarioId ni ninguna otra clave: el código identifica la autorización", async () => {
  const codigo = generarCodigoVinculo();
  for (const cuerpo of [{ codigo, usuarioId: 7 }, { codigo, usuarioId: 9 }, { usuarioId: 7 }, {}, { codigo, aplicacion: "AZUL_CHAT" }]) {
    const { db, buscado } = dbDeMentira({ fila: conCodigo(codigo) });
    const r = await armar({ cuerpo, db })();
    assert.deepEqual([r.status, r.cuerpo.codigo, buscado.length], [400, "PEDIDO_INVALIDO", 0], JSON.stringify(cuerpo));
  }
  // Y JSON no canónico, aunque esté firmado.
  const { db } = dbDeMentira({ fila: conCodigo(codigo) });
  assert.equal((await armar({ cuerpo: `{ "codigo": "${codigo}" }`, db })()).status, 400);
});

test("15. el canje tiene cupo, y se mira ANTES de la base", async () => {
  assert.equal(MAX_CANJES_POR_MINUTO, 20);
  const claves = [];
  const limitador = { consumir: (a) => (claves.push(a), { ok: false, reintentarEnSegundos: 30 }) };
  const codigo = generarCodigoVinculo();
  const { db, buscado } = dbDeMentira({ fila: conCodigo(codigo) });
  const r = await armar({ cuerpo: { codigo }, db, limitador })();
  assert.deepEqual([r.status, r.cuerpo.codigo, r.cuerpo.reintentarEnSegundos, buscado.length], [429, "LIMITE_EXCEDIDO", 30, 0]);
  assert.deepEqual(claves, [{ aplicacion: "azul-chat", clave: CLAVE_DE_CUPO_CANJE }], "la clave no lleva el código");
  // El limitador real del canje: veinte por minuto y por aplicación.
  const real = crearLimitadorCanje();
  for (let i = 0; i < MAX_CANJES_POR_MINUTO; i++) assert.equal(real.consumir({ aplicacion: "azul-chat", clave: CLAVE_DE_CUPO_CANJE }, AHORA).ok, true);
  assert.equal(real.consumir({ aplicacion: "azul-chat", clave: CLAVE_DE_CUPO_CANJE }, AHORA).ok, false);
});

test("7. por la puerta, inexistente, vencido, usado, revocado y persona inactiva salen IDÉNTICOS", async () => {
  const salidas = [];
  for (const extra of [null, { autorizadoEn: new Date(AHORA - VIDA_CODIGO_CANJE_MS - 1) }, { delegacion: { id: 1 } }, { revocadoEn: new Date(AHORA) }, { usuario: { id: 7, activo: false } }]) {
    const codigo = generarCodigoVinculo();
    const { db } = dbDeMentira({ fila: extra === null ? null : conCodigo(codigo, extra) });
    const r = aRespuestaPublica(await armar({ cuerpo: { codigo }, db })());
    salidas.push(JSON.stringify([r.status, r.cuerpo, r.cabeceras]));
  }
  assert.equal(new Set(salidas).size, 1, salidas.join("\n"));
  assert.match(salidas[0], /CODIGO_NO_VALIDO/);
});
