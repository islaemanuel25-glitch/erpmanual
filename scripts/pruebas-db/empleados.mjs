// PRUEBAS DE BASE DE EMPLEADOS Y DE LA CARGA A MANO DE UNA COMPRA POR CARGAR.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/empleados.mjs
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
//   A. LA MIGRACIÓN `20261015154425_empleados`, sobre una base AISLADA con el
//      esquema de antes y operadores, consumos y sueldos ya cargados: crea un
//      empleado por operador con sus locales, completa el empleado de consumos,
//      gastos de consumo y sueldos, y no le saca a nadie su operador. Y su
//      RELLENO es idempotente: correrlo otra vez no duplica ni cambia nada.
//   B. Operador nuevo → nace su empleado. Un empleado sin operador se da de
//      alta, y uno desactivado deja de ofrecerse y de aceptarse en Sueldo.
//   C. Una compra nacida de "Pagar → Proveedor" se carga a mano por el camino
//      sin papel (`agregar-item` + `recibir`): entra el stock y la caja NO se
//      descuenta otra vez; con un total distinto de lo pagado, no se recibe.
//
// La base aislada se crea y se tira acá; lo demás se monta y se desmonta sobre
// la base de la prueba. El cliente es el de `clientePrisma.mjs` en ESCRITURA.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const fs = await import("node:fs");
const path = await import("node:path");
const { execFileSync } = await import("node:child_process");
const { aplicarMigraciones, MIGRACIONES } = await import("./lib/libroEnElTiempo.mjs");

const MIGRACION = "20261015154425_empleados";
const ARCHIVO_MIGRACION = path.join(process.cwd(), "prisma", "migrations", MIGRACION, "migration.sql");

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

const urlDe = (db) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${db}`;
  return u.toString();
};
const sinParametros = (url) => {
  const u = new URL(url);
  u.search = "";
  return u.toString();
};
/** El relleno, tal cual está escrito en la migración, entre sus marcas. */
function bloqueDeRelleno() {
  const texto = fs.readFileSync(ARCHIVO_MIGRACION, "utf8");
  const desde = texto.indexOf("-- RELLENO:INICIO");
  const hasta = texto.indexOf("-- RELLENO:FIN");
  if (desde < 0 || hasta < 0) throw new Error("La migración perdió las marcas del relleno.");
  return texto.slice(desde, hasta);
}
const correrSql = (url, sql) =>
  execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// ═══════════════════════════════════════════════════════════════════════════
// A · LA MIGRACIÓN, SOBRE UNA BASE CON DATOS DE ANTES
// ═══════════════════════════════════════════════════════════════════════════

const DB = "erpazul_empleados_prueba";

async function sembrarAntes(url) {
  const p = await crearClientePrisma({ nivel: ESCRITURA, url });
  try {
    const grupo = await p.grupo.create({ data: { nombre: "Grupo previo" }, select: { id: true } });
    const localA = await p.local.create({ data: { nombre: "Local A" }, select: { id: true } });
    const localB = await p.local.create({ data: { nombre: "Local B" }, select: { id: true } });
    await p.grupoLocal.create({ data: { grupoId: grupo.id, localId: localA.id } });
    await p.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });
    const rol = await p.rol.create({ data: { nombre: "Previo", permisos: [] }, select: { id: true } });
    const u = await p.usuario.create({
      data: { nombre: "Previo", email: "previo-empleados@ci.local", passwordHash: "x", rolId: rol.id, localId: localA.id },
      select: { id: true },
    });
    // `select` en todo: el cliente es el de hoy y la base todavía no tiene las
    // columnas nuevas; el RETURNING por defecto las pediría.
    const ana = await p.operadorLocal.create({ data: { nombre: "Ana previa", pinHash: "x" }, select: { id: true, nombre: true } });
    const beto = await p.operadorLocal.create({ data: { nombre: "Beto previo", pinHash: "x", activo: false }, select: { id: true, nombre: true } });
    await p.operadorEnLocal.createMany({
      data: [
        { operadorId: ana.id, localId: localA.id },
        { operadorId: ana.id, localId: localB.id },
        { operadorId: beto.id, localId: localA.id },
      ],
    });
    const turno = await p.turno.create({
      data: { localId: localA.id, vendedorId: u.id, operadorId: ana.id, montoInicial: 0, apertura: new Date() },
      select: { id: true },
    });
    const cat = async (nombre) => (await p.categoriaGasto.findUnique({ where: { nombre }, select: { id: true } })).id;
    const gasto = (data) => p.gasto.create({
      data: { grupoId: grupo.id, localId: localA.id, total: 100, fecha: new Date("2026-10-15"), creadoPorId: u.id, ...data },
      select: { id: true },
    });
    const gastoConsumo = await gasto({ categoriaId: await cat("Consumo del personal"), concepto: "Consumo previo", idempotencyKey: "g1" });
    const consumo = await p.consumoPersonal.create({
      data: { localId: localA.id, turnoId: turno.id, operadorId: ana.id, usuarioId: u.id, gastoId: gastoConsumo.id, totalCosto: 100, totalPrecio: 150, idempotencyKey: "c1" },
      select: { id: true },
    });
    const sueldoAna = await gasto({ categoriaId: await cat("Sueldos"), concepto: "Adelanto · Ana previa", beneficiario: ana.nombre, idempotencyKey: "g2" });
    const sueldoOtro = await gasto({ categoriaId: await cat("Sueldos"), concepto: "Sueldo · Alguien", beneficiario: "Alguien sin operador", idempotencyKey: "g3" });
    return { localA, localB, ana, beto, consumo, gastoConsumo, sueldoAna, sueldoOtro };
  } finally {
    await p.$disconnect();
  }
}

async function estadoDeEmpleados(c) {
  return {
    empleados: await c.empleado.count(),
    locales: await c.empleadoEnLocal.count(),
  };
}

async function casoMigracion() {
  seccion("A · La migración: un empleado por operador, y el relleno idempotente");
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${DB}"`);
  const url = sinParametros(urlDe(DB));
  try {
    aplicarMigraciones(url, { hasta: MIGRACION });
    const s = await sembrarAntes(urlDe(DB));
    // Hasta antes de `operadores_y_empleados_por_local`: esta siembra tiene a
    // Ana en DOS locales, que es justo lo que esa migración frena. Su caso
    // vive en `operadoresPorLocal.mjs`.
    aplicarMigraciones(url, { solo: MIGRACIONES.filter((m) => m >= MIGRACION && m < "20261015232632_operadores_y_empleados_por_local") });

    const c = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(DB) });
    try {
      const empleados = await c.empleado.findMany({
        select: { nombre: true, activo: true, operadorId: true, locales: { select: { localId: true }, orderBy: { localId: "asc" } } },
        orderBy: { nombre: "asc" },
      });
      igual(
        "un empleado por operador, con su nombre, su estado y sus locales",
        empleados.map((e) => [e.nombre, e.activo, e.operadorId, e.locales.map((l) => l.localId)]),
        [
          ["Ana previa", true, s.ana.id, [s.localA.id, s.localB.id]],
          ["Beto previo", false, s.beto.id, [s.localA.id]],
        ]
      );
      const empAna = await c.empleado.findUnique({ where: { operadorId: s.ana.id }, select: { id: true } });
      const consumo = await c.consumoPersonal.findUnique({ where: { id: s.consumo.id }, select: { empleadoId: true, operadorId: true } });
      igual("el consumo pasa a su empleado y conserva su operador", [consumo.empleadoId, consumo.operadorId], [empAna.id, s.ana.id]);
      const gastos = await c.gasto.findMany({
        where: { id: { in: [s.gastoConsumo.id, s.sueldoAna.id, s.sueldoOtro.id] } },
        select: { id: true, empleadoId: true },
        orderBy: { id: "asc" },
      });
      igual(
        "el gasto del consumo y el sueldo de Ana, a su empleado; el de alguien sin operador, sin empleado",
        gastos.map((g) => g.empleadoId),
        [empAna.id, empAna.id, null]
      );

      const antes = await estadoDeEmpleados(c);
      // Si el relleno no es idempotente, la segunda vuelta duplica o choca con
      // un UNIQUE: las dos cosas tienen que caer en ESTA afirmación.
      let errorDelRelleno = null;
      try {
        correrSql(url, bloqueDeRelleno());
        correrSql(url, bloqueDeRelleno());
      } catch (e) {
        errorDelRelleno = `${e.stderr || e.message}`.split("\n")[0];
      }
      ok(
        "el relleno corrido dos veces más no duplica nada",
        errorDelRelleno === null && JSON.stringify(await estadoDeEmpleados(c)) === JSON.stringify(antes),
        errorDelRelleno ?? `antes ${JSON.stringify(antes)}, después ${JSON.stringify(await estadoDeEmpleados(c))}`
      );
      const otraVez = await c.consumoPersonal.findUnique({ where: { id: s.consumo.id }, select: { empleadoId: true } });
      igual("y no cambia lo asignado", otraVez.empleadoId, empAna.id);
    } finally {
      await c.$disconnect();
    }
  } finally {
    await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// B y C · SOBRE LA BASE DE LA PRUEBA, CON LAS RUTAS REALES
// ═══════════════════════════════════════════════════════════════════════════

const prisma = principal;
const SECRETO = process.env.AUTH_SECRET;
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const rutaCrearOperador = await import("../../app/api/operador/crear/route.js");
const rutaCrearEmpleado = await import("../../app/api/empleados/crear/route.js");
const rutaEditarEmpleado = await import("../../app/api/empleados/editar/route.js");
const rutaListarEmpleados = await import("../../app/api/empleados/listar-todos/route.js");
const rutaPagar = await import("../../app/api/pos-ventas/pagar/route.js");
const rutaAgregar = await import("../../app/api/compras-proveedor/agregar-item/[id]/route.js");
const rutaConciliacion = await import("../../app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");

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
const BASE = "http://ci/api";
const marca = `ci-empleados-${Date.now()}`;
let n = 0;
const clave = () => `${marca}-${(n += 1)}`;
const creado = { grupoId: null, locales: [], usuarios: [], roles: [], operadorIds: [], empleadoIds: [], bases: [], proveedorId: null };

async function montar() {
  // Quien carga la compra TAMBIÉN puede registrar pagos: si el pago de la caja
  // no se contara, el cierre sacaría plata otra vez y se vería, en vez de
  // frenarse por falta de permiso y tapar el doble descuento.
  const PERMISOS_COMPRAS = ["compras.ver", "compras.crear", "compras.recibir", "finanzas.ver", "finanzas.pagos_proveedores.registrar"];
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: [] } });
  creado.roles.push(rol.id);
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.locales.push(deposito.id, local.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });

  const usuario = async (nombre, permisos) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${nombre}`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
    });
    creado.usuarios.push(u.id);
    return { u, sesion: jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId: local.id, permisos }, SECRETO, { expiresIn: "1h" }) };
  };
  const encargado = await usuario("encargado", ["config_local.operadores"]);
  const cajero = await usuario("cajero", ["pos.usar"]);
  const compras = await usuario("compras", PERMISOS_COMPRAS);

  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-Panaderia`, creadoEnLocalId: local.id } });
  creado.proveedorId = proveedor.id;
  const base = await prisma.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-pan`, precio_costo: 100, precio_venta: 150, unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" },
  });
  creado.bases.push(base.id);
  const pl = await prisma.productoLocal.create({ data: { localId: local.id, baseId: base.id, precio_costo: 100, precio_venta: 150 } });
  return { grupo, local, encargado, cajero, compras, proveedor, pl };
}

async function desmontar() {
  const localId = creado.locales[1];
  if (localId) {
    const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
    const pedidos = (await prisma.pedidoProveedor.findMany({ where: { grupoId: creado.grupoId }, select: { id: true } })).map((p) => p.id);
    await prisma.pagoProveedor.deleteMany({ where: { cuenta: { grupoId: creado.grupoId } } });
    await prisma.cuentaPorPagarProveedor.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.pagoGasto.deleteMany({ where: { gasto: { grupoId: creado.grupoId } } });
    await prisma.gasto.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.pedidoProveedorDetalle.deleteMany({ where: { pedidoId: { in: pedidos } } });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: pedidos } } });
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
    await prisma.turno.deleteMany({ where: { localId } });
    const pls = (await prisma.productoLocal.findMany({ where: { baseId: { in: creado.bases } }, select: { id: true } })).map((p) => p.id);
    await prisma.stockLocal.deleteMany({ where: { productoId: { in: pls } } });
    await prisma.configuracionLocal.deleteMany({ where: { localId } });
    const empleados = (await prisma.empleado.findMany({ where: { localId }, select: { id: true } })).map((e) => e.id);
    await prisma.empleado.deleteMany({ where: { id: { in: [...empleados, ...creado.empleadoIds] } } });
    const ops = (await prisma.operadorLocal.findMany({ where: { localId }, select: { id: true } })).map((o) => o.id);
    creado.operadorIds.push(...ops);
  }
  if (creado.proveedorId) await prisma.proveedor.updateMany({ where: { id: creado.proveedorId }, data: { activo: false } }).catch(() => {});
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } }).catch(() => {});
}

async function casosEmpleados(f) {
  seccion("B · Operador nuevo → su empleado; empleados sin operador");
  const quienEnc = { sesion: f.encargado.sesion };
  const op = await leer(await rutaCrearOperador.POST(pedido(`${BASE}/operador/crear`, quienEnc, {
    cuerpo: { nombre: `${marca}-Caro`, pin: "1234" },
  })));
  igual("el operador se crea", [op.status, op.ok], [200, true]);
  creado.operadorIds.push(op.operador.id);
  const suyo = await prisma.empleado.findUnique({
    where: { operadorId: op.operador.id },
    select: { nombre: true, activo: true, localId: true },
  });
  igual("y nace su empleado, con su nombre y su local", [suyo?.nombre, suyo?.activo, suyo?.localId], [`${marca}-Caro`, true, f.local.id]);

  const cocina = await leer(await rutaCrearEmpleado.POST(pedido(`${BASE}/empleados/crear`, quienEnc, {
    cuerpo: { nombre: `${marca}-Cocinero` },
  })));
  igual("un empleado SIN operador se da de alta", [cocina.status, cocina.ok, cocina.empleado?.operador], [200, true, null]);
  const ajeno = await leer(await rutaCrearEmpleado.POST(pedido(`${BASE}/empleados/crear?localId=${f.local.id + 999999}`, quienEnc, {
    cuerpo: { nombre: `${marca}-Ajeno` },
  })));
  igual("un no-admin no da de alta en otro local", ajeno.status, 403);
  const ocupado = await leer(await rutaCrearEmpleado.POST(pedido(`${BASE}/empleados/crear`, quienEnc, {
    cuerpo: { nombre: `${marca}-Otro`, operadorId: op.operador.id },
  })));
  igual("un operador que ya es de un empleado no se asocia a otro", ocupado.status, 409);
  const lista = await leer(await rutaListarEmpleados.GET(pedido(`${BASE}/empleados/listar-todos`, quienEnc, { metodo: "GET" })));
  ok("la lista trae a los dos", ["Caro", "Cocinero"].every((x) => (lista.items || []).some((e) => e.nombre === `${marca}-${x}`)));

  // La caja, para pagar un sueldo y la compra de C.
  const turno = await prisma.turno.create({
    data: { localId: f.local.id, vendedorId: f.cajero.u.id, operadorId: op.operador.id, montoInicial: 50000, apertura: new Date() },
  });
  const quienCaja = { sesion: f.cajero.sesion, operador: firmarTokenOperador({ operadorId: op.operador.id, nombre: op.operador.nombre, localId: f.local.id }) };
  const pagar = async (cuerpo) =>
    leer(await rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, quienCaja, { cuerpo: { turnoId: turno.id, idempotencyKey: clave(), ...cuerpo } })));

  const sueldo = await pagar({ tipo: "SUELDO", monto: "2000", empleadoId: cocina.empleado.id });
  igual("el empleado sin operador cobra su sueldo", sueldo.ok, true);

  const baja = await leer(await rutaEditarEmpleado.POST(pedido(`${BASE}/empleados/editar`, quienEnc, {
    cuerpo: { id: cocina.empleado.id, activo: false },
  })));
  igual("se desactiva", [baja.ok, baja.empleado?.activo], [true, false]);
  const opciones = await leer(await rutaPagar.GET(pedido(`${BASE}/pos-ventas/pagar?turnoId=${turno.id}`, quienCaja, { metodo: "GET" })));
  ok("desactivado, Pagar ya no lo ofrece", !(opciones.empleados || []).some((e) => e.id === cocina.empleado.id));
  const rechazado = await pagar({ tipo: "SUELDO", monto: "2000", empleadoId: cocina.empleado.id });
  igual("ni lo acepta", [rechazado.status, rechazado.error], [400, "Elegí el empleado."]);

  return { turno, quienCaja, pagar };
}

async function casosCargaAMano(f, { turno, pagar }) {
  seccion("C · Compra por cargar, cargada a mano: sin doble descuento");
  const quienCompras = { sesion: f.compras.sesion };
  const movimientos = () => prisma.cajaMovimiento.count({ where: { turnoId: turno.id } });

  const prov = await pagar({ tipo: "PROVEEDOR", monto: "1500", proveedorId: f.proveedor.id });
  igual("el pago al proveedor desde la caja", prov.ok, true);
  const pedidoId = prov.pedidoProveedorId;
  const ctx = { params: Promise.resolve({ id: String(pedidoId) }) };

  const agregado = await leer(await rutaAgregar.POST(pedido(`${BASE}/compras-proveedor/agregar-item/${pedidoId}`, quienCompras, {
    cuerpo: { productoLocalId: f.pl.id, cantidad: 1, cantidadRecibida: 1, precioCosto: 1500, unidad: "UNIDAD" },
  }), ctx));
  igual("'Agregar producto' carga la línea, sin papel", [agregado.status, agregado.ok], [200, true]);
  const det = await prisma.pedidoProveedorDetalle.findFirst({ where: { pedidoId }, select: { id: true } });
  const conc = await leer(await rutaConciliacion.GET(
    pedido(`${BASE}/compras-proveedor/conciliacion/${pedidoId}`, quienCompras, { metodo: "GET" }),
    { params: Promise.resolve({ pedidoId: String(pedidoId) }) }
  ));
  ok("la recepción sin papel la ve como fila", (conc.sinComprobante || []).some((d) => d.pedidoDetalleId === det.id));

  const recibir = async (pago) =>
    leer(await rutaRecibir.POST(pedido(`${BASE}/compras-proveedor/recibir/${pedidoId}`, quienCompras, {
      cuerpo: { recibidos: { [det.id]: 1 }, costosExcluidos: [det.id], pagoAlProveedor: pago },
    }), ctx));
  const movsAntes = await movimientos();

  const distinto = await recibir({ estado: "PAGADA", totalAPagar: "1000", totalConfirmado: true, pago: { medio: "EFECTIVO", turnoId: turno.id } });
  igual("con un total distinto de lo pagado no se recibe", distinto.status, 409);
  igual("y queda por cargar", (await prisma.pedidoProveedor.findUnique({ where: { id: pedidoId }, select: { estado: true } })).estado, "ENVIADO");

  const ok1 = await recibir({ estado: "PAGADA", totalAPagar: "1500", totalConfirmado: true, pago: { medio: "EFECTIVO", turnoId: turno.id } });
  igual("con el total de lo pagado se recibe", [ok1.status, ok1.ok], [200, true]);
  igual("la caja NO se descuenta otra vez", await movimientos(), movsAntes);
  const cuenta = await prisma.cuentaPorPagarProveedor.findUnique({ where: { pedidoProveedorId: pedidoId }, select: { total: true, pagos: { select: { id: true } } } });
  igual("la cuenta queda con UN pago, el de la caja, y el total cargado", [cuenta.pagos.length, Number(cuenta.total)], [1, 1500]);
  const stock = await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: f.local.id, productoId: f.pl.id } }, select: { cantidad: true } });
  ok("y el stock entró", Number(stock?.cantidad ?? 0) > 0, `stock ${stock?.cantidad}`);
}

// ═══════════════════════════════════════════════════════════════════════════

try {
  await casoMigracion();
} catch (e) {
  fallas.push(`[excepción en A] ${e.stderr || ""}${e.stack || e.message}`);
  console.error(e);
}

let f;
try {
  f = await montar();
  const caja = await casosEmpleados(f);
  await casosCargaAMano(f, caja);
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
