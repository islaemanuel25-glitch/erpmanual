// Tests del resolver de lista por ubicación.
// Runner nativo: `node --test lib/precios/resolverListaCliente.test.mjs`
// Mock de Prisma en memoria + spy sobre listaPrecio.findFirst (default global nunca se consulta).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverListaCliente } from "./resolverListaCliente.js";

// ── Fixtures ──────────────────────────────────────────────────────────────
// Grupo 1: local 2 "mini el 7"; depósitos 1 "depo" (default 100), 5 (sin default),
//          6 (default 300 INACTIVA), 7 (default 200 de OTRO grupo).
// Grupo 2: local 3; depósito 4 (default 200).
const locales = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id })); // 999 no existe
const grupoDeposito = [
  { grupoId: 1, localId: 1, listaPrecioDefaultId: 100 },
  { grupoId: 1, localId: 5, listaPrecioDefaultId: null },
  { grupoId: 1, localId: 6, listaPrecioDefaultId: 300 },
  { grupoId: 1, localId: 7, listaPrecioDefaultId: 200 },
  { grupoId: 2, localId: 4, listaPrecioDefaultId: 200 },
];
const grupoLocal = [
  { id: 11, grupoId: 1, localId: 2 },
  { id: 12, grupoId: 2, localId: 3 },
];
const listas = [
  { id: 100, grupoId: 1, nombre: "Costo", tipoBase: "COSTO", margenPorcentaje: 0, esDefault: true, redondeo_100: false, activo: true },
  { id: 101, grupoId: 1, nombre: "ClienteLista", tipoBase: "PRECIO_VENTA", margenPorcentaje: null, esDefault: false, redondeo_100: false, activo: true },
  { id: 200, grupoId: 2, nombre: "OtroGrupo", tipoBase: "COSTO", margenPorcentaje: 10, esDefault: true, redondeo_100: false, activo: true },
  { id: 300, grupoId: 1, nombre: "Inactiva", tipoBase: "COSTO", margenPorcentaje: 5, esDefault: false, redondeo_100: false, activo: false },
];
const clientes = [
  { id: 1, grupoId: 1, listaPrecioId: 101 }, // lista válida grupo 1
  { id: 2, grupoId: 1, listaPrecioId: null }, // sin lista
  { id: 3, grupoId: 1, listaPrecioId: 300 }, // lista inactiva
  { id: 4, grupoId: 2, listaPrecioId: 200 }, // cliente de OTRO grupo
];

function pick(obj, sel) {
  const out = {};
  for (const k of Object.keys(sel)) if (sel[k] === true) out[k] = obj[k];
  return out;
}

function makePrisma() {
  const spy = { findFirstListaCalls: 0 };
  const prisma = {
    local: { findUnique: async ({ where: { id } }) => locales.find((l) => l.id === id) || null },
    grupoDeposito: {
      findFirst: async ({ where: { grupoId, localId }, select }) => {
        const r = grupoDeposito.find((x) => x.grupoId === grupoId && x.localId === localId);
        return r ? pick(r, select) : null;
      },
    },
    grupoLocal: {
      findFirst: async ({ where: { grupoId, localId } }) =>
        grupoLocal.find((x) => x.grupoId === grupoId && x.localId === localId) || null,
    },
    cliente: {
      findUnique: async ({ where: { id }, select }) => {
        const c = clientes.find((x) => x.id === id);
        if (!c) return null;
        const out = {};
        if (select.grupoId) out.grupoId = c.grupoId;
        if (select.listaPrecio) {
          const lp = c.listaPrecioId ? listas.find((l) => l.id === c.listaPrecioId) : null;
          out.listaPrecio = lp ? pick(lp, select.listaPrecio.select) : null;
        }
        return out;
      },
    },
    listaPrecio: {
      findUnique: async ({ where: { id }, select }) => {
        const l = listas.find((x) => x.id === id);
        return l ? pick(l, select) : null;
      },
      // SPY: la default global NO debe consultarse jamás.
      findFirst: async () => {
        spy.findFirstListaCalls += 1;
        return null;
      },
    },
  };
  return { prisma, spy };
}

const call = (args) => {
  const { prisma } = makePrisma();
  return resolverListaCliente({ prisma, ...args });
};

// ── A) Local sin cliente → null / PRECIO_LOCAL ────────────────────────────
test("A) local sin cliente: null, origen PRECIO_LOCAL", async () => {
  const r = await call({ grupoId: 1, localId: 2 });
  assert.equal(r.lista, null);
  assert.equal(r.origen, "PRECIO_LOCAL");
  assert.equal(r.ubicacion, "LOCAL");
});

// ── B) Local con cliente sin lista → null ─────────────────────────────────
test("B) local con cliente sin lista: null, PRECIO_LOCAL", async () => {
  const r = await call({ grupoId: 1, localId: 2, clienteId: 2 });
  assert.equal(r.lista, null);
  assert.equal(r.origen, "PRECIO_LOCAL");
});

// ── C) Local con cliente y lista válida → lista del cliente ───────────────
test("C) local con cliente y lista válida: lista 101, origen CLIENTE", async () => {
  const r = await call({ grupoId: 1, localId: 2, clienteId: 1 });
  assert.equal(r.lista?.id, 101);
  assert.equal(r.origen, "CLIENTE");
  assert.equal(r.ubicacion, "LOCAL");
});

// ── D) Depósito sin cliente → default del depósito ────────────────────────
test("D) depósito sin cliente: default 100, origen DEPOSITO_DEFAULT", async () => {
  const r = await call({ grupoId: 1, localId: 1 });
  assert.equal(r.lista?.id, 100);
  assert.equal(r.origen, "DEPOSITO_DEFAULT");
  assert.equal(r.ubicacion, "DEPOSITO");
});

// ── E) Depósito con cliente sin lista → default del depósito ──────────────
test("E) depósito con cliente sin lista: default 100", async () => {
  const r = await call({ grupoId: 1, localId: 1, clienteId: 2 });
  assert.equal(r.lista?.id, 100);
  assert.equal(r.origen, "DEPOSITO_DEFAULT");
});

// ── F) Depósito con cliente y lista válida → la del cliente gana ──────────
test("F) depósito con cliente y lista válida: cliente (101) gana sobre default", async () => {
  const r = await call({ grupoId: 1, localId: 1, clienteId: 1 });
  assert.equal(r.lista?.id, 101);
  assert.equal(r.origen, "CLIENTE");
});

// ── G) Depósito sin default → null ────────────────────────────────────────
test("G) depósito sin default: null, PRECIO_LOCAL", async () => {
  const r = await call({ grupoId: 1, localId: 5 });
  assert.equal(r.lista, null);
  assert.equal(r.origen, "PRECIO_LOCAL");
  assert.equal(r.ubicacion, "DEPOSITO");
});

// ── H) Lista del cliente inactiva → fallback por ubicación ────────────────
test("H) lista del cliente inactiva: local→null, depósito→default", async () => {
  const rLocal = await call({ grupoId: 1, localId: 2, clienteId: 3 });
  assert.equal(rLocal.lista, null);
  assert.equal(rLocal.origen, "PRECIO_LOCAL");
  const rDepo = await call({ grupoId: 1, localId: 1, clienteId: 3 });
  assert.equal(rDepo.lista?.id, 100);
  assert.equal(rDepo.origen, "DEPOSITO_DEFAULT");
});

// ── I) Default del depósito inactiva → null ───────────────────────────────
test("I) default del depósito inactiva (300): null", async () => {
  const r = await call({ grupoId: 1, localId: 6 });
  assert.equal(r.lista, null);
  assert.equal(r.origen, "PRECIO_LOCAL");
});

// ── J) Lista del cliente de otro grupo → no aplicar, fallback ─────────────
test("J) cliente de otro grupo: no aplica su lista; local→null, depósito→default", async () => {
  const rLocal = await call({ grupoId: 1, localId: 2, clienteId: 4 });
  assert.equal(rLocal.lista, null);
  assert.equal(rLocal.origen, "PRECIO_LOCAL");
  const rDepo = await call({ grupoId: 1, localId: 1, clienteId: 4 });
  assert.equal(rDepo.lista?.id, 100); // default del depósito, NO la lista del cliente ajeno
});

// ── K) Default del depósito de otro grupo → no aplicar ────────────────────
test("K) default del depósito apunta a lista de otro grupo (200): null", async () => {
  const r = await call({ grupoId: 1, localId: 7 });
  assert.equal(r.lista, null);
  assert.equal(r.origen, "PRECIO_LOCAL");
});

// ── L) Local inexistente → rechaza ────────────────────────────────────────
test("L) local inexistente: rechaza", async () => {
  await assert.rejects(() => call({ grupoId: 1, localId: 999 }), /el local 999 no existe/);
});

// ── M) Local de otro grupo → rechaza ──────────────────────────────────────
test("M) local de otro grupo: rechaza (local 3 es de grupo 2)", async () => {
  await assert.rejects(() => call({ grupoId: 1, localId: 3 }), /no pertenece al grupo 1/);
});

// ── N) Depósito identificado por GrupoDeposito (no por Local.es_deposito) ──
test("N) ubicación DEPOSITO se determina por GrupoDeposito (el mock Local no tiene es_deposito)", async () => {
  const r = await call({ grupoId: 1, localId: 1 });
  assert.equal(r.ubicacion, "DEPOSITO");
  assert.equal(Object.prototype.hasOwnProperty.call(locales[0], "es_deposito"), false);
});

// ── O) Local con lista esDefault existente → NO se aplica la default ──────
test("O) local no aplica la esDefault del grupo aunque exista (100 es esDefault)", async () => {
  const r = await call({ grupoId: 1, localId: 2 });
  assert.equal(r.lista, null); // NO devuelve la 100 pese a ser esDefault=true del grupo
});

// ── P) SPY: listaPrecio.findFirst nunca se llama ──────────────────────────
test("P) no se consulta la default global (listaPrecio.findFirst nunca se llama)", async () => {
  const { prisma, spy } = makePrisma();
  await resolverListaCliente({ prisma, grupoId: 1, localId: 1 }); // depósito
  await resolverListaCliente({ prisma, grupoId: 1, localId: 2 }); // local
  await resolverListaCliente({ prisma, grupoId: 1, localId: 1, clienteId: 1 }); // cliente
  assert.equal(spy.findFirstListaCalls, 0);
});

// ── Q) Caso real: grupo 1, local 2 "mini el 7", sin cliente → null ────────
test("Q) real: local 'mini el 7' sin cliente → null", async () => {
  const r = await call({ grupoId: 1, localId: 2 });
  assert.equal(r.lista, null);
});

// ── R) Caso real: grupo 1, depósito 1 "depo", sin cliente → #100 "Costo" ──
test("R) real: depósito 'depo' sin cliente → lista 'Costo'", async () => {
  const r = await call({ grupoId: 1, localId: 1 });
  assert.equal(r.lista?.id, 100);
  assert.equal(r.lista?.nombre, "Costo");
});

// ── Guarda: localId obligatorio ───────────────────────────────────────────
test("Guarda) sin localId: rechaza", async () => {
  await assert.rejects(() => call({ grupoId: 1, clienteId: 1 }), /localId es requerido/);
});

// ── Status HTTP en errores de CONTEXTO (para que el POS no los oculte) ─────
test("Status) errores de contexto llevan .status (400/403/404)", async () => {
  const grab = async (args) => {
    try { await call(args); return null; } catch (e) { return e.status; }
  };
  assert.equal(await grab({ grupoId: 1 }), 400); // falta localId
  assert.equal(await grab({ grupoId: 1, localId: 999 }), 404); // local inexistente
  assert.equal(await grab({ grupoId: 1, localId: 3 }), 403); // local de otro grupo
});
