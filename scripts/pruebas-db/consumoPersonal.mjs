// PRUEBAS DE BASE DEL CONSUMO DEL PERSONAL Y DE LA FOTO DEL GASTO.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/consumoPersonal.mjs
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
// Se ejercen los handlers REALES contra Postgres —`pos-ventas/consumo-personal`,
// `pos-ventas/pagar` y `finanzas/gastos/[gastoId]/archivo`— con sesiones
// firmadas como las del login, y se mira la base:
//
//   1. el consumo descuenta el stock y deja su movimiento en el Libro con su
//      origen y el id del consumo;
//   2. NO crea Venta ni movimiento de caja, y el efectivo esperado no se mueve;
//   3. el gasto sale al COSTO, en su categoría, sin pago y sin figurar como
//      pendiente; no se puede pagar;
//   4. el mismo intento repetido no descuenta otra vez;
//   5. el resultado del turno lo resta UNA vez, en su fila, y "Sueldos y
//      gastos" no lo cuenta;
//   6. la foto de un gasto se guarda y se lee, y un cajero ajeno no la ve.
//
// Los datos se montan y se desmontan acá, sobre una base descartable. El
// cliente es el de `clientePrisma.mjs` en ESCRITURA: host local y NODE_ENV
// distinto de production, o aborta.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const rutaConsumo = await import("../../app/api/pos-ventas/consumo-personal/route.js");
const rutaPagar = await import("../../app/api/pos-ventas/pagar/route.js");
const rutaArchivo = await import("../../app/api/finanzas/gastos/[gastoId]/archivo/route.js");
const { leerDetalleDeCaja } = await import("../../lib/turnosYCierres/lecturaTurnosYCierresServer.js");
const { SQL_GASTO_SALDADO, registrarPagoGasto } = await import("../../lib/finanzas/gastosServer.js");
const { NOMBRE_CENTINELA } = await import("../../lib/compras-proveedor/comprobante/almacenImagenes.js");
const { VARIABLE_RUTA } = await import("../../lib/compras-proveedor/comprobante/almacenDisco.js");

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
function pedido(url, quien, { metodo = "POST", cuerpo, form } = {}) {
  const headers = { cookie: cookieDe(quien) };
  if (!form) headers["content-type"] = "application/json";
  const req = new Request(url, {
    method: metodo,
    headers,
    body: metodo === "GET" ? undefined : form ?? JSON.stringify(cuerpo ?? {}),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

const marca = `ci-consumo-${Date.now()}`;
const creado = { grupoId: null, locales: [], usuarios: [], roles: [], operadorIds: [], bases: [], almacen: null };

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

async function montar() {
  const rolCajero = await prisma.rol.create({ data: { nombre: `${marca}-cajero`, permisos: ["pos.usar"] } });
  creado.roles.push(rolCajero.id);
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.locales.push(deposito.id, local.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });

  const usuario = async (nombre) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${nombre}`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rolCajero.id, localId: local.id },
    });
    creado.usuarios.push(u.id);
    return { u, sesion: jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId: local.id, permisos: ["pos.usar"] }, SECRETO, { expiresIn: "1h" }) };
  };
  const cajero = await usuario("cajero");
  const otroCajero = await usuario("otro");

  const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-Brenda`, pinHash: "x", localId: local.id } });
  creado.operadorIds.push(op.id);
  // Quien consume es una EMPLEADA SIN OPERADOR: trabaja en la cocina y no
  // maneja la caja. Es el caso que Empleados existe para cubrir.
  const consume = await prisma.empleado.create({
    data: { nombre: `${marca}-Mariangel`, localId: local.id },
  });
  // Y el empleado de la cajera, que cobra el sueldo de la sección 5.
  const empleadoOp = await prisma.empleado.create({
    data: { nombre: op.nombre, operadorId: op.id, localId: local.id },
  });
  creado.empleadoIds = [consume.id, empleadoOp.id];

  const turno = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajero.u.id, operadorId: op.id, montoInicial: 50000, apertura: new Date() },
  });

  // Gaseosa por unidad (costo 100, venta 150) y fiambre por kilo (costo 8000/kg).
  const gaseosa = await prisma.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-gaseosa`, precio_costo: 100, precio_venta: 150, unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" },
  });
  const fiambre = await prisma.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-fiambre`, precio_costo: 8000, precio_venta: 12000, unidad_medida: "kg", modoCompraProveedor: "UNIDAD" },
  });
  creado.bases.push(gaseosa.id, fiambre.id);
  const plG = await prisma.productoLocal.create({ data: { localId: local.id, baseId: gaseosa.id, precio_costo: 100, precio_venta: 150 } });
  const plF = await prisma.productoLocal.create({ data: { localId: local.id, baseId: fiambre.id, precio_costo: 8000, precio_venta: 12000 } });
  await prisma.stockLocal.create({ data: { localId: local.id, productoId: plG.id, cantidad: 10 } });
  await prisma.stockLocal.create({ data: { localId: local.id, productoId: plF.id, cantidad: 5 } });

  creado.almacen = await mkdtemp(join(tmpdir(), "ci-gastos-"));
  await writeFile(join(creado.almacen, NOMBRE_CENTINELA), "");
  process.env[VARIABLE_RUTA] = creado.almacen;

  const quien = (c) => ({ sesion: c.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: local.id }) });
  return { grupo, local, cajero, otroCajero, op, consume, empleadoOp, turno, gaseosa, fiambre, plG, plF, quienCaja: quien(cajero), quienOtro: { sesion: otroCajero.sesion } };
}

async function desmontar() {
  const localId = creado.locales[1];
  if (localId) {
    const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
    await prisma.consumoPersonal.deleteMany({ where: { localId } });
    await prisma.gastoArchivo.deleteMany({ where: { gasto: { grupoId: creado.grupoId } } });
    await prisma.pagoGasto.deleteMany({ where: { gasto: { grupoId: creado.grupoId } } });
    await prisma.gasto.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
    await prisma.turno.deleteMany({ where: { localId } });
    const pls = (await prisma.productoLocal.findMany({ where: { baseId: { in: creado.bases } }, select: { id: true } })).map((p) => p.id);
    await prisma.stockLocal.deleteMany({ where: { productoId: { in: pls } } });
    await prisma.configuracionLocal.deleteMany({ where: { localId } });
  }
  // El libro de stock no deja borrar sus movimientos: los productos quedan.
  if (creado.empleadoIds) await prisma.empleado.deleteMany({ where: { id: { in: creado.empleadoIds } } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } }).catch(() => {});
  if (creado.almacen) await rm(creado.almacen, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// AYUDAS
// ═══════════════════════════════════════════════════════════════════════════

const BASE = "http://ci/api";
let n = 0;
const clave = () => `ci-consumo-${Date.now()}-${(n += 1)}`;
const consumir = async (f, cuerpo) =>
  leer(await rutaConsumo.POST(pedido(`${BASE}/pos-ventas/consumo-personal`, f.quienCaja, { cuerpo: { turnoId: f.turno.id, ...cuerpo } })));
const stockDe = async (f, pl) =>
  Number((await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: f.local.id, productoId: pl.id } }, select: { cantidad: true } })).cantidad);
const detalle = async (f) => (await leerDetalleDeCaja(prisma, f.turno.id)).detalle;

// ═══════════════════════════════════════════════════════════════════════════
// CASOS
// ═══════════════════════════════════════════════════════════════════════════

async function casos(f) {
  const items = [
    { productoBaseId: f.gaseosa.id, nombre: "Gaseosa", precio: 150, cantidad: 2, precioCosto: 100, modoVentaLinea: "NORMAL" },
    { productoBaseId: f.fiambre.id, nombre: "Fiambre", precio: 12000, cantidad: 0.25, precioCosto: 8000, modoVentaLinea: "NORMAL" },
  ];
  const antes = await detalle(f);
  const ventasAntes = await prisma.venta.count({ where: { localId: f.local.id } });
  const movsAntes = await prisma.cajaMovimiento.count({ where: { turnoId: f.turno.id } });

  seccion("1 · El consumo sale del stock, con su origen en el Libro");
  const claveC = clave();
  const r = await consumir(f, { empleadoId: f.consume.id, items, idempotencyKey: claveC });
  igual("una empleada SIN operador registra su consumo", [r.status, r.ok], [200, true]);
  const fila = await prisma.consumoPersonal.findUnique({ where: { id: r.consumoId }, select: { empleadoId: true, operadorId: true } });
  igual("el consumo es de la empleada, sin operador", [fila.empleadoId, fila.operadorId], [f.consume.id, null]);
  igual("gaseosa: 10 − 2", await stockDe(f, f.plG), 8);
  igual("fiambre: 5 − 0,25 kg", await stockDe(f, f.plF), 4.75);
  const libro = await prisma.movimientoStock.findMany({
    where: { origen: "CONSUMO_PERSONAL", origenRef: String(r.consumoId) },
    select: { id: true },
  });
  igual("dos movimientos en el Libro, del consumo", libro.length, 2);

  seccion("2 · No es una venta y no toca la caja");
  igual("no hay Venta nueva", await prisma.venta.count({ where: { localId: f.local.id } }), ventasAntes);
  igual("no hay movimiento de caja nuevo", await prisma.cajaMovimiento.count({ where: { turnoId: f.turno.id } }), movsAntes);
  const desp = await detalle(f);
  igual("el efectivo esperado no se movió", desp.efectivo.teniaQueHaber, antes.efectivo.teniaQueHaber);
  igual("ni los tickets ni lo vendido", [desp.metricas.tickets, desp.metricas.bruto], [antes.metricas.tickets, antes.metricas.bruto]);

  seccion("3 · El gasto sale al costo, sin pago, y no es deuda");
  // Costo: 2 × 100 + 0,25 × 8000 = 2200. Precio de venta: 2 × 150 + 0,25 × 12000 = 3300.
  igual("el consumo al costo", r.totalCosto, 2200);
  const gasto = await prisma.gasto.findUnique({
    where: { id: r.gastoId },
    select: { total: true, beneficiario: true, concepto: true, localId: true, empleadoId: true, categoria: { select: { nombre: true } }, pagos: { select: { id: true } } },
  });
  igual("gasto por el COSTO, no por el precio", Number(gasto.total), 2200);
  igual("el gasto es de la empleada", gasto.empleadoId, f.consume.id);
  igual("en su categoría, a nombre de quien consumió", [gasto.categoria.nombre, gasto.beneficiario], ["Consumo del personal", f.consume.nombre]);
  ok("el concepto dice quién y qué", gasto.concepto.includes(f.consume.nombre) && gasto.concepto.includes("Gaseosa"));
  igual("sin pagos", gasto.pagos.length, 0);
  const saldado = await prisma.$queryRaw`SELECT g."id" FROM "Gasto" g WHERE g."id" = ${r.gastoId} AND ${SQL_GASTO_SALDADO}`;
  igual("el SQL de saldado lo da por saldado: no figura como pendiente", saldado.length, 1);
  let rechazoPago = null;
  try {
    await prisma.$transaction((tx) =>
      registrarPagoGasto(tx, {
        gastoId: r.gastoId, monto: "2200", medio: "TRANSFERENCIA", fecha: "2026-10-15",
        localOrigenId: f.local.id, localOperativoId: f.local.id, idempotencyKey: clave(),
        session: { id: f.cajero.u.id, permisos: ["finanzas.ver", "finanzas.gastos.registrar"] },
      })
    );
  } catch (e) { rechazoPago = e.message; }
  igual("y no se puede pagar", rechazoPago, "El consumo del personal no se paga: sale del stock.");

  seccion("4 · El mismo intento no descuenta otra vez");
  const otra = await consumir(f, { empleadoId: f.consume.id, items, idempotencyKey: claveC });
  igual("devuelve el mismo consumo", [otra.ok, otra.repetido, otra.consumoId], [true, true, r.consumoId]);
  igual("el stock sigue igual", [await stockDe(f, f.plG), await stockDe(f, f.plF)], [8, 4.75]);
  igual("un solo gasto", await prisma.gasto.count({ where: { grupoId: f.grupo.id } }), 1);

  seccion("5 · El resultado del turno lo resta una vez");
  const sueldo = await leer(await rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, f.quienCaja, {
    cuerpo: { turnoId: f.turno.id, tipo: "SUELDO", monto: "1000", empleadoId: f.empleadoOp.id, idempotencyKey: clave() },
  })));
  igual("un sueldo desde la caja", sueldo.ok, true);
  // Un adelanto a la empleada SIN operador: Sueldo elige de Empleados.
  const adelanto = await leer(await rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, f.quienCaja, {
    cuerpo: { turnoId: f.turno.id, tipo: "SUELDO", modalidad: "ADELANTO", monto: "500", empleadoId: f.consume.id, idempotencyKey: clave() },
  })));
  igual("una empleada sin operador cobra un adelanto", adelanto.ok, true);
  const gastoAdelanto = await prisma.gasto.findUnique({ where: { id: adelanto.gastoId }, select: { empleadoId: true, beneficiario: true } });
  igual("el sueldo queda a nombre de la empleada", [gastoAdelanto.empleadoId, gastoAdelanto.beneficiario], [f.consume.id, f.consume.nombre]);
  const deEmpleados = await leer(await rutaPagar.GET(pedido(`${BASE}/pos-ventas/pagar?turnoId=${f.turno.id}`, f.quienCaja, { metodo: "GET" })));
  ok("Pagar ofrece la empleada sin operador", (deEmpleados.empleados || []).some((e) => e.id === f.consume.id));
  const det = await detalle(f);
  igual("sueldos y gastos NO cuenta el consumo", det.metricas.sueldosYGastos, 1500);
  igual("consumo del personal en su fila", det.metricas.consumoPersonal, 2200);
  igual("resultado = 0 − 0 − 1500 − 2200", det.metricas.resultado, -3700);
  igual("el detalle dice quién y cuánto", det.consumos.map((c) => [c.quien, c.productos, c.costo]), [[f.consume.nombre, 2, 2200]]);

  seccion("6 · Rechazos que no escriben nada");
  const sinStock = await consumir(f, { empleadoId: f.consume.id, items: [{ ...items[0], cantidad: 99 }], idempotencyKey: clave() });
  igual("sin stock suficiente se frena", sinStock.status, 409);
  igual("y no descontó", await stockDe(f, f.plG), 8);
  const ajeno = await consumir(f, { empleadoId: 999999, items, idempotencyKey: clave() });
  igual("quien consume tiene que ser del local", [ajeno.status, ajeno.error], [400, "Elegí quién lo consume."]);
  igual("ningún consumo de más", await prisma.consumoPersonal.count({ where: { localId: f.local.id } }), 1);

  seccion("7 · La foto del gasto se guarda y se lee");
  const gastoPos = await leer(await rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, f.quienCaja, {
    cuerpo: {
      turnoId: f.turno.id, tipo: "GASTO", monto: "500",
      categoriaId: (await prisma.categoriaGasto.findFirst({ where: { activo: true, nombre: { notIn: ["Sueldos", "Consumo del personal"] } } })).id,
      idempotencyKey: clave(),
    },
  })));
  igual("un gasto desde Pagar", gastoPos.ok, true);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7, Date.now() % 255]);
  const form = new FormData();
  form.append("archivo", new File([bytes], "ticket.jpg", { type: "image/jpeg" }));
  const ctx = { params: Promise.resolve({ gastoId: String(gastoPos.gastoId) }) };
  const subida = await leer(await rutaArchivo.POST(pedido(`${BASE}/finanzas/gastos/${gastoPos.gastoId}/archivo`, f.quienCaja, { form }), ctx));
  igual("la foto entra", [subida.status, subida.ok, subida.archivo?.orden], [200, true, 1]);
  const lectura = await rutaArchivo.GET(
    pedido(`${BASE}/finanzas/gastos/${gastoPos.gastoId}/archivo?orden=1`, f.quienCaja, { metodo: "GET" }),
    { params: Promise.resolve({ gastoId: String(gastoPos.gastoId) }) }
  );
  const leidos = Buffer.from(await lectura.arrayBuffer());
  igual("y se lee igual", [lectura.status, lectura.headers.get("content-type"), leidos.equals(bytes)], [200, "image/jpeg", true]);
  const ajenoFoto = await rutaArchivo.GET(
    pedido(`${BASE}/finanzas/gastos/${gastoPos.gastoId}/archivo?orden=1`, f.quienOtro, { metodo: "GET" }),
    { params: Promise.resolve({ gastoId: String(gastoPos.gastoId) }) }
  );
  igual("otro cajero no la ve", ajenoFoto.status, 403);
  const opciones = await leer(await rutaPagar.GET(pedido(`${BASE}/pos-ventas/pagar?turnoId=${f.turno.id}`, f.quienCaja, { metodo: "GET" })));
  ok("Pagar no ofrece Consumo del personal como gasto", !(opciones.categorias || []).some((c) => c.nombre === "Consumo del personal"));
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

// La primera línea es la que lee contrapruebasRevision.mjs para saber que corrió.
console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} en verde, ${fallas.length} en rojo`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
