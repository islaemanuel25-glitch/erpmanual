// Red de caracterización del núcleo de creación de transferencias.
//
// Documenta el comportamiento que el flujo manual (POS transferencias → Enviar)
// tenía inline en app/api/pos-transferencias/enviar/route.js antes del refactor, y
// que el servicio debe preservar exactamente. Se usa un doble de Prisma (`tx`) que
// registra cada llamada, así se pueden afirmar los argumentos reales de los upsert
// y del create — no hace falta base de datos ni servidor Next.
//
// Correr con: node --test lib/transferencias/crearTransferencia.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crearTransferencia } from "./crearTransferencia.js";
import {
  DESCONTAR_Y_TRANSITO,
  SOLO_TRANSITO,
  movimientoStockOrigen,
  esPoliticaValida,
} from "./politicasStock.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..", "..");

// ── Doble de Prisma ──────────────────────────────────────────────────────────
// `productoLocalDestinoExistente`: mapa "localId:baseId" → id ya existente.
// Si no está, el upsert se comporta como create y asigna un id nuevo.
function fakeTx({ productoLocalDestinoExistente = {} } = {}) {
  let seqProductoLocal = 500;
  const calls = { productoLocalUpsert: [], stockLocalUpsert: [], transferenciaCreate: [] };

  return {
    calls,
    productoLocal: {
      async upsert(args) {
        calls.productoLocalUpsert.push(args);
        const k = `${args.where.localId_baseId.localId}:${args.where.localId_baseId.baseId}`;
        const existente = productoLocalDestinoExistente[k];
        if (existente) return { id: existente, ...args.where.localId_baseId, _creado: false };
        seqProductoLocal += 1;
        return { id: seqProductoLocal, ...args.create, _creado: true };
      },
    },
    stockLocal: {
      async upsert(args) {
        calls.stockLocalUpsert.push(args);
        return {};
      },
    },
    transferencia: {
      async create(args) {
        calls.transferenciaCreate.push(args);
        return {
          id: 9001,
          ...args.data,
          detalle: args.data.detalle.create.map((d, i) => ({ id: 100 + i, ...d })),
        };
      },
    },
  };
}

// `def` respeta el null EXPLÍCITO (a diferencia de ??), para poder ejercitar las
// cadenas de fallback origen → base → vacío.
const def = (v, d) => (v === undefined ? d : v);

// ProductoLocal del origen, con su ProductoBase.
const plOrigen = (o = {}) => ({
  id: o.id ?? 11,
  baseId: o.baseId ?? 1,
  nombre: def(o.nombre, "Coca Cola 500ml (origen)"),
  descripcion: def(o.descripcion, "desc origen"),
  precio_costo: def(o.precio_costo, 500),
  precio_venta: def(o.precio_venta, 850),
  base: {
    id: o.baseId ?? 1,
    nombre: def(o.baseNombre, "Coca Cola 500ml"),
    descripcion: def(o.baseDescripcion, "desc base"),
    precio_costo: def(o.basePrecioCosto, 480),
    precio_venta: def(o.basePrecioVenta, 800),
    factor_pack: o.factorPack ?? 12,
    unidad_medida: o.unidadMedida ?? "pack",
    modo_envio: o.modoEnvio ?? "MIXTO",
    modoCompraProveedor: o.modoCompraProveedor ?? "BULTO",
    pesoReferenciaKg: o.pesoReferenciaKg ?? null,
    modoVentaDeposito: o.modoVentaDeposito ?? "PESO",
    pesoEsFijo: o.pesoEsFijo ?? false,
  },
});

const item = (o = {}) => {
  const pl = plOrigen(o);
  return {
    baseId: pl.baseId,
    productoLocalOrigenId: pl.id,
    cantidad: o.cantidad ?? 3,
    unidadEnviada: o.unidadEnviada ?? "BULTO",
    factorPack: o.factorPackItem !== undefined ? o.factorPackItem : Number(pl.base.factor_pack || 1),
    productoLocalOrigen: pl,
  };
};

const BASE_ARGS = { origenId: 1, destinoId: 2, creadoPorId: 7, posTransferenciaId: 42 };

// ── 1. Conversión y detalles ─────────────────────────────────────────────────

test("envío en UNIDAD: la cantidad física es la cantidad tal cual", async () => {
  const tx = fakeTx();
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS,
    politicaStockOrigen: DESCONTAR_Y_TRANSITO,
    items: [item({ cantidad: 5, unidadEnviada: "UNIDAD", factorPack: 12 })],
  });
  assert.equal(movimientos[0].unidadesStock, 5, "UNIDAD no debe multiplicar por el factor");
  assert.equal(tx.calls.stockLocalUpsert[0].update.cantidad.decrement, 5);
});

test("envío en BULTO con factor pack: cantidad × factor", async () => {
  const tx = fakeTx();
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS,
    politicaStockOrigen: DESCONTAR_Y_TRANSITO,
    items: [item({ cantidad: 3, unidadEnviada: "BULTO", factorPack: 12 })],
  });
  assert.equal(movimientos[0].unidadesStock, 36, "3 bultos × 12 = 36 unidades");
  assert.equal(tx.calls.stockLocalUpsert[0].update.cantidad.decrement, 36);
});

test("BULTO con factor 1 no multiplica", async () => {
  const tx = fakeTx();
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ cantidad: 4, unidadEnviada: "BULTO", factorPack: 1, factorPackItem: 1 })],
  });
  assert.equal(movimientos[0].unidadesStock, 4);
});

test("sin factorPack en el ítem se deriva con factorBulto(base)", async () => {
  const tx = fakeTx();
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ cantidad: 2, unidadEnviada: "BULTO", factorPack: 24, factorPackItem: null })],
  });
  // factorPackItem null → el servicio usa factorBulto(base) = 24.
  assert.equal(movimientos[0].factorPack, 24);
  assert.equal(movimientos[0].unidadesStock, 48);
});

test("el detalle guarda cantidad en la unidad enviada, unidadEnviada y precioCosto", async () => {
  const tx = fakeTx();
  await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ cantidad: 3, unidadEnviada: "BULTO", factorPack: 12, precio_costo: 500 })],
  });
  const detalle = tx.calls.transferenciaCreate[0].data.detalle.create[0];
  assert.equal(detalle.cantidad, 3, "el detalle NO guarda unidades físicas, guarda la cantidad enviada");
  assert.equal(detalle.unidadEnviada, "BULTO");
  assert.equal(detalle.precioCosto, 500, "precioCosto del ProductoLocal de origen");
});

test("precioCosto cae al de la base y luego a 0", async () => {
  const tx1 = fakeTx();
  await crearTransferencia({
    tx: tx1, ...BASE_ARGS,
    items: [item({ precio_costo: null, basePrecioCosto: 480 })],
  });
  assert.equal(tx1.calls.transferenciaCreate[0].data.detalle.create[0].precioCosto, 480);

  const tx2 = fakeTx();
  await crearTransferencia({
    tx: tx2, ...BASE_ARGS,
    items: [item({ precio_costo: null, basePrecioCosto: null })],
  });
  assert.equal(tx2.calls.transferenciaCreate[0].data.detalle.create[0].precioCosto, 0);
});

test("el detalle apunta al ProductoLocal del DESTINO, no al del origen", async () => {
  const tx = fakeTx({ productoLocalDestinoExistente: { "2:1": 777 } });
  await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ id: 11, baseId: 1 })],
  });
  const detalle = tx.calls.transferenciaCreate[0].data.detalle.create[0];
  assert.equal(detalle.productoId, 777, "productoId debe ser el ProductoLocal del destino");
  assert.notEqual(detalle.productoId, 11);
  // Y el movimiento de stock se hizo sobre la fila del ORIGEN.
  assert.equal(tx.calls.stockLocalUpsert[0].where.localId_productoId.localId, 1);
  assert.equal(tx.calls.stockLocalUpsert[0].where.localId_productoId.productoId, 11);
});

test("varios ítems: un movimiento de stock y un detalle por ítem, en orden", async () => {
  const tx = fakeTx();
  await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [
      item({ id: 11, baseId: 1, cantidad: 3, unidadEnviada: "BULTO", factorPack: 12 }),
      item({ id: 12, baseId: 2, cantidad: 5, unidadEnviada: "UNIDAD", factorPack: 12 }),
    ],
  });
  assert.equal(tx.calls.stockLocalUpsert.length, 2);
  assert.equal(tx.calls.transferenciaCreate[0].data.detalle.create.length, 2);
  assert.equal(tx.calls.stockLocalUpsert[0].update.cantidad.decrement, 36);
  assert.equal(tx.calls.stockLocalUpsert[1].update.cantidad.decrement, 5);
});

// ── 2. Política DESCONTAR_Y_TRANSITO ─────────────────────────────────────────

test("DESCONTAR_Y_TRANSITO: 36 unidades → cantidad -= 36, enTransito += 36", async () => {
  const tx = fakeTx();
  await crearTransferencia({
    tx, ...BASE_ARGS,
    politicaStockOrigen: DESCONTAR_Y_TRANSITO,
    items: [item({ cantidad: 3, unidadEnviada: "BULTO", factorPack: 12 })],
  });
  const { update, create } = tx.calls.stockLocalUpsert[0];
  assert.deepEqual(update, { cantidad: { decrement: 36 }, enTransito: { increment: 36 } });
  // Sin fila previa: verbatim del comportamiento actual (queda en negativo).
  assert.equal(create.cantidad, -36);
  assert.equal(create.enTransito, 36);
});

test("DESCONTAR_Y_TRANSITO es el default cuando no se pasa política", async () => {
  const tx = fakeTx();
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ cantidad: 3, unidadEnviada: "BULTO", factorPack: 12 })],
  });
  assert.equal(movimientos[0].politicaStockOrigen, DESCONTAR_Y_TRANSITO);
  assert.ok(tx.calls.stockLocalUpsert[0].update.cantidad, "debe descontar cantidad");
});

// ── 3. Política SOLO_TRANSITO (preparada, sin llamador) ──────────────────────

test("SOLO_TRANSITO: 36 unidades → cantidad sin cambios, enTransito += 36", async () => {
  const tx = fakeTx();
  await crearTransferencia({
    tx, ...BASE_ARGS,
    politicaStockOrigen: SOLO_TRANSITO,
    items: [item({ cantidad: 3, unidadEnviada: "BULTO", factorPack: 12 })],
  });
  const { update, create } = tx.calls.stockLocalUpsert[0];
  assert.deepEqual(update, { enTransito: { increment: 36 } });
  assert.equal(update.cantidad, undefined, "SOLO_TRANSITO no debe tocar cantidad");
  assert.equal(create.cantidad, 0);
  assert.equal(create.enTransito, 36);
});

test("SOLO_TRANSITO crea la transferencia igual que DESCONTAR_Y_TRANSITO", async () => {
  const args = { ...BASE_ARGS, items: [item({ cantidad: 3, unidadEnviada: "BULTO", factorPack: 12 })] };
  const a = fakeTx();
  const b = fakeTx();
  await crearTransferencia({ tx: a, ...args, politicaStockOrigen: DESCONTAR_Y_TRANSITO });
  await crearTransferencia({ tx: b, ...args, politicaStockOrigen: SOLO_TRANSITO });
  // Lo único que cambia entre políticas es el movimiento de stock del origen.
  assert.deepEqual(
    a.calls.transferenciaCreate[0].data.detalle,
    b.calls.transferenciaCreate[0].data.detalle
  );
  assert.deepEqual(a.calls.productoLocalUpsert, b.calls.productoLocalUpsert);
  assert.notDeepEqual(a.calls.stockLocalUpsert[0].update, b.calls.stockLocalUpsert[0].update);
});

test("política desconocida es rechazada", async () => {
  const tx = fakeTx();
  await assert.rejects(
    () => crearTransferencia({ tx, ...BASE_ARGS, politicaStockOrigen: "OTRA", items: [item()] }),
    /Pol.tica de stock de origen desconocida/
  );
  assert.equal(tx.calls.transferenciaCreate.length, 0, "no debe crear nada");
});

test("politicasStock: helpers puros", () => {
  assert.equal(esPoliticaValida(DESCONTAR_Y_TRANSITO), true);
  assert.equal(esPoliticaValida(SOLO_TRANSITO), true);
  assert.equal(esPoliticaValida("NADA"), false);
  assert.deepEqual(movimientoStockOrigen(SOLO_TRANSITO, 10).update, { enTransito: { increment: 10 } });
  assert.deepEqual(movimientoStockOrigen(DESCONTAR_Y_TRANSITO, 10).update, {
    cantidad: { decrement: 10 },
    enTransito: { increment: 10 },
  });
  assert.throws(() => movimientoStockOrigen("X", 1), /desconocida/);
});

// ── 4. Producto del destino ──────────────────────────────────────────────────

test("reutiliza el ProductoLocal del destino cuando ya existe (upsert con update vacío)", async () => {
  const tx = fakeTx({ productoLocalDestinoExistente: { "2:1": 777 } });
  await crearTransferencia({ tx, ...BASE_ARGS, items: [item({ baseId: 1 })] });
  const up = tx.calls.productoLocalUpsert[0];
  assert.deepEqual(up.where, { localId_baseId: { localId: 2, baseId: 1 } });
  assert.deepEqual(up.update, {}, "no debe modificar el producto existente del destino");
});

test("crea el ProductoLocal del destino cuando falta, con los snapshots del origen", async () => {
  const tx = fakeTx();
  await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ baseId: 1, nombre: "Coca (origen)", descripcion: "d-origen", precio_costo: 500, precio_venta: 850 })],
  });
  assert.deepEqual(tx.calls.productoLocalUpsert[0].create, {
    localId: 2,
    baseId: 1,
    nombre: "Coca (origen)",
    descripcion: "d-origen",
    precio_costo: 500,
    precio_venta: 850,
  });
});

test("los datos del destino caen a los de la base y luego a cadena vacía", async () => {
  const tx = fakeTx();
  await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({
      nombre: null, descripcion: null, precio_costo: null, precio_venta: null,
      baseNombre: "Coca base", baseDescripcion: "d-base", basePrecioCosto: 480, basePrecioVenta: 800,
    })],
  });
  const c = tx.calls.productoLocalUpsert[0].create;
  assert.equal(c.nombre, "Coca base");
  assert.equal(c.descripcion, "d-base");
  assert.equal(c.precio_costo, 480);
  assert.equal(c.precio_venta, 800);
});

test("al ENVIAR no se toca el StockLocal del destino (se crea al recibir)", async () => {
  const tx = fakeTx();
  await crearTransferencia({ tx, ...BASE_ARGS, items: [item()] });
  // Todos los upsert de stock son del ORIGEN. La fila del destino la crea
  // confirmar-recepcion; el envío no la inicializa (comportamiento actual).
  assert.equal(tx.calls.stockLocalUpsert.length, 1);
  for (const c of tx.calls.stockLocalUpsert) {
    assert.equal(c.where.localId_productoId.localId, BASE_ARGS.origenId);
    assert.notEqual(c.where.localId_productoId.localId, BASE_ARGS.destinoId);
  }
});

// ── 5. Fiambre (piezas en el depósito) ───────────────────────────────────────

test("fiambre de pieza fija: el envío descuenta PIEZAS y no convierte a kg", async () => {
  const tx = fakeTx();
  const fiambre = item({
    id: 21, baseId: 5, cantidad: 4, unidadEnviada: "UNIDAD",
    factorPack: 1, factorPackItem: 1,
    unidadMedida: "kg", modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 3.2, modoVentaDeposito: "PIEZA", pesoEsFijo: true,
    precio_costo: 11200,
  });
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS, politicaStockOrigen: DESCONTAR_Y_TRANSITO, items: [fiambre],
  });
  // El depósito cuenta piezas: 4 piezas → 4, NO 12.8 kg.
  assert.equal(movimientos[0].unidadesStock, 4);
  assert.equal(tx.calls.stockLocalUpsert[0].update.cantidad.decrement, 4);
  // El detalle conserva lo que la recepción necesita para hacer piezasToKg().
  const d = tx.calls.transferenciaCreate[0].data.detalle.create[0];
  assert.equal(d.cantidad, 4);
  assert.equal(d.unidadEnviada, "UNIDAD");
  assert.equal(d.productoId, 501, "ProductoLocal del destino, por el que la recepción resuelve la base");
});

test("cantidad fraccionada (fiambre por peso) se preserva sin redondear", async () => {
  const tx = fakeTx();
  const { movimientos } = await crearTransferencia({
    tx, ...BASE_ARGS,
    items: [item({ cantidad: 1.925, unidadEnviada: "UNIDAD", factorPack: 1, factorPackItem: 1, unidadMedida: "kg" })],
  });
  assert.equal(movimientos[0].unidadesStock, 1.925);
  assert.equal(tx.calls.transferenciaCreate[0].data.detalle.create[0].cantidad, 1.925);
});

// ── 6. Cabecera de la transferencia ─────────────────────────────────────────

test("cabecera: estado Enviada, fechaEnvio, origen/destino, creadaPor y posTransferenciaId", async () => {
  const antes = Date.now();
  const tx = fakeTx();
  const { transferencia } = await crearTransferencia({
    tx, origenId: 1, destinoId: 2, creadoPorId: 7, posTransferenciaId: 42,
    politicaStockOrigen: DESCONTAR_Y_TRANSITO, items: [item()],
  });
  const data = tx.calls.transferenciaCreate[0].data;
  assert.equal(data.origenId, 1);
  assert.equal(data.destinoId, 2);
  assert.equal(data.creadaPor, 7, "se mapea a Transferencia.creadaPor");
  assert.equal(data.posTransferenciaId, 42);
  assert.equal(data.estado, "Enviada");
  assert.ok(data.fechaEnvio instanceof Date);
  assert.ok(data.fechaEnvio.getTime() >= antes);
  assert.deepEqual(tx.calls.transferenciaCreate[0].include, { detalle: true });
  assert.equal(transferencia.id, 9001);
  assert.equal(transferencia.detalle.length, 1);
});

test("sin posTransferenciaId la cabecera queda en null (transferencia no originada en POS)", async () => {
  const tx = fakeTx();
  await crearTransferencia({ tx, origenId: 1, destinoId: 2, items: [item()] });
  const data = tx.calls.transferenciaCreate[0].data;
  assert.equal(data.posTransferenciaId, null);
  assert.equal(data.creadaPor, null);
});

// ── 7. Validaciones de entrada ──────────────────────────────────────────────

test("valida tx, origen/destino e ítems", async () => {
  await assert.rejects(() => crearTransferencia({ origenId: 1, destinoId: 2, items: [item()] }), /tx/);
  const tx = fakeTx();
  await assert.rejects(() => crearTransferencia({ tx, destinoId: 2, items: [item()] }), /obligatorios/);
  await assert.rejects(() => crearTransferencia({ tx, origenId: 1, destinoId: 2, items: [] }),
    /No se generaron detalles v.lidos/);
  await assert.rejects(() => crearTransferencia({ tx, origenId: 1, destinoId: 2 }),
    /No se generaron detalles v.lidos/);
  assert.equal(tx.calls.transferenciaCreate.length, 0);
});

test("ítem sin baseId conserva el mensaje del handler original", async () => {
  const tx = fakeTx();
  await assert.rejects(
    () => crearTransferencia({ tx, ...BASE_ARGS, items: [{ ...item(), baseId: null }] }),
    /Producto sin baseId asignado/
  );
});

test("ítem sin ProductoLocal de origen es rechazado antes de escribir", async () => {
  const tx = fakeTx();
  await assert.rejects(
    () => crearTransferencia({ tx, ...BASE_ARGS, items: [{ ...item(), productoLocalOrigenId: null }] }),
    /ProductoLocal de origen/
  );
  assert.equal(tx.calls.stockLocalUpsert.length, 0);
  assert.equal(tx.calls.transferenciaCreate.length, 0);
});

// ── 8. Regresión del flujo manual: contrato con enviar/route.js ─────────────
// La ruta conserva las responsabilidades que NO deben moverse al servicio. Se
// verifica por inspección del fuente (no hay infraestructura para levantar Next).

const RUTA = path.join(ROOT, "app/api/pos-transferencias/enviar/route.js");
const fuenteRuta = fs.readFileSync(RUTA, "utf8");

test("la ruta delega en el servicio con DESCONTAR_Y_TRANSITO", () => {
  assert.match(fuenteRuta, /crearTransferencia\(\{/);
  assert.match(fuenteRuta, /politicaStockOrigen:\s*DESCONTAR_Y_TRANSITO/);
  assert.match(fuenteRuta, /posTransferenciaId:\s*pos\.id/);
  assert.match(fuenteRuta, /creadoPorId:\s*pos\.usuarioId/);
});

test("la ruta ya no crea la transferencia ni mueve stock por su cuenta", () => {
  assert.equal(/tx\.transferencia\.create/.test(fuenteRuta), false, "la creación debe vivir en el servicio");
  assert.equal(/tx\.stockLocal\.upsert/.test(fuenteRuta), false, "el movimiento de stock debe vivir en el servicio");
  assert.equal(/tx\.productoLocal\.upsert/.test(fuenteRuta), false, "el upsert del destino debe vivir en el servicio");
});

test("la barrera atómica contra doble envío sigue en la ruta", () => {
  assert.match(fuenteRuta, /posTransferencia\.updateMany/);
  assert.match(fuenteRuta, /estado:\s*\{\s*in:\s*\["Borrador",\s*"Preparando",\s*"Solicitado"\]\s*\}/);
  assert.match(fuenteRuta, /data:\s*\{\s*estado:\s*"Enviando"\s*\}/);
  assert.match(fuenteRuta, /lock\.count === 0/);
  assert.match(fuenteRuta, /ALREADY_SENT/);
});

test("la ruta sigue abriendo una única transacción y llama al servicio dentro", () => {
  const aperturas = fuenteRuta.match(/prisma\.\$transaction/g) || [];
  assert.equal(aperturas.length, 1, "una sola transacción");
  const iTx = fuenteRuta.indexOf("prisma.$transaction");
  const iSvc = fuenteRuta.indexOf("crearTransferencia({");
  assert.ok(iSvc > iTx, "la llamada al servicio debe estar dentro de la transacción");
});

test("la ruta conserva permisos, scope, estados, combos, validarEnvio y stock negativo", () => {
  assert.match(fuenteRuta, /checkPerm\(session, "pos_transferencias\.enviar"\)/);
  assert.match(fuenteRuta, /No autorizado para esta transferencia/);
  assert.match(fuenteRuta, /es_deposito/);
  assert.match(fuenteRuta, /\["Borrador", "Preparando", "Solicitado"\]\.includes\(pos\.estado\)/);
  assert.match(fuenteRuta, /esComboBase\(base\)/);
  assert.match(fuenteRuta, /COMBO_NO_TRANSFERIBLE/);
  assert.match(fuenteRuta, /validarEnvio\(\{/);
  assert.match(fuenteRuta, /allowNegativeStock/);
  assert.match(fuenteRuta, /STOCK_INSUFICIENTE/);
});

test("la ruta sigue cerrando la POS en Enviado y conserva sus respuestas HTTP", () => {
  assert.match(fuenteRuta, /posTransferencia\.update\(\{[\s\S]*?estado:\s*"Enviado"/);
  assert.match(fuenteRuta, /Esta transferencia ya fue enviada\./);
  assert.match(fuenteRuta, /Los combos no se transfieren/);
  assert.match(fuenteRuta, /Error interno al enviar POS/);
  assert.match(fuenteRuta, /ok:\s*true,\s*\n?\s*item:\s*transferencia/);
});

test("el servicio no conoce HTTP, sesión, permisos ni PosTransferencia", () => {
  const svc = fs.readFileSync(path.join(AQUI, "crearTransferencia.js"), "utf8");
  for (const prohibido of [
    "NextResponse", "getUsuarioSession", "checkPerm", "requirePerm",
    "req.json", "posTransferencia.findUnique", "posTransferencia.update",
    "posTransferencia.updateMany", "prisma.$transaction", "status: 4", "status: 5",
  ]) {
    assert.equal(svc.includes(prohibido), false, `el servicio no debería mencionar "${prohibido}"`);
  }
  // Sí debe aceptar el vínculo con la POS como dato.
  assert.match(svc, /posTransferenciaId/);
});
