// Candados de la capacidad `stock_consulta` (Tanda 8A): el pedido, la búsqueda
// por nombre y por código con el buscador del ERP, el corte en 10 con `hayMas`,
// la cantidad y la unidad como las dibuja la pantalla Stock Locales, el mínimo,
// "bajo mínimo" y STOCK_MINIMO_NO_DISPONIBLE.
//
// La base es de mentira pero con la forma de la real: `StockLocal.cantidad` y
// `stockMin` llegan como `Prisma.Decimal`, y cada `ProductoLocal` trae su base y
// su fila de stock como las piden `buscarCatalogoLocal` y stockConsultaServer.js.
// `scripts/pruebas-db/azulChatStockConsulta.mjs` produce esas filas por las rutas
// reales y ejerce todo contra PostgreSQL.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/stockConsulta.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import { resolverPedido, compararBajoMinimo, MAX_COINCIDENCIAS, MAX_BAJO_MINIMO } from "./stockConsulta.js";
import { stockConsulta } from "./stockConsultaServer.js";
import { mapStockItemLocal, mapStockItemDeposito } from "../../stock/mapItem.js";
import { presentacionCantidadStock, getUnidadDeposito, getUnidadLocal } from "../../stock/presentacion.js";

const D = (v) => (v == null ? null : new Prisma.Decimal(v));
const AUTZ = { localId: 7, grupoId: 3 };

let siguienteId = 100;
/** Un producto del local como lo devuelve Prisma: el ProductoLocal, su base y su fila de stock. */
function producto({ nombre, codigo = null, propio = null, unidad = "unidad", factor = 1, cantidad = 0, min = null, ajustado = false, activo = true, sinFila = false, localId = 7 }) {
  const id = (siguienteId += 1);
  return {
    id,
    localId,
    nombre: null,
    activo,
    codigo_barra_propio: propio,
    baseId: id + 1000,
    base: {
      id: id + 1000,
      nombre,
      codigo_barra: codigo,
      codigo_barra_secundario: null,
      categoria_id: null,
      proveedor_id: null,
      area_fisica_id: null,
      unidad_medida: unidad,
      factor_pack: factor,
      modoCompraProveedor: null,
      pesoReferenciaKg: null,
      pesoEsFijo: false,
      modoVentaDeposito: null,
      activo: true,
    },
    stock: sinFila
      ? []
      : [{ cantidad: D(cantidad), stockMin: D(min), stockMax: null, limitesConfiguradosAt: ajustado ? new Date("2026-10-01T12:00:00Z") : null }],
  };
}

/**
 * La base de mentira. Contesta las CUATRO formas de consulta que hace la
 * capacidad —el local; los candidatos y la recarga de `buscarCatalogoLocal`; las
 * filas de stock por id; las de mínimo ajustado— y anota cada una.
 */
function baseCon(productos, { esDeposito = false } = {}) {
  const consultas = [];
  const delLocal = (where) => productos.filter((p) => p.localId === where.localId && (!where.activo || p.activo));
  return {
    consultas,
    local: {
      findUnique: async ({ where }) => {
        consultas.push("local.findUnique");
        return where.id === AUTZ.localId ? { id: AUTZ.localId, nombre: "Local Centro", es_deposito: esDeposito } : null;
      },
    },
    productoLocal: {
      findMany: async ({ where, select, include }) => {
        if (where.stock?.some) {
          consultas.push("conMinimo");
          return delLocal(where).filter((p) => p.stock[0]?.limitesConfiguradosAt && p.stock[0]?.stockMin != null);
        }
        if (select?.codigo_barra_propio) {
          consultas.push("candidatos");
          return delLocal(where);
        }
        const ids = where.id?.in ?? [];
        consultas.push(include ? "recarga" : "filas");
        return productos.filter((p) => ids.includes(p.id) && (!where.localId || p.localId === where.localId)).reverse();
      },
    },
  };
}

const consultar = (db, parametros) => stockConsulta(AUTZ, parametros, { db });

// ═══════════════════════════════════════════════════════════════════════════
// El pedido
// ═══════════════════════════════════════════════════════════════════════════

test("1. la forma del pedido: modo producto con texto de 2 a 60, o bajo_minimo sin texto", () => {
  assert.deepEqual(resolverPedido({ modo: "producto", texto: "  leche " }), { ok: true, modo: "producto", texto: "leche" });
  assert.deepEqual(resolverPedido({ modo: "bajo_minimo" }), { ok: true, modo: "bajo_minimo", texto: null });
  for (const malo of [
    {},
    { modo: "todo" },
    { modo: "producto" },
    { modo: "producto", texto: "a" },
    { modo: "producto", texto: "  a  " },
    { modo: "producto", texto: "x".repeat(61) },
    { modo: "producto", texto: 7790001 },
    { modo: "bajo_minimo", texto: "leche" },
  ]) {
    const r = resolverPedido(malo);
    assert.deepEqual([r.ok, r.status, r.codigo], [false, 400, "PEDIDO_INVALIDO"], JSON.stringify(malo));
  }
  assert.equal(resolverPedido({ modo: "producto", texto: "x".repeat(60) }).ok, true);
  assert.equal(resolverPedido({ modo: "producto", texto: "ab" }).ok, true);
});

test("2. un pedido inválido no consulta nada", async () => {
  const db = baseCon([]);
  const r = await consultar(db, { modo: "producto", texto: "a" });
  assert.equal(r.codigo, "PEDIDO_INVALIDO");
  assert.deepEqual(db.consultas, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// La búsqueda: el buscador del ERP
// ═══════════════════════════════════════════════════════════════════════════

test("3. por nombre: en el orden del buscador —igual, empieza, palabra que empieza, contiene—", async () => {
  const db = baseCon([
    producto({ nombre: "Dulce de Leche Serenísima", cantidad: 4 }),
    producto({ nombre: "Leche Cotar Entera", cantidad: 20 }),
    producto({ nombre: "Leche", cantidad: 1 }),
    producto({ nombre: "Yerba Playadito", cantidad: 9 }),
    producto({ nombre: "Superleche", cantidad: 2 }),
  ]);
  const r = await consultar(db, { modo: "producto", texto: "leche" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos.productos.map((p) => p.nombre), ["Leche", "Leche Cotar Entera", "Dulce de Leche Serenísima", "Superleche"]);
  assert.equal(r.datos.hayMas, false);
  assert.deepEqual(db.consultas, ["local.findUnique", "candidatos", "recarga", "filas"]);
});

test("4. por código de barras exacto, también el propio del local; un código parcial no es coincidencia", async () => {
  const db = baseCon([
    producto({ nombre: "Leche Cotar", codigo: "7790001000012", cantidad: 20 }),
    producto({ nombre: "Galletitas", codigo: "7790002000019", propio: "LOC-55", cantidad: 3 }),
  ]);
  const porCodigo = await consultar(db, { modo: "producto", texto: "7790001000012" });
  assert.deepEqual(porCodigo.datos.productos.map((p) => [p.nombre, p.codigo]), [["Leche Cotar", "7790001000012"]]);
  const propio = await consultar(db, { modo: "producto", texto: "loc-55" });
  assert.deepEqual(propio.datos.productos.map((p) => p.nombre), ["Galletitas"]);
  const parcial = await consultar(db, { modo: "producto", texto: "7790001" });
  assert.deepEqual(parcial.datos.productos, []);
});

test("5. ninguna coincidencia: lista vacía, sin hayMas, y no se leen filas", async () => {
  const db = baseCon([producto({ nombre: "Leche" })]);
  const r = await consultar(db, { modo: "producto", texto: "fernet" });
  assert.deepEqual([r.ok, r.datos.productos, r.datos.hayMas], [true, [], false]);
  assert.deepEqual(db.consultas, ["local.findUnique", "candidatos"]);
});

test("6. hasta 10, y hayMas si el buscador encontró más; con 10 justos, no", async () => {
  assert.equal(MAX_COINCIDENCIAS, 10);
  const doce = Array.from({ length: 12 }, (_, i) => producto({ nombre: `Alfajor ${String(i).padStart(2, "0")}` }));
  const r = await consultar(baseCon(doce), { modo: "producto", texto: "alfajor" });
  assert.deepEqual([r.datos.productos.length, r.datos.hayMas], [10, true]);
  const diez = await consultar(baseCon(doce.slice(0, 10)), { modo: "producto", texto: "alfajor" });
  assert.deepEqual([diez.datos.productos.length, diez.datos.hayMas], [10, false]);
});

test("7. un producto inactivo no entra: el universo es el de la pantalla de stock", async () => {
  const r = await consultar(baseCon([producto({ nombre: "Leche vieja", activo: false }), producto({ nombre: "Leche" })]), { modo: "producto", texto: "leche" });
  assert.deepEqual(r.datos.productos.map((p) => p.nombre), ["Leche"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cantidad, unidad y equivalencia: como la pantalla
// ═══════════════════════════════════════════════════════════════════════════

test("8. en un local: la existencia en unidades (o kg), con la unidad y el texto de la pantalla", async () => {
  const pack = producto({ nombre: "Cerveza Quilmes", unidad: "pack", factor: 12, cantidad: 30 });
  const kg = producto({ nombre: "Queso Cremoso", unidad: "kg", cantidad: "1.5" });
  const r = await consultar(baseCon([pack, kg]), { modo: "producto", texto: "cerveza" });
  assert.deepEqual(r.datos.productos[0], {
    productoId: pack.id,
    nombre: "Cerveza Quilmes",
    codigo: null,
    cantidad: "30.000",
    unidad: "Unidad",
    equivalencia: "30 uds",
    stockMinimo: null,
    bajoMinimo: null,
  });
  const q = await consultar(baseCon([pack, kg]), { modo: "producto", texto: "queso" });
  assert.deepEqual([q.datos.productos[0].cantidad, q.datos.productos[0].unidad, q.datos.productos[0].equivalencia], ["1.500", "Kg", "1.500 kg"]);
  assert.equal(r.datos.local.esDeposito, false);
});

test("9. en el depósito: el pack en bultos + unidades, y la unidad del pack, como la tabla", async () => {
  const pack = producto({ nombre: "Cerveza Quilmes", unidad: "pack", factor: 12, cantidad: 30 });
  const suelto = producto({ nombre: "Cerveza Patagonia", unidad: "unidad", cantidad: 5 });
  const r = await consultar(baseCon([pack, suelto], { esDeposito: true }), { modo: "producto", texto: "cerveza" });
  const [quilmes, patagonia] = r.datos.productos;
  assert.deepEqual([quilmes.cantidad, quilmes.unidad, quilmes.equivalencia], ["30.000", "Pack x12", "2 bultos + 6 uds"]);
  assert.deepEqual([patagonia.unidad, patagonia.equivalencia], ["Unidad", "5 uds"]);
  assert.equal(r.datos.local.esDeposito, true);
  // La MISMA pieza que la pantalla, sobre el ítem que arma el listado.
  const item = mapStockItemDeposito(pack, pack.base, pack.stock[0], 7);
  assert.equal(quilmes.equivalencia, presentacionCantidadStock(item, true).texto);
  assert.equal(quilmes.unidad, getUnidadDeposito(item));
  const local = mapStockItemLocal(pack, pack.base, pack.stock[0]);
  assert.equal(getUnidadLocal(local), "Unidad");
});

test("10. sin fila de stock la existencia es cero, como en el listado", async () => {
  const r = await consultar(baseCon([producto({ nombre: "Leche nueva", sinFila: true })]), { modo: "producto", texto: "leche" });
  assert.deepEqual([r.datos.productos[0].cantidad, r.datos.productos[0].equivalencia, r.datos.productos[0].stockMinimo], ["0.000", "0 uds", null]);
});

test("11. el mínimo: solo si los límites están AJUSTADOS; bajoMinimo es el faltante del listado", async () => {
  const productos = [
    producto({ nombre: "Leche A", cantidad: 5, min: 10, ajustado: true }),
    producto({ nombre: "Leche B", cantidad: 20, min: 10, ajustado: true }),
    // Un mínimo cargado por una ruta vieja, sin que nadie lo ajustara: la
    // pantalla lo dibuja "sin ajustar" y la card no lo cuenta.
    producto({ nombre: "Leche C", cantidad: 5, min: 10, ajustado: false }),
    producto({ nombre: "Leche D", cantidad: 5 }),
  ];
  const r = await consultar(baseCon(productos), { modo: "producto", texto: "leche" });
  assert.deepEqual(r.datos.productos.map((p) => [p.nombre, p.stockMinimo, p.bajoMinimo]), [
    ["Leche A", "10.00", true],
    ["Leche B", "10.00", false],
    ["Leche C", null, null],
    ["Leche D", null, null],
  ]);
});

test("12. nada de dinero: los campos son exactamente los del contrato", async () => {
  const r = await consultar(baseCon([producto({ nombre: "Leche", cantidad: 1 })]), { modo: "producto", texto: "leche" });
  assert.deepEqual(Object.keys(r.datos), ["capacidad", "version", "local", "grupoId", "modo", "texto", "productos", "hayMas"]);
  assert.deepEqual(Object.keys(r.datos.productos[0]), ["productoId", "nombre", "codigo", "cantidad", "unidad", "equivalencia", "stockMinimo", "bajoMinimo"]);
  assert.ok(!/precio|costo|margen|valor/i.test(JSON.stringify(r.datos)));
  assert.deepEqual([r.datos.capacidad, r.datos.version, r.datos.grupoId, r.datos.local], ["stock_consulta", 1, 3, { id: 7, nombre: "Local Centro", esDeposito: false }]);
});

// ═══════════════════════════════════════════════════════════════════════════
// Bajo mínimo
// ═══════════════════════════════════════════════════════════════════════════

test("13. bajo_minimo: los faltantes por mayor faltante relativo, con el total", async () => {
  const productos = [
    producto({ nombre: "Azúcar", cantidad: 8, min: 10, ajustado: true }), // 20 %
    producto({ nombre: "Harina", cantidad: 1, min: 10, ajustado: true }), // 90 %
    producto({ nombre: "Arroz", cantidad: 30, min: 10, ajustado: true }), // no falta
    producto({ nombre: "Fideos", cantidad: 5, min: 10, ajustado: true }), // 50 %
    producto({ nombre: "Aceite", cantidad: -2, min: 0, ajustado: true }), // negativo con mínimo cero: primero
    producto({ nombre: "Sal", cantidad: 0, min: 10, ajustado: false }), // sin ajustar: no cuenta
  ];
  const r = await consultar(baseCon(productos), { modo: "bajo_minimo" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos.productos.map((p) => p.nombre), ["Aceite", "Harina", "Fideos", "Azúcar"]);
  assert.ok(r.datos.productos.every((p) => p.bajoMinimo === true && p.stockMinimo !== null));
  assert.deepEqual([r.datos.total, r.datos.hayMas, r.datos.texto, r.datos.modo], [4, false, null, "bajo_minimo"]);
  assert.deepEqual(Object.keys(r.datos), ["capacidad", "version", "local", "grupoId", "modo", "texto", "productos", "total", "hayMas"]);
});

test("14. bajo_minimo con mínimo cargado y ninguno faltante: lista vacía, no 'no disponible'", async () => {
  const r = await consultar(baseCon([producto({ nombre: "Arroz", cantidad: 30, min: 10, ajustado: true })]), { modo: "bajo_minimo" });
  assert.deepEqual([r.ok, r.datos.productos, r.datos.total], [true, [], 0]);
});

test("15. sin ningún mínimo ajustado en el local: STOCK_MINIMO_NO_DISPONIBLE", async () => {
  const sinAjustar = [producto({ nombre: "Sal", cantidad: 0, min: 10, ajustado: false }), producto({ nombre: "Arroz", cantidad: 3 })];
  const r = await consultar(baseCon(sinAjustar), { modo: "bajo_minimo" });
  assert.deepEqual([r.ok, r.status, r.codigo], [false, 409, "STOCK_MINIMO_NO_DISPONIBLE"]);
  // CONTRAPRUEBA: con UNO ajustado deja de ser "no disponible".
  sinAjustar.push(producto({ nombre: "Azúcar", cantidad: 30, min: 10, ajustado: true }));
  assert.equal((await consultar(baseCon(sinAjustar), { modo: "bajo_minimo" })).ok, true);
});

test("16. bajo_minimo: hasta 50, con el total y hayMas", async () => {
  assert.equal(MAX_BAJO_MINIMO, 50);
  const muchos = Array.from({ length: 53 }, (_, i) => producto({ nombre: `P${i}`, cantidad: i % 10, min: 10, ajustado: true }));
  const r = await consultar(baseCon(muchos), { modo: "bajo_minimo" });
  assert.deepEqual([r.datos.productos.length, r.datos.total, r.datos.hayMas], [50, 53, true]);
});

test("17. el orden: proporción, después nombre, después id", () => {
  const f = (id, nombre, stock, stockMin) => ({ id, nombre, stock, stockMin });
  const lista = [f(3, "B", 5, 10), f(2, "A", 5, 10), f(1, "C", 1, 10), f(4, "D", -1, 0)].sort(compararBajoMinimo);
  assert.deepEqual(lista.map((x) => x.id), [4, 1, 2, 3]);
});

test("18. el local sale de la autorización: otro local del cuerpo no existe para la capacidad", async () => {
  const r = await stockConsulta({ localId: 999, grupoId: 3 }, { modo: "bajo_minimo" }, { db: baseCon([]) });
  assert.deepEqual([r.ok, r.status, r.codigo], [false, 403, "LOCAL_SIN_GRUPO"]);
});
