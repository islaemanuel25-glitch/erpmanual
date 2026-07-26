import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerLocalIdDePedido, pedidoEnAlcance } from "./scope.js";

test("ownerLocalIdDePedido: usa creadoEnLocalId; cae a depositoId si falta", () => {
  assert.equal(ownerLocalIdDePedido({ creadoEnLocalId: 5, depositoId: 1 }), 5);
  assert.equal(ownerLocalIdDePedido({ creadoEnLocalId: null, depositoId: 1 }), 1); // legacy
  assert.equal(ownerLocalIdDePedido(null), null);
});

test("pedidoEnAlcance: mismo grupo + misma ubicación dueña → true", () => {
  const pedido = { grupoId: 10, creadoEnLocalId: 2, depositoId: 1 };
  assert.equal(pedidoEnAlcance(pedido, { grupoId: 10, localId: 2 }), true);
});

test("pedidoEnAlcance: mismo grupo, OTRA ubicación → false", () => {
  const pedido = { grupoId: 10, creadoEnLocalId: 2, depositoId: 1 };
  assert.equal(pedidoEnAlcance(pedido, { grupoId: 10, localId: 3 }), false);
  assert.equal(pedidoEnAlcance(pedido, { grupoId: 10, localId: 1 }), false); // ni el depósito
});

test("pedidoEnAlcance: OTRO grupo → false", () => {
  const pedido = { grupoId: 10, creadoEnLocalId: 2, depositoId: 1 };
  assert.equal(pedidoEnAlcance(pedido, { grupoId: 99, localId: 2 }), false);
});

test("pedidoEnAlcance: pedido legacy (creadoEnLocalId null) → dueño = depósito", () => {
  const pedido = { grupoId: 10, creadoEnLocalId: null, depositoId: 1 };
  assert.equal(pedidoEnAlcance(pedido, { grupoId: 10, localId: 1 }), true); // depósito
  assert.equal(pedidoEnAlcance(pedido, { grupoId: 10, localId: 2 }), false); // un local
});

test("pedidoEnAlcance: pedido nulo → false", () => {
  assert.equal(pedidoEnAlcance(null, { grupoId: 10, localId: 2 }), false);
});
