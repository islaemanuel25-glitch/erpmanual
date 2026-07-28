// Harness B2: endpoints editar + revisar de la corrección COMPLETA (SIN escrituras).
// Verifica el contrato de editar, la regla "solo turno abierto", el bloqueo optimista,
// el diff/impacto de stock de revisar y el bloqueo de líneas legacy.
// Uso: DATABASE_URL=<test> AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-correccion-completa-b2.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: no test DB"); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

async function post(path, ck, body) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: ck, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function get(path, ck) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: ck } });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function truncate() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);
}
const ckAdmin = () => {
  const t = jwt.sign({ id: S.admin, rolId: S.rol, permisos: ["*"], esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: S.local }))}`;
};
// Usuario con permiso "*" pero NO en el feature flag beta (id 999999) → debe 403.
const ckNoBeta = () => {
  const t = jwt.sign({ id: 999999, rolId: S.rol, permisos: ["*"], esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: S.local }))}`;
};

async function prod(nombre, { combo = false } = {}) {
  const base = await prisma.productoBase.create({ data: { grupoId: S.g, nombre, unidad_medida: "unidad", precio_costo: 25, precio_venta: 100, es_combo: combo } });
  const pl = await prisma.productoLocal.create({ data: { localId: S.local, baseId: base.id, precio_venta: 100 } });
  if (!combo) await prisma.stockLocal.create({ data: { localId: S.local, productoId: pl.id, cantidad: nombre === "A" ? 8 : nombre === "B" ? 5 : 9 } });
  return { baseId: base.id, plId: pl.id };
}

async function seed() {
  await truncate();
  const rol = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"] } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "Adm", email: "a@t.test", passwordHash: "x", rolId: rol.id } });
  Object.assign(S, { g: g.id, local: local.id, admin: admin.id, rol: rol.id });

  const A = await prod("A"); const B = await prod("B"); const D = await prod("D");
  const C = await prod("Combo", { combo: true });
  S.A = A; S.B = B; S.D = D; S.C = C;
  // Composición del combo: B x2 + D x1.
  await prisma.comboComponente.create({ data: { comboProductoLocalId: C.plId, comboLocalId: local.id, componenteProductoLocalId: B.plId, componenteLocalId: local.id, cantidad: 2 } });
  await prisma.comboComponente.create({ data: { comboProductoLocalId: C.plId, comboLocalId: local.id, componenteProductoLocalId: D.plId, componenteLocalId: local.id, cantidad: 1 } });

  const tAbierto = await prisma.turno.create({ data: { localId: local.id, vendedorId: admin.id, montoInicial: 0 } });
  const tCerrado = await prisma.turno.create({ data: { localId: local.id, vendedorId: admin.id, montoInicial: 0, cierre: new Date() } });
  S.tAbierto = tAbierto.id; S.tCerrado = tCerrado.id;

  // V1: venta congelada en turno ABIERTO. A x2 + B x3 suelto + Combo C x1 (comp B2,D1).
  const v1 = await prisma.venta.create({ data: { localId: local.id, vendedorId: admin.id, turnoId: tAbierto.id, numero: 1, subtotal: 650, total: 650, formaPago: "efectivo", version: 0 } });
  const dA = await prisma.ventaDetalle.create({ data: { ventaId: v1.id, productoBaseId: A.baseId, nombre: "A", precio: 100, precioCosto: 25, cantidad: 2, subtotal: 200, productoLocalId: A.plId, cantidadStock: 2 } });
  const dB = await prisma.ventaDetalle.create({ data: { ventaId: v1.id, productoBaseId: B.baseId, nombre: "B", precio: 50, precioCosto: 25, cantidad: 3, subtotal: 150, productoLocalId: B.plId, cantidadStock: 3 } });
  const dC = await prisma.ventaDetalle.create({ data: { ventaId: v1.id, productoBaseId: C.baseId, nombre: "Combo", precio: 300, precioCosto: 75, cantidad: 1, subtotal: 300, productoLocalId: null, cantidadStock: null } });
  await prisma.ventaDetalleComponente.create({ data: { ventaDetalleId: dC.id, productoBaseId: B.baseId, productoLocalId: B.plId, cantidad: 2 } });
  await prisma.ventaDetalleComponente.create({ data: { ventaDetalleId: dC.id, productoBaseId: D.baseId, productoLocalId: D.plId, cantidad: 1 } });
  await prisma.ventaPago.create({ data: { ventaId: v1.id, medio: "EFECTIVO", monto: 650, neto: 650 } });
  S.v1 = v1.id; S.dA = dA.id; S.dB = dB.id; S.dC = dC.id;

  // V2: venta en turno CERRADO.
  const v2 = await prisma.venta.create({ data: { localId: local.id, vendedorId: admin.id, turnoId: tCerrado.id, numero: 2, subtotal: 100, total: 100, formaPago: "efectivo", version: 0 } });
  await prisma.ventaDetalle.create({ data: { ventaId: v2.id, productoBaseId: A.baseId, nombre: "A", precio: 100, precioCosto: 25, cantidad: 1, subtotal: 100, productoLocalId: A.plId, cantidadStock: 1 } });
  await prisma.ventaPago.create({ data: { ventaId: v2.id, medio: "EFECTIVO", monto: 100, neto: 100 } });
  S.v2 = v2.id;

  // V3: venta LEGACY (cantidadStock null) en turno abierto.
  const v3 = await prisma.venta.create({ data: { localId: local.id, vendedorId: admin.id, turnoId: tAbierto.id, numero: 3, subtotal: 200, total: 200, formaPago: "efectivo", version: 0 } });
  const d3 = await prisma.ventaDetalle.create({ data: { ventaId: v3.id, productoBaseId: A.baseId, nombre: "A", precio: 100, precioCosto: 25, cantidad: 2, subtotal: 200, productoLocalId: null, cantidadStock: null } });
  await prisma.ventaPago.create({ data: { ventaId: v3.id, medio: "EFECTIVO", monto: 200, neto: 200 } });
  S.v3 = v3.id; S.d3 = d3.id;
}

const deltaDe = (arr, pl) => { const f = (arr || []).find((x) => x.productoLocalId === pl); return f ? f.delta : 0; };

async function run() {
  await seed();
  const ck = ckAdmin();

  // 1) editar V1 (turno abierto)
  const e1 = await get(`/api/pos-ventas/venta/${S.v1}/editar`, ck);
  ok("editar V1 → 200", e1.status === 200, JSON.stringify(e1.j?.error));
  ok("editar V1: turnoAbierto true + puedeCorregirCompleta true", e1.j?.turno?.turnoAbierto === true && e1.j?.correccion?.puedeCorregirCompleta === true);
  ok("editar V1: 3 líneas", (e1.j?.venta?.lineas || []).length === 3);
  const lineaA = e1.j.venta.lineas.find((l) => l.detalleId === S.dA);
  const lineaC = e1.j.venta.lineas.find((l) => l.detalleId === S.dC);
  ok("editar V1: A cantidadStock=2", Number(lineaA?.cantidadStock) === 2);
  ok("editar V1: Combo esCombo + cantidadStock null + 2 componentes", lineaC?.esCombo === true && lineaC?.cantidadStock === null && lineaC?.componentes?.length === 2);
  ok("editar V1: sin líneas legacy ambiguas", e1.j?.correccion?.hayLineasLegacyAmbiguas === false);

  // 2) editar V2 (turno cerrado)
  const e2 = await get(`/api/pos-ventas/venta/${S.v2}/editar`, ck);
  ok("editar V2: puedeCorregirCompleta false", e2.j?.correccion?.puedeCorregirCompleta === false);
  ok("editar V2: motivo turno_cerrado_no_corregible", e2.j?.correccion?.motivoBloqueo === "turno_cerrado_no_corregible" && !!e2.j?.correccion?.mensajeBloqueo);

  // 3) editar V3 (legacy)
  const e3 = await get(`/api/pos-ventas/venta/${S.v3}/editar`, ck);
  ok("editar V3: hay línea legacy ambigua", e3.j?.correccion?.hayLineasLegacyAmbiguas === true && e3.j.venta.lineas[0].legacyAmbiguo === true);

  // 4) revisar V1: reducir A 2→1 (B y C preservados), pagos 550
  const r4 = await post(`/api/pos-ventas/venta/${S.v1}/revisar`, ck, {
    version: 0,
    cliente: null,
    lineas: [
      { origenDetalleId: S.dA, productoBaseId: S.A.baseId, cantidad: 1, precio: 100, precioCosto: 25 },
      { origenDetalleId: S.dB, productoBaseId: S.B.baseId, cantidad: 3, precio: 50, precioCosto: 25 },
      { origenDetalleId: S.dC, productoBaseId: S.C.baseId, cantidad: 1, precio: 300 },
    ],
    pagos: [{ medio: "EFECTIVO", monto: 550 }],
  });
  ok("revisar V1 reduce A → 200", r4.status === 200, JSON.stringify(r4.j?.error || r4.j?.code));
  ok("revisar V1: modificadas 1 / preservadas 2", r4.j?.diff?.clasificacion?.modificadas === 1 && r4.j?.diff?.clasificacion?.preservadas === 2);
  ok("revisar V1: impacto stock A delta +1 (devuelve 1)", deltaDe(r4.j?.impactoStock, S.A.plId) === 1);
  ok("revisar V1: total 650→550, diferencia -100", r4.j?.totales?.totalAnterior === 650 && r4.j?.totales?.totalNuevo === 550 && r4.j?.totales?.diferencia === -100);
  ok("revisar V1: puedeConfirmar true", r4.j?.puedeConfirmar === true);

  // 5) revisar V1 versión stale → 409
  const r5 = await post(`/api/pos-ventas/venta/${S.v1}/revisar`, ck, { version: 9, lineas: [{ origenDetalleId: S.dA, productoBaseId: S.A.baseId, cantidad: 1, precio: 100 }], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("revisar V1 versión stale → 409 conflicto_version", r5.status === 409 && r5.j?.code === "conflicto_version");

  // 6) revisar V2 turno cerrado → 409
  const r6 = await post(`/api/pos-ventas/venta/${S.v2}/revisar`, ck, { version: 0, lineas: [{ origenDetalleId: null, productoBaseId: S.A.baseId, cantidad: 1, precio: 100 }], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("revisar V2 turno cerrado → 409 turno_cerrado_no_corregible", r6.status === 409 && r6.j?.code === "turno_cerrado_no_corregible");

  // 7) revisar V1 agregar producto D nuevo (x2), total 790
  const r7 = await post(`/api/pos-ventas/venta/${S.v1}/revisar`, ck, {
    version: 0,
    lineas: [
      { origenDetalleId: S.dA, productoBaseId: S.A.baseId, cantidad: 2, precio: 100, precioCosto: 25 },
      { origenDetalleId: S.dB, productoBaseId: S.B.baseId, cantidad: 3, precio: 50, precioCosto: 25 },
      { origenDetalleId: S.dC, productoBaseId: S.C.baseId, cantidad: 1, precio: 300 },
      { origenDetalleId: null, productoBaseId: S.D.baseId, cantidad: 2, precio: 70, precioCosto: 25 },
    ],
    pagos: [{ medio: "EFECTIVO", monto: 790 }],
  });
  ok("revisar V1 agregar D: agregadas 1 + delta D -2 + diff +140", r7.j?.diff?.clasificacion?.agregadas === 1 && deltaDe(r7.j?.impactoStock, S.D.plId) === -2 && r7.j?.totales?.diferencia === 140);

  // 8) revisar V3 legacy tocado → bloqueo
  const r8 = await post(`/api/pos-ventas/venta/${S.v3}/revisar`, ck, { version: 0, lineas: [{ origenDetalleId: S.d3, productoBaseId: S.A.baseId, cantidad: 1, precio: 100 }], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("revisar V3 legacy tocado: bloqueoLegacy + no confirmar", (r8.j?.bloqueosLegacy || []).length === 1 && r8.j?.puedeConfirmar === false);

  // 9) revisar V1 pagos no cuadran
  const r9 = await post(`/api/pos-ventas/venta/${S.v1}/revisar`, ck, {
    version: 0,
    lineas: [
      { origenDetalleId: S.dA, productoBaseId: S.A.baseId, cantidad: 1, precio: 100 },
      { origenDetalleId: S.dB, productoBaseId: S.B.baseId, cantidad: 3, precio: 50 },
      { origenDetalleId: S.dC, productoBaseId: S.C.baseId, cantidad: 1, precio: 300 },
    ],
    pagos: [{ medio: "EFECTIVO", monto: 999 }],
  });
  ok("revisar V1 pagos no cuadran → no confirmar", r9.j?.pagos?.cuadran === false && r9.j?.puedeConfirmar === false);

  // 10) Feature flag: usuario fuera del beta → 403 en editar y revisar (aunque tenga "*").
  const fe = await get(`/api/pos-ventas/venta/${S.v1}/editar`, ckNoBeta());
  ok("flag off (no-beta) editar → 403 correccion_completa_no_habilitada", fe.status === 403 && fe.j?.code === "correccion_completa_no_habilitada", `status=${fe.status}`);
  const fr = await post(`/api/pos-ventas/venta/${S.v1}/revisar`, ckNoBeta(), { version: 0, lineas: [{ origenDetalleId: S.dA, productoBaseId: S.A.baseId, cantidad: 1, precio: 100 }], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("flag off (no-beta) revisar → 403", fr.status === 403 && fr.j?.code === "correccion_completa_no_habilitada", `status=${fr.status}`);

  console.log(`\nRESULTADO B2 (editar/revisar): ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
