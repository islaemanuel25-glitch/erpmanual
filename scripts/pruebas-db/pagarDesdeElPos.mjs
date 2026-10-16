// PRUEBAS DE BASE DE "PAGAR" DESDE EL POS Y DE CARGAR UNA COMPRA POR CARGAR.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/pagarDesdeElPos.mjs
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
// Se ejercen los handlers REALES contra Postgres —`pos-ventas/pagar`,
// `compras-proveedor/recibir/[id]`, `compras-proveedor/comprobantes/subir` y
// `compras-proveedor/por-cargar`— con sesiones firmadas como las del login, y
// se mira la base:
//
//   1. cada tipo queda en su módulo y saca UN movimiento de la caja, con su tipo;
//   2. el mismo intento repetido no saca la plata otra vez;
//   3. cargar la compra por cargar NO vuelve a descontar la caja: los pagos de
//      la cuenta y los movimientos del turno quedan como estaban;
//   4. lo pagado de más se frena sin escribir nada;
//   5. el efectivo esperado es el mismo con tipo y sin tipo;
//   6. el resultado del turno resta solo sueldos y gastos.
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
const rutaPagar = await import("../../app/api/pos-ventas/pagar/route.js");
const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
const rutaPorCargar = await import("../../app/api/compras-proveedor/por-cargar/route.js");
const rutaSubir = await import("../../app/api/compras-proveedor/comprobantes/subir/route.js");
const rutaClasificar = await import("../../app/api/turnos-y-cierres/movimientos/[id]/route.js");
const { leerDetalleDeCaja } = await import("../../lib/turnosYCierres/lecturaTurnosYCierresServer.js");
const { pagadoAlDepositoDesdeCaja } = await import("../../lib/finanzas/pagoADepositoDesdeCajaServer.js");
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

const marca = `ci-pagar-pos-${Date.now()}`;
const creado = { grupoId: null, locales: [], usuarios: [], roles: [], operadorIds: [], proveedorId: null, bases: [], almacen: null };

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

async function montar() {
  const rolCajero = await prisma.rol.create({ data: { nombre: `${marca}-cajero`, permisos: ["pos.usar"] } });
  const PERMISOS_COMPRAS = ["compras.ver", "compras.crear", "compras.recibir"];
  const rolCompras = await prisma.rol.create({ data: { nombre: `${marca}-compras`, permisos: PERMISOS_COMPRAS } });
  const rolFinanzas = await prisma.rol.create({ data: { nombre: `${marca}-finanzas`, permisos: ["finanzas.ver"] } });
  creado.roles.push(rolCajero.id, rolCompras.id, rolFinanzas.id);
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.locales.push(deposito.id, local.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });

  const usuario = async (nombre, rol, permisos) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${nombre}`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
    });
    creado.usuarios.push(u.id);
    return { u, sesion: jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId: local.id, permisos }, SECRETO, { expiresIn: "1h" }) };
  };
  const cajero = await usuario("cajero", rolCajero, ["pos.usar"]);
  const compras = await usuario("compras", rolCompras, PERMISOS_COMPRAS);
  const finanzas = await usuario("finanzas", rolFinanzas, ["finanzas.ver"]);

  const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-Brenda`, pinHash: "x", localId: local.id } });
  creado.operadorIds.push(op.id);
  // Sueldo elige de Empleados: el de la cajera, asociado a su operador.
  const empleado = await prisma.empleado.create({
    data: { nombre: op.nombre, operadorId: op.id, localId: local.id },
  });
  creado.empleadoIds = [empleado.id];

  const turno = await prisma.turno.create({
    // 150.000 y no 100.000: los pagos de la sección 4 suman 100.300, y desde
    // 2026-10-16 no se paga más de lo que hay en la caja (sección 11).
    data: { localId: local.id, vendedorId: cajero.u.id, operadorId: op.id, montoInicial: FONDO, apertura: new Date() },
  });

  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-Panaderia`, creadoEnLocalId: local.id } });
  creado.proveedorId = proveedor.id;

  const base = await prisma.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-pan`, precio_costo: 100, precio_venta: 150, unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" },
  });
  creado.bases.push(base.id);
  const pl = await prisma.productoLocal.create({ data: { localId: local.id, baseId: base.id, precio_costo: 100, precio_venta: 150 } });

  const categoriaGasto = await prisma.categoriaGasto.findFirst({ where: { activo: true, nombre: { not: "Sueldos" } }, select: { id: true, nombre: true } });

  // El almacén de fotos, en un directorio temporal con su centinela.
  creado.almacen = await mkdtemp(join(tmpdir(), "ci-comprobantes-"));
  await writeFile(join(creado.almacen, NOMBRE_CENTINELA), "");
  process.env[VARIABLE_RUTA] = creado.almacen;

  const quienCaja = { sesion: cajero.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: local.id }) };
  return { grupo, deposito, local, cajero, compras, finanzas, op, empleado, turno, proveedor, pl, categoriaGasto, quienCaja };
}

async function desmontar() {
  const localId = creado.locales[1];
  if (localId) {
    const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
    const pedidos = (await prisma.pedidoProveedor.findMany({ where: { grupoId: creado.grupoId }, select: { id: true } })).map((p) => p.id);
    await prisma.comprobanteArchivo.deleteMany({ where: { comprobante: { grupoId: creado.grupoId } } });
    await prisma.comprobanteProveedor.deleteMany({ where: { grupoId: creado.grupoId } });
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
  }
  // El libro de stock no deja borrar sus movimientos: los productos quedan.
  if (creado.proveedorId) await prisma.proveedor.updateMany({ where: { id: creado.proveedorId }, data: { activo: false } }).catch(() => {});
  if (creado.empleadoIds) await prisma.empleado.deleteMany({ where: { id: { in: creado.empleadoIds } } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
  if (creado.almacen) await rm(creado.almacen, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// AYUDAS
// ═══════════════════════════════════════════════════════════════════════════

const BASE = "http://ci/api";
const FONDO = 150000;
let n = 0;
const clave = () => `ci-pagar-${Date.now()}-${(n += 1)}`;
const pagar = async (f, cuerpo) =>
  leer(await rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, f.quienCaja, { cuerpo: { turnoId: f.turno.id, ...cuerpo } })));
const movimientosDelTurno = (f) =>
  prisma.cajaMovimiento.findMany({ where: { turnoId: f.turno.id }, orderBy: { id: "asc" }, select: { id: true, tipo: true, monto: true, tipoEgreso: true } });
const esperado = async (f) => (await leerDetalleDeCaja(prisma, f.turno.id)).detalle.efectivo.teniaQueHaber;

// ═══════════════════════════════════════════════════════════════════════════
// CASOS
// ═══════════════════════════════════════════════════════════════════════════

async function casos(f) {
  seccion("1 · Lo que ofrece Pagar al cajero");
  const op = await leer(await rutaPagar.GET(pedido(`${BASE}/pos-ventas/pagar?turnoId=${f.turno.id}`, f.quienCaja, { metodo: "GET" })));
  igual("contesta ok", op.status, 200);
  igual("el efectivo de la caja ahora", op.caja?.efectivoAhora, FONDO);
  ok("el proveedor del local está", (op.proveedores || []).some((p) => p.id === f.proveedor.id));
  ok("el proveedor viaja sin teléfono ni CUIT", (op.proveedores || []).every((p) => Object.keys(p).join() === "id,nombre"));
  ok("el empleado del local está", (op.empleados || []).some((e) => e.id === f.empleado.id));
  ok("Sueldos no se ofrece como Gasto", !(op.categorias || []).some((c) => c.nombre === "Sueldos"));

  seccion("2 · Proveedor: compra por cargar + pago en Finanzas + un retiro");
  const antes = await movimientosDelTurno(f);
  const claveProv = clave();
  const prov = await pagar(f, { tipo: "PROVEEDOR", monto: "38.800,00", proveedorId: f.proveedor.id, idempotencyKey: claveProv });
  igual("contesta ok", [prov.status, prov.ok], [200, true]);
  const despuesProv = await movimientosDelTurno(f);
  igual("UN movimiento nuevo", despuesProv.length - antes.length, 1);
  const movProv = despuesProv.at(-1);
  igual("RETIRO de $38.800 con tipo PROVEEDOR", [movProv.tipo, Number(movProv.monto), movProv.tipoEgreso], ["RETIRO", 38800, "PROVEEDOR"]);
  const pedidoPos = await prisma.pedidoProveedor.findUnique({
    where: { id: prov.pedidoProveedorId },
    select: { estado: true, nacidoDeFactura: true, creadoEnLocalId: true, proveedorId: true, cuentaPorPagar: { select: { id: true, total: true, pagos: { select: { medio: true, monto: true, cajaMovimientoId: true } } } } },
  });
  igual("la compra nace ENVIADA y de factura, en el local", [pedidoPos.estado, pedidoPos.nacidoDeFactura, pedidoPos.creadoEnLocalId], ["ENVIADO", true, f.local.id]);
  igual("su cuenta tiene UN pago en efectivo apuntando al retiro", pedidoPos.cuentaPorPagar.pagos.map((p) => [p.medio, Number(p.monto), p.cajaMovimientoId]), [["EFECTIVO", 38800, movProv.id]]);
  const otraVez = await pagar(f, { tipo: "PROVEEDOR", monto: "38.800,00", proveedorId: f.proveedor.id, idempotencyKey: claveProv });
  igual("el mismo intento devuelve la misma compra", [otraVez.ok, otraVez.repetido, otraVez.pedidoProveedorId], [true, true, prov.pedidoProveedorId]);
  igual("y no saca la plata otra vez", (await movimientosDelTurno(f)).length, despuesProv.length);

  seccion("3 · La foto del remito, con pos.usar, solo para esa compra");
  const form = new FormData();
  form.append("proveedorId", String(f.proveedor.id));
  form.append("pedidoId", String(prov.pedidoProveedorId));
  form.append("archivos", new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, Date.now() % 255])], "remito.jpg", { type: "image/jpeg" }));
  const foto = await leer(await rutaSubir.POST(pedido(`${BASE}/compras-proveedor/comprobantes/subir`, f.quienCaja, { form })));
  igual("la foto entra", [foto.status, foto.ok, foto.subidos], [200, true, 1]);
  const formAjeno = new FormData();
  formAjeno.append("proveedorId", String(f.proveedor.id));
  formAjeno.append("archivos", new File([Buffer.from([0xff, 0xd8, 9, 9])], "otro.jpg", { type: "image/jpeg" }));
  const ajena = await leer(await rutaSubir.POST(pedido(`${BASE}/compras-proveedor/comprobantes/subir`, f.quienCaja, { form: formAjeno })));
  igual("sin compra por cargar, el cajero no sube nada", ajena.status, 403);

  seccion("4 · Sueldo, gasto, al depósito y retiro del dueño");
  const sueldo = await pagar(f, { tipo: "SUELDO", monto: "35000", empleadoId: f.empleado.id, modalidad: "ADELANTO", idempotencyKey: clave() });
  igual("sueldo ok", sueldo.ok, true);
  const gastoS = await prisma.gasto.findUnique({ where: { id: sueldo.gastoId }, select: { concepto: true, categoria: { select: { nombre: true } }, beneficiario: true, pagos: { select: { medio: true, cajaMovimientoId: true } } } });
  igual("queda en Gastos → Sueldos, pagado con efectivo de la caja", [gastoS.categoria.nombre, gastoS.concepto, gastoS.pagos[0].medio], ["Sueldos", `Adelanto · ${f.op.nombre}`, "EFECTIVO"]);
  const claveGasto = clave();
  const gasto = await pagar(f, { tipo: "GASTO", monto: "1500", categoriaId: f.categoriaGasto.id, idempotencyKey: claveGasto });
  igual("gasto ok", gasto.ok, true);
  const gastoG = await prisma.gasto.findUnique({ where: { id: gasto.gastoId }, select: { categoriaId: true, total: true, pagos: { select: { cajaMovimientoId: true } } } });
  igual("queda en Gastos con su categoría, pagado entero", [gastoG.categoriaId, Number(gastoG.total), gastoG.pagos.length], [f.categoriaGasto.id, 1500, 1]);
  const movsAntesRepetir = (await movimientosDelTurno(f)).length;
  await pagar(f, { tipo: "GASTO", monto: "1500", categoriaId: f.categoriaGasto.id, idempotencyKey: claveGasto });
  igual("el mismo gasto repetido no saca otra vez", (await movimientosDelTurno(f)).length, movsAntesRepetir);
  const dep = await pagar(f, { tipo: "AL_DEPOSITO", monto: "20000", idempotencyKey: clave() });
  const duenio = await pagar(f, { tipo: "RETIRO_DUENO", monto: "5000", idempotencyKey: clave() });
  igual("al depósito y dueño ok", [dep.ok, duenio.ok], [true, true]);
  const movs = await movimientosDelTurno(f);
  igual(
    "cada pago es UN retiro con su tipo",
    movs.map((m) => [m.tipoEgreso, Number(m.monto)]),
    [["PROVEEDOR", 38800], ["SUELDO", 35000], ["GASTO", 1500], ["AL_DEPOSITO", 20000], ["RETIRO_DUENO", 5000]]
  );
  const alDeposito = await pagadoAlDepositoDesdeCaja(prisma, { localId: f.local.id, rango: { desde: "2000-01-01", hasta: "2100-12-31" } });
  igual("Finanzas → Pago a depósito ve lo pagado desde la caja", [alDeposito.total, alDeposito.items.length], [20000, 1]);

  seccion("5 · La plata: el esperado resta todo, con tipo o sin tipo");
  const conTipo = await esperado(f);
  igual("esperado = el fondo − todo lo que salió", conTipo, FONDO - 38800 - 35000 - 1500 - 20000 - 5000);
  const tipos = movs.map((m) => [m.id, m.tipoEgreso]);
  await prisma.cajaMovimiento.updateMany({ where: { turnoId: f.turno.id }, data: { tipoEgreso: null } });
  igual("sin tipo, el esperado es EXACTAMENTE el mismo", await esperado(f), conTipo);
  for (const [id, t] of tipos) await prisma.cajaMovimiento.update({ where: { id }, data: { tipoEgreso: t } });

  seccion("6 · La ganancia: solo sueldos y gastos restan");
  const det = (await leerDetalleDeCaja(prisma, f.turno.id)).detalle;
  igual("sueldos y gastos = sueldo + gasto", det.metricas.sueldosYGastos, 36500);
  igual("resultado = neto − costo − sueldos y gastos (sin ventas)", det.metricas.resultado, -36500);
  igual("la plata, en cambio, resta todo", det.efectivo.pagosDesdeCaja, 100300);

  seccion("7 · Clasificar un egreso manual: solo el tipo");
  const manual = await prisma.cajaMovimiento.create({ data: { turnoId: f.turno.id, usuarioId: f.cajero.u.id, tipo: "RETIRO", monto: 700, motivo: "viejo" } });
  const detSin = (await leerDetalleDeCaja(prisma, f.turno.id)).detalle;
  igual("sin clasificar no resta", detSin.metricas.sueldosYGastos, 36500);
  const quienFin = { sesion: f.finanzas.sesion };
  const cls = await leer(
    await rutaClasificar.PATCH(pedido(`${BASE}/turnos-y-cierres/movimientos/${manual.id}`, quienFin, { metodo: "PATCH", cuerpo: { tipo: "GASTO" } }), {
      params: Promise.resolve({ id: String(manual.id) }),
    })
  );
  igual("Finanzas lo clasifica", [cls.status, cls.ok], [200, true]);
  const trasClasificar = await prisma.cajaMovimiento.findUnique({ where: { id: manual.id }, select: { monto: true, turnoId: true, tipoEgreso: true } });
  igual("cambió solo el tipo", [Number(trasClasificar.monto), trasClasificar.turnoId, trasClasificar.tipoEgreso], [700, f.turno.id, "GASTO"]);
  igual("y ahora resta", (await leerDetalleDeCaja(prisma, f.turno.id)).detalle.metricas.sueldosYGastos, 37200);
  const noManual = await leer(
    await rutaClasificar.PATCH(pedido(`${BASE}/turnos-y-cierres/movimientos/${movProv.id}`, quienFin, { metodo: "PATCH", cuerpo: { tipo: "GASTO" } }), {
      params: Promise.resolve({ id: String(movProv.id) }),
    })
  );
  igual("el de un pago de Finanzas no se reclasifica", noManual.status, 409);
  const cajeroNo = await leer(
    await rutaClasificar.PATCH(pedido(`${BASE}/turnos-y-cierres/movimientos/${manual.id}`, f.quienCaja, { metodo: "PATCH", cuerpo: { tipo: "SUELDO" } }), {
      params: Promise.resolve({ id: String(manual.id) }),
    })
  );
  igual("sin Finanzas no se clasifica", cajeroNo.status, 403);

  seccion("8 · Compras por cargar");
  const quienCompras = { sesion: f.compras.sesion };
  const lista = await leer(await rutaPorCargar.GET(pedido(`${BASE}/compras-proveedor/por-cargar`, quienCompras, { metodo: "GET" })));
  const fila = (lista.items || []).find((x) => x.id === prov.pedidoProveedorId);
  ok("la compra está en la lista", Boolean(fila));
  igual("con su monto, su cajero, su foto y su estado", [fila?.monto, fila?.cajero, Boolean(fila?.fotoComprobanteId), fila?.estado], [38800, f.op.nombre, true, "Pagado · falta cargar"]);
  const listaCajero = await leer(await rutaPorCargar.GET(pedido(`${BASE}/compras-proveedor/por-cargar`, f.quienCaja, { metodo: "GET" })));
  igual("el cajero no la ve", listaCajero.status, 403);

  seccion("9 · Cargarla NO vuelve a descontar la caja");
  const det1 = await prisma.pedidoProveedorDetalle.create({
    data: { pedidoId: prov.pedidoProveedorId, productoLocalId: f.pl.id, cantidad: 10, unidad: "UNIDAD", precioCosto: 3880 },
  });
  const recibir = async (cuerpo) =>
    leer(
      await rutaRecibir.POST(
        pedido(`${BASE}/compras-proveedor/recibir/${prov.pedidoProveedorId}`, quienCompras, {
          cuerpo: { costosExcluidos: [det1.id], recibidos: { [det1.id]: 10 }, ...cuerpo },
        }),
        { params: Promise.resolve({ id: String(prov.pedidoProveedorId) }) }
      )
    );
  const movsAntesDeCargar = await movimientosDelTurno(f);

  const deMas = await recibir({ pagoAlProveedor: { estado: "PAGADA", totalAPagar: "30000", totalConfirmado: true } });
  igual("pagado de más se frena", deMas.status, 409);
  igual("y no cambia nada", (await prisma.pedidoProveedor.findUnique({ where: { id: prov.pedidoProveedorId }, select: { estado: true } })).estado, "ENVIADO");

  const cargada = await recibir({ pagoAlProveedor: { estado: "PAGADA", totalAPagar: "38800", totalConfirmado: true, pago: { medio: "EFECTIVO", turnoId: f.turno.id } } });
  igual("se recibe sin el permiso de pagos: no sale plata", [cargada.status, cargada.ok], [200, true]);
  igual("la caja NO se descuenta otra vez", (await movimientosDelTurno(f)).length, movsAntesDeCargar.length);
  const cuenta = await prisma.cuentaPorPagarProveedor.findUnique({ where: { pedidoProveedorId: prov.pedidoProveedorId }, select: { total: true, pagos: { select: { id: true } } } });
  igual("la cuenta sigue con UN pago y toma el total de la compra", [cuenta.pagos.length, Number(cuenta.total)], [1, 38800]);
  igual("el esperado no se movió", await esperado(f), conTipo - 700);
  const lista2 = await leer(await rutaPorCargar.GET(pedido(`${BASE}/compras-proveedor/por-cargar`, quienCompras, { metodo: "GET" })));
  ok("ya no está por cargar", !(lista2.items || []).some((x) => x.id === prov.pedidoProveedorId));
  const stock = await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: f.local.id, productoId: f.pl.id } }, select: { cantidad: true } });
  igual("y el stock entró", Number(stock?.cantidad ?? 0), 10);

  seccion("10 · Una compra por cargar con saldo: lo pagado cuenta");
  const prov2 = await pagar(f, { tipo: "PROVEEDOR", monto: "1000", proveedorId: f.proveedor.id, idempotencyKey: clave() });
  const det2 = await prisma.pedidoProveedorDetalle.create({
    data: { pedidoId: prov2.pedidoProveedorId, productoLocalId: f.pl.id, cantidad: 1, unidad: "UNIDAD", precioCosto: 1500 },
  });
  const movs2 = (await movimientosDelTurno(f)).length;
  const recibirPendiente = async (extra = {}) =>
    leer(
      await rutaRecibir.POST(
        pedido(`${BASE}/compras-proveedor/recibir/${prov2.pedidoProveedorId}`, quienCompras, {
          cuerpo: { costosExcluidos: [det2.id], recibidos: { [det2.id]: 1 }, pagoAlProveedor: { estado: "PENDIENTE", totalAPagar: "1500", totalConfirmado: true, ...extra } },
        }),
        { params: Promise.resolve({ id: String(prov2.pedidoProveedorId) }) }
      )
    );
  // Quedan $500 a deber: desde 2026-10-15 eso se confirma a sabiendas.
  const sinConfirmar = await recibirPendiente();
  igual("sin confirmar el saldo no se recibe", [sinConfirmar.status, sinConfirmar.codigo], [409, "SALDO_SIN_CONFIRMAR"]);
  const pend = await recibirPendiente({ saldoConfirmado: 500 });
  igual("se recibe pendiente, confirmando el saldo", [pend.status, pend.ok], [200, true]);
  igual("queda con saldo de lo que falta", [pend.cuentaPorPagar?.pagado, pend.cuentaPorPagar?.saldo], [1000, 500]);
  igual("sin otro retiro", (await movimientosDelTurno(f)).length, movs2);

  seccion("11 · No se paga más de lo que hay en la caja");
  const hay = async () => (await leer(await rutaPagar.GET(pedido(`${BASE}/pos-ventas/pagar?turnoId=${f.turno.id}`, f.quienCaja, { metodo: "GET" })))).caja?.efectivoAhora;
  const disponible = await hay();
  igual("Pagar dice lo mismo que el cierre", disponible, await esperado(f));
  ok("y queda algo en la caja para probar", disponible > 0, String(disponible));
  const unCentavoMas = (disponible + 0.01).toFixed(2);
  const movsAntesTope = (await movimientosDelTurno(f)).length;
  const pedidosAntes = await prisma.pedidoProveedor.count({ where: { creadoEnLocalId: f.local.id } });
  const gastosAntes = await prisma.gasto.count({ where: { localId: f.local.id } });
  for (const [t, extra] of [
    ["PROVEEDOR", { proveedorId: f.proveedor.id }],
    ["SUELDO", { empleadoId: f.empleado.id, modalidad: "SUELDO" }],
    ["GASTO", { categoriaId: f.categoriaGasto.id }],
    ["AL_DEPOSITO", {}],
    ["RETIRO_DUENO", {}],
  ]) {
    const r = await pagar(f, { tipo: t, monto: unCentavoMas, idempotencyKey: clave(), ...extra });
    igual(`${t}: un centavo más de lo que hay → 409`, [r.status, /No alcanza el efectivo de la caja/.test(r.error ?? "")], [409, true]);
  }
  igual("y no salió nada de la caja", (await movimientosDelTurno(f)).length, movsAntesTope);
  igual("ni quedó una compra ni un gasto a medias", [
    await prisma.pedidoProveedor.count({ where: { creadoEnLocalId: f.local.id } }),
    await prisma.gasto.count({ where: { localId: f.local.id } }),
  ], [pedidosAntes, gastosAntes]);
  const justo = await pagar(f, { tipo: "AL_DEPOSITO", monto: String(disponible), idempotencyKey: clave() });
  igual("lo que hay, justo, sí se paga", [justo.status, justo.ok], [200, true]);
  igual("y la caja queda en cero", await hay(), 0);
  const nada = await pagar(f, { tipo: "RETIRO_DUENO", monto: "0,01", idempotencyKey: clave() });
  igual("con la caja en cero, ni un centavo", nada.status, 409);
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
console.log(`${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
