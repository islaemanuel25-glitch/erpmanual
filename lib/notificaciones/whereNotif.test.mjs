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
//
// ── POR QUÉ LOS LECTORES TIENEN UN PERMISO Y LA FIXTURE LO PIDE ──────────────
//
// Los cinco candados de ALCANCE se pusieron en rojo al cambiar la regla de
// `permisoRequerido` en NULL, y el rojo era justo: sus lectores no tenían ningún
// permiso y sus notificaciones no pedían ninguno, así que bajo la regla nueva no
// veían nada — por el permiso, no por el alcance.
//
// No se aflojó la regla: se le dio a la fixture un permiso que los tres lectores
// tienen (`pos.usar`), para que estos candados midan EL ALCANCE Y NADA MÁS, que
// es lo que fueron escritos para medir. El permiso tiene su propio bloque abajo,
// con `compras.ver`, que solo tiene el lector del depósito.
//
// De paso quedó mejor que antes: el candado de DEPOSITO pedía `compras.ver`, así
// que los lectores de local quedaban afuera por DOS motivos a la vez y no se
// podía saber cuál lo estaba haciendo pasar.
const G = 10;
const readerDepo = { grupoId: G, localId: 1, userId: 100, permisos: ["compras.ver", "pos.usar"] };
const readerLocalA = { grupoId: G, localId: 2, userId: 200, permisos: ["pos.usar"] };
const readerLocalB = { grupoId: G, localId: 3, userId: 300, permisos: ["pos.usar"] };
const n = (over) => ({ grupoId: G, usuarioId: null, alcance: "GRUPO", localId: null, origenLocalId: null, destinoLocalId: null, permisoRequerido: "pos.usar", ...over });

test("DEPOSITO: visible en el depósito, NO en un local", () => {
  const notif = n({ alcance: "DEPOSITO", localId: 1 });
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

// ── permisoRequerido en NULL = SOLO ADMIN ────────────────────────────────────
//
// Antes una fila sin permiso la veía cualquiera con el alcance correcto, y en
// producción hay 122 así —de antes del 2026-07-26, cuando se empezó a escribir el
// permiso—, con nombre de proveedor y número de pedido adentro.
//
// Se cerró acá y no con una migración de datos porque así también quedan tapadas
// las filas FUTURAS que nazcan sin permiso, y porque se revierte volviendo la
// imagen atrás, sin tocar un dato de producción.
test("permisoRequerido en NULL: solo el admin, por más alcance que tenga", () => {
  const notif = n({ alcance: "GRUPO", permisoRequerido: null });
  assert.equal(visible(notif, readerDepo), false);
  assert.equal(visible(notif, readerLocalA), false);
  assert.equal(visible(notif, readerLocalB), false);
  assert.equal(visible(notif, { grupoId: G, localId: 2, userId: 9, permisos: ["*"] }), true);
});

test("permisoRequerido en NULL: tampoco por alcance de USUARIO", () => {
  // El caso más tentador: la notificación es PARA ese usuario. Igual no la ve,
  // porque no pide ningún permiso. Hoy no existe ninguna así —hay un solo lugar
  // en el repo que crea notificaciones y siempre pone `compras.ver`—, y si algún
  // día se agrega una personal tiene que nacer con permiso.
  const notif = n({ alcance: "USUARIO", usuarioId: 200, permisoRequerido: null });
  assert.equal(visible(notif, readerLocalA), false);
  assert.equal(visible(notif, { grupoId: G, localId: 2, userId: 200, permisos: ["*"] }), true);
});

test("un lector SIN NINGÚN permiso no ve nada, tenga el alcance que tenga", () => {
  const pelado = { grupoId: G, localId: 2, userId: 200, permisos: [] };
  for (const alcance of ["GRUPO", "LOCAL", "USUARIO", "DEPOSITO", "PARTICIPANTES"]) {
    const notif = n({ alcance, localId: 2, usuarioId: 200, origenLocalId: 2, destinoLocalId: 2 });
    assert.equal(visible(notif, pelado), false, `alcance ${alcance} no debería verse`);
  }
});

test("otro grupo: nunca visible", () => {
  const notif = n({ grupoId: 999, alcance: "GRUPO" });
  assert.equal(visible(notif, readerDepo), false);
});

test("lector sin contexto (grupoId null) → no ve nada", () => {
  const notif = n({ alcance: "GRUPO" });
  assert.equal(visible(notif, { grupoId: null, localId: null, userId: 1, permisos: [] }), false);
});

// LA FIRMA LEGACY AHORA FALLA CERRADA, y el candado lo dice en vez de esconderlo.
//
// Afirmaba que `whereNotifUsuario(grupoId, userId)` "sigue devolviendo un where
// usable", y con la regla nueva ese llamador —que no pasa permisos— no ve nada.
// El candado se puso en rojo con razón.
//
// No se aflojó la regla para que pasara: se comprobó quién usa esa firma. Con
// `git grep` sobre todo el repo, los CINCO llamadores reales pasan el objeto
// `scope`; la firma de dos argumentos no la usa nadie. Así que lo correcto para
// un predicado de seguridad es exactamente esto —sin permisos, nada— y es lo que
// el candado afirma ahora.
test("compat legacy (grupoId, userId): falla cerrada, no ve nada", () => {
  const w = whereNotifUsuario(G, 200);
  assert.equal(w.grupoId, G, "el grupo se sigue respetando");

  // Sin permisos no ve ni siquiera lo de alcance GRUPO.
  assert.equal(matchCond(n({ alcance: "GRUPO" }), w), false);
  assert.equal(matchCond(n({ alcance: "LOCAL", localId: 2 }), w), false);
});
