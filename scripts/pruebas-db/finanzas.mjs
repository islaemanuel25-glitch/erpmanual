// PRUEBA DE BASE DE FINANZAS.
//
// Ejerce los HANDLERS reales contra el PostgreSQL 16 efímero del workflow.
// No mide funciones puras: obliga a Prisma/Postgres a validar los where/select
// que el build y los candados no pueden comprobar.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/finanzas.mjs

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const rutaTablero = await import("../../app/api/finanzas/tablero/route.js");
const rutaTurno = await import("../../app/api/finanzas/turno/[turnoId]/route.js");

let pasadas = 0;
const fallas = [];

function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const mensaje = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(mensaje);
  console.log(`  ✗ ${mensaje}`);
}

const SECRETO = process.env.AUTH_SECRET;
const token = (usuarioId, localId, permisos = ["finanzas.ver"]) =>
  jwt.sign(
    { id: usuarioId, nombre: "CI Finanzas", email: `finanzas-${usuarioId}@ci.local`, localId, permisos },
    SECRETO,
    { expiresIn: "1h" }
  );

const pedido = (url, sesion) =>
  new Request(url, { headers: { cookie: `erpazul_sesion=${sesion}` } });

const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

const paramsTurno = (turnoId) => ({ params: Promise.resolve({ turnoId: String(turnoId) }) });

const marca = `ci-finanzas-${Date.now()}`;
const creado = {
  rolId: null,
  grupoId: null,
  depositoId: null,
  localId: null,
  usuarioDepositoId: null,
  usuarioLocalId: null,
  turnoId: null,
};

async function montar() {
  const rol = await prisma.rol.create({
    data: { nombre: `${marca}-rol`, permisos: ["finanzas.ver"] },
  });
  creado.rolId = rol.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;

  const deposito = await prisma.local.create({
    data: { nombre: `${marca}-deposito`, es_deposito: true },
  });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local` } });
  creado.depositoId = deposito.id;
  creado.localId = local.id;

  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });

  const usuarioDeposito = await prisma.usuario.create({
    data: {
      nombre: "CI Finanzas Depósito",
      email: `${marca}-deposito@ci.local`,
      passwordHash: "x",
      rolId: rol.id,
      localId: deposito.id,
    },
  });
  const usuarioLocal = await prisma.usuario.create({
    data: {
      nombre: "CI Finanzas Local",
      email: `${marca}-local@ci.local`,
      passwordHash: "x",
      rolId: rol.id,
      localId: local.id,
    },
  });
  creado.usuarioDepositoId = usuarioDeposito.id;
  creado.usuarioLocalId = usuarioLocal.id;

  const turno = await prisma.turno.create({
    data: {
      localId: local.id,
      vendedorId: usuarioLocal.id,
      montoInicial: 1000,
      apertura: new Date(),
    },
  });
  creado.turnoId = turno.id;

  // Al menos un movimiento hace que el tablero ejecute también las consultas
  // estructurales de clasificación: ArqueoCaja.cajaMovimientoRetiroId y
  // Turno.retiroCierreMovimientoId.
  await prisma.cajaMovimiento.create({
    data: {
      turnoId: turno.id,
      usuarioId: usuarioLocal.id,
      tipo: "INGRESO",
      monto: 500,
      motivo: `${marca}-movimiento`,
      createdAt: new Date(),
    },
  });

  return { deposito, local, usuarioDeposito, usuarioLocal, turno };
}

async function desmontar() {
  if (creado.localId) {
    await prisma.arqueoCaja.deleteMany({ where: { localId: creado.localId } });
    await prisma.venta.deleteMany({ where: { localId: creado.localId } });
  }
  if (creado.turnoId) {
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: creado.turnoId } });
    await prisma.turno.deleteMany({ where: { id: creado.turnoId } });
  }
  const usuarios = [creado.usuarioDepositoId, creado.usuarioLocalId].filter(Boolean);
  if (usuarios.length) await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  if (creado.grupoId) {
    await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.grupoDeposito.deleteMany({ where: { grupoId: creado.grupoId } });
  }
  const locales = [creado.depositoId, creado.localId].filter(Boolean);
  if (locales.length) await prisma.local.deleteMany({ where: { id: { in: locales } } });
  if (creado.grupoId) await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  if (creado.rolId) await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

async function correr(f) {
  const sesionDeposito = token(f.usuarioDeposito.id, f.deposito.id);
  const sesionLocal = token(f.usuarioLocal.id, f.local.id);

  console.log("\n── Depósito: entrada");
  const entradaDeposito = await leer(
    rutaTablero.GET(pedido("http://ci/api/finanzas/tablero?entrada=1", sesionDeposito))
  );
  ok("la entrada del depósito responde 200", entradaDeposito.status === 200, entradaDeposito.error);
  ok("la entrada del depósito es ENTRADA", entradaDeposito.vista === "ENTRADA");
  ok(
    "la lista contiene depósito y local",
    Array.isArray(entradaDeposito.locales) &&
      entradaDeposito.locales.some((l) => l.localId === f.deposito.id) &&
      entradaDeposito.locales.some((l) => l.localId === f.local.id)
  );

  console.log("\n── Depósito: abre un local");
  const desdeDeposito = await leer(
    rutaTablero.GET(
      pedido(`http://ci/api/finanzas/tablero?destino=${f.local.id}`, sesionDeposito)
    )
  );
  ok("el depósito puede abrir el local", desdeDeposito.status === 200 && desdeDeposito.ok === true, desdeDeposito.error);
  ok("la respuesta es UN_LOCAL", desdeDeposito.vista === "UN_LOCAL");
  ok("es el local pedido", desdeDeposito.local?.id === f.local.id);

  console.log("\n── Local: tablero propio");
  const tableroLocal = await leer(
    rutaTablero.GET(pedido("http://ci/api/finanzas/tablero?entrada=1", sesionLocal))
  );
  ok("el tablero del local responde 200", tableroLocal.status === 200 && tableroLocal.ok === true, tableroLocal.error);
  ok("el local recibe UN_LOCAL", tableroLocal.vista === "UN_LOCAL");
  ok("el tablero conserva su local", tableroLocal.local?.id === f.local.id);
  ok("el resumen existe", tableroLocal.resumen && typeof tableroLocal.resumen === "object");
  ok("la actividad existe", Array.isArray(tableroLocal.actividad));

  console.log("\n── Turno: abierto por el local");
  const detalleLocal = await leer(
    rutaTurno.GET(
      pedido(`http://ci/api/finanzas/turno/${f.turno.id}`, sesionLocal),
      paramsTurno(f.turno.id)
    )
  );
  ok("el detalle del turno responde 200", detalleLocal.status === 200 && detalleLocal.ok === true, detalleLocal.error);
  ok("devuelve el turno correcto", detalleLocal.turno?.id === f.turno.id);
  ok("ejerció movimientos de caja", Array.isArray(detalleLocal.movimientos) && detalleLocal.movimientos.length === 1);
  ok("calculó efectivo esperado", detalleLocal.esperado?.efectivoEsperado !== undefined);

  console.log("\n── Turno: abierto por el depósito");
  const detalleDeposito = await leer(
    rutaTurno.GET(
      pedido(`http://ci/api/finanzas/turno/${f.turno.id}`, sesionDeposito),
      paramsTurno(f.turno.id)
    )
  );
  ok(
    "el depósito puede abrir el turno del local de su grupo",
    detalleDeposito.status === 200 && detalleDeposito.ok === true,
    detalleDeposito.error
  );
}

let fixture;
try {
  fixture = await montar();
  await correr(fixture);
} finally {
  await desmontar();
  await prisma.$disconnect();
}

console.log(`\n${pasadas} comprobaciones pasaron.`);
if (fallas.length) {
  console.error("\nFallaron:");
  for (const f of fallas) console.error(`- ${f}`);
  process.exit(1);
}
