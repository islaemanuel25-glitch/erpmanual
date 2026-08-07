// Harness B3: endpoint corregir (aplica la corrección COMPLETA, transaccional).
// Cubre: stock revert/reaplicación, idempotencia, conflicto de versión, turno
// cerrado (rollback), stock insuficiente (rollback), agregar, cuenta corriente
// (cobrada↔fiada, cambio cliente), puntos (delta + fail-closed), pago mixto,
// legacy bloqueado, e invariantes históricas (mismo ventaId/número, versión++).
// Uso: DATABASE_URL=...erpazul_term_test AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-correccion-completa-b3.mjs

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
  const ck = `erpazul_sesion=${t}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: S.local }))}`;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: ck, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let jj = null; try { jj = await r.json(); } catch {}
  return { status: r.status, j: jj };
}
async function truncate() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);
}
const stockDe = async (pl) => Number((await prisma.stockLocal.findFirst({ where: { localId: S.local, productoId: pl } }))?.cantidad ?? 0);
const saldoPuntos = async (cli) => {
  const a = await prisma.clientePuntoMovimiento.groupBy({ by: ["direccion"], where: { clienteId: cli, localId: S.local }, _sum: { puntos: true } });
  let c = 0, d = 0; for (const r of a) { if (r.direccion === "CREDITO") c = Number(r._sum.puntos || 0); if (r.direccion === "DEBITO") d = Number(r._sum.puntos || 0); } return c - d;
};
const saldoCC = async (cli) => {
  const a = await prisma.movimientoCuenta.groupBy({ by: ["direccion"], where: { clienteId: cli, localId: S.local }, _sum: { monto: true } });
  let deb = 0, cred = 0; for (const r of a) { if (r.direccion === "DEBITO") deb = Number(r._sum.monto || 0); if (r.direccion === "CREDITO") cred = Number(r._sum.monto || 0); } return deb - cred;
};

async function prod(nombre, stock, { combo = false } = {}) {
  const base = await prisma.productoBase.create({ data: { grupoId: S.g, nombre, unidad_medida: "unidad", precio_costo: 20, precio_venta: 100, es_combo: combo } });
  const pl = await prisma.productoLocal.create({ data: { localId: S.local, baseId: base.id, precio_venta: 100 } });
  if (!combo) await prisma.stockLocal.create({ data: { localId: S.local, productoId: pl.id, cantidad: stock } });
  return { baseId: base.id, plId: pl.id };
}
async function ventaFrozen({ numero, turnoId, cliente = null, fiado = false, total, detalles }) {
  const v = await prisma.venta.create({ data: { localId: S.local, vendedorId: S.admin, turnoId, numero, clienteId: cliente, subtotal: total, total, formaPago: fiado ? "fiado" : "efectivo", esFiado: fiado, version: 0 } });
  for (const d of detalles) {
    const det = await prisma.ventaDetalle.create({ data: { ventaId: v.id, productoBaseId: d.baseId, nombre: d.nombre, precio: d.precio, precioCosto: 20, cantidad: d.cantidad, subtotal: d.precio * d.cantidad, productoLocalId: d.plId ?? null, cantidadStock: d.cs ?? null } });
    if (d.componentes) for (const c of d.componentes) await prisma.ventaDetalleComponente.create({ data: { ventaDetalleId: det.id, productoBaseId: c.baseId, productoLocalId: c.plId, cantidad: c.cantidad } });
    d._detId = det.id;
  }
  await prisma.ventaPago.create({ data: { ventaId: v.id, medio: fiado ? "FIADO" : "EFECTIVO", monto: total, neto: total } });
  if (fiado && cliente) await prisma.movimientoCuenta.create({ data: { grupoId: S.g, localId: S.local, clienteId: cliente, tipo: "VENTA", direccion: "DEBITO", monto: total, ventaId: v.id, correccionId: 0 } });
  return v;
}

async function seed() {
  await truncate();
  const rol = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"] } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "Adm", email: "a@t.test", passwordHash: "x", rolId: rol.id } });
  Object.assign(S, { g: g.id, local: local.id, admin: admin.id, rol: rol.id });
  const cli1 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Cli1" } });
  const cli2 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Cli2" } });
  S.cli1 = cli1.id; S.cli2 = cli2.id;
  await prisma.puntosConfigLocal.create({ data: { grupoId: g.id, localId: local.id, activo: true, reglasJson: { puntosPorPeso: 0.01 } } });

  const A = await prod("A", 100); const B = await prod("B", 100); const D = await prod("D", 100);
  const C = await prod("Combo", 0, { combo: true });
  const F = await prod("F", 1); // stock chico → test insuficiente
  S.A = A; S.B = B; S.D = D; S.C = C; S.F = F;
  await prisma.comboComponente.create({ data: { comboProductoLocalId: C.plId, comboLocalId: local.id, componenteProductoLocalId: B.plId, componenteLocalId: local.id, cantidad: 2 } });
  await prisma.comboComponente.create({ data: { comboProductoLocalId: C.plId, comboLocalId: local.id, componenteProductoLocalId: D.plId, componenteLocalId: local.id, cantidad: 1 } });

  const tA = await prisma.turno.create({ data: { localId: local.id, vendedorId: admin.id, montoInicial: 0 } });
  const tC = await prisma.turno.create({ data: { localId: local.id, vendedorId: admin.id, montoInicial: 0, cierre: new Date() } });
  S.tA = tA.id; S.tC = tC.id;

  // V1 cobrada efectivo (A2,B3,ComboC1). total 650. cliente cli1. ACREDITACION 6.
  const dA = { baseId: A.baseId, plId: A.plId, nombre: "A", precio: 100, cantidad: 2, cs: 2 };
  const dB = { baseId: B.baseId, plId: B.plId, nombre: "B", precio: 50, cantidad: 3, cs: 3 };
  const dC = { baseId: C.baseId, plId: null, nombre: "Combo", precio: 300, cantidad: 1, cs: null, componentes: [{ baseId: B.baseId, plId: B.plId, cantidad: 2 }, { baseId: D.baseId, plId: D.plId, cantidad: 1 }] };
  const v1 = await ventaFrozen({ numero: 1, turnoId: tA.id, cliente: cli1.id, total: 650, detalles: [dA, dB, dC] });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cli1.id, direccion: "CREDITO", tipo: "ACREDITACION", puntos: 6, ventaId: v1.id, correccionId: 0 } });
  S.v1 = v1.id; S.v1_dA = dA._detId; S.v1_dB = dB._detId; S.v1_dC = dC._detId;

  // V-fiada (A2) total 200 cli1. Para fiada→cobrada.
  const fA = { baseId: A.baseId, plId: A.plId, nombre: "A", precio: 100, cantidad: 2, cs: 2 };
  const vf = await ventaFrozen({ numero: 2, turnoId: tA.id, cliente: cli1.id, fiado: true, total: 200, detalles: [fA] });
  S.vf = vf.id; S.vf_dA = fA._detId;

  // V-cobrada simple (A1) total 100 cli1. Para cobrada→fiada / cambio cliente.
  const cA = { baseId: A.baseId, plId: A.plId, nombre: "A", precio: 100, cantidad: 1, cs: 1 };
  const vc = await ventaFrozen({ numero: 3, turnoId: tA.id, cliente: cli1.id, total: 100, detalles: [cA] });
  S.vc = vc.id; S.vc_dA = cA._detId;

  // V2 turno cerrado (A1).
  const v2 = await ventaFrozen({ numero: 4, turnoId: tC.id, cliente: cli1.id, total: 100, detalles: [{ baseId: A.baseId, plId: A.plId, nombre: "A", precio: 100, cantidad: 1, cs: 1 }] });
  S.v2 = v2.id;

  // V3 legacy (A2, cs null).
  const l3 = { baseId: A.baseId, plId: null, nombre: "A", precio: 100, cantidad: 2, cs: null };
  const v3 = await ventaFrozen({ numero: 5, turnoId: tA.id, total: 200, detalles: [l3] });
  S.v3 = v3.id; S.v3_d = l3._detId;

  // Vf de F (stock chico). F x1 total 100.
  const fF = { baseId: F.baseId, plId: F.plId, nombre: "F", precio: 100, cantidad: 1, cs: 1 };
  const vF = await ventaFrozen({ numero: 6, turnoId: tA.id, total: 100, detalles: [fF] });
  S.vF = vF.id; S.vF_d = fF._detId;

  // Vp puntos fail-closed: cli2 con ACREDITACION 3 y CANJE 3 (saldo 0).
  const pA = { baseId: A.baseId, plId: A.plId, nombre: "A", precio: 100, cantidad: 3, cs: 3 };
  const vp = await ventaFrozen({ numero: 7, turnoId: tA.id, cliente: cli2.id, total: 300, detalles: [pA] });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cli2.id, direccion: "CREDITO", tipo: "ACREDITACION", puntos: 3, ventaId: vp.id, correccionId: 0 } });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cli2.id, direccion: "DEBITO", tipo: "CANJE", puntos: 3, ventaId: null, correccionId: 0 } });
  S.vp = vp.id; S.vp_d = pA._detId;
}

const L = (detId, baseId, cantidad, precio) => ({ origenDetalleId: detId, productoBaseId: baseId, cantidad, precio, precioCosto: 20 });

async function run() {
  await seed();

  // 1) Reducir A 2→1 en V1 (B y C preservados). total 550.
  const stockA0 = await stockDe(S.A.plId);
  const r1 = await post(`/api/pos-ventas/venta/${S.v1}/corregir`, {
    motivo: "Cliente devolvió 1", idempotencyKey: "k-v1-a", version: 0, cliente: { id: S.cli1 },
    lineas: [L(S.v1_dA, S.A.baseId, 1, 100), L(S.v1_dB, S.B.baseId, 3, 50), L(S.v1_dC, S.C.baseId, 1, 300)],
    pagos: [{ medio: "EFECTIVO", monto: 550 }],
  });
  ok("corregir V1 reduce A → 200", r1.status === 200, JSON.stringify(r1.j));
  const v1db = await prisma.venta.findUnique({ where: { id: S.v1 } });
  ok("V1: version=1, corregida, total=550, mismo número", v1db.version === 1 && v1db.corregida === true && Number(v1db.total) === 550 && v1db.numero === 1);
  ok("V1: stock A devuelto +1", (await stockDe(S.A.plId)) === stockA0 + 1, `antes ${stockA0} ahora ${await stockDe(S.A.plId)}`);
  ok("V1: VentaDetalle A cantidad=1 (reemplazado)", Number((await prisma.ventaDetalle.findFirst({ where: { ventaId: S.v1, productoBaseId: S.A.baseId } }))?.cantidad) === 1);
  ok("V1: VentaCorreccion COMPLETA registrada", (await prisma.ventaCorreccion.count({ where: { ventaId: S.v1, tipo: "COMPLETA" } })) === 1);
  ok("V1: puntos ajustados (6→5, debito 1)", (await saldoPuntos(S.cli1)) === 5, `saldo ${await saldoPuntos(S.cli1)}`);

  // 2) Idempotencia: repetir misma clave → yaAplicada, sin doble aplicar.
  const stockAahora = await stockDe(S.A.plId);
  const r2 = await post(`/api/pos-ventas/venta/${S.v1}/corregir`, { motivo: "x", idempotencyKey: "k-v1-a", version: 0, cliente: { id: S.cli1 }, lineas: [L(S.v1_dA, S.A.baseId, 1, 100)], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("idempotencia: yaAplicada true", r2.status === 200 && r2.j?.yaAplicada === true);
  ok("idempotencia: stock NO cambió", (await stockDe(S.A.plId)) === stockAahora);

  // 3) Conflicto de versión (clave nueva, versión vieja).
  const r3 = await post(`/api/pos-ventas/venta/${S.v1}/corregir`, { motivo: "x", idempotencyKey: "k-v1-b", version: 0, cliente: { id: S.cli1 }, lineas: [L(S.v1_dA, S.A.baseId, 1, 100)], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("versión stale → 409 conflicto_version", r3.status === 409 && r3.j?.code === "conflicto_version");

  // 4) Turno cerrado → 409 + rollback (sin cambios).
  const v2Antes = await prisma.venta.findUnique({ where: { id: S.v2 } });
  const r4 = await post(`/api/pos-ventas/venta/${S.v2}/corregir`, { motivo: "x", idempotencyKey: "k-v2", version: 0, cliente: { id: S.cli1 }, lineas: [L(null, S.A.baseId, 5, 100)], pagos: [{ medio: "EFECTIVO", monto: 500 }] });
  ok("turno cerrado → 409 turno_cerrado_no_corregible", r4.status === 409 && r4.j?.code === "turno_cerrado_no_corregible");
  ok("turno cerrado: rollback (version/total intactos)", JSON.stringify(await prisma.venta.findUnique({ where: { id: S.v2 } })) === JSON.stringify(v2Antes));

  // 5) Stock insuficiente + rollback (F stock chico, aumentar F 1→5).
  const fStock0 = await stockDe(S.F.plId);
  const r5 = await post(`/api/pos-ventas/venta/${S.vF}/corregir`, { motivo: "x", idempotencyKey: "k-vf", version: 0, lineas: [L(S.vF_d, S.F.baseId, 5, 100)], pagos: [{ medio: "EFECTIVO", monto: 500 }] });
  ok("stock insuficiente → 409", r5.status === 409 && r5.j?.code === "stock_insuficiente", JSON.stringify(r5.j?.code));
  ok("stock insuficiente: rollback (stock F intacto)", (await stockDe(S.F.plId)) === fStock0);
  ok("stock insuficiente: sin VentaCorreccion", (await prisma.ventaCorreccion.count({ where: { ventaId: S.vF } })) === 0);

  // 6) Cobrada → fiada (CC): Vc a fiado cli1.
  const ccAntes = await saldoCC(S.cli1);
  const r6 = await post(`/api/pos-ventas/venta/${S.vc}/corregir`, { motivo: "pasa a fiado", idempotencyKey: "k-vc-fiar", version: 0, cliente: { id: S.cli1 }, lineas: [L(S.vc_dA, S.A.baseId, 1, 100)], pagos: [{ medio: "FIADO", monto: 100 }] });
  ok("cobrada→fiada → 200 + esFiado", r6.status === 200 && (await prisma.venta.findUnique({ where: { id: S.vc } }))?.esFiado === true, JSON.stringify(r6.j));
  ok("cobrada→fiada: CC deuda +100", (await saldoCC(S.cli1)) === ccAntes + 100);

  // 7) Fiada → cobrada (CC): Vf a efectivo. Reversa CREDITO.
  const ccF0 = await saldoCC(S.cli1);
  const r7 = await post(`/api/pos-ventas/venta/${S.vf}/corregir`, { motivo: "pagó", idempotencyKey: "k-vf-cobrar", version: 0, cliente: { id: S.cli1 }, lineas: [L(S.vf_dA, S.A.baseId, 2, 100)], pagos: [{ medio: "EFECTIVO", monto: 200 }] });
  ok("fiada→cobrada → 200 + esFiado false", r7.status === 200 && (await prisma.venta.findUnique({ where: { id: S.vf } }))?.esFiado === false, JSON.stringify(r7.j));
  ok("fiada→cobrada: CC deuda -200 (reversa)", (await saldoCC(S.cli1)) === ccF0 - 200);

  // 8) Puntos fail-closed: reducir Vp (cli2 saldo 0) → debito puntos → bloqueo.
  const r8 = await post(`/api/pos-ventas/venta/${S.vp}/corregir`, { motivo: "reduce", idempotencyKey: "k-vp", version: 0, cliente: { id: S.cli2 }, lineas: [L(S.vp_d, S.A.baseId, 1, 100)], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("puntos insuficientes → 409 fail-closed", r8.status === 409 && r8.j?.code === "puntos_insuficientes_para_corregir", JSON.stringify(r8.j?.code));
  ok("puntos fail-closed: rollback (Vp version 0)", (await prisma.venta.findUnique({ where: { id: S.vp } }))?.version === 0);

  // 9) Legacy bloqueado + rollback.
  const r9 = await post(`/api/pos-ventas/venta/${S.v3}/corregir`, { motivo: "x", idempotencyKey: "k-v3", version: 0, lineas: [L(S.v3_d, S.A.baseId, 1, 100)], pagos: [{ medio: "EFECTIVO", monto: 100 }] });
  ok("legacy LOCAL auto-reconstruido → 200 (corrige)", r9.status === 200, JSON.stringify(r9.j?.code));
  ok("legacy: aplicado (version 1)", (await prisma.venta.findUnique({ where: { id: S.v3 } }))?.version === 1);

  // 10) Pago mixto: corregir Vc (ya fiada v1) — usar V1 (version1) agregar D y pagar mixto.
  const r10 = await post(`/api/pos-ventas/venta/${S.v1}/corregir`, {
    motivo: "agrega D mixto", idempotencyKey: "k-v1-mix", version: 1, cliente: { id: S.cli1 },
    lineas: [L(S.v1_dA, S.A.baseId, 1, 100), L(S.v1_dB, S.B.baseId, 3, 50), L(S.v1_dC, S.C.baseId, 1, 300), L(null, S.D.baseId, 2, 70)],
    pagos: [{ medio: "EFECTIVO", monto: 400 }, { medio: "DEBITO", monto: 290 }],
  });
  ok("mixto → 200, total 690", r10.status === 200 && Number((await prisma.venta.findUnique({ where: { id: S.v1 } }))?.total) === 690, JSON.stringify(r10.j));
  ok("mixto: 2 tenders (VentaPago)", (await prisma.ventaPago.count({ where: { ventaId: S.v1 } })) === 2);
  ok("mixto: formaPago 'mixto'", (await prisma.venta.findUnique({ where: { id: S.v1 } }))?.formaPago === "mixto");

  console.log(`\nRESULTADO B3 (corregir): ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
