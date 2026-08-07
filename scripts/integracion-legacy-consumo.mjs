// Harness: reconstrucción de consumo LEGACY en corrección completa.
// Cubre: #823-like (depósito SOLO_BULTO factor 2, precioCosto=costoBulto → auto
// BULTO, cantidadStock 2), ambiguo (MIXTO sin coincidencia → editar ambiguo +
// bloqueo si se toca sin confirmar + resolución con modalidad manual), y local
// (auto-reconstruye). Verifica que el revert usa la cantidad reconstruida.
// Uso: DATABASE_URL=...erpazul_term_test AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-legacy-consumo.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";

const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

async function post(path, body) {
  const t = jwt.sign({ id: S.admin, rolId: S.rol, permisos: ["*"], esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  const ck = `erpazul_sesion=${t}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: S.dep }))}`;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: ck, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function get(path, localId) {
  const t = jwt.sign({ id: S.admin, rolId: S.rol, permisos: ["*"], esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  const ck = `erpazul_sesion=${t}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId }))}`;
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: ck } });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function truncate() { const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`); const n = rows.map((r) => `"${r.tablename}"`).join(", "); if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`); }
const stockDe = async (pl) => Number((await prisma.stockLocal.findFirst({ where: { productoId: pl } }))?.cantidad ?? 0);

async function prod(localId, nombre, { precio, costo, factor = 1, modoEnvio = null, stock = 10 }) {
  const base = await prisma.productoBase.create({ data: { grupoId: S.g, nombre, unidad_medida: "pack", precio_costo: costo, precio_venta: precio, factor_pack: factor, modo_envio: modoEnvio, modoVentaDeposito: "PESO" } });
  const pl = await prisma.productoLocal.create({ data: { localId, baseId: base.id, precio_venta: precio, precio_costo: costo } });
  await prisma.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: stock } });
  return { baseId: base.id, plId: pl.id, nombre, precio, costo };
}
// venta LEGACY: cantidadStock null, productoLocalId null.
async function ventaLegacy({ localId, numero, detalles }) {
  const total = detalles.reduce((a, d) => a + d.precio * d.cantidad, 0);
  const v = await prisma.venta.create({ data: { localId, vendedorId: S.admin, turnoId: S.turno, numero, subtotal: total, total, formaPago: "efectivo", version: 0 } });
  for (const d of detalles) {
    await prisma.ventaDetalle.create({ data: { ventaId: v.id, productoBaseId: d.baseId, nombre: d.nombre, precio: d.precio, precioCosto: d.precioCosto, cantidad: d.cantidad, subtotal: d.precio * d.cantidad, productoLocalId: null, cantidadStock: null } });
  }
  await prisma.ventaPago.create({ data: { ventaId: v.id, medio: "EFECTIVO", monto: total, neto: total } });
  const dets = await prisma.ventaDetalle.findMany({ where: { ventaId: v.id }, orderBy: { id: "asc" } });
  return { id: v.id, detalleIds: dets.map((x) => x.id) };
}

async function seed() {
  await truncate();
  const rol = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"] } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const dep = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const loc = await prisma.local.create({ data: { nombre: "Local", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: dep.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: loc.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "A", email: "a@t.test", passwordHash: "x", rolId: rol.id } });
  const turno = await prisma.turno.create({ data: { localId: dep.id, vendedorId: admin.id, montoInicial: 0 } });
  const turnoLoc = await prisma.turno.create({ data: { localId: loc.id, vendedorId: admin.id, montoInicial: 0 } });
  Object.assign(S, { g: g.id, dep: dep.id, loc: loc.id, admin: admin.id, rol: rol.id, turno: turno.id, turnoLoc: turnoLoc.id });

  // Producto #823-like: depósito, factor 2, SOLO_BULTO, costo bulto 82000.
  S.P = await prod(dep.id, "Aceite 10L", { precio: 106600, costo: 82000, factor: 2, modoEnvio: "SOLO_BULTO", stock: 10 });
  // Producto de reemplazo (destino) en depósito.
  S.Q = await prod(dep.id, "Otro dep", { precio: 5000, costo: 3000, factor: 1, modoEnvio: "SOLO_UNIDAD", stock: 10 });
  // Producto AMBIGUO: depósito, factor 2, MIXTO, costo bulto 500 (unidad 250).
  S.M = await prod(dep.id, "Mixto", { precio: 800, costo: 500, factor: 2, modoEnvio: "MIXTO", stock: 20 });
  // Producto local.
  S.L = await prod(loc.id, "Prod local", { precio: 100, costo: 50, factor: 1, stock: 30 });

  // V1: #823-like (P x1, precioCosto=82000=costoBulto → BULTO → cantidadStock 2)
  S.v1 = await ventaLegacy({ localId: dep.id, numero: 823, detalles: [{ baseId: S.P.baseId, nombre: "Aceite 10L", precio: 82000, precioCosto: 82000, cantidad: 1 }] });
  // V2: ambiguo (M x1, precioCosto=999 no matchea 500 ni 250)
  S.v2 = await ventaLegacy({ localId: dep.id, numero: 2, detalles: [{ baseId: S.M.baseId, nombre: "Mixto", precio: 999, precioCosto: 999, cantidad: 1 }] });
  // V3: local (L x3)
  S.v3 = await ventaLegacy({ localId: loc.id, numero: 3, detalles: [{ baseId: S.L.baseId, nombre: "Prod local", precio: 100, precioCosto: 50, cantidad: 3 }] });
}

async function run() {
  await seed();

  // 1) editar V1 → línea reconstruida BULTO, cantidadFisica 2, NO ambigua
  const e1 = await get(`/api/pos-ventas/venta/${S.v1.id}/editar`, S.dep);
  const l1 = e1.j?.venta?.lineas?.[0];
  ok("V1 editar: estado reconstruido", l1?.reconstruccion?.estado === "reconstruido", JSON.stringify(l1?.reconstruccion));
  ok("V1 editar: modalidad BULTO, cantidadFisica 2", l1?.reconstruccion?.modalidad === "BULTO" && l1?.reconstruccion?.cantidadFisica === 2);
  ok("V1 editar: NO legacyAmbiguo", l1?.legacyAmbiguo === false);

  // 2) corregir V1: reemplazar P por Q (qty 1) → revert usa 2 → stock P +2
  const pAntes = await stockDe(S.P.plId), qAntes = await stockDe(S.Q.plId);
  const r1 = await post(`/api/pos-ventas/venta/${S.v1.id}/corregir`, { motivo: "reemplazo", idempotencyKey: "k-v1", version: 0, lineas: [{ origenDetalleId: S.v1.detalleIds[0], productoBaseId: S.Q.baseId, cantidad: 1, precio: 5000, precioCosto: 3000 }], pagos: [{ medio: "EFECTIVO", monto: 5000 }] });
  ok("V1 corregir → 200 (legacy auto-reconstruido, sin bloqueo)", r1.status === 200, JSON.stringify(r1.j?.code || r1.j?.error));
  ok("V1: stock P revertido +2 (reconstruido, no +1)", (await stockDe(S.P.plId)) === pAntes + 2, `antes ${pAntes} ahora ${await stockDe(S.P.plId)}`);
  ok("V1: stock Q -1", (await stockDe(S.Q.plId)) === qAntes - 1);
  const vc1 = await prisma.ventaCorreccion.findFirst({ where: { ventaId: S.v1.id } });
  ok("V1: reconstrucción registrada en snapshot", !!vc1?.snapshotAntes?.reconstruccionLegacy?.[0] && vc1.snapshotAntes.reconstruccionLegacy[0].modalidad === "BULTO");

  // 3) editar V2 → ambiguo con modalidadesPosibles
  const e2 = await get(`/api/pos-ventas/venta/${S.v2.id}/editar`, S.dep);
  const l2 = e2.j?.venta?.lineas?.[0];
  ok("V2 editar: estado ambiguo", l2?.reconstruccion?.estado === "ambiguo", JSON.stringify(l2?.reconstruccion));
  ok("V2 editar: 2 modalidades posibles (BULTO 2, UNIDAD 1)", (l2?.reconstruccion?.modalidadesPosibles || []).length === 2);

  // 4) revisar V2 tocando la línea SIN confirmar → bloqueo_legacy con opciones
  const r2 = await post(`/api/pos-ventas/venta/${S.v2.id}/revisar`, { version: 0, lineas: [{ origenDetalleId: S.v2.detalleIds[0], productoBaseId: S.M.baseId, cantidad: 2, precio: 999, precioCosto: 999 }], pagos: [{ medio: "EFECTIVO", monto: 1998 }] });
  ok("V2 revisar sin confirmar: bloqueoLegacy + opciones", (r2.j?.bloqueosLegacy || []).length === 1 && (r2.j.bloqueosLegacy[0].modalidadesPosibles || []).length === 2 && r2.j?.puedeConfirmar === false);

  // 5) revisar V2 CON modalidad manual BULTO → sin bloqueo
  const r3 = await post(`/api/pos-ventas/venta/${S.v2.id}/revisar`, { version: 0, confirmaciones: [{ origenDetalleId: S.v2.detalleIds[0], modalidad: "BULTO" }], lineas: [{ origenDetalleId: S.v2.detalleIds[0], productoBaseId: S.M.baseId, cantidad: 2, precio: 999, precioCosto: 999 }], pagos: [{ medio: "EFECTIVO", monto: 1998 }] });
  ok("V2 revisar con modalidad BULTO: sin bloqueo, puedeConfirmar", (r3.j?.bloqueosLegacy || []).length === 0 && r3.j?.puedeConfirmar === true, JSON.stringify(r3.j?.bloqueosLegacy));

  // 6) corregir V2 con confirmación manual → aplica + registra confirmadaManualmente
  const mAntes = await stockDe(S.M.plId);
  const r4 = await post(`/api/pos-ventas/venta/${S.v2.id}/corregir`, { motivo: "confirmo bulto", idempotencyKey: "k-v2", version: 0, confirmaciones: [{ origenDetalleId: S.v2.detalleIds[0], modalidad: "BULTO" }], lineas: [{ origenDetalleId: S.v2.detalleIds[0], productoBaseId: S.M.baseId, cantidad: 2, precio: 999, precioCosto: 999 }], pagos: [{ medio: "EFECTIVO", monto: 1998 }] });
  ok("V2 corregir con manual BULTO → 200", r4.status === 200, JSON.stringify(r4.j?.code));
  // original consumo BULTO = 1×2 = 2; nuevo = 2×2 = 4; delta = -2
  ok("V2: stock M delta -2 (revert 2, reapply 4)", (await stockDe(S.M.plId)) === mAntes - 2, `antes ${mAntes} ahora ${await stockDe(S.M.plId)}`);
  const vc2 = await prisma.ventaCorreccion.findFirst({ where: { ventaId: S.v2.id } });
  ok("V2: confirmadaManualmente + confirmadaPor en snapshot", vc2?.snapshotAntes?.reconstruccionLegacy?.[0]?.confirmadaManualmente === true && vc2.snapshotAntes.reconstruccionLegacy[0].confirmadaPor === S.admin);

  // 7) editar V3 (local) → auto-reconstruido, cantidadFisica 3
  const e3 = await get(`/api/pos-ventas/venta/${S.v3.id}/editar`, S.loc);
  const l3 = e3.j?.venta?.lineas?.[0];
  ok("V3 (local) editar: reconstruido, cantidadFisica 3", l3?.reconstruccion?.estado === "reconstruido" && l3?.reconstruccion?.cantidadFisica === 3);

  console.log(`\nRESULTADO LEGACY-CONSUMO: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
