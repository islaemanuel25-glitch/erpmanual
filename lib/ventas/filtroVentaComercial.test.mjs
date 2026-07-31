// Tests del filtro que separa VENTA COMERCIAL de OPERACIÓN INTERNA.
//
// Contexto: cuando el POS del depósito le vende a un Cliente vinculado a un local
// propio, se crea Venta + VentaPago + Transferencia. Esa Venta no es una venta:
// infla los reportes y —sobre todo— suma al EFECTIVO ESPERADO del turno un cobro
// que nunca ocurrió, generando un faltante de caja inexistente.
//
// Caso real: turno 156 del depósito, 12 ventas, 4 internas por $80.000 en
// efectivo. Esperado antes $1.896.847,53 / comercial real $1.816.847,53.
//
// Los tests de integración se hacen sobre el CÓDIGO FUENTE de los endpoints (sin
// comentarios): son invariantes estructurales —"este endpoint filtra", "aquel no
// debe filtrar"— y afirmarlas acá evita que una edición futura las rompa en
// silencio o que un endpoint nuevo quede afuera.
//
// Correr con: node --test lib/ventas/filtroVentaComercial.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  soloComercial,
  soloInterna,
  whereVentaComercial,
  relacionVentaComercial,
  evaluarVentaComercial,
  SELECT_MARCA_INTERNA,
} from "./filtroVentaComercial.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// Clasificación A + B: deben filtrar.
const COMERCIALES = [
  "app/api/reportes-ventas/general/route.js",
  "app/api/reportes-ventas/listado/route.js",
  "app/api/reportes-ventas/por-cliente/route.js",
  "app/api/dashboard/resumen/route.js",
  "app/api/dashboard/actividad/route.js",
  "app/api/dashboard/ventas-recientes/route.js",
  "app/api/clientes/analytics/ranking/route.js",
  "app/api/clientes/analytics/inactivos/route.js",
  "app/api/pos-ventas/stats-dia/route.js",
  "app/api/pos-ventas/historial-dia/route.js",
];
const CAJA = [
  "app/api/pos-ventas/turnos/cerrar/route.js",
  "app/api/pos-ventas/turnos/resumen/route.js",
  "app/api/pos-ventas/turnos/ventas/route.js",
];
// Clasificación C + D: NO deben filtrar.
const TECNICOS = [
  "app/api/auditoria-pos-ventas/balances/route.js",
  "app/api/auditoria-pos-ventas/cajas/route.js",
  "app/api/auditoria-pos-ventas/medios/route.js",
  "app/api/auditoria-pos-ventas/operadores/route.js",
  "app/api/auditoria-pos-ventas/resumen/route.js",
  "app/api/auditoria-pos-ventas/turnos/route.js",
  "app/api/auditoria-pos-ventas/turnos/personas/route.js",
  "app/api/auditoria-pos-ventas/turnos/sin-turno/route.js",
  "app/api/clientes/[id]/ventas/route.js",
  "app/api/admin/reset-operativo/route.js",
];

// Ventas de ejemplo: la relación `transferencia` es la ÚNICA marca.
const normal = (extra = {}) => ({ id: 1, total: 100, transferencia: null, ...extra });
const interna = (extra = {}) => ({ id: 2, total: 100, transferencia: { id: 9 }, ...extra });

// ── Clasificación ────────────────────────────────────────────────────────────

test("1. venta sin Transferencia → comercial", () => {
  assert.equal(evaluarVentaComercial(normal()).esComercial, true);
});

test("2. venta con Transferencia vinculada → interna", () => {
  assert.equal(evaluarVentaComercial(interna()).esComercial, false);
});

test("3. la condición Prisma apunta a la relación, no a campos heurísticos", () => {
  assert.deepEqual(soloComercial(), { transferencia: { is: null } });
  assert.deepEqual(soloInterna(), { transferencia: { isNot: null } });
});

test("3b. una Transferencia sin ventaId no marca ninguna venta", () => {
  // Manual/automática: ventaId null → del lado de Venta, `transferencia` es null.
  assert.equal(evaluarVentaComercial(normal()).esComercial, true);
});

test("4. venta histórica interna se excluye sin backfill (la relación ya existe)", () => {
  // 1324..1327 tienen Transferencia 3..6. No hace falta ningún campo nuevo.
  for (const id of [1324, 1325, 1326, 1327]) {
    assert.equal(evaluarVentaComercial(interna({ id })).esComercial, false);
  }
});

test("4b. si no se pidió la relación, NO se asume comercial", () => {
  const sinRelacion = { id: 1, total: 100 };
  const r = evaluarVentaComercial(sinRelacion);
  assert.equal(r.resoluble, false);
  assert.equal(r.esComercial, false, "asumir comercial marcaría una interna como venta");
});

// ── Composición del where ────────────────────────────────────────────────────

test("5. whereVentaComercial no muta el where base y agrega la condición", () => {
  const base = { turnoId: 156 };
  const out = whereVentaComercial(base);
  assert.deepEqual(out, { turnoId: 156, transferencia: { is: null } });
  assert.deepEqual(base, { turnoId: 156 }, "el objeto original no se toca");
});

test("5b. respeta un `transferencia` explícito del llamador", () => {
  const out = whereVentaComercial({ transferencia: { isNot: null } });
  assert.deepEqual(out, { transferencia: { isNot: null } });
});

test("5c. tolera where vacío o inválido", () => {
  assert.deepEqual(whereVentaComercial(), { transferencia: { is: null } });
  assert.deepEqual(whereVentaComercial(null), { transferencia: { is: null } });
});

test("5d. relacionVentaComercial sirve para modelos que llegan por relación", () => {
  assert.deepEqual(relacionVentaComercial("venta", { localId: 1 }), {
    venta: { localId: 1, transferencia: { is: null } },
  });
});

// ── Reportes: filtros preservados ────────────────────────────────────────────

test("14-16. fecha, local y paginación siguen en el where junto al filtro", () => {
  const out = whereVentaComercial({
    localId: 1,
    fecha: { gte: "A", lte: "B" },
    clienteId: 5,
  });
  assert.equal(out.localId, 1);
  assert.deepEqual(out.fecha, { gte: "A", lte: "B" });
  assert.equal(out.clienteId, 5);
  assert.deepEqual(out.transferencia, { is: null });
});

test("16b. la paginación no vive en el where: skip/take quedan intactos", () => {
  const src = leerSinComentarios("app/api/reportes-ventas/listado/route.js");
  assert.ok(/skip/.test(src) && /take/.test(src));
  // count y findMany deben usar el MISMO filtro o la paginación miente.
  assert.ok(src.includes("prisma.venta.count({ where: whereVentaComercial(where) })"));
  assert.ok(/prisma\.venta\.findMany\(\{\s*where: whereVentaComercial\(where\),/.test(src));
});

// ── Cobertura de endpoints ───────────────────────────────────────────────────

test("5-13. todos los endpoints comerciales aplican el filtro", () => {
  for (const ruta of COMERCIALES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      src.includes("filtroVentaComercial"),
      `${ruta} no importa el helper`
    );
    const consultas = (src.match(/prisma\.venta\.(findMany|aggregate|groupBy|count)/g) || []).length;
    const usos = (src.match(/whereVentaComercial\(/g) || []).length;
    assert.ok(usos >= consultas, `${ruta}: ${consultas} consultas y solo ${usos} filtros`);
  }
});

test("17-25. los tres endpoints de turno aplican el MISMO filtro", () => {
  for (const ruta of CAJA) {
    const src = leerSinComentarios(ruta);
    assert.ok(src.includes("whereVentaComercial({ turnoId })"), `${ruta} debe filtrar por turno`);
    assert.ok(
      !/prisma\.venta\.findMany\(\{\s*where: \{ turnoId \}/.test(src),
      `${ruta} conserva la consulta sin filtrar`
    );
  }
});

test("24. resumen y cierre usan literalmente la misma expresión", () => {
  const cerrar = leerSinComentarios("app/api/pos-ventas/turnos/cerrar/route.js");
  const resumen = leerSinComentarios("app/api/pos-ventas/turnos/resumen/route.js");
  const expr = "whereVentaComercial({ turnoId })";
  assert.ok(cerrar.includes(expr) && resumen.includes(expr),
    "si divergen, el operador ve un esperado y el cierre calcula otro");
});

test("8-9. las agregaciones de ítems por relación también filtran", () => {
  for (const ruta of ["app/api/dashboard/resumen/route.js", "app/api/pos-ventas/stats-dia/route.js"]) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      /venta: whereVentaComercial\(/.test(src),
      `${ruta}: ventaDetalle.aggregate contaría los ítems de las internas`
    );
  }
});

test("26. la auditoría técnica y el soporte NO filtran", () => {
  for (const ruta of TECNICOS) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !src.includes("whereVentaComercial"),
      `${ruta} es técnico: las internas tienen que seguir viéndose`
    );
  }
});

test("26b. los 23 archivos que consultan Venta están clasificados", () => {
  assert.equal(COMERCIALES.length + CAJA.length + TECNICOS.length, 23);
  for (const ruta of [...COMERCIALES, ...CAJA, ...TECNICOS]) {
    assert.ok(fs.existsSync(path.join(RAIZ, ruta)), `${ruta} no existe`);
  }
});

// ── Regresión: lo que NO debe cambiar ────────────────────────────────────────

test("27-28. el POS sigue creando Venta + VentaPago + Transferencia", () => {
  const src = leerSinComentarios("app/api/pos-ventas/crear/route.js");
  assert.ok(src.includes("tx.venta.create"), "la venta se sigue creando");
  assert.ok(src.includes("tx.ventaPago.createMany"), "el pago se sigue creando");
  assert.ok(src.includes("crearTransferencia"), "la transferencia se sigue creando");
  assert.ok(!src.includes("whereVentaComercial"), "crear no clasifica, solo crea");
});

test("29-31. recepción, stock y transferencias no se tocan", () => {
  for (const ruta of [
    "app/api/transferencias/confirmar-recepcion/route.js",
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/detalle/route.js",
  ]) {
    const src = leerSinComentarios(ruta);
    assert.ok(!src.includes("whereVentaComercial"), `${ruta} no debe filtrar ventas`);
  }
});

test("33. la idempotencia no cambia", () => {
  const src = leerSinComentarios("app/api/pos-ventas/crear/route.js");
  assert.ok(src.includes("clientTxnId"), "sigue el barrera por clientTxnId");
});

test("34-35. el filtro no escribe nada: es solo lectura", () => {
  const src = leerSinComentarios("lib/ventas/filtroVentaComercial.js");
  for (const prohibido of ["prisma", "create", "update", "delete", "upsert", "$transaction"]) {
    assert.ok(!src.includes(prohibido), `el helper no debe mencionar ${prohibido}`);
  }
});

test("SELECT_MARCA_INTERNA trae lo mínimo para clasificar en memoria", () => {
  assert.deepEqual(SELECT_MARCA_INTERNA, { transferencia: { select: { id: true } } });
});

// ── Aritmética del turno 156 (datos reales) ──────────────────────────────────

test("17-23. turno 156: la interna no suma a ningún medio ni al conteo", () => {
  // Réplica de la agregación por tender de turnos/cerrar, sobre datos reales.
  const ventasTurno = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: i, transferencia: null, pagos: [{ medio: "EFECTIVO", monto: 259549.647 }] })),
    { id: 100, transferencia: null, pagos: [{ medio: "CREDITO", monto: 146608.34 }] },
    { id: 1324, transferencia: { id: 3 }, pagos: [{ medio: "EFECTIVO", monto: 9600 }] },
    { id: 1325, transferencia: { id: 4 }, pagos: [{ medio: "EFECTIVO", monto: 28800 }] },
    { id: 1326, transferencia: { id: 5 }, pagos: [{ medio: "EFECTIVO", monto: 9600 }] },
    { id: 1327, transferencia: { id: 6 }, pagos: [{ medio: "EFECTIVO", monto: 32000 }] },
  ];
  const comerciales = ventasTurno.filter((v) => evaluarVentaComercial(v).esComercial);

  assert.equal(ventasTurno.length, 12);
  assert.equal(comerciales.length, 8, "22. la cantidad de tickets excluye las internas");

  const porMedio = {};
  for (const v of comerciales) for (const p of v.pagos) porMedio[p.medio] = (porMedio[p.medio] || 0) + p.monto;

  const fantasma = ventasTurno
    .filter((v) => !evaluarVentaComercial(v).esComercial)
    .flatMap((v) => v.pagos)
    .reduce((a, p) => a + p.monto, 0);

  assert.equal(fantasma, 80000, "los 4 pagos internos suman el efectivo fantasma");
  assert.equal(Math.round(porMedio.EFECTIVO * 100) / 100, 1816847.53, "efectivo comercial real");
  assert.equal(porMedio.CREDITO, 146608.34, "el crédito comercial no se toca");
});

test("18-20. la regla es general: cualquier medio futuro también se excluye", () => {
  for (const medio of ["MERCADOPAGO", "DEBITO", "CREDITO", "TRANSFERENCIA", "QR"]) {
    const v = interna({ pagos: [{ medio, monto: 1000 }] });
    assert.equal(evaluarVentaComercial(v).esComercial, false, `${medio} debe excluirse igual`);
  }
});

test("21. una interna fiada tampoco cuenta como venta comercial", () => {
  assert.equal(evaluarVentaComercial(interna({ esFiado: true })).esComercial, false);
});
