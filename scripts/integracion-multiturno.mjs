// scripts/integracion-multiturno.mjs
//
// Varios cajeros abiertos a la vez en un MISMO local. Importa los handlers reales
// de abrir/cerrar y verifica lo que queda ESCRITO en PostgreSQL, no lo que
// devolvió el endpoint.
//
//   DATABASE_URL=<revision> AUTH_SECRET=<temporal> \
//     node --import ./scripts/alias-loader.mjs scripts/integracion-multiturno.mjs
//
// Crea su propio local y usuarios de prueba y los borra al terminar.

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const SUF = `multi-${Date.now().toString(36)}`;
let ok = 0;
let fallos = 0;
const fallaron = [];

const chk = (n, c, x = "") => {
  if (c) { ok++; console.log(`  OK   ${n}${x ? " — " + x : ""}`); }
  else { fallos++; fallaron.push(n); console.log(`  FALLA ${n}${x ? " — " + x : ""}`); }
};
const money = (v) => (v == null ? null : Number(v));

let GRUPO = null;
const ck = (u, localId) =>
  `erpazul_sesion=${jwt.sign(
    { id: u.id, email: u.email, nombre: u.nombre, rolId: u.rolId, permisos: ["pos.usar"], localId, grupoId: GRUPO },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  )}`;
const req = (url, cookie, body) =>
  new Request(url, {
    method: body ? "POST" : "GET",
    headers: { cookie, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

async function main() {
  const { POST: abrir, GET: estado } = await import("../app/api/pos-ventas/turnos/abrir/route.js");
  const { POST: cerrar } = await import("../app/api/pos-ventas/turnos/cerrar/route.js");
  const U_AB = "http://x/api/pos-ventas/turnos/abrir";
  const U_CE = "http://x/api/pos-ventas/turnos/cerrar";

  const g = await prisma.grupo.findFirst({ select: { id: true } });
  const rol = await prisma.rol.findFirst({ select: { id: true } });
  GRUPO = g.id;

  const mkLocal = async (n) => {
    const l = await prisma.local.create({ data: { nombre: `${n} ${SUF}`, es_deposito: false } });
    await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: l.id } });
    await prisma.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
    return l;
  };
  const L4 = await mkLocal("L4");
  const L5 = await mkLocal("L5");
  const mkUser = (n, localId) =>
    prisma.usuario.create({
      data: { nombre: `${n} ${SUF}`, email: `${n}.${SUF}@t.local`, passwordHash: "x", rolId: rol.id, localId },
    });
  const A = await mkUser("A", L4.id);
  const B = await mkUser("B", L4.id);
  const C = await mkUser("C", L5.id);
  const ckA = ck(A, L4.id);
  const ckB = ck(B, L4.id);
  const ckC = ck(C, L5.id);

  console.log(`\n=== Local L4 #${L4.id} · Local L5 #${L5.id} ===\n`);

  // ── 1 · A abre ────────────────────────────────────────────────────────────
  let r = await abrir(req(U_AB, ckA, { localId: L4.id, montoInicial: 10000 }));
  let d = await r.json();
  chk("1 · usuario A abre turno en el local", d.ok === true && money(d.turno?.montoInicial) === 10000, d.error || "");
  const tA = d.turno;
  chk("11 · la apertura pide fondo manual y lo guarda", money(tA.fondoRecibidoApertura) === 10000);
  chk("10a · NO hereda fondo: sin origen ni sugerido", tA.fondoOrigenTurnoId === null && tA.fondoSugeridoApertura === null);

  // ── 2 y 3 · B abre en el MISMO local ──────────────────────────────────────
  r = await abrir(req(U_AB, ckB, { localId: L4.id, montoInicial: 5000 }));
  d = await r.json();
  chk("2 · usuario B abre OTRO turno en el mismo local", d.ok === true, d.error || "");
  const tB = d.turno;
  const abiertos = await prisma.turno.count({ where: { localId: L4.id, cierre: null } });
  chk("3 · ambos quedan abiertos a la vez", abiertos === 2, `abiertos: ${abiertos}`);
  chk(
    "15 · al abrir se informa que hay otros turnos",
    Array.isArray(d.otrosTurnosAbiertos) && d.otrosTurnosAbiertos.length === 1 && d.otrosTurnosAbiertos[0].turnoId === tA.id
  );

  // ── 4 · A intenta un segundo turno ────────────────────────────────────────
  r = await abrir(req(U_AB, ckA, { localId: L4.id, montoInicial: 1000 }));
  d = await r.json();
  chk("4 · A NO puede abrir un segundo turno", d.ok === false && r.status === 409, `status ${r.status}`);
  chk(
    "4b · el mensaje es el pedido",
    /^Ya tenés un turno abierto en este local desde .+\. Cerralo antes de abrir otro\.$/.test(d.error || ""),
    d.error
  );

  // ── 5 y 6 · Nadie más se bloquea ──────────────────────────────────────────
  r = await estado(req(U_AB, ckB));
  d = await r.json();
  chk("5 · B no queda bloqueado por A", d.ok === true && d.turnoPropioAbierto?.turnoId === tB.id);
  r = await estado(req(U_AB, ckC));
  d = await r.json();
  chk("6 · el local 5 no se ve afectado", d.ok === true && d.turnoPropioAbierto === null && d.otrosTurnosAbiertos.length === 0);
  chk("10b · la herencia de fondo figura desactivada", d.herenciaFondoActiva === false);

  // ── 7 · Cada turno toma solo sus ventas ───────────────────────────────────
  const pb = await prisma.productoBase.findFirst({ select: { id: true } });
  let nro = 0;
  const venta = async (turnoId, vendedorId, medio, monto) => {
    const v = await prisma.venta.create({
      data: { localId: L4.id, vendedorId, turnoId, numero: ++nro, subtotal: monto, total: monto,
              formaPago: medio.toLowerCase(), esFiado: false, costoTotal: 0, gananciaBruta: monto, gananciaNeta: monto },
    });
    await prisma.ventaPago.create({ data: { ventaId: v.id, medio, monto } });
    if (pb) await prisma.ventaDetalle.create({ data: { ventaId: v.id, productoBaseId: pb.id, nombre: "t", precio: monto, cantidad: 1, subtotal: monto } });
  };
  await venta(tA.id, A.id, "EFECTIVO", 20000);
  await venta(tA.id, A.id, "MERCADOPAGO", 7000);
  await venta(tB.id, B.id, "EFECTIVO", 3000);
  const vA = await prisma.venta.count({ where: { turnoId: tA.id } });
  const vB = await prisma.venta.count({ where: { turnoId: tB.id } });
  chk("7 · cada turno toma solo sus ventas", vA === 2 && vB === 1, `A:${vA} B:${vB}`);

  // ── 8 · Cada arqueo pertenece a su turno ──────────────────────────────────
  await prisma.arqueoCaja.create({
    data: { turnoId: tA.id, localId: L4.id, usuarioId: A.id, realizadoPorId: A.id, periodoDesde: tA.apertura,
            periodoHasta: new Date(), efectivoEsperado: 30000, efectivoContado: 30000, diferencia: 0,
            tipo: "PARCIAL", idempotencyKey: `a-${tA.id}-1` },
  });
  const arqA = await prisma.arqueoCaja.count({ where: { turnoId: tA.id } });
  const arqB = await prisma.arqueoCaja.count({ where: { turnoId: tB.id } });
  chk("8 · el arqueo pertenece solo a su turno", arqA === 1 && arqB === 0, `A:${arqA} B:${arqB}`);

  // ── 9 · El cierre de A no afecta a B ──────────────────────────────────────
  r = await cerrar(req(U_CE, ckA, { turnoId: tA.id, montoRealEfectivo: 30000, efectivoRetirado: 20000, fondoDejado: 10000 }));
  d = await r.json();
  chk("9 · A cierra correctamente", d.ok === true, d.error || "");
  const Acer = await prisma.turno.findUnique({ where: { id: tA.id } });
  const Babierto = await prisma.turno.findUnique({ where: { id: tB.id } });
  chk("9b · el cierre de A no toca a B", Babierto.cierre === null);
  chk("9c · el esperado de A es 10.000 + 20.000, sin Mercado Pago", money(Acer.montoEsperadoEfectivo) === 30000, `${money(Acer.montoEsperadoEfectivo)}`);

  // ── 10 · El fondo de A no se ofrece a nadie ───────────────────────────────
  r = await estado(req(U_AB, ckB));
  d = await r.json();
  chk("10 · el fondo dejado por A no se ofrece", d.fondoSugerido === undefined && d.herenciaFondoActiva === false);
  chk("10c · pero A dejó su fondo registrado igual", money(Acer.fondoDejadoCierre) === 10000);
  chk("10d · nadie consumió el fondo de A", Acer.fondoConsumidoEnTurnoId === null);

  // ── 11 · A reabre declarando el fondo a mano ──────────────────────────────
  r = await abrir(req(U_AB, ckA, { localId: L4.id, montoInicial: 2500, observacionFondo: "arranco con lo mio" }));
  d = await r.json();
  chk("11b · A reabre declarando su fondo", d.ok === true && money(d.turno.montoInicial) === 2500, d.error || "");
  chk("11c · la observación es opcional y se guarda", d.turno.observacionFondoApertura === "arranco con lo mio");
  chk("11d · el turno nuevo no toma el fondo de nadie", d.turno.fondoOrigenTurnoId === null);
  const tA2 = d.turno;

  // ── 13 · Concurrencia del MISMO usuario ───────────────────────────────────
  await cerrar(req(U_CE, ckA, { turnoId: tA2.id, montoRealEfectivo: 2500, efectivoRetirado: 0, fondoDejado: 2500 }));
  const res13 = await Promise.allSettled([
    abrir(req(U_AB, ckA, { localId: L4.id, montoInicial: 1000 })),
    abrir(req(U_AB, ckA, { localId: L4.id, montoInicial: 1000 })),
  ]);
  const c13 = await Promise.all(res13.map((x) => (x.status === "fulfilled" ? x.value.json() : { ok: false, error: String(x.reason) })));
  const gan13 = c13.filter((x) => x.ok === true).length;
  chk("13 · dos aperturas del MISMO usuario: solo una triunfa", gan13 === 1, `triunfaron ${gan13}`);
  const abiertosA = await prisma.turno.count({ where: { localId: L4.id, vendedorId: A.id, cierre: null } });
  chk("13b · A queda con UN solo turno abierto", abiertosA === 1, `${abiertosA}`);

  // ── 14 · Concurrencia de usuarios DISTINTOS ───────────────────────────────
  const D = await mkUser("D", L4.id);
  const E = await mkUser("E", L4.id);
  const res14 = await Promise.allSettled([
    abrir(req(U_AB, ck(D, L4.id), { localId: L4.id, montoInicial: 1000 })),
    abrir(req(U_AB, ck(E, L4.id), { localId: L4.id, montoInicial: 1000 })),
  ]);
  const c14 = await Promise.all(res14.map((x) => (x.status === "fulfilled" ? x.value.json() : { ok: false, error: String(x.reason) })));
  const gan14 = c14.filter((x) => x.ok === true).length;
  chk("14 · dos usuarios distintos: ambos pueden abrir", gan14 === 2, `triunfaron ${gan14}`);
  const totalAbiertos = await prisma.turno.count({ where: { localId: L4.id, cierre: null } });
  chk("14b · el local admite varios turnos simultáneos", totalAbiertos >= 3, `abiertos: ${totalAbiertos}`);

  // ── 12 · Históricos con fondo heredado ────────────────────────────────────
  const hist = await prisma.turno.count({ where: { fondoOrigenTurnoId: { not: null } } });
  chk("12 · turnos históricos con fondo heredado siguen visibles", hist >= 1, `${hist} turnos`);

  // ── Limpieza ──────────────────────────────────────────────────────────────
  const ids = (await prisma.turno.findMany({ where: { localId: { in: [L4.id, L5.id] } }, select: { id: true } })).map((t) => t.id);
  const vids = (await prisma.venta.findMany({ where: { turnoId: { in: ids } }, select: { id: true } })).map((v) => v.id);
  await prisma.ventaDetalle.deleteMany({ where: { ventaId: { in: vids } } });
  await prisma.ventaPago.deleteMany({ where: { ventaId: { in: vids } } });
  await prisma.venta.deleteMany({ where: { id: { in: vids } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: ids } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: ids } } });
  await prisma.turno.deleteMany({ where: { id: { in: ids } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: [L4.id, L5.id] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [A.id, B.id, C.id, D.id, E.id] } } });
  await prisma.grupoLocal.deleteMany({ where: { localId: { in: [L4.id, L5.id] } } });
  await prisma.local.deleteMany({ where: { id: { in: [L4.id, L5.id] } } });
  console.log("\n(datos de prueba eliminados)");

  console.log(`\n=== RESULTADO: ${ok} OK, ${fallos} fallas ===`);
  if (fallos) console.log("Fallaron:\n  - " + fallaron.join("\n  - "));
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
