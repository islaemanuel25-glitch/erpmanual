// Tests del servicio de lista predeterminada del depósito.
// Runner: `node --test lib/precios/defaultDeposito.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDefaultDeposito, setDefaultDeposito } from "./defaultDeposito.js";

function nuevoStore() {
  return {
    grupoDeposito: [
      { id: 10, grupoId: 1, localId: 1, listaPrecioDefaultId: 100 }, // depo grupo1
      { id: 11, grupoId: 1, localId: 5, listaPrecioDefaultId: null }, // 2º depo grupo1
      { id: 20, grupoId: 2, localId: 4, listaPrecioDefaultId: 200 }, // depo grupo2
    ],
    // grupoLocal: local 2 NO está en grupoDeposito → local normal
    listas: [
      { id: 100, grupoId: 1, nombre: "Costo", tipoBase: "COSTO", margenPorcentaje: 0, activo: true, esDefault: true },
      { id: 101, grupoId: 1, nombre: "Mayorista", tipoBase: "PRECIO_VENTA", margenPorcentaje: null, activo: true, esDefault: false },
      { id: 300, grupoId: 1, nombre: "Inactiva", tipoBase: "COSTO", margenPorcentaje: 5, activo: false, esDefault: false },
      { id: 200, grupoId: 2, nombre: "OtroGrupo", tipoBase: "COSTO", margenPorcentaje: 10, activo: true, esDefault: true },
    ],
  };
}

function clientFor(store) {
  return {
    grupoDeposito: {
      findFirst: async ({ where: { grupoId, localId } }) =>
        store.grupoDeposito.find((x) => x.grupoId === grupoId && x.localId === localId) || null,
      update: async ({ where: { id }, data }) => {
        const r = store.grupoDeposito.find((x) => x.id === id);
        Object.assign(r, data);
        return r;
      },
    },
    listaPrecio: {
      findMany: async ({ where: { grupoId, activo } }) =>
        store.listas.filter((l) => l.grupoId === grupoId && (activo === undefined || l.activo === activo)),
      findUnique: async ({ where: { id } }) => store.listas.find((l) => l.id === id) || null,
      update: async () => {
        throw new Error("listaPrecio.update NO debe llamarse en esta feature");
      },
    },
  };
}

const gd = (store, id) => store.grupoDeposito.find((x) => x.id === id);

// ── A) GET desde depósito ─────────────────────────────────────────────────
test("A) get desde depósito: default #100 'Costo' + listas activas del grupo", async () => {
  const store = nuevoStore();
  const r = await getDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1 });
  assert.equal(r.esDeposito, true);
  assert.equal(r.listaPrecioDefaultId, 100);
  assert.equal(r.listaActual?.nombre, "Costo");
  assert.deepEqual(r.listasDisponibles.map((l) => l.id).sort(), [100, 101]); // solo activas del grupo 1
});

// ── B) GET desde local normal ─────────────────────────────────────────────
test("B) get desde local normal: esDeposito=false, sin config", async () => {
  const store = nuevoStore();
  const r = await getDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 2 });
  assert.equal(r.esDeposito, false);
  assert.equal(r.listaPrecioDefaultId, null);
  assert.deepEqual(r.listasDisponibles, []);
});

// ── C) Cambiar 'Costo' → 'Mayorista' (solo esa fila) ──────────────────────
test("C) set depósito a #101: cambia solo esa fila GrupoDeposito", async () => {
  const store = nuevoStore();
  const r = await setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1, listaPrecioDefaultId: 101 });
  assert.equal(r.listaPrecioDefaultId, 101);
  assert.equal(gd(store, 10).listaPrecioDefaultId, 101);
  assert.equal(gd(store, 11).listaPrecioDefaultId, null); // otro depósito intacto
  assert.equal(gd(store, 20).listaPrecioDefaultId, 200); // otro grupo intacto
});

// ── D) Seleccionar null → quita la default ────────────────────────────────
test("D) set null: elimina la default, no toca listas ni otros depósitos", async () => {
  const store = nuevoStore();
  const r = await setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1, listaPrecioDefaultId: null });
  assert.equal(r.listaPrecioDefaultId, null);
  assert.equal(gd(store, 10).listaPrecioDefaultId, null);
  assert.equal(store.listas.length, 4); // listas intactas
});

// ── E) Lista de otro grupo → rechaza sin escribir ─────────────────────────
test("E) set lista de otro grupo (200): rechaza 403 sin escribir", async () => {
  const store = nuevoStore();
  await assert.rejects(
    () => setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1, listaPrecioDefaultId: 200 }),
    (e) => e.status === 403 && /otro grupo/.test(e.message)
  );
  assert.equal(gd(store, 10).listaPrecioDefaultId, 100); // sin cambios
});

// ── F) Lista inactiva → rechaza ───────────────────────────────────────────
test("F) set lista inactiva (300): rechaza 400 sin escribir", async () => {
  const store = nuevoStore();
  await assert.rejects(
    () => setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1, listaPrecioDefaultId: 300 }),
    (e) => e.status === 400 && /inactiva/.test(e.message)
  );
  assert.equal(gd(store, 10).listaPrecioDefaultId, 100);
});

// ── G) Local normal intenta configurar → 403 ──────────────────────────────
test("G) local normal no puede configurar: 403", async () => {
  const store = nuevoStore();
  await assert.rejects(
    () => setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 2, listaPrecioDefaultId: 100 }),
    (e) => e.status === 403 && /no es un depósito/.test(e.message)
  );
});

// ── I) Múltiples depósitos: modificar uno no cambia otro ──────────────────
test("I) múltiples depósitos: set en localId 5 no afecta al depósito 1", async () => {
  const store = nuevoStore();
  await setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 5, listaPrecioDefaultId: 101 });
  assert.equal(gd(store, 11).listaPrecioDefaultId, 101);
  assert.equal(gd(store, 10).listaPrecioDefaultId, 100); // depósito 1 intacto
});

// ── J) Nunca modifica ListaPrecio / esDefault ─────────────────────────────
test("J) no toca ListaPrecio.esDefault (listaPrecio.update lanzaría)", async () => {
  const store = nuevoStore();
  await setDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1, listaPrecioDefaultId: 101 });
  // esDefault de todas las listas queda igual
  assert.equal(store.listas.find((l) => l.id === 100).esDefault, true);
  assert.equal(store.listas.find((l) => l.id === 101).esDefault, false);
});

// ── Advertencia) config actual apunta a lista inactiva ────────────────────
test("Warn) get con default apuntando a lista inactiva: listaActual.activo=false", async () => {
  const store = nuevoStore();
  gd(store, 10).listaPrecioDefaultId = 300; // Inactiva
  const r = await getDefaultDeposito({ prisma: clientFor(store), grupoId: 1, localId: 1 });
  assert.equal(r.listaPrecioDefaultId, 300);
  assert.equal(r.listaActual?.activo, false); // la UI advierte
  assert.equal(r.listasDisponibles.some((l) => l.id === 300), false); // no seleccionable
});
