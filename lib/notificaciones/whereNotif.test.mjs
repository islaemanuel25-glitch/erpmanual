import { test } from "node:test";
import assert from "node:assert/strict";
import { whereNotifUsuario } from "./whereNotif.js";

// Mini-evaluador del subconjunto de semántica Prisma que usa whereNotifUsuario:
// eq escalar, { in: [...] }, null, AND (array), OR (array). Permite testear el
// AISLAMIENTO de forma conductual (¿esta notif es visible para este lector?).
function matchCond(notif, cond) {
  return Object.entries(cond).every(([k, v]) => {
    if (k === "AND") return v.every((c) => matchCond(notif, c));
    if (k === "OR") return v.some((c) => matchCond(notif, c));
    const actual = notif[k];
    if (v === null) return actual == null;
    if (v && typeof v === "object" && Array.isArray(v.in)) return v.in.includes(actual);
    return actual === v;
  });
}
const visible = (notif, scope) => matchCond(notif, whereNotifUsuario(scope));

// Grupo con depósito=1, localA=2, localB=3.
const G = 10;
const readerDepo = { grupoId: G, localId: 1, userId: 100, permisos: ["compras.ver"] };
const readerLocalA = { grupoId: G, localId: 2, userId: 200, permisos: [] };
const readerLocalB = { grupoId: G, localId: 3, userId: 300, permisos: [] };
const n = (over) => ({ grupoId: G, usuarioId: null, alcance: "GRUPO", localId: null, origenLocalId: null, destinoLocalId: null, permisoRequerido: null, ...over });

test("DEPOSITO: visible en el depósito, NO en un local", () => {
  const notif = n({ alcance: "DEPOSITO", localId: 1, permisoRequerido: "compras.ver" });
  assert.equal(visible(notif, readerDepo), true);
  assert.equal(visible(notif, readerLocalA), false);
  assert.equal(visible(notif, readerLocalB), false);
});

test("LOCAL: visible solo en ese local", () => {
  const notif = n({ alcance: "LOCAL", localId: 2 });
  assert.equal(visible(notif, readerLocalA), true);
  assert.equal(visible(notif, readerLocalB), false);
  assert.equal(visible(notif, readerDepo), false);
});

test("GRUPO: visible para cualquier ubicación del grupo", () => {
  const notif = n({ alcance: "GRUPO" });
  assert.equal(visible(notif, readerDepo), true);
  assert.equal(visible(notif, readerLocalA), true);
  assert.equal(visible(notif, readerLocalB), true);
});

test("USUARIO: visible solo para el destinatario", () => {
  const notif = n({ alcance: "USUARIO", usuarioId: 200 });
  assert.equal(visible(notif, readerLocalA), true); // userId 200
  assert.equal(visible(notif, readerLocalB), false); // userId 300
  assert.equal(visible(notif, readerDepo), false); // userId 100
});

test("PARTICIPANTES: visible para origen y destino, no para terceros", () => {
  const notif = n({ alcance: "PARTICIPANTES", origenLocalId: 2, destinoLocalId: 1 });
  assert.equal(visible(notif, readerLocalA), true); // origen
  assert.equal(visible(notif, readerDepo), true); // destino
  assert.equal(visible(notif, readerLocalB), false); // no participa
});

test("permisoRequerido: solo lo ve quien tiene el permiso (o *)", () => {
  const notif = n({ alcance: "GRUPO", permisoRequerido: "compras.ver" });
  assert.equal(visible(notif, readerDepo), true); // tiene compras.ver
  assert.equal(visible(notif, readerLocalA), false); // no lo tiene
  assert.equal(visible(notif, { grupoId: G, localId: 2, userId: 9, permisos: ["*"] }), true); // admin
});

test("otro grupo: nunca visible", () => {
  const notif = n({ grupoId: 999, alcance: "GRUPO" });
  assert.equal(visible(notif, readerDepo), false);
});

test("lector sin contexto (grupoId null) → no ve nada", () => {
  const notif = n({ alcance: "GRUPO" });
  assert.equal(visible(notif, { grupoId: null, localId: null, userId: 1, permisos: [] }), false);
});

test("compat legacy (grupoId, userId) sigue devolviendo un where usable", () => {
  const w = whereNotifUsuario(G, 200);
  assert.equal(w.grupoId, G);
  // Sin localId → solo GRUPO y USUARIO en el OR de alcance.
  const notifGrupo = n({ alcance: "GRUPO" });
  assert.equal(matchCond(notifGrupo, w), true);
  const notifLocal = n({ alcance: "LOCAL", localId: 2 });
  assert.equal(matchCond(notifLocal, w), false); // sin localId activo, no ve LOCAL
});
