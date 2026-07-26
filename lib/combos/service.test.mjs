// Tests del service de combos (crear / get / editar) con mock Prisma stateful.
// Runner nativo: `node --test lib/combos/service.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCombo, getCombo, editarCombo, cambiarEstadoCombo, evaluarEstructuraCombo } from "./service.js";
import { esComboBase, assertBaseNoEsCombo } from "./guards.js";

// ── Mock Prisma en memoria (stateful + rollback en throw) ──────────────────
const clone = (x) => JSON.parse(JSON.stringify(x));
function pick(obj, select) {
  if (!select) return { ...obj };
  const o = {};
  for (const k of Object.keys(select)) if (select[k] === true) o[k] = obj[k];
  return o;
}

function seedData() {
  return {
    locales: [
      { id: 1, es_deposito: true },
      { id: 2, es_deposito: false },
      { id: 3, es_deposito: false },
    ],
    config: [{ grupoId: 1, allowNegativeStock: false }],
    bases: [
      { id: 101, grupoId: 1, nombre: "Coca", activo: true, es_combo: false, precio_costo: 100, factor_pack: 1, creadoEnLocalId: 2 },
      { id: 102, grupoId: 1, nombre: "Fernet", activo: true, es_combo: false, precio_costo: 800, factor_pack: 1, creadoEnLocalId: 2 },
      { id: 103, grupoId: 1, nombre: "Pack12", activo: true, es_combo: false, precio_costo: 1200, factor_pack: 12, creadoEnLocalId: 2 },
      { id: 104, grupoId: 1, nombre: "BaseInactiva", activo: false, es_combo: false, precio_costo: 50, factor_pack: 1, creadoEnLocalId: 2 },
      { id: 105, grupoId: 1, nombre: "PLInactivo", activo: true, es_combo: false, precio_costo: 50, factor_pack: 1, creadoEnLocalId: 2 },
      { id: 106, grupoId: 1, nombre: "OtroCombo", activo: true, es_combo: true, precio_costo: 0, factor_pack: 1, creadoEnLocalId: 2 },
      { id: 107, grupoId: 1, nombre: "DeLocalB", activo: true, es_combo: false, precio_costo: 70, factor_pack: 1, creadoEnLocalId: 3 },
      { id: 110, grupoId: 1, nombre: "CocaDepo", activo: true, es_combo: false, precio_costo: 100, factor_pack: 1, creadoEnLocalId: 1 },
    ],
    pls: [
      { id: 1001, localId: 2, baseId: 101, activo: true, precio_costo: null, precio_venta: 150, margen: null },
      { id: 1002, localId: 2, baseId: 102, activo: true, precio_costo: null, precio_venta: 1000, margen: null },
      { id: 1003, localId: 2, baseId: 103, activo: true, precio_costo: null, precio_venta: 150, margen: null },
      { id: 1004, localId: 2, baseId: 104, activo: true, precio_costo: null, precio_venta: 80, margen: null },
      { id: 1005, localId: 2, baseId: 105, activo: false, precio_costo: null, precio_venta: 80, margen: null },
      { id: 1006, localId: 2, baseId: 106, activo: true, precio_costo: null, precio_venta: 500, margen: null },
      { id: 1007, localId: 3, baseId: 107, activo: true, precio_costo: null, precio_venta: 90, margen: null },
      { id: 1010, localId: 1, baseId: 110, activo: true, precio_costo: null, precio_venta: 150, margen: null },
    ],
    stock: [
      { id: 5001, productoId: 1001, localId: 2, cantidad: 10 },
      { id: 5002, productoId: 1002, localId: 2, cantidad: 3 },
      { id: 5003, productoId: 1003, localId: 2, cantidad: 24 },
      { id: 5004, productoId: 1004, localId: 2, cantidad: 5 },
      { id: 5005, productoId: 1005, localId: 2, cantidad: 5 },
      { id: 5010, productoId: 1010, localId: 1, cantidad: 20 },
    ],
    ccs: [],
    vdc: [], // "VentaDetalleComponente" histórico — el service NUNCA debe tocarlo
  };
}

function fresh() {
  const db = { _seq: { base: 200, pl: 2000, cc: 9000, stock: 8000 }, ...clone(seedData()) };

  const baseById = (id) => db.bases.find((b) => b.id === id) || null;
  const stockFor = (plId, localId, select) =>
    db.stock
      .filter((s) => s.productoId === plId && (localId == null || s.localId === localId))
      .map((s) => (select?.cantidad ? { cantidad: s.cantidad } : select?.id ? { id: s.id } : { ...s }));

  const attachPL = (pl, include) => {
    if (!pl) return null;
    const out = { ...pl };
    if (include?.base === true) out.base = baseById(pl.baseId) ? { ...baseById(pl.baseId) } : null;
    else if (include?.base?.select) {
      const b = baseById(pl.baseId);
      out.base = b ? pick(b, include.base.select) : null;
    }
    if (include?.stock) {
      const lid = include.stock.where?.localId;
      out.stock = stockFor(pl.id, lid, include.stock.select);
    }
    return out;
  };

  const client = {
    local: {
      findUnique: async ({ where: { id }, select }) => {
        const l = db.locales.find((x) => x.id === id);
        return l ? pick(l, select) : null;
      },
    },
    configuracionGrupo: {
      findUnique: async ({ where: { grupoId }, select }) => {
        const c = db.config.find((x) => x.grupoId === grupoId);
        return c ? pick(c, select) : null;
      },
    },
    productoBase: {
      create: async ({ data }) => {
        const row = { id: db._seq.base++, codigo_barra: null, codigo_barra_secundario: null, activo: true, es_combo: false, margen: null, ...data };
        db.bases.push(row);
        return { ...row };
      },
      update: async ({ where: { id }, data }) => {
        const b = baseById(id);
        Object.assign(b, data);
        return { ...b };
      },
      findFirst: async ({ where, select }) => {
        let rows = db.bases.filter((b) => b.grupoId === where.grupoId);
        if (where.id?.not != null) rows = rows.filter((b) => b.id !== where.id.not);
        if (where.OR) {
          rows = rows.filter((b) =>
            where.OR.some((cl) => {
              if ("codigo_barra" in cl) return b.codigo_barra === cl.codigo_barra;
              if ("codigo_barra_secundario" in cl) return b.codigo_barra_secundario === cl.codigo_barra_secundario;
              return false;
            })
          );
        }
        return rows[0] ? pick(rows[0], select) : null;
      },
    },
    productoLocal: {
      create: async ({ data }) => {
        const row = { id: db._seq.pl++, activo: true, margen: null, precio_costo: null, precio_venta: null, ...data };
        db.pls.push(row);
        return { ...row };
      },
      update: async ({ where: { id }, data }) => {
        const pl = db.pls.find((p) => p.id === id);
        Object.assign(pl, data);
        return { ...pl };
      },
      findUnique: async ({ where: { id }, include }) => attachPL(db.pls.find((p) => p.id === id), include),
      findMany: async ({ where, include }) => {
        let rows = db.pls;
        if (where?.id?.in) rows = rows.filter((p) => where.id.in.includes(p.id));
        return rows.map((p) => attachPL(p, include));
      },
    },
    comboComponente: {
      findMany: async ({ where }) =>
        db.ccs
          .filter((c) => where?.comboProductoLocalId == null || c.comboProductoLocalId === where.comboProductoLocalId)
          .slice()
          .sort((a, b) => a.id - b.id)
          .map((r) => ({ ...r })),
      createMany: async ({ data }) => {
        for (const d of data) db.ccs.push({ id: db._seq.cc++, ...d });
        return { count: data.length };
      },
      deleteMany: async ({ where }) => {
        const before = db.ccs.length;
        db.ccs = db.ccs.filter((c) => c.comboProductoLocalId !== where.comboProductoLocalId);
        return { count: before - db.ccs.length };
      },
    },
    $transaction: async (fn) => {
      const snap = { bases: [...db.bases], pls: [...db.pls], ccs: [...db.ccs], stock: [...db.stock], seq: { ...db._seq } };
      try {
        return await fn(client);
      } catch (e) {
        db.bases = snap.bases;
        db.pls = snap.pls;
        db.ccs = snap.ccs;
        db.stock = snap.stock;
        db._seq = snap.seq;
        throw e;
      }
    },
    __db: db,
  };
  return client;
}

const comps = (...pairs) => pairs.map(([componenteProductoLocalId, cantidad]) => ({ componenteProductoLocalId, cantidad }));

// ── 1) Crear combo LOCAL válido (+ 9 sin StockLocal + 10 sin replicar) ─────
test("1) crear combo local válido: costo/ganancia/disponibilidad correctos", async () => {
  const prisma = fresh();
  const combo = await crearCombo({
    prisma,
    grupoId: 1,
    localId: 2,
    data: { nombre: "Combo Fernet", precio_venta: 1000, componentes: comps([1002, 1], [1001, 2]) },
  });
  assert.equal(combo.esCombo, true);
  assert.equal(combo.costoTotal, 1000); // 800×1 + 100×2
  assert.equal(combo.ganancia, 0);
  assert.equal(combo.margen, 0);
  assert.equal(combo.disponibilidad, 3); // min(floor(3/1), floor(10/2))
  assert.equal(combo.componentes.length, 2);
  assert.ok(combo.productoLocalId);

  // 9) NO se creó StockLocal para el combo
  assert.equal(prisma.__db.stock.filter((s) => s.productoId === combo.productoLocalId).length, 0);
  // 10) NO se replicó: un solo ProductoLocal para la base, en el local propietario
  const plsDeBase = prisma.__db.pls.filter((p) => p.baseId === combo.baseId);
  assert.equal(plsDeBase.length, 1);
  assert.equal(plsDeBase[0].localId, 2);
});

// ── Formación de precio POR MARGEN (server-authoritative) ─────────────────
test("crear combo por margen: precio = costo·(1+m/100)", async () => {
  const prisma = fresh();
  // costo = 800×1 + 100×2 = 1000 ; margen 50 → 1500
  const combo = await crearCombo({
    prisma,
    grupoId: 1,
    localId: 2,
    data: { nombre: "CM", margen: 50, redondeo_100: false, componentes: comps([1002, 1], [1001, 2]) },
  });
  assert.equal(combo.costoTotal, 1000);
  assert.equal(combo.precio_venta, 1500);
  assert.equal(combo.margenConfigurado, 50);
});

test("crear combo por margen con redondeo a 100 (ceil)", async () => {
  const prisma = fresh();
  // costo 100 ; ×1.45 = 145 ; redondeo → 200
  const combo = await crearCombo({
    prisma,
    grupoId: 1,
    localId: 2,
    data: { nombre: "CR", margen: 45, redondeo_100: true, componentes: comps([1001, 1]) },
  });
  assert.equal(combo.precio_venta, 200);
  assert.equal(combo.margenConfigurado, 45);
});

// ── 2) Crear combo EXCLUSIVO del depósito ─────────────────────────────────
test("2) crear combo en depósito: exclusivo del depósito", async () => {
  const prisma = fresh();
  const combo = await crearCombo({
    prisma,
    grupoId: 1,
    localId: 1,
    data: { nombre: "Combo Depo", precio_venta: 300, componentes: comps([1010, 2]) },
  });
  assert.equal(combo.disponibilidad, 10); // floor(20/2)
  const base = prisma.__db.bases.find((b) => b.id === combo.baseId);
  assert.equal(base.creadoEnLocalId, 1);
  assert.equal(base.es_combo, true);
  assert.equal(prisma.__db.pls.filter((p) => p.baseId === combo.baseId).length, 1);
});

// ── 3) Rechazar componente de OTRO local ──────────────────────────────────
test("3) rechaza componente de otro local", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1007, 1]) } }),
    /no pertenece a este local/
  );
});

// ── 4) Rechazar componente COMBO ──────────────────────────────────────────
test("4) rechaza componente que es combo", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1006, 1]) } }),
    /no puede contener otro combo/
  );
});

// ── 5) Rechazar componente INACTIVO (ProductoLocal o base) ────────────────
test("5) rechaza componente con ProductoLocal inactivo", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1005, 1]) } }),
    /inactivo/
  );
});

test("5.b) rechaza componente con ProductoBase inactivo", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1004, 1]) } }),
    /inactivo/
  );
});

// ── 6) Rechazar componentes DUPLICADOS ────────────────────────────────────
test("6) rechaza componentes duplicados", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1001, 1], [1001, 2]) } }),
    /duplicado/
  );
});

// ── 7) Rechazar cantidad CERO o NEGATIVA ──────────────────────────────────
test("7) rechaza cantidad cero", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1001, 0]) } }),
    /mayor a 0/
  );
});

test("7.b) rechaza cantidad negativa", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: comps([1001, -1]) } }),
    /mayor a 0/
  );
});

// ── 8) Rechazar composición VACÍA ─────────────────────────────────────────
test("8) rechaza composición vacía", async () => {
  const prisma = fresh();
  await assert.rejects(
    () => crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "X", precio_venta: 100, componentes: [] } }),
    /al menos un componente/
  );
});

// ── 16) Impedir consultar o editar el combo desde OTRO local ──────────────
test("16) no se puede consultar ni editar el combo desde otro local", async () => {
  const prisma = fresh();
  const combo = await crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "C", precio_venta: 1000, componentes: comps([1001, 1]) } });
  await assert.rejects(
    () => getCombo({ prisma, grupoId: 1, localId: 3, productoLocalId: combo.productoLocalId }),
    /no pertenece a este local/
  );
  await assert.rejects(
    () => editarCombo({ prisma, grupoId: 1, localId: 3, productoLocalId: combo.productoLocalId, data: { nombre: "Y", precio_venta: 1, componentes: comps([1001, 1]) } }),
    /no pertenece a este local/
  );
});

// ── 17) Editar composición SIN afectar registros históricos ───────────────
test("17) editar reemplaza composición sin tocar el histórico (VentaDetalleComponente)", async () => {
  const prisma = fresh();
  const combo = await crearCombo({ prisma, grupoId: 1, localId: 2, data: { nombre: "C", precio_venta: 1000, componentes: comps([1001, 2]) } });
  // Histórico simulado: el service NO tiene métodos de ventaDetalleComponente,
  // así que si lo tocara, el mock rompería. Además chequeamos que quede intacto.
  prisma.__db.vdc = [{ id: 1, ventaDetalleId: 99, productoBaseId: 101, cantidad: 2, precioCosto: 100 }];
  const ccBefore = prisma.__db.ccs.filter((c) => c.comboProductoLocalId === combo.productoLocalId).map((c) => c.id);

  const editado = await editarCombo({
    prisma,
    grupoId: 1,
    localId: 2,
    productoLocalId: combo.productoLocalId,
    data: { nombre: "Combo Editado", precio_venta: 1200, componentes: comps([1002, 1]) },
  });

  assert.equal(editado.nombre, "Combo Editado");
  assert.equal(editado.precio_venta, 1200);
  assert.equal(editado.componentes.length, 1);
  assert.equal(editado.componentes[0].componenteProductoLocalId, 1002);

  // Composición reemplazada: ninguna fila vieja sobrevive
  const ccAfter = prisma.__db.ccs.filter((c) => c.comboProductoLocalId === combo.productoLocalId).map((c) => c.id);
  assert.equal(ccAfter.some((id) => ccBefore.includes(id)), false);

  // Histórico intacto
  assert.deepEqual(prisma.__db.vdc, [{ id: 1, ventaDetalleId: 99, productoBaseId: 101, cantidad: 2, precioCosto: 100 }]);
  // Sigue siendo combo y del mismo local propietario
  const base = prisma.__db.bases.find((b) => b.id === combo.baseId);
  assert.equal(base.es_combo, true);
  assert.equal(base.creadoEnLocalId, 2);
});

// ══════════════════════════════════════════════════════════════════════════
// ESTADO: activar / desactivar (cambiarEstadoCombo + editarCombo)
// ══════════════════════════════════════════════════════════════════════════

// Helper: crea un combo válido de 2 componentes en el local 2.
async function comboValido(prisma) {
  return crearCombo({
    prisma,
    grupoId: 1,
    localId: 2,
    data: { nombre: "Combo Estado", precio_venta: 1000, componentes: comps([1002, 1], [1001, 2]) },
  });
}

// E1) Desactivar conserva composición, NO toca StockLocal, y solo cambia PL.activo.
test("E1) desactivar: conserva composición, no toca stock, solo PL.activo (base intacta)", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  const ccBefore = prisma.__db.ccs.filter((c) => c.comboProductoLocalId === combo.productoLocalId).map((c) => c.id).sort();
  const stockBefore = JSON.stringify(prisma.__db.stock);
  const baseActivoBefore = prisma.__db.bases.find((b) => b.id === combo.baseId).activo;

  const res = await cambiarEstadoCombo({ prisma, grupoId: 1, localId: 2, productoLocalId: combo.productoLocalId, activo: false });

  assert.equal(res.activo, false);
  // Composición intacta (mismas filas)
  const ccAfter = prisma.__db.ccs.filter((c) => c.comboProductoLocalId === combo.productoLocalId).map((c) => c.id).sort();
  assert.deepEqual(ccAfter, ccBefore);
  // StockLocal intacto
  assert.equal(JSON.stringify(prisma.__db.stock), stockBefore);
  // ProductoLocal.activo=false; ProductoBase.activo NO cambió
  assert.equal(prisma.__db.pls.find((p) => p.id === combo.productoLocalId).activo, false);
  assert.equal(prisma.__db.bases.find((b) => b.id === combo.baseId).activo, baseActivoBefore);
});

// E2) Reactivar un combo válido funciona.
test("E2) reactivar combo válido: vuelve activo", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  await cambiarEstadoCombo({ prisma, grupoId: 1, localId: 2, productoLocalId: combo.productoLocalId, activo: false });
  const res = await cambiarEstadoCombo({ prisma, grupoId: 1, localId: 2, productoLocalId: combo.productoLocalId, activo: true });
  assert.equal(res.activo, true);
  assert.equal(prisma.__db.pls.find((p) => p.id === combo.productoLocalId).activo, true);
});

// E3) Reactivar un combo con componente inactivo → RECHAZADO (409) con motivo.
test("E3) reactivar combo roto (componente inactivo): rechazado", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  await cambiarEstadoCombo({ prisma, grupoId: 1, localId: 2, productoLocalId: combo.productoLocalId, activo: false });
  // Un componente se desactiva después
  prisma.__db.pls.find((p) => p.id === 1001).activo = false;
  await assert.rejects(
    () => cambiarEstadoCombo({ prisma, grupoId: 1, localId: 2, productoLocalId: combo.productoLocalId, activo: true }),
    /No se puede reactivar el combo/
  );
  // Sigue inactivo (no se reactivó)
  assert.equal(prisma.__db.pls.find((p) => p.id === combo.productoLocalId).activo, false);
});

// E4) Desactivar un combo roto SIEMPRE se puede (aunque tenga componente inactivo).
test("E4) desactivar combo roto: permitido", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  prisma.__db.pls.find((p) => p.id === 1001).activo = false; // roto y activo → "No disponible"
  const res = await cambiarEstadoCombo({ prisma, grupoId: 1, localId: 2, productoLocalId: combo.productoLocalId, activo: false });
  assert.equal(res.activo, false);
});

// E5) Un local NO puede activar/desactivar un combo de otro local.
test("E5) cross-local: no se puede cambiar el estado desde otro local", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  await assert.rejects(
    () => cambiarEstadoCombo({ prisma, grupoId: 1, localId: 3, productoLocalId: combo.productoLocalId, activo: false }),
    /no pertenece a este local/
  );
});

// E6) evaluarEstructuraCombo marca bloqueado + motivo cuando hay componente inactivo.
test("E6) evaluarEstructuraCombo detecta componente inactivo con motivo legible", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  prisma.__db.pls.find((p) => p.id === 1001).activo = false;
  const est = await evaluarEstructuraCombo(prisma, { localId: 2, comboProductoLocalId: combo.productoLocalId });
  assert.equal(est.bloqueadoEstructural, true);
  assert.match(est.motivo, /desactivado/);
});

// E7) editarCombo con activo=false permite guardar aunque la composición sea inválida,
//     conservando la composición (no la reemplaza).
test("E7) editarCombo desactivando: permite aunque haya componente inactivo y conserva composición", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  prisma.__db.pls.find((p) => p.id === 1001).activo = false; // rompe la composición
  const ccBefore = prisma.__db.ccs.filter((c) => c.comboProductoLocalId === combo.productoLocalId).map((c) => c.id).sort();

  const editado = await editarCombo({
    prisma,
    grupoId: 1,
    localId: 2,
    productoLocalId: combo.productoLocalId,
    // Manda la composición actual (inválida) + activo:false → NO debe fallar.
    data: { nombre: "Combo Apagado", activo: false, precio_venta: 1000, componentes: comps([1002, 1], [1001, 2]) },
  });

  assert.equal(editado.activo, false);
  assert.equal(editado.nombre, "Combo Apagado");
  // Composición conservada (mismas filas, no reemplazada)
  const ccAfter = prisma.__db.ccs.filter((c) => c.comboProductoLocalId === combo.productoLocalId).map((c) => c.id).sort();
  assert.deepEqual(ccAfter, ccBefore);
});

// E8) editarCombo con activo=true y composición inválida → RECHAZADO (no se puede
//     dejar/​volver activo un combo roto).
test("E8) editarCombo activo con componente inactivo: rechazado", async () => {
  const prisma = fresh();
  const combo = await comboValido(prisma);
  prisma.__db.pls.find((p) => p.id === 1001).activo = false;
  await assert.rejects(
    () =>
      editarCombo({
        prisma,
        grupoId: 1,
        localId: 2,
        productoLocalId: combo.productoLocalId,
        data: { nombre: "X", activo: true, precio_venta: 1000, componentes: comps([1002, 1], [1001, 2]) },
      }),
    /inactivo/
  );
});

// ── 18) Rechazar promoción a depósito (guard reutilizable) ────────────────
test("18) guard: un combo no puede promoverse a depósito", () => {
  assert.equal(esComboBase({ es_combo: true }), true);
  assert.equal(esComboBase({ es_combo: false }), false);
  let status = null;
  try {
    assertBaseNoEsCombo({ es_combo: true }, "promover al depósito");
  } catch (e) {
    status = e.status;
    assert.match(e.message, /No se puede promover al depósito/);
  }
  assert.equal(status, 400);
});
