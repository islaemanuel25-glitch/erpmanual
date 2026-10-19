// PRUEBAS DE BASE DE FINANZAS → SUELDOS.
//
//   AUTH_SECRET=... node --import ./scripts/alias-loader.mjs scripts/pruebas-db/sueldos.mjs
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
// Se ejercen los handlers REALES contra Postgres —`finanzas/sueldos` (GET, POST
// y PATCH), `pos-ventas/pagar`, `finanzas/gastos` y su catálogo, y el tablero
// del Resumen— con sesiones firmadas como las del login, y se mira la base:
//
//   1. un sueldo sin empleado, sin modalidad o con un empleado de otro local es
//      400, desde Finanzas, desde el POS y desde Gastos, y no deja nada escrito;
//   2. un pago desde el POS aparece en Sueldos, en su empleado, "Desde la caja";
//      uno desde Finanzas, "Desde Finanzas"; el mismo intento no paga dos veces;
//   3. Gastos ya no ofrece Sueldos ni lista sueldos;
//   4. el Resumen financiero suma los sueldos exactamente como antes: su total
//      de gastos es la suma de TODOS los gastos del período, sueldos incluidos;
//   5. el relleno de la migración marca bien los "Sueldo ·" y "Adelanto ·";
//   6. asignar empleado a un sueldo viejo no cambia montos ni pagos;
//   7. los empleados y sueldos de un local no aparecen en el otro.
//
// Los datos se montan y se desmontan acá. El cliente es el de
// `clientePrisma.mjs` en ESCRITURA: host local y NODE_ENV distinto de
// production, o aborta.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const { readFileSync, writeFileSync } = await import("node:fs");

const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const rutaSueldos = await import("../../app/api/finanzas/sueldos/route.js");
const rutaSueldo = await import("../../app/api/finanzas/sueldos/[gastoId]/route.js");
const rutaPagar = await import("../../app/api/pos-ventas/pagar/route.js");
const rutaGastos = await import("../../app/api/finanzas/gastos/route.js");
const rutaPagosGasto = await import("../../app/api/finanzas/gastos/[gastoId]/pagos/route.js");
const rutaCategorias = await import("../../app/api/finanzas/gastos/categorias/route.js");
const rutaTablero = await import("../../app/api/finanzas/tablero/route.js");
const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`); };
function ok(t, c, d = "falló") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d}`); console.log(`  ✗ ${t} — ${d}`); }
}
const igual = (t, o, e) => ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

const SECRETO = process.env.AUTH_SECRET;
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const cookieDe = (quien) =>
  [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
function pedido(url, quien, { metodo = "POST", cuerpo } = {}) {
  const req = new Request(url, {
    method: metodo,
    headers: { cookie: cookieDe(quien), "content-type": "application/json" },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo ?? {}),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

const marca = `ci-sueldos-${Date.now()}`;
const creado = { grupoId: null, locales: [], usuarios: [], roles: [], operadorIds: [], empleadoIds: [] };
const BASE = "http://ci/api";
const FONDO = 200000;
let n = 0;
const clave = () => `ci-sueldo-${Date.now()}-${(n += 1)}`;
const HOY = hoyArgentinaISO();
const MES = "unidad=MES&desplazamiento=0";

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

async function montar() {
  const PERMISOS_FIN = ["finanzas.ver", "finanzas.gastos.registrar"];
  const rolFin = await prisma.rol.create({ data: { nombre: `${marca}-finanzas`, permisos: PERMISOS_FIN } });
  const rolCajero = await prisma.rol.create({ data: { nombre: `${marca}-cajero`, permisos: ["pos.usar"] } });
  const rolVe = await prisma.rol.create({ data: { nombre: `${marca}-ve`, permisos: ["finanzas.ver"] } });
  creado.roles.push(rolFin.id, rolCajero.id, rolVe.id);
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const A = await prisma.local.create({ data: { nombre: `${marca}-A`, tipo: "local" } });
  const B = await prisma.local.create({ data: { nombre: `${marca}-B`, tipo: "local" } });
  creado.locales.push(deposito.id, A.id, B.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: A.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: B.id } });
  await prisma.configuracionLocal.create({ data: { localId: A.id, exigirOperador: true, allowNegativeStock: false } });

  const usuario = async (nombre, rol, permisos, localId) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${nombre}`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId },
      select: { id: true, nombre: true, email: true },
    });
    creado.usuarios.push(u.id);
    return { u, sesion: jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId, permisos }, SECRETO, { expiresIn: "1h" }) };
  };
  const finA = await usuario("finA", rolFin, PERMISOS_FIN, A.id);
  const finB = await usuario("finB", rolFin, PERMISOS_FIN, B.id);
  const veA = await usuario("veA", rolVe, ["finanzas.ver"], A.id);
  const cajero = await usuario("cajero", rolCajero, ["pos.usar"], A.id);

  // El empleado que maneja la caja (con operador), uno que no, y uno de B.
  const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-Brenda`, pinHash: "x", localId: A.id } });
  creado.operadorIds.push(op.id);
  const brenda = await prisma.empleado.create({ data: { nombre: op.nombre, operadorId: op.id, localId: A.id } });
  const carlos = await prisma.empleado.create({ data: { nombre: `${marca}-Carlos`, localId: A.id } });
  const dora = await prisma.empleado.create({ data: { nombre: `${marca}-Dora`, localId: B.id } });
  // Activa en A y sin ningún pago: tiene que verse igual.
  const eva = await prisma.empleado.create({ data: { nombre: `${marca}-Eva`, localId: A.id } });
  creado.empleadoIds.push(brenda.id, carlos.id, dora.id, eva.id);

  const turno = await prisma.turno.create({
    data: { localId: A.id, vendedorId: cajero.u.id, operadorId: op.id, montoInicial: FONDO, apertura: new Date() },
    select: { id: true },
  });
  const sueldos = await prisma.categoriaGasto.findUnique({ where: { nombre: "Sueldos" }, select: { id: true } });
  const otra = await prisma.categoriaGasto.findFirst({ where: { activo: true, nombre: "Servicios" }, select: { id: true } });
  const quienCaja = { sesion: cajero.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: A.id }) };
  return { grupo, A, B, finA, finB, veA, quienCaja, brenda, carlos, dora, eva, turno, sueldos, otra };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const turnos = (await prisma.turno.findMany({ where: { localId: { in: creado.locales } }, select: { id: true } })).map((t) => t.id);
  await prisma.pagoGasto.deleteMany({ where: { gasto: { grupoId: creado.grupoId } } });
  await prisma.gasto.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { id: { in: turnos } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: creado.locales } } });
  await prisma.empleado.deleteMany({ where: { id: { in: creado.empleadoIds } } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
}

// ═══════════════════════════════════════════════════════════════════════════
// AYUDAS
// ═══════════════════════════════════════════════════════════════════════════

const leerSueldos = (quien, qs = MES) => rutaSueldos.GET(pedido(`${BASE}/finanzas/sueldos?${qs}`, quien, { metodo: "GET" })).then(leer);
const pagarSueldo = (quien, cuerpo) => rutaSueldos.POST(pedido(`${BASE}/finanzas/sueldos`, quien, { cuerpo })).then(leer);
const pagarPos = (f, cuerpo) =>
  rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, f.quienCaja, { cuerpo: { turnoId: f.turno.id, idempotencyKey: clave(), ...cuerpo } })).then(leer);
const conteo = async (f) => ({
  gastos: await prisma.gasto.count({ where: { grupoId: f.grupo.id } }),
  pagos: await prisma.pagoGasto.count({ where: { gasto: { grupoId: f.grupo.id } } }),
  movs: await prisma.cajaMovimiento.count({ where: { turnoId: f.turno.id } }),
});
const sueldoFinanzas = (f, extra = {}) => ({
  empleadoId: f.carlos.id,
  modalidadSueldo: "SUELDO",
  monto: "250000",
  fecha: HOY,
  medio: "TRANSFERENCIA",
  idempotencyKey: clave(),
  ...extra,
});
/** El total de gastos del Resumen: lo que contesta el tablero de verdad. */
const gastosDelResumen = async (quien) => {
  const r = await leer(await rutaTablero.GET(pedido(`${BASE}/finanzas/tablero?unidad=MES&desplazamiento=0`, quien, { metodo: "GET" })));
  return { status: r.status, gastos: r.resumen?.resultado?.gastos ?? r.resumen?.gastos ?? null, crudo: r };
};

// ═══════════════════════════════════════════════════════════════════════════
// CASOS
// ═══════════════════════════════════════════════════════════════════════════

async function casos(f) {
  seccion("0 · El Resumen antes de cualquier sueldo");
  const resumenAntes = await gastosDelResumen(f.finA);
  igual("el tablero contesta", resumenAntes.status, 200);
  ok("y trae el total de gastos", typeof resumenAntes.gastos === "number", JSON.stringify(resumenAntes.crudo?.resumen)?.slice(0, 300));

  seccion("1 · Un sueldo sin empleado, sin tipo o de otro local: 400 en las tres puertas");
  const antes = await conteo(f);
  let r = await pagarSueldo(f.finA, sueldoFinanzas(f, { empleadoId: null }));
  igual("Finanzas, sin empleado: 400", [r.status, r.error], [400, "Elegí el empleado."]);
  r = await pagarSueldo(f.finA, sueldoFinanzas(f, { empleadoId: f.dora.id }));
  igual("Finanzas, empleado de otro local: 400", [r.status, r.error], [400, "Ese empleado es de otro local."]);
  r = await pagarSueldo(f.finA, sueldoFinanzas(f, { modalidadSueldo: null }));
  igual("Finanzas, sin tipo: 400", [r.status, r.error], [400, "Elegí qué es: sueldo, adelanto, aguinaldo o vacaciones."]);
  r = await pagarSueldo(f.finA, sueldoFinanzas(f, { modalidadSueldo: "PREMIO" }));
  igual("Finanzas, un tipo que no existe: 400", r.status, 400);
  r = await pagarPos(f, { tipo: "SUELDO", modalidad: "SUELDO", monto: "1000" });
  igual("POS, sin empleado: 400", [r.status, r.error], [400, "Elegí el empleado."]);
  r = await pagarPos(f, { tipo: "SUELDO", modalidad: "SUELDO", monto: "1000", empleadoId: f.dora.id });
  igual("POS, empleado de otro local: 400", [r.status, r.error], [400, "Ese empleado es de otro local."]);
  r = await pagarPos(f, { tipo: "SUELDO", monto: "1000", empleadoId: f.brenda.id });
  igual("POS, sin tipo: 400", r.status, 400);
  r = await leer(await rutaGastos.POST(pedido(`${BASE}/finanzas/gastos`, f.finA, {
    cuerpo: { categoriaId: f.sueldos.id, concepto: "Sueldo de Carlos", total: 1000, fecha: HOY, beneficiario: "Carlos", idempotencyKey: clave() },
  })));
  igual("Gastos, un sueldo con el nombre a mano: 400", [r.status, r.error], [400, "Elegí el empleado."]);
  igual("ningún rechazo dejó gasto, pago ni movimiento de caja", await conteo(f), antes);

  seccion("2 · El POS y Finanzas, un solo historial por empleado");
  const pos = await pagarPos(f, { tipo: "SUELDO", modalidad: "ADELANTO", monto: "30000", empleadoId: f.carlos.id });
  igual("el adelanto desde la caja entra", [pos.status, pos.ok], [200, true]);
  const gPos = await prisma.gasto.findUnique({ where: { id: pos.gastoId }, select: { modalidadSueldo: true, empleadoId: true, beneficiario: true, concepto: true } });
  igual("el POS guarda la modalidad en su columna", [gPos.modalidadSueldo, gPos.empleadoId, gPos.beneficiario, gPos.concepto], ["ADELANTO", f.carlos.id, f.carlos.nombre, `Adelanto · ${f.carlos.nombre}`]);
  const aguinaldo = await pagarPos(f, { tipo: "SUELDO", modalidad: "AGUINALDO", monto: "10000", empleadoId: f.brenda.id });
  igual("el POS ofrece las cuatro: aguinaldo entra", aguinaldo.ok, true);

  const cuerpo = sueldoFinanzas(f, { nota: "Octubre" });
  const fin = await pagarSueldo(f.finA, cuerpo);
  igual("el sueldo desde Finanzas entra", [fin.status, fin.ok, fin.repetido], [200, true, false]);
  const gFin = await prisma.gasto.findUnique({
    where: { id: fin.gasto.id },
    select: { modalidadSueldo: true, empleadoId: true, beneficiario: true, total: true, pagos: { select: { monto: true, medio: true, turnoId: true, nota: true } } },
  });
  igual("queda con su empleado y su tipo, pagado entero, con la nota en el pago",
    [gFin.modalidadSueldo, gFin.empleadoId, gFin.beneficiario, Number(gFin.total), gFin.pagos.map((p) => [Number(p.monto), p.medio, p.turnoId, p.nota])],
    ["SUELDO", f.carlos.id, f.carlos.nombre, 250000, [[250000, "TRANSFERENCIA", null, "Octubre"]]]);
  const otraVez = await pagarSueldo(f.finA, cuerpo);
  igual("el mismo intento devuelve el mismo sueldo", [otraVez.ok, otraVez.repetido, otraVez.gasto?.id], [true, true, fin.gasto.id]);
  igual("y no paga dos veces", await prisma.pagoGasto.count({ where: { gastoId: fin.gasto.id } }), 1);

  const s = await leerSueldos(f.finA);
  igual("la pantalla contesta", [s.status, s.ok, s.local?.id], [200, true, f.A.id]);
  igual("PAGADO EN EL PERÍODO: el total, desde la caja y desde Finanzas", [s.total, s.desdeLaCaja, s.desdeFinanzas], [290000, 40000, 250000]);
  const carlos = (s.empleados || []).find((e) => e.id === f.carlos.id);
  igual("Carlos: dos pagos, los dos juntos", [carlos?.cantidadPagos, carlos?.total], [2, 280000]);
  const porOrigen = Object.fromEntries((carlos?.pagos || []).map((p) => [p.desdeLaCaja ? "caja" : "finanzas", p]));
  igual("el del POS dice de qué caja salió", [porOrigen.caja?.origen, porOrigen.caja?.monto, porOrigen.caja?.titulo.endsWith("· Adelanto")], [`Caja #${f.turno.id} · efectivo`, 30000, true]);
  igual("el de Finanzas, el medio", [porOrigen.finanzas?.origen, porOrigen.finanzas?.monto], ["Finanzas · transferencia", 250000]);
  igual("Brenda: el aguinaldo", (s.empleados || []).find((e) => e.id === f.brenda.id)?.total, 10000);
  const eva = (s.empleados || []).find((e) => e.id === f.eva.id);
  igual("Eva, activa y sin cobrar, también tiene su renglón", [eva?.cantidadPagos, eva?.total, eva?.ultimo], [0, 0, null]);
  ok("sin sueldos viejos, no hay renglón 'Sin empleado asignado'", s.sinEmpleado === null, JSON.stringify(s.sinEmpleado));

  seccion("3 · Gastos ya no ofrece ni lista Sueldos");
  const cats = await leer(await rutaCategorias.GET(pedido(`${BASE}/finanzas/gastos/categorias`, f.veA, { metodo: "GET" })));
  ok("el catálogo de Gastos no trae Sueldos", cats.ok && !(cats.categorias || []).some((c) => c.nombre === "Sueldos"), JSON.stringify(cats.categorias));
  const gServ = await leer(await rutaGastos.POST(pedido(`${BASE}/finanzas/gastos`, f.finA, {
    cuerpo: { categoriaId: f.otra.id, concepto: "Luz", total: 5000, fecha: HOY, idempotencyKey: clave() },
  })));
  igual("un gasto común sigue entrando", gServ.ok, true);
  const lista = await leer(await rutaGastos.GET(pedido(`${BASE}/finanzas/gastos?estado=TODAS&pageSize=100`, f.finA, { metodo: "GET" })));
  const idsLista = (lista.gastos || []).map((g) => g.id);
  igual("la lista de Gastos trae el gasto común y ningún sueldo", [idsLista.includes(gServ.gasto.id), idsLista.some((id) => [pos.gastoId, aguinaldo.gastoId, fin.gasto.id].includes(id))], [true, false]);
  igual("y su cuenta tampoco los cuenta", lista.paginacion?.total, 1);

  seccion("4 · El Resumen financiero suma los sueldos como antes");
  const resumenDespues = await gastosDelResumen(f.finA);
  const sumaCruda = await prisma.$queryRaw`SELECT COALESCE(SUM(g."total"), 0)::float AS t FROM "Gasto" g WHERE g."localId" = ${f.A.id} AND g."fecha" >= date_trunc('month', ${HOY}::date) AND g."fecha" <= ${HOY}::date`;
  igual("lo que sumó: los tres sueldos y el gasto común", resumenDespues.gastos - resumenAntes.gastos, 30000 + 10000 + 250000 + 5000);
  igual("el total del Resumen es la suma de TODOS los gastos del período, sueldos incluidos", resumenDespues.gastos, Number(sumaCruda[0].t));

  seccion("5 · El relleno de la migración");
  const viejo = async (concepto, categoriaId) => (await prisma.gasto.create({
    data: { grupoId: f.grupo.id, localId: f.A.id, categoriaId, concepto, total: 1000, fecha: new Date(`${HOY}T12:00:00Z`), creadoPorId: f.finA.u.id, idempotencyKey: clave() },
    select: { id: true },
  })).id;
  // Las formas que dejó el POS antes de la columna, y las que no son suyas.
  const vSueldo = await viejo(`Sueldo · ${f.brenda.nombre}`, f.sueldos.id);
  const vAdelanto = await viejo(`Adelanto · ${f.brenda.nombre}`, f.sueldos.id);
  const vLibre = await viejo("Pago a Ana por la semana", f.sueldos.id);
  const vOtraCat = await viejo("Sueldo · de otra categoría", f.otra.id);
  const sql = readFileSync("prisma/migrations/20261019200000_gasto_modalidad_sueldo/migration.sql", "utf8");
  const relleno = sql.slice(sql.indexOf("UPDATE"));
  ok("la migración trae el relleno", relleno.startsWith("UPDATE \"Gasto\""), relleno.slice(0, 40));
  await prisma.$executeRawUnsafe(relleno);
  const marcados = await prisma.gasto.findMany({ where: { id: { in: [vSueldo, vAdelanto, vLibre, vOtraCat] } }, select: { id: true, modalidadSueldo: true }, orderBy: { id: "asc" } });
  igual("'Sueldo ·' → SUELDO, 'Adelanto ·' → ADELANTO, el libre y el de otra categoría quedan vacíos",
    marcados.map((m) => m.modalidadSueldo), ["SUELDO", "ADELANTO", null, null]);
  await prisma.$executeRawUnsafe(relleno);
  igual("correrla dos veces no cambia nada", (await prisma.gasto.findMany({ where: { id: { in: [vSueldo, vAdelanto, vLibre, vOtraCat] } }, select: { modalidadSueldo: true }, orderBy: { id: "asc" } })).map((m) => m.modalidadSueldo), ["SUELDO", "ADELANTO", null, null]);
  igual("y no tocó los sueldos nuevos", (await prisma.gasto.findUnique({ where: { id: aguinaldo.gastoId }, select: { modalidadSueldo: true } })).modalidadSueldo, "AGUINALDO");

  seccion("6 · Asignar empleado a un sueldo viejo");
  // Un sueldo viejo de Gastos tiene un pago real: se paga por su puerta.
  const pagoViejo = await leer(await rutaPagosGasto.POST(
    pedido(`${BASE}/finanzas/gastos/${vLibre}/pagos`, f.finA, { cuerpo: { monto: 1000, medio: "MERCADO_PAGO", fecha: HOY, idempotencyKey: clave() } }),
    { params: Promise.resolve({ gastoId: String(vLibre) }) }
  ));
  igual("el sueldo viejo tiene su pago", [pagoViejo.ok, await prisma.pagoGasto.count({ where: { gastoId: vLibre } })], [true, 1]);
  const s2 = await leerSueldos(f.finA);
  // La forma real que leen los candados de pantalla
  // (`components/finanzas/sueldos/sueldos.test.mjs`): con caja, Finanzas,
  // empleados sin pagos y sueldos sin empleado, con y sin pago.
  if (process.env.ESCRIBIR_FIXTURE_SUELDOS) {
    writeFileSync("components/finanzas/sueldos/lecturaReal.fixture.json", `${JSON.stringify(s2, null, 2)}\n`);
    console.log("  · fixture escrito");
  }
  const sin = s2.sinEmpleado;
  ok("aparece 'Sin empleado asignado' con los viejos sin empleado", Boolean(sin) && sin.sueldos.some((x) => x.id === vLibre), JSON.stringify(sin));
  const deSin = (id) => sin.sueldos.find((x) => x.id === id);
  igual("cada uno dice su importe y lo que se pagó, sin pisarse", [deSin(vLibre)?.total, deSin(vLibre)?.pagado, deSin(vSueldo)?.total, deSin(vSueldo)?.pagado], [1000, 1000, 1000, 0]);
  const fotoAntes = async () => ({
    gasto: await prisma.gasto.findUnique({ where: { id: vLibre }, select: { total: true, concepto: true, beneficiario: true, fecha: true, categoriaId: true } }),
    pagos: await prisma.pagoGasto.findMany({ where: { gastoId: vLibre }, select: { id: true, monto: true, medio: true, fecha: true, turnoId: true, cajaMovimientoId: true }, orderBy: { id: "asc" } }),
    movs: await prisma.cajaMovimiento.count({ where: { turnoId: f.turno.id } }),
  });
  const antesAsignar = JSON.stringify(await fotoAntes());
  const patch = (quien, gastoId, cuerpo) => rutaSueldo.PATCH(pedido(`${BASE}/finanzas/sueldos/${gastoId}`, quien, { metodo: "PATCH", cuerpo }), { params: Promise.resolve({ gastoId: String(gastoId) }) }).then(leer);
  r = await patch(f.finA, vLibre, { empleadoId: f.dora.id, modalidadSueldo: "SUELDO" });
  igual("un empleado de otro local: 400", [r.status, r.error], [400, "Ese empleado es de otro local."]);
  r = await patch(f.veA, vLibre, { empleadoId: f.carlos.id, modalidadSueldo: "SUELDO" });
  igual("con finanzas.ver solo: 403", r.status, 403);
  r = await patch(f.finB, vLibre, { empleadoId: f.dora.id, modalidadSueldo: "SUELDO" });
  igual("desde otro local: 403", r.status, 403);
  r = await patch(f.finA, gServ.gasto.id, { empleadoId: f.carlos.id, modalidadSueldo: "SUELDO" });
  igual("un gasto que no es sueldo: 400", r.status, 400);
  r = await patch(f.finA, vLibre, { empleadoId: f.carlos.id, modalidadSueldo: "VACACIONES" });
  igual("asignado", [r.status, r.ok, r.sueldo?.empleadoId, r.sueldo?.modalidadSueldo], [200, true, f.carlos.id, "VACACIONES"]);
  igual("el total, el concepto, el beneficiario, los pagos y la caja quedaron EXACTAMENTE igual", JSON.stringify(await fotoAntes()), antesAsignar);
  r = await patch(f.finA, vLibre, { empleadoId: f.brenda.id, modalidadSueldo: "SUELDO" });
  igual("ya asignado no se reasigna: 409", r.status, 409);
  const s3 = await leerSueldos(f.finA);
  ok("ya no está entre los sin empleado", !(s3.sinEmpleado?.sueldos || []).some((x) => x.id === vLibre));
  ok("y su pago pasa al historial de Carlos", (s3.empleados.find((e) => e.id === f.carlos.id)?.pagos || []).some((p) => p.gastoId === vLibre));
  igual("el total del período no cambió por asignar", s3.total, s2.total);

  seccion("7 · Cada local, sus empleados y sus sueldos");
  const sB = await leerSueldos(f.finB);
  igual("B ve solo a Dora", (sB.empleados || []).map((e) => e.id), [f.dora.id]);
  igual("y nada pagado", [sB.total, sB.sinEmpleado], [0, null]);
  const pagoB = await pagarSueldo(f.finB, sueldoFinanzas(f, { empleadoId: f.dora.id, monto: "1000" }));
  igual("B le paga a Dora", pagoB.ok, true);
  r = await pagarSueldo(f.finB, sueldoFinanzas(f, { empleadoId: f.carlos.id }));
  igual("B no le paga a Carlos, que es de A: 400", r.status, 400);
  ok("A no ve a Dora", !(await leerSueldos(f.finA)).empleados.some((e) => e.id === f.dora.id));
  r = await leerSueldos(f.finA, "unidad=OTRO&desde=2026-10-01");
  igual("un período mal pedido: 400, no otro período", r.status, 400);
}

// ═══════════════════════════════════════════════════════════════════════════

let f;
try {
  f = await montar();
  await casos(f);
} catch (e) {
  fallas.push(`[excepción] ${e.stack || e.message}`);
  console.error(e);
} finally {
  await desmontar().catch((e) => console.error("desmontar:", e.message));
  await prisma.$disconnect();
}

console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
