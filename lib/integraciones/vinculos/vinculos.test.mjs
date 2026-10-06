// Candados del vínculo persona ↔ aplicación, del lado del ERP: el código, quién
// puede revocar y qué se guarda. La misma lógica contra PostgreSQL y por las
// rutas reales la ejerce `scripts/pruebas-db/azulChatVentasResumen.mjs`.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/vinculos/vinculos.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generarCodigoVinculo, esCodigoVinculo, hashCodigoVinculo, APLICACION_INTEGRACION } from "./codigoVinculo.js";
import { decidirRevocacion, autorizarVinculo, revocarVinculo } from "./vinculos.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

// ── El código ──────────────────────────────────────────────────────────────

test("el código tiene su forma, no se repite y su hash es SHA-256 en hex", () => {
  const codigos = new Set(Array.from({ length: 200 }, generarCodigoVinculo));
  assert.equal(codigos.size, 200);
  for (const c of codigos) {
    assert.ok(esCodigoVinculo(c), c);
    const h = hashCodigoVinculo(c);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.notEqual(h, c);
    assert.ok(!h.includes(c.slice(5)), "el hash no contiene el código");
  }
  assert.equal(hashCodigoVinculo("vin1_x"), hashCodigoVinculo("vin1_x"), "determinista: se busca por índice");
});

test("lo que no tiene la forma no es un código", () => {
  for (const v of [null, undefined, "", 1, "vin1_", "VIN1_" + "a".repeat(43), "vin1_" + "a".repeat(42), "vin1_" + "a".repeat(44), "vin1_" + "+".repeat(43)]) {
    assert.equal(esCodigoVinculo(v), false, String(v));
  }
});

test("el enum de la aplicación es el de la migración", () => {
  assert.deepEqual(Object.keys(APLICACION_INTEGRACION), ["AZUL_CHAT"]);
  const sql = fs.readFileSync(path.join(RAIZ, "prisma/migrations/20261006120000_vinculo_integracion/migration.sql"), "utf8");
  assert.match(sql, /CREATE TYPE "AplicacionIntegracion" AS ENUM \('AZUL_CHAT'\);/);
});

// ── Quién puede revocar ────────────────────────────────────────────────────

const sesion = (extra = {}) => ({ id: 7, localId: 10, permisos: [], esAdmin: false, ...extra });

test("cada persona puede revocar su propio vínculo, sin ningún permiso", () => {
  assert.deepEqual(decidirRevocacion(sesion(), { id: 7, localId: 10 }), { ok: true, propio: true });
  // El id del JWT puede venir como texto.
  assert.equal(decidirRevocacion(sesion({ id: "7" }), { id: 7, localId: 10 }).ok, true);
});

test("sin permiso de gestión de usuarios, no se revoca el de otro", () => {
  const r = decidirRevocacion(sesion({ permisos: ["reportes.ver", "usuarios.ver"] }), { id: 8, localId: 10 });
  assert.deepEqual([r.ok, r.codigo], [false, "SIN_PERMISO"]);
});

test("quien gestiona usuarios del local revoca a los de su local, no a los de otro", () => {
  const gestor = sesion({ permisos: ["usuarios.gestionar_local"] });
  assert.equal(decidirRevocacion(gestor, { id: 8, localId: 10 }).ok, true);
  assert.equal(decidirRevocacion(gestor, { id: 9, localId: 11 }).codigo, "FUERA_DE_ALCANCE");
  assert.equal(decidirRevocacion(gestor, { id: 9, localId: null }).codigo, "FUERA_DE_ALCANCE");
});

test("el admin revoca a cualquiera, como puede darlo de baja", () => {
  assert.equal(decidirRevocacion(sesion({ esAdmin: true, permisos: ["*"], localId: null }), { id: 9, localId: 11 }).ok, true);
});

test("sin sesión, o sobre un usuario que no existe, no se revoca", () => {
  assert.equal(decidirRevocacion(null, { id: 7 }).status, 401);
  assert.equal(decidirRevocacion(sesion(), null).status, 404);
});

test("la regla de revocar es la de dar de baja: la misma pieza que /api/usuarios/eliminar", () => {
  const vinculos = leer("lib/integraciones/vinculos/vinculos.js");
  const eliminar = leer("app/api/usuarios/eliminar/[id]/route.js");
  for (const pieza of ["autorizarGestionUsuarios", "dentroDeAlcance"]) {
    assert.ok(vinculos.includes(pieza), `vinculos.js no usa ${pieza}`);
    assert.ok(eliminar.includes(pieza), `eliminar ya no usa ${pieza}: la equivalencia dejó de ser cierta`);
  }
});

// ── Lo que se escribe ──────────────────────────────────────────────────────

function dbFalsa({ usuario = { id: 7, activo: true, localId: 10 } } = {}) {
  const escrito = [];
  const tx = {
    usuario: { findUnique: async () => usuario },
    vinculoIntegracion: {
      updateMany: async (args) => (escrito.push(["updateMany", args]), { count: 1 }),
      create: async (args) => (escrito.push(["create", args]), { id: 1, autorizadoEn: args.data.autorizadoEn }),
    },
  };
  return { escrito, db: { ...tx, $transaction: (fn) => fn(tx) } };
}

test("autorizar guarda el hash, nunca el código, y revoca el anterior en la misma transacción", async () => {
  const { db, escrito } = dbFalsa();
  const r = await autorizarVinculo(db, { usuarioId: 7, aplicacion: "AZUL_CHAT" });
  assert.equal(r.ok, true);
  assert.ok(esCodigoVinculo(r.codigo));
  assert.deepEqual(escrito.map(([op]) => op), ["updateMany", "create"]);
  const [, revocar] = escrito[0];
  assert.deepEqual(revocar.where, { usuarioId: 7, aplicacion: "AZUL_CHAT", revocadoEn: null });
  assert.equal(revocar.data.revocadoPorId, 7);
  const [, crear] = escrito[1];
  assert.deepEqual(Object.keys(crear.data).sort(), ["aplicacion", "autorizadoEn", "codigoHash", "usuarioId"]);
  assert.equal(crear.data.codigoHash, hashCodigoVinculo(r.codigo));
  assert.ok(!JSON.stringify(escrito).includes(r.codigo), "el código no viaja a la base");
  assert.equal(revocar.data.revocadoEn, crear.data.autorizadoEn, "las dos fechas, del mismo reloj");
});

test("un usuario inactivo o inexistente no se vincula, y no se escribe nada", async () => {
  for (const [usuario, codigo] of [[{ id: 7, activo: false }, "USUARIO_INACTIVO"], [null, "USUARIO_INEXISTENTE"]]) {
    const { db, escrito } = dbFalsa({ usuario });
    const r = await autorizarVinculo(db, { usuarioId: 7, aplicacion: "AZUL_CHAT" });
    assert.equal(r.codigo, codigo);
    assert.deepEqual(escrito, []);
  }
});

test("una aplicación que no está en el enum no se vincula", async () => {
  const { db } = dbFalsa();
  assert.equal((await autorizarVinculo(db, { usuarioId: 7, aplicacion: "constructor" })).codigo, "APLICACION_DESCONOCIDA");
  assert.equal((await revocarVinculo(db, { session: sesion(), usuarioId: 7, aplicacion: "OTRA" })).codigo, "APLICACION_DESCONOCIDA");
});

test("revocar marca solo el vigente, con quién revocó", async () => {
  const { db, escrito } = dbFalsa();
  const r = await revocarVinculo(db, { session: sesion(), usuarioId: 7, aplicacion: "AZUL_CHAT" });
  assert.deepEqual(r, { ok: true, revocado: true });
  const [op, args] = escrito[0];
  assert.equal(op, "updateMany");
  assert.deepEqual(args.where, { usuarioId: 7, aplicacion: "AZUL_CHAT", revocadoEn: null });
  assert.equal(args.data.revocadoPorId, 7);
});

// ── Las rutas del ERP ──────────────────────────────────────────────────────

test("autorizar toma el usuario de la SESIÓN y no lee el cuerpo: nadie autoriza por otro", () => {
  const src = leer("app/api/integraciones/azul-chat/vinculo/autorizar/route.js");
  assert.match(src, /usuarioId: Number\(session\.id\)/);
  assert.ok(!/req\.(json|text|formData)\(/.test(src), "la ruta de autorizar lee el cuerpo");
  assert.ok(!/searchParams/.test(src), "la ruta de autorizar lee la URL");
  assert.match(src, /"Cache-Control": "no-store"/);
});

test("ningún archivo del vínculo registra el código", () => {
  for (const f of [
    "lib/integraciones/vinculos/vinculos.js",
    "lib/integraciones/vinculos/codigoVinculo.js",
    "app/api/integraciones/azul-chat/vinculo/autorizar/route.js",
    "app/api/integraciones/azul-chat/vinculo/revocar/route.js",
  ]) {
    for (const linea of leer(f).split("\n").filter((l) => /console\./.test(l))) {
      assert.ok(!/codigo|r\.codigo|codigoVinculo/i.test(linea), `${f}: ${linea.trim()}`);
    }
  }
});
