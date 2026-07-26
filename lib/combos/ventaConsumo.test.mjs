// Tests de la integración de combos en la venta (carga+validación de composición,
// construcción de líneas y descuento consolidado) con un mock de `tx`.
// Runner: `node --test lib/combos/ventaConsumo.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construirLineasComerciales,
  aplicarConsumoStock,
} from "./ventaConsumo.js";

const clone = (x) => JSON.parse(JSON.stringify(x));

function baseSeed() {
  return {
    bases: [
      { id: 101, activo: true, es_combo: false, precio_costo: 100, factor_pack: 1, nombre: "Coca" },
      { id: 102, activo: true, es_combo: false, precio_costo: 800, factor_pack: 1, nombre: "Fernet" },
      { id: 103, activo: true, es_combo: true, precio_costo: 0, factor_pack: 1, nombre: "OtroCombo" },
      { id: 200, activo: true, es_combo: true, precio_costo: 1000, factor_pack: 1, nombre: "Combo" },
    ],
    pls: [
      { id: 2000, localId: 2, baseId: 200, activo: true, precio_costo: 1000 },
      { id: 1001, localId: 2, baseId: 101, activo: true, precio_costo: null },
      { id: 1002, localId: 2, baseId: 102, activo: true, precio_costo: null },
      { id: 1003, localId: 2, baseId: 103, activo: true, precio_costo: null }, // combo como componente (inválido)
    ],
    comboComp: [
      { id: 1, comboProductoLocalId: 2000, componenteProductoLocalId: 1001, cantidad: 2 },
      { id: 2, comboProductoLocalId: 2000, componenteProductoLocalId: 1002, cantidad: 1 },
    ],
    stock: { 1001: 10, 1002: 3 }, // productoLocalId → cantidad
  };
}

function makeTx(seed) {
  const store = clone(seed);
  const baseById = (id) => store.bases.find((b) => b.id === id) || null;
  const attach = (pl, include) => {
    if (!pl) return null;
    const out = { ...pl };
    if (include?.base) out.base = baseById(pl.baseId) ? { ...baseById(pl.baseId) } : null;
    if (include?.stock) {
      const c = store.stock[pl.id];
      out.stock = c === undefined ? [] : [{ cantidad: c }];
    }
    return out;
  };
  const lockOrder = [];
  const decrements = [];
  return {
    comboComponente: {
      findMany: async ({ where: { comboProductoLocalId } }) =>
        store.comboComp
          .filter((c) => c.comboProductoLocalId === comboProductoLocalId)
          .sort((a, b) => a.id - b.id)
          .map((c) => ({ ...c })),
    },
    productoLocal: {
      findFirst: async ({ where: { localId, baseId }, select }) => {
        const pl = store.pls.find((p) => p.localId === localId && p.baseId === baseId);
        if (!pl) return null;
        if (!select) return { ...pl };
        const out = {};
        if (select.id) out.id = pl.id;
        if (select.activo) out.activo = pl.activo;
        if (select.base?.select?.nombre) out.base = { nombre: baseById(pl.baseId)?.nombre ?? null };
        return out;
      },
      findMany: async ({ where: { id: { in: ids } }, include }) =>
        store.pls.filter((p) => ids.includes(p.id)).map((p) => attach(p, include)),
    },
    $queryRaw: async (_strings, ...values) => {
      const productoId = values[1];
      lockOrder.push(productoId);
      const c = store.stock[productoId];
      return c === undefined ? [] : [{ cantidad: c }];
    },
    stockLocal: {
      updateMany: async ({ where: { productoId }, data }) => {
        const dec = data.cantidad.decrement;
        decrements.push({ productoId, decrement: dec });
        store.stock[productoId] = (store.stock[productoId] || 0) - dec;
        return { count: 1 };
      },
    },
    __store: store,
    __lockOrder: lockOrder,
    __decrements: decrements,
  };
}

const ctxBase = {
  productosBaseMap: { 101: { es_combo: false }, 102: { es_combo: false }, 200: { es_combo: true }, 103: { es_combo: true } },
  costosMap: { 101: { costoBulto: 100, factorPack: 1 }, 102: { costoBulto: 800, factorPack: 1 } },
  baseStockMap: { 101: { factorPack: 1 }, 102: { factorPack: 1 } },
  localId: 2,
  esDeposito: false,
};

// ── 3) Vender 1 combo → componentes correctos + costo del combo ───────────
test("3/10) construir: combo expande componentes y calcula costo", async () => {
  const tx = makeTx(baseSeed());
  const { lineasComerciales, consumoFisicoConsolidado } = await construirLineasComerciales(tx, {
    ...ctxBase,
    items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }],
  });
  assert.equal(lineasComerciales[0].tipo, "COMBO");
  assert.equal(lineasComerciales[0].costoUnitario, 1000); // 100×2 + 800×1
  assert.equal(consumoFisicoConsolidado.find((c) => c.productoLocalId === 1001).cantidad, 2);
  assert.equal(consumoFisicoConsolidado.find((c) => c.productoLocalId === 1002).cantidad, 1);
});

// ── 5) Producto directo + combo con el mismo componente consolidan ────────
test("5) normal (Coca) + combo (con Coca) consolidan sobre pl 1001", async () => {
  const tx = makeTx(baseSeed());
  const { consumoFisicoConsolidado } = await construirLineasComerciales(tx, {
    ...ctxBase,
    items: [
      { productoBaseId: 101, precio: 150, cantidad: 3, nombre: "Coca", precioCosto: 100 },
      { productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" },
    ],
  });
  assert.equal(consumoFisicoConsolidado.filter((c) => c.productoLocalId === 1001).length, 1);
  assert.equal(consumoFisicoConsolidado.find((c) => c.productoLocalId === 1001).cantidad, 5); // 3 + 2
});

// ── Combo DESACTIVADO no se puede vender (aunque el cliente lo mande) ──────
test("combo desactivado (ProductoLocal.activo=false) → rechazado con mensaje claro", async () => {
  const seed = baseSeed();
  seed.pls.find((p) => p.id === 2000).activo = false; // el combo en sí, inactivo
  const tx = makeTx(seed);
  await assert.rejects(
    () => construirLineasComerciales(tx, { ...ctxBase, items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }] }),
    (e) => {
      assert.match(e.message, /está desactivado/);
      assert.equal(e.status, 400);
      return true;
    }
  );
  // No descontó nada
  assert.equal(tx.__decrements.length, 0);
});

// ── Bloqueos ESTRUCTURALES (siempre, incluso con negativos) ───────────────
test("15/16) componente inactivo → bloquea la venta", async () => {
  const seed = baseSeed();
  seed.pls.find((p) => p.id === 1001).activo = false;
  const tx = makeTx(seed);
  await assert.rejects(
    () => construirLineasComerciales(tx, { ...ctxBase, items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }] }),
    /inactivo/
  );
});

test("estructural: componente sin StockLocal → bloquea", async () => {
  const seed = baseSeed();
  delete seed.stock[1001];
  const tx = makeTx(seed);
  await assert.rejects(
    () => construirLineasComerciales(tx, { ...ctxBase, items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }] }),
    /stock configurado/
  );
});

test("estructural: cantidad inválida en la composición → bloquea", async () => {
  const seed = baseSeed();
  seed.comboComp.find((c) => c.id === 1).cantidad = 0;
  const tx = makeTx(seed);
  await assert.rejects(
    () => construirLineasComerciales(tx, { ...ctxBase, items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }] }),
    /cantidad inválida/
  );
});

test("estructural: composición vacía → bloquea", async () => {
  const seed = baseSeed();
  seed.comboComp = [];
  const tx = makeTx(seed);
  await assert.rejects(
    () => construirLineasComerciales(tx, { ...ctxBase, items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }] }),
    /no tiene componentes/
  );
});

test("estructural: combo dentro de combo → bloquea", async () => {
  const seed = baseSeed();
  seed.comboComp = [{ id: 1, comboProductoLocalId: 2000, componenteProductoLocalId: 1003, cantidad: 1 }];
  seed.stock[1003] = 5;
  const tx = makeTx(seed);
  await assert.rejects(
    () => construirLineasComerciales(tx, { ...ctxBase, items: [{ productoBaseId: 200, precio: 1000, cantidad: 1, nombre: "Combo" }] }),
    /contiene otro combo/
  );
});

// ── 19) Locks en orden determinístico por productoLocalId ─────────────────
test("19) aplicarConsumoStock lockea en orden ascendente por productoLocalId", async () => {
  const tx = makeTx(baseSeed());
  const consumo = [
    { productoLocalId: 1002, productoBaseId: 102, cantidad: 1, nombre: "Fernet", fuentes: [] },
    { productoLocalId: 1001, productoBaseId: 101, cantidad: 2, nombre: "Coca", fuentes: [] },
  ];
  await aplicarConsumoStock(tx, { localId: 2, consumoFisicoConsolidado: consumo, allowNegativeStock: false });
  assert.deepEqual(tx.__lockOrder, [1001, 1002]); // ordenado, no en orden de entrada
});

// ── 7) Cada StockLocal se descuenta UNA sola vez ──────────────────────────
test("7) un solo decrement por productoLocalId, por el total", async () => {
  const tx = makeTx(baseSeed());
  const consumo = [{ productoLocalId: 1001, productoBaseId: 101, cantidad: 5, nombre: "Coca", fuentes: [] }];
  await aplicarConsumoStock(tx, { localId: 2, consumoFisicoConsolidado: consumo, allowNegativeStock: false });
  assert.equal(tx.__decrements.length, 1);
  assert.deepEqual(tx.__decrements[0], { productoId: 1001, decrement: 5 });
  assert.equal(tx.__store.stock[1001], 5); // 10 - 5
});

// ── 13) Stock insuficiente bloquea (con limitante) ────────────────────────
test("13) stock insuficiente → error con producto limitante", async () => {
  const tx = makeTx(baseSeed());
  const consumo = [{ productoLocalId: 1002, productoBaseId: 102, cantidad: 5, nombre: "Fernet", fuentes: [] }]; // stock 3
  await assert.rejects(
    () => aplicarConsumoStock(tx, { localId: 2, consumoFisicoConsolidado: consumo, allowNegativeStock: false }),
    (e) => {
      assert.match(e.message, /Stock insuficiente/);
      assert.equal(e.status, 409);
      assert.equal(e.limitante.productoLocalId, 1002);
      assert.equal(e.limitante.disponible, 3);
      assert.equal(e.limitante.requerido, 5);
      return true;
    }
  );
  assert.equal(tx.__decrements.length, 0); // no descontó nada
});

// ── 14) allowNegativeStock permite insuficiencia física ───────────────────
test("14) allowNegativeStock=true permite descontar por debajo de 0", async () => {
  const tx = makeTx(baseSeed());
  const consumo = [{ productoLocalId: 1002, productoBaseId: 102, cantidad: 5, nombre: "Fernet", fuentes: [] }];
  const r = await aplicarConsumoStock(tx, { localId: 2, consumoFisicoConsolidado: consumo, allowNegativeStock: true });
  assert.equal(r.allowNegativeStockUsed, true);
  assert.equal(tx.__store.stock[1002], -2); // 3 - 5
});
