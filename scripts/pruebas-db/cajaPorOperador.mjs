// PRUEBA DE BASE: CAJA POR OPERADOR. MISMO LOCAL, MISMA CUENTA, DOS CAJONES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/cajaPorOperador.mjs
//
// Es la operación real del mostrador: una sola cuenta ERP del local —la de la
// computadora—, dos operadores que se identifican con su PIN, y cada uno con su
// propio cajón físico. La cuenta autentica el acceso; el operador responde por
// su caja.
//
//   A: fondo $1.000 · vende $100.000 en efectivo · retira $80.000
//      esperado $21.000 · cuenta $16.000 · diferencia −$5.000
//   B: fondo $1.000 · vende $100.000 en efectivo · retira $80.000
//      esperado $21.000 · cuenta $26.000 · diferencia +$5.000
//
// Y tienen que terminar así: A −$5.000 y B +$5.000. Nunca un cajón de $0.
//
// Todo pasa por los handlers REALES de las rutas, con la cookie de sesión de
// la cuenta y la cookie de operador firmada como la firma el login del PIN. Los
// retiros son de las dos clases —recaudación con conteo y Caja − manual— para
// que el esperado se arme por los dos caminos.
//
// Las contrapruebas de autorización van entre los pasos: A no vende, no mueve,
// no arquea, no retira, no corta ni cierra la caja de B. Un segundo turno de A
// —ni por la ruta ni directo a la base con otra cuenta— no puede existir. El
// Dueño de su local no arquea ni cierra normal la caja de otro (2026-10-14):
// la FUERZA, y la caja de B se cierra así, marcada con quién la forzó y con la
// diferencia de B.
//
// Después, un local SIN operario obligatorio: igual un cajero no abre sin PIN,
// y una caja de cuenta vieja no la alcanza ni la cuenta sin PIN ni un PIN.
//
// Al final, la segunda regla del mismo día: el Dueño sin PIN abre y vende en
// la caja de SU cuenta, que nadie más usa, y retira de la caja de B: el retiro
// dice quién lo hizo y el faltante queda en la caja de B.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { turnoOperativoDeSesion } = await import("./fixtureTurnoOperativo.mjs");
const { firmarTokenOperador, firmarVoucherOperador, OperadorCookie } = await import("../../lib/operador.js");
const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaActual = await import("../../app/api/pos-ventas/turnos/actual/route.js");
const rutaResumen = await import("../../app/api/pos-ventas/turnos/resumen/route.js");
const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");
const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
const rutaArqueo = await import("../../app/api/pos-ventas/arqueos/registrar/route.js");
const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
const rutaCierreIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaCierreConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
const rutaCierresPendientes = await import("../../app/api/pos-ventas/cierres/pendientes/route.js");
const rutaAuditoriaOperadores = await import("../../app/api/auditoria-pos-ventas/operadores/route.js");
const rutaAuditoriaCajas = await import("../../app/api/auditoria-pos-ventas/cajas/route.js");

// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };

function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d || "falló"}`); console.log(`  ✗ ${t} — ${d || "falló"}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

/** Un paso sin el cual lo que sigue no tiene sentido: si falla, se corta acá. */
function requerir(t, c, d = "") {
  ok(t, c, d);
  if (!c) throw new Error(`requisito: ${t} — ${d}`);
}

const SECRETO = process.env.AUTH_SECRET;
const PERMISOS = ["pos.usar"];
const sesionDe = (usuario, localId, extra = {}) =>
  jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos: PERMISOS, ...extra },
    SECRETO,
    { expiresIn: "1h" }
  );

/** Las cookies de un dispositivo: la cuenta, y el operador si hizo PIN. */
const cookies = ({ sesion, operador = null }) =>
  [`erpazul_sesion=${sesion}`, operador ? `${OperadorCookie.nombre}=${operador}` : null].filter(Boolean).join("; ");

const pedidoGet = (url, quien) => {
  const req = new Request(url, { headers: { cookie: cookies(quien) } });
  // Los handlers leen `req.nextUrl.searchParams`, que el Request nativo no tiene.
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const pedido = (url, quien, cuerpo) => {
  const req = new Request(url, {
    method: "POST",
    headers: { cookie: cookies(quien), "content-type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });

const BASE = "http://ci/api/pos-ventas";
const AUDITORIA = "http://ci/api/auditoria-pos-ventas";

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-caja-operador-${Date.now()}`;
const creado = { grupoId: null, localIds: [], usuarioIds: [], operadorIds: [], rolId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;

  // Casiano: el local con operario obligatorio y arqueos activos. `exigirOperador`
  // en true a propósito: es el caso real, y el que hace que la cookie importe.
  const local = await prisma.local.create({ data: { nombre: `${marca}-casiano`, tipo: "local" } });
  // Un segundo local SIN operario, para la compatibilidad.
  const localSinOperario = await prisma.local.create({ data: { nombre: `${marca}-sin-operario`, tipo: "local" } });
  creado.localIds.push(local.id, localSinOperario.id);
  for (const l of [local, localSinOperario]) {
    await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
  }
  await prisma.configuracionLocal.create({
    data: { localId: local.id, exigirOperador: true, arqueoCajaActivo: true, allowNegativeStock: true },
  });
  await prisma.configuracionLocal.create({
    data: { localId: localSinOperario.id, exigirOperador: false, arqueoCajaActivo: true, allowNegativeStock: true },
  });

  const nuevoUsuario = async (sufijo, localId) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${sufijo}`, email: `${marca}-${sufijo}@ci.local`, passwordHash: "x", rolId: rol.id, localId },
    });
    creado.usuarioIds.push(u.id);
    return u;
  };
  // LA cuenta del mostrador de Casiano, compartida por los dos operadores.
  const cuenta = await nuevoUsuario("cuenta-casiano", local.id);
  // Otra cuenta del mismo local: la de un segundo dispositivo.
  const otraCuenta = await nuevoUsuario("otra-cuenta", local.id);
  const dueno = await nuevoUsuario("dueno", local.id);
  const cuentaSinOperario = await nuevoUsuario("cuenta-sin-operario", localSinOperario.id);

  const nuevoOperador = async (sufijo, localIds) => {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-${sufijo}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    for (const localId of localIds) await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId } });
    return op;
  };
  const opA = await nuevoOperador("operador-a", [local.id]);
  const opB = await nuevoOperador("operador-b", [local.id]);
  const opC = await nuevoOperador("operador-c", [localSinOperario.id]);

  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-producto`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });
  const productoSinOperario = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: localSinOperario.id, nombre: `${marca}-producto-2`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });

  // Las cookies de operador, firmadas como las firma `/api/operador/login`.
  const pin = (op, localId) => firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId });
  const sesionCuenta = sesionDe(cuenta, local.id);

  return {
    grupo, local, localSinOperario, cuenta, otraCuenta, dueno, cuentaSinOperario, opA, opB, opC,
    producto, productoSinOperario,
    // Los dos operadores en la MISMA cuenta.
    A: { sesion: sesionCuenta, operador: pin(opA, local.id) },
    B: { sesion: sesionCuenta, operador: pin(opB, local.id) },
    // A desde otro dispositivo, con otra cuenta del mismo local.
    AporOtraCuenta: { sesion: sesionDe(otraCuenta, local.id), operador: pin(opA, local.id) },
    // El Dueño de Casiano, sin PIN: la intervención que ya existía.
    dueno_: { sesion: sesionDe(dueno, local.id, { esDuenoLocal: true }) },
    auditor: { sesion: sesionDe(dueno, local.id, { esDuenoLocal: true, permisos: ["pos.usar", "reportes.ver"] }) },
    sinOperario: { sesion: sesionDe(cuentaSinOperario, localSinOperario.id) },
    sinOperarioConPinC: { sesion: sesionDe(cuentaSinOperario, localSinOperario.id), operador: pin(opC, localSinOperario.id) },
    // Los vouchers offline, firmados como los firma el login del PIN.
    voucherA: firmarVoucherOperador({ operadorId: opA.id, localId: local.id }),
    voucherB: firmarVoucherOperador({ operadorId: opB.id, localId: local.id }),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const localIds = creado.localIds;
  const turnos = (await prisma.turno.findMany({ where: { localId: { in: localIds } }, select: { id: true } })).map((t) => t.id);
  await prisma.auditoriaBitacora.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId: { in: localIds } } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.venta.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cambioPendiente.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.retiroPreparacion.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.stockLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarioIds } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: { in: localIds } } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOS PASOS, CON LAS MISMAS FORMAS QUE MANDA LA PANTALLA
// ═══════════════════════════════════════════════════════════════════════════

function pasos(f) {
  let nVenta = 0;
  return {
    abrir: async (quien, montoInicial = 1000) =>
      leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial, turnoOperativoId: await turnoOperativoDeSesion(prisma, quien) }))),
    actual: async (quien, localId) =>
      leer(await rutaActual.GET(pedidoGet(`${BASE}/turnos/actual?localId=${localId}`, quien))),
    vender: async (quien, turnoId, { localId = f.local.id, producto = f.producto, cantidad = 100, extra = {} } = {}) =>
      leer(
        await rutaCrearVenta.POST(
          pedido(`${BASE}/crear`, quien, {
            clientTxnId: `${marca}-${(nVenta += 1)}`,
            localId,
            turnoId,
            items: [{
              productoBaseId: producto.baseId,
              nombre: "Producto de prueba",
              precio: 1000,
              cantidad,
              precioCosto: 600,
              esServicio: false,
              importeBaseServicio: null,
              subtotalFijado: null,
            }],
            formaPago: "EFECTIVO",
            pagos: [{ medio: "EFECTIVO", monto: 1000 * cantidad }],
            ...extra,
          })
        )
      ),
    movimiento: async (quien, turnoId, tipo, monto) =>
      leer(await rutaMovimiento.POST(pedido(`${BASE}/caja-movimientos/crear`, quien, { turnoId, tipo, monto, motivo: `${tipo} de prueba` }))),
    arquear: async (quien, turnoId, efectivoContado) =>
      leer(await rutaArqueo.POST(pedido(`${BASE}/arqueos/registrar`, quien, {
        turnoId, efectivoContado, idempotencyKey: `${marca}-arqueo-${turnoId}-${Math.random()}`,
      }))),
    iniciarRetiro: async (quien, turnoId, desgloseCambio) =>
      leer(await rutaRetiroIniciar.POST(pedido(`${BASE}/retiros/iniciar`, quien, { turnoId, desgloseCambio }))),
    confirmarRetiro: async (quien, token, desgloseRetiroContado) =>
      leer(await rutaRetiroConfirmar.POST(pedido(`${BASE}/retiros/${token}/confirmar`, quien, { desgloseRetiroContado }), conToken(token))),
    iniciarCierre: async (quien, turnoId, desgloseCambio, extra = {}) =>
      leer(await rutaCierreIniciar.POST(pedido(`${BASE}/cierres/iniciar`, quien, { turnoId, desgloseCambio, ...extra }))),
    confirmarCierre: async (quien, token, desgloseRetiroContado) =>
      leer(await rutaCierreConfirmar.POST(pedido(`${BASE}/cierres/${token}/confirmar`, quien, { desgloseRetiroContado }), conToken(token))),
    cerrarClasico: async (quien, turnoId, montoRealEfectivo) =>
      leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, quien, { turnoId, montoRealEfectivo }))),
    resumen: async (quien, turnoId) =>
      leer(await rutaResumen.GET(pedidoGet(`${BASE}/turnos/resumen?turnoId=${turnoId}`, quien))),
  };
}

const cuantos = {
  ventas: (turnoId) => prisma.venta.count({ where: { turnoId } }),
  movimientos: (turnoId) => prisma.cajaMovimiento.count({ where: { turnoId } }),
  arqueos: (turnoId) => prisma.arqueoCaja.count({ where: { turnoId } }),
  retiros: (turnoId) => prisma.retiroPreparacion.count({ where: { turnoId } }),
  cortes: (turnoId) => prisma.cierrePreparacion.count({ where: { turnoId } }),
};
const fotoDe = async (turnoId) => ({
  ventas: await cuantos.ventas(turnoId),
  movimientos: await cuantos.movimientos(turnoId),
  arqueos: await cuantos.arqueos(turnoId),
  retiros: await cuantos.retiros(turnoId),
  cortes: await cuantos.cortes(turnoId),
});

// ═══════════════════════════════════════════════════════════════════════════

async function correr() {
  const f = await montar();
  const p = pasos(f);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. Apertura: dos operadores, la MISMA cuenta, dos cajas");

  const abreA = await p.abrir(f.A);
  requerir("A abre su caja con $1.000", abreA.ok === true, `${abreA.status} ${abreA.error ?? ""}`);
  const abreB = await p.abrir(f.B);
  requerir("B abre SU caja con la misma cuenta mientras A trabaja", abreB.ok === true, `${abreB.status} ${abreB.error ?? ""}`);
  const turnoA = await prisma.turno.findUnique({ where: { id: abreA.turno.id } });
  const turnoB = await prisma.turno.findUnique({ where: { id: abreB.turno.id } });
  ok("son dos turnos distintos", turnoA.id !== turnoB.id);
  igual("los dos con la misma cuenta", [turnoA.vendedorId, turnoB.vendedorId], [f.cuenta.id, f.cuenta.id]);
  igual("cada uno con su operador", [turnoA.operadorId, turnoB.operadorId], [f.opA.id, f.opB.id]);
  ok("B ve a A como otro turno abierto, sin bloqueo",
    (abreB.otrosTurnosAbiertos || []).some((t) => t.turnoId === turnoA.id));

  const otraVezA = await p.abrir(f.A);
  ok("A no puede abrir una segunda caja: 409", otraVezA.status === 409, `${otraVezA.status} ${otraVezA.error ?? ""}`);
  const aPorOtraCuenta = await p.abrir(f.AporOtraCuenta);
  ok("A tampoco con otra cuenta del mismo local: 409", aPorOtraCuenta.status === 409, `${aPorOtraCuenta.status} ${aPorOtraCuenta.error ?? ""}`);
  igual("y sigue habiendo exactamente dos turnos abiertos en Casiano",
    await prisma.turno.count({ where: { localId: f.local.id, cierre: null } }), 2);

  // La base, sin pasar por ninguna ruta: el índice por operador es el que
  // garantiza la regla aunque una ruta futura se olvide de preguntar.
  let errorIndice = null;
  try {
    const intruso = await prisma.turno.create({
      data: { localId: f.local.id, vendedorId: f.otraCuenta.id, operadorId: f.opA.id, montoInicial: 0 },
    });
    // Si entró, se borra para no ensuciar el resto: la falla ya quedó anotada.
    await prisma.turno.delete({ where: { id: intruso.id } });
  } catch (e) {
    errorIndice = e;
  }
  ok("un segundo turno operativo de A, directo a la base con otra cuenta, choca con el índice",
    errorIndice?.code === "P2002", errorIndice ? `${errorIndice.code} ${errorIndice.message?.slice(0, 120)}` : "se creó");

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. El POS encuentra la caja del operador, no la de la cuenta");

  const actualA = await p.actual(f.A, f.local.id);
  const actualB = await p.actual(f.B, f.local.id);
  igual("con el PIN de A, el turno actual es el de A", actualA.turno?.id, turnoA.id);
  igual("con el PIN de B, en la misma cuenta, el de B", actualB.turno?.id, turnoB.id);
  const actualAotra = await p.actual(f.AporOtraCuenta, f.local.id);
  igual("A desde otra cuenta del local encuentra SU caja", actualAotra.turno?.id, turnoA.id);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. Ventas: cada una en su caja");

  const vA = await p.vender(f.A, turnoA.id);
  requerir("A vende $100.000 en efectivo", vA.ok === true, `${vA.status} ${vA.error ?? ""}`);
  const vB = await p.vender(f.B, turnoB.id);
  requerir("B vende $100.000 en efectivo", vB.ok === true, `${vB.status} ${vB.error ?? ""}`);

  const antesB = await fotoDe(turnoB.id);
  const cruzada = await p.vender(f.A, turnoB.id);
  ok("A vendiendo con el turno de B: rechazo", cruzada.ok !== true && cruzada.status === 403, `${cruzada.status} ${cruzada.error ?? ""}`);
  const cruzadaInversa = await p.vender(f.B, turnoA.id);
  ok("B vendiendo con el turno de A: rechazo", cruzadaInversa.ok !== true && cruzadaInversa.status === 403, `${cruzadaInversa.status}`);
  igual("y la caja de B no recibió nada", await fotoDe(turnoB.id), antesB);

  const ventasA = await prisma.venta.findMany({ where: { turnoId: turnoA.id }, select: { operadorId: true, total: true } });
  const ventasB = await prisma.venta.findMany({ where: { turnoId: turnoB.id }, select: { operadorId: true, total: true } });
  igual("en la caja de A hay UNA venta, de A, por $100.000", ventasA.map((v) => [v.operadorId, Number(v.total)]), [[f.opA.id, 100000]]);
  igual("en la caja de B hay UNA venta, de B, por $100.000", ventasB.map((v) => [v.operadorId, Number(v.total)]), [[f.opB.id, 100000]]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. Retiros: recaudación con conteo y Caja − manual, cada uno en lo suyo");

  for (const [quien, nombre, turno] of [[f.A, "A", turnoA], [f.B, "B", turnoB]]) {
    // Esperado antes del retiro: 1.000 + 100.000 = 101.000. Queda $51.000 de
    // cambio y se lleva $50.000.
    const ini = await p.iniciarRetiro(quien, turno.id, { 1000: 51 });
    requerir(`${nombre} inicia el retiro de recaudación`, ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
    const conf = await p.confirmarRetiro(quien, ini.retiro.token, { 10000: 5 });
    requerir(`${nombre} confirma $50.000 retirados`, conf.ok === true, `${conf.status} ${conf.error ?? ""}`);
    const manual = await p.movimiento(quien, turno.id, "RETIRO", 30000);
    requerir(`${nombre} hace un Caja − manual de $30.000`, manual.ok === true, `${manual.status} ${manual.error ?? ""}`);
  }

  const antesB2 = await fotoDe(turnoB.id);
  const movCruzado = await p.movimiento(f.A, turnoB.id, "INGRESO", 999);
  ok("A creando un movimiento manual sobre la caja de B: rechazo", movCruzado.ok !== true && [403, 404].includes(movCruzado.status), `${movCruzado.status} ${movCruzado.error ?? ""}`);
  const retiroCruzado = await p.iniciarRetiro(f.A, turnoB.id, { 1000: 1 });
  ok("A iniciando un retiro sobre la caja de B: rechazo", retiroCruzado.ok !== true && [403, 404].includes(retiroCruzado.status), `${retiroCruzado.status} ${retiroCruzado.error ?? ""}`);
  igual("la caja de B no se tocó", await fotoDe(turnoB.id), antesB2);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5. Arqueos parciales: cada uno el suyo; el Dueño tampoco opera la caja de otro");

  const arqA = await p.arquear(f.A, turnoA.id, 21000);
  requerir("A arquea su caja", arqA.ok === true, `${arqA.status} ${arqA.error ?? ""}`);
  const arqB = await p.arquear(f.B, turnoB.id, 21000);
  requerir("B arquea su caja", arqB.ok === true, `${arqB.status} ${arqB.error ?? ""}`);
  const antesB3 = await fotoDe(turnoB.id);
  const arqCruzado = await p.arquear(f.A, turnoB.id, 21000);
  ok("A arqueando la caja de B: rechazo", arqCruzado.ok !== true && [403, 404].includes(arqCruzado.status), `${arqCruzado.status} ${arqCruzado.error ?? ""}`);
  igual("y no apareció ningún arqueo en la caja de B", await fotoDe(turnoB.id), antesB3);

  // Hasta el 2026-10-14 el Dueño intervenía cualquier caja sin PIN. Ya no: el
  // Dueño sin PIN opera la caja de SU cuenta, y sobre la de otro solo puede
  // RETIRAR (sección 12) o FORZAR el cierre (sección 7). Arquear, no.
  const arqDueno = await p.arquear(f.dueno_, turnoB.id, 21000);
  ok("el Dueño no arquea la caja de B: 403", arqDueno.status === 403, `${arqDueno.status} ${arqDueno.error ?? ""}`);
  igual("y en la caja de B no apareció nada", await fotoDe(turnoB.id), antesB3);

  // En la caja de A hay dos arqueos: el del retiro de recaudación —que deja su
  // propio ArqueoCaja, con el esperado de ese momento— y el parcial de recién.
  const arqueosA = await prisma.arqueoCaja.findMany({
    where: { turnoId: turnoA.id },
    select: { operadorId: true, efectivoEsperado: true, cajaMovimientoRetiroId: true },
  });
  ok("todos los arqueos de la caja de A son de A", arqueosA.length === 2 && arqueosA.every((a) => a.operadorId === f.opA.id),
    JSON.stringify(arqueosA));
  igual("el parcial de A espera $21.000",
    arqueosA.filter((a) => a.cajaMovimientoRetiroId == null).map((a) => Number(a.efectivoEsperado)), [21000]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("6. Esperado: $21.000 en cada caja, sin mirar la otra");

  const resA = await p.resumen(f.A, turnoA.id);
  const resB = await p.resumen(f.B, turnoB.id);
  igual("A: inicial, efectivo, retiros, esperado",
    [resA.montoInicial, resA.totalEfectivo, resA.totalRetirosCaja, resA.efectivoEsperado], [1000, 100000, 80000, 21000]);
  igual("B: inicial, efectivo, retiros, esperado",
    [resB.montoInicial, resB.totalEfectivo, resB.totalRetirosCaja, resB.efectivoEsperado], [1000, 100000, 80000, 21000]);
  const resCruzado = await p.resumen(f.B, turnoA.id);
  igual("B no lee el resumen de la caja de A", resCruzado.status, 403);
  const resDueno = await p.resumen(f.dueno_, turnoA.id);
  igual("el Dueño sí", resDueno.efectivoEsperado, 21000);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("7. Cierre: nadie corta ni cierra la caja de otro");

  const antesA = await fotoDe(turnoA.id);
  const corteCruzado = await p.iniciarCierre(f.B, turnoA.id, { 1000: 1 });
  ok("B iniciando el cierre de la caja de A: rechazo", corteCruzado.ok !== true && [403, 404].includes(corteCruzado.status), `${corteCruzado.status} ${corteCruzado.error ?? ""}`);
  const cierreCruzado = await p.cerrarClasico(f.B, turnoA.id, 21000);
  ok("B cerrando la caja de A por el cierre clásico: rechazo", cierreCruzado.ok !== true && [403, 404].includes(cierreCruzado.status), `${cierreCruzado.status} ${cierreCruzado.error ?? ""}`);
  const sigueA = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  ok("la caja de A sigue abierta y sin corte", sigueA.cierre === null && sigueA.cierreEnPreparacionEn === null);
  igual("y sin ningún registro nuevo", await fotoDe(turnoA.id), antesA);

  // A deja $1.000 de cambio y cuenta $15.000 de retiro: el cajón tenía $16.000.
  const corteA = await p.iniciarCierre(f.A, turnoA.id, { 1000: 1 });
  requerir("A toma el corte de su caja", corteA.ok === true, `${corteA.status} ${corteA.error ?? ""}`);

  // El token del corte es la llave del conteo. La bandeja de pendientes lo
  // reparte: tiene que repartirlo solo a quien podría confirmar ese cierre.
  const tokensPendientes = async (quien) =>
    ((await leer(await rutaCierresPendientes.GET(pedidoGet(`${BASE}/cierres/pendientes`, quien)))).items || [])
      .map((i) => i.token);
  ok("B no recibe el token del corte de A", !(await tokensPendientes(f.B)).includes(corteA.cierre.token));
  ok("A sí lo recibe, para recuperar su conteo", (await tokensPendientes(f.A)).includes(corteA.cierre.token));
  ok("el Dueño también, para resolverlo", (await tokensPendientes(f.dueno_)).includes(corteA.cierre.token));
  // El token no alcanza: el corte de A lo confirma A. El Dueño, solo forzándolo.
  const duenoConfirmaA = await p.confirmarCierre(f.dueno_, corteA.cierre.token, { 10000: 1, 1000: 5 });
  ok("el Dueño no confirma el corte normal de A: 403", duenoConfirmaA.status === 403, `${duenoConfirmaA.status} ${duenoConfirmaA.error ?? ""}`);
  const bConfirmaA = await p.confirmarCierre(f.B, corteA.cierre.token, { 10000: 1, 1000: 5 });
  ok("B, con el token de A, tampoco: 403", bConfirmaA.status === 403, `${bConfirmaA.status} ${bConfirmaA.error ?? ""}`);
  const finA = await p.confirmarCierre(f.A, corteA.cierre.token, { 10000: 1, 1000: 5 });
  requerir("A confirma: contó $16.000", finA.ok === true, `${finA.status} ${finA.error ?? ""}`);

  // ── EL CIERRE FORZADO: la caja de B la cierra el Dueño ───────────────────
  //
  // B se fue sin cerrar. El Dueño fuerza el cierre: queda registrado como
  // forzado y a su nombre, y la caja y su diferencia siguen siendo de B —la
  // sección 8 lo comprueba en la auditoría—. B había dejado $1.000 de cambio y
  // el cajón tiene $26.000: se cuentan $25.000 de retiro.
  const forzadoPorA = await p.iniciarCierre(f.A, turnoB.id, { 1000: 1 }, { forzado: true });
  ok("A no puede forzar la caja de B: 403", forzadoPorA.status === 403, `${forzadoPorA.status} ${forzadoPorA.error ?? ""}`);
  const normalDelDueno = await p.iniciarCierre(f.dueno_, turnoB.id, { 1000: 1 });
  ok("el Dueño no toma el corte NORMAL de B: 403", normalDelDueno.status === 403, `${normalDelDueno.status} ${normalDelDueno.error ?? ""}`);
  const corteB = await p.iniciarCierre(f.dueno_, turnoB.id, { 1000: 1 }, { forzado: true });
  requerir("el Dueño fuerza el cierre de la caja de B", corteB.ok === true && corteB.forzado === true, `${corteB.status} ${corteB.error ?? ""}`);
  const aConfirmaForzado = await p.confirmarCierre(f.A, corteB.cierre.token, { 20000: 1, 1000: 5 });
  ok("A no confirma el cierre forzado de B: 403", aConfirmaForzado.status === 403, `${aConfirmaForzado.status} ${aConfirmaForzado.error ?? ""}`);
  const finB = await p.confirmarCierre(f.dueno_, corteB.cierre.token, { 20000: 1, 1000: 5 });
  requerir("el Dueño confirma: contó $26.000", finB.ok === true, `${finB.status} ${finB.error ?? ""}`);
  const cerradaB = await prisma.turno.findUnique({ where: { id: turnoB.id } });
  igual("la caja sigue siendo de B, cerrada por el Dueño y marcada forzada por él",
    [cerradaB.operadorId, cerradaB.cerradoPorId, cerradaB.cierreForzadoPorId], [f.opB.id, f.dueno.id, f.dueno.id]);
  const corteBFila = await prisma.cierrePreparacion.findUnique({ where: { id: corteB.cierre.id } });
  igual("el corte forzado no se atribuye a ningún operador que no sea el de la caja",
    [corteBFila.forzadoPorUsuarioId, corteBFila.iniciadoPorOperadorId], [f.dueno.id, null]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("8. Las diferencias quedan donde ocurrieron: A −$5.000, B +$5.000");

  const cerradoA = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  const cerradoB = await prisma.turno.findUnique({ where: { id: turnoB.id } });
  const cuentas = (t) => [Number(t.montoEsperadoEfectivo), Number(t.montoRealEfectivo), Number(t.diferenciaEfectivo)];
  igual("A: esperado $21.000, contado $16.000, diferencia −$5.000", cuentas(cerradoA), [21000, 16000, -5000]);
  igual("B: esperado $21.000, contado $26.000, diferencia +$5.000", cuentas(cerradoB), [21000, 26000, 5000]);

  // La reconstrucción que necesita la futura auditoría de recaudaciones:
  // operador → turno → retiros → total declarado, sin pasar por la cuenta.
  const retirosDe = async (operadorId) => {
    const turnos = await prisma.turno.findMany({ where: { localId: f.local.id, operadorId }, select: { id: true } });
    const movs = await prisma.cajaMovimiento.findMany({
      where: { turnoId: { in: turnos.map((t) => t.id) }, tipo: "RETIRO" },
      select: { monto: true },
    });
    return movs.reduce((s, m) => s + Number(m.monto), 0);
  };
  // 50.000 de recaudación + 30.000 manual + el retiro final del cierre (15.000 / 25.000).
  igual("A → su turno → sus retiros: $95.000 declarados", await retirosDe(f.opA.id), 95000);
  igual("B → su turno → sus retiros: $105.000 declarados", await retirosDe(f.opB.id), 105000);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("9. Auditoría POS: la responsabilidad por operador, nunca un neto de $0");

  const hoy = hoyArgentinaISO();
  const rOps = await leer(await rutaAuditoriaOperadores.GET(
    pedidoGet(`${AUDITORIA}/operadores?fechaDesde=${hoy}&fechaHasta=${hoy}`, f.auditor)
  ));
  requerir("el reporte de operadores responde", rOps.ok === true, `${rOps.status} ${rOps.error ?? ""}`);
  const fila = (opId) => (rOps.items || []).find((i) => i.responsable?.tipo === "OPERADOR" && i.responsable?.id === opId);
  const filaA = fila(f.opA.id);
  const filaB = fila(f.opB.id);
  ok("hay una fila para A y otra para B, aunque compartan la cuenta", Boolean(filaA && filaB),
    JSON.stringify((rOps.items || []).map((i) => i.responsable ?? i.vendedorId)));
  igual("A: faltante $5.000, sobrante $0, un cierre con diferencia",
    [filaA?.faltante, filaA?.sobrante, filaA?.cierresConDiferencia], [5000, 0, 1]);
  igual("B: faltante $0, sobrante $5.000, un cierre con diferencia",
    [filaB?.faltante, filaB?.sobrante, filaB?.cierresConDiferencia], [0, 5000, 1]);
  ok("ninguna fila trae una diferencia neta que compense cajas", (rOps.items || []).every((i) => !("diferenciaTotal" in i)),
    JSON.stringify(rOps.items?.map((i) => i.diferenciaTotal)));
  igual("el agregado del local separa faltantes y sobrantes",
    [rOps.agregadoEstadistico?.faltante, rOps.agregadoEstadistico?.sobrante, rOps.agregadoEstadistico?.cierresConDiferencia],
    [5000, 5000, 2]);

  const rCajas = await leer(await rutaAuditoriaCajas.GET(
    pedidoGet(`${AUDITORIA}/cajas?fechaDesde=${hoy}&fechaHasta=${hoy}`, f.auditor)
  ));
  const difPorTurno = new Map((rCajas.items || []).map((c) => [c.turnoId, c.diferencia]));
  igual("el reporte de cajas conserva −5.000 y +5.000 por turno",
    [difPorTurno.get(turnoA.id), difPorTurno.get(turnoB.id)], [-5000, 5000]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("10. Offline no es una excepción de propiedad ni de vigencia");

  // `origenOffline: true` lo declara el cliente: no prueba nada. Una venta de la
  // cola se escribe sola SOLO si puede escribirse como una venta de ahora: PIN
  // activo del dueño de la caja, en su turno original, operativo y del día. El
  // voucher del operador no autoriza nada —no está atado a una venta, no vence y
  // queda en el navegador—: solo permite negarse a escribir a nombre de otro.
  //
  // La primera revisión encontró que declarando offline A metía ventas en la caja
  // de B; la segunda, que con el voucher de A, B fabricaba ventas en la caja de
  // A, y que la bandera salteaba la vigencia de la caja. Cada rechazo se mide
  // como CERO escrituras: ni Venta, ni VentaPago, ni stock, ni movimiento de
  // stock, ni movimiento de caja.
  const abreA2 = await p.abrir(f.A);
  requerir("A abre una caja nueva", abreA2.ok === true, `${abreA2.status} ${abreA2.error ?? ""}`);
  const abreB2 = await p.abrir(f.B);
  requerir("B abre una caja nueva", abreB2.ok === true, `${abreB2.status} ${abreB2.error ?? ""}`);
  const turnoA2 = abreA2.turno.id;
  const turnoB2 = abreB2.turno.id;
  const SIN_PIN = { sesion: f.A.sesion };

  /** Todo lo que una venta escribe, en el local entero. */
  const huella = async () => ({
    ventas: await prisma.venta.count({ where: { localId: f.local.id } }),
    pagos: await prisma.ventaPago.count({ where: { venta: { localId: f.local.id } } }),
    stock: Number((await prisma.stockLocal.findFirst({
      where: { localId: f.local.id, productoId: f.producto.productoLocalId }, select: { cantidad: true },
    }))?.cantidad ?? NaN),
    movimientosStock: await prisma.movimientoStock.count({ where: { localId: f.local.id } }),
    movimientosCaja: await prisma.cajaMovimiento.count({ where: { turno: { localId: f.local.id } } }),
  });
  const rechazada = async (nombre, pedido) => {
    const antes = await huella();
    const r = await pedido();
    ok(`${nombre}: RECHAZADA`, r.ok !== true && [403, 409, 428].includes(r.status), `${r.status} ${r.error ?? ""}`);
    igual(`${nombre}: cero escrituras`, await huella(), antes);
  };
  const venderEn = (quien, turnoId, extra) => p.vender(quien, turnoId, { cantidad: 1, extra });

  // El voucher de A, tal como queda guardado en la cola del navegador, y uno
  // VIEJO: firmado hace un mes, ya vencido. El servidor ignora el vencimiento
  // del voucher, así que si autorizara algo, el viejo valdría igual.
  const { iat: _iat, exp: _exp, ...cuerpoVoucherA } = jwt.decode(f.voucherA);
  const haceUnMes = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const voucherAViejo = jwt.sign({ ...cuerpoVoucherA, iat: haceUnMes, exp: haceUnMes + 3600 }, SECRETO);

  // ── Propiedad: los siete casos ──────────────────────────────────────────────
  await rechazada("1. A online → caja de B", () => venderEn(f.A, turnoB2, {}));
  await rechazada("2. A declara offline → caja de B, sin voucher",
    () => venderEn(f.A, turnoB2, { origenOffline: true }));
  await rechazada("3. A declara offline → caja de B, con el voucher de A",
    () => venderEn(f.A, turnoB2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await rechazada("4. sin PIN, en un local que exige operador, declara offline → caja de B",
    () => venderEn(SIN_PIN, turnoB2, { origenOffline: true }));

  // 5. El PIN activo es la identidad: A sincroniza en SU caja, operativa y del día.
  const r5 = await venderEn(f.A, turnoA2, { origenOffline: true });
  ok("5. A offline legítima → su caja, con el PIN de A: ACEPTADA", r5.ok === true, `${r5.status} ${r5.error ?? ""}`);
  // 6. Con su voucher y su PIN: el voucher coincide con quien sincroniza.
  const txnLegitima = `${marca}-legitima-A`;
  const r6 = await venderEn(f.A, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA, clientTxnId: txnLegitima });
  ok("6. voucher de A → caja de A, sincronizando A con su PIN: ACEPTADA", r6.ok === true, `${r6.status} ${r6.error ?? ""}`);
  await rechazada("7. voucher de A → caja de B, sincronizando B",
    () => venderEn(f.B, turnoB2, { origenOffline: true, operadorVoucher: f.voucherA }));

  // ── El ataque del voucher: B conoce el voucher de A ────────────────────────
  // Misma cuenta, mismo local, A y B con su caja. A obtuvo su voucher; ahora B
  // está activo, lo lee de la cola y fabrica una venta NUEVA hacia la caja de A.
  await rechazada("V1. B activo, con el voucher de A → caja de A",
    () => venderEn(f.B, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await rechazada("V2. sin PIN, con el voucher de A → caja de A",
    () => venderEn(SIN_PIN, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await rechazada("V3. B activo, con un voucher VIEJO de A → caja de A",
    () => venderEn(f.B, turnoA2, { origenOffline: true, operadorVoucher: voucherAViejo }));
  await rechazada("V4. sin PIN, con un voucher VIEJO de A → caja de A",
    () => venderEn(SIN_PIN, turnoA2, { origenOffline: true, operadorVoucher: voucherAViejo }));
  await rechazada("V5. el Dueño sin PIN, con el voucher de A → caja de A",
    () => venderEn(f.dueno_, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));

  const ventasA2 = await prisma.venta.findMany({ where: { turnoId: turnoA2 }, select: { operadorId: true } });
  igual("solo las dos legítimas quedan en la caja de A, a nombre de A", ventasA2.map((v) => v.operadorId), [f.opA.id, f.opA.id]);
  igual("la caja de B no recibió ninguna", await prisma.venta.count({ where: { turnoId: turnoB2 } }), 0);

  // ── Vigencia: la caja de A quedó abierta de un día anterior ────────────────
  // (su propio dato, sembrado acá). La bandera no distingue una venta encolada
  // de una fabricada ahora: ni online ni "offline" se escribe sola. Queda en la
  // cola para resolverla una persona.
  await prisma.turno.update({ where: { id: turnoA2 }, data: { apertura: new Date(Date.now() - 3 * 24 * 3600 * 1000) } });
  await rechazada("caja vencida: A online, con su PIN", () => venderEn(f.A, turnoA2, {}));
  await rechazada("caja vencida: A declara offline con su PIN, pedido NUEVO sin voucher",
    () => venderEn(f.A, turnoA2, { origenOffline: true }));
  await rechazada("caja vencida: A declara offline con su PIN y su voucher",
    () => venderEn(f.A, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await rechazada("caja vencida: B con el voucher de A",
    () => venderEn(f.B, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await prisma.turno.update({ where: { id: turnoA2 }, data: { apertura: new Date() } });

  // ── Operador A desactivado: ni su PIN ni su voucher escriben ───────────────
  await prisma.operadorLocal.update({ where: { id: f.opA.id }, data: { activo: false } });
  await rechazada("A desactivado: su PIN y su voucher → su caja",
    () => venderEn(f.A, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await rechazada("A desactivado: B con el voucher de A → caja de A",
    () => venderEn(f.B, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  await prisma.operadorLocal.update({ where: { id: f.opA.id }, data: { activo: true } });

  // ── La caja de A cierra con una venta legítima todavía en la cola ──────────
  const cierreA2 = await p.cerrarClasico(f.A, turnoA2, 1000 + 2 * 1000);
  requerir("A cierra su caja", cierreA2.ok === true, `${cierreA2.status} ${cierreA2.error ?? ""}`);
  await rechazada("caja cerrada: la venta legítima de A, con su PIN, no se escribe sola",
    () => venderEn(f.A, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA }));
  // Y un reintento de una venta que YA se escribió —la respuesta se perdió— se
  // reconoce aunque su caja haya cerrado: si no, quedaría pendiente estando
  // escrita, y resolverla a mano la duplicaría.
  const antesReintento = await huella();
  const reintento = await venderEn(f.A, turnoA2, { origenOffline: true, operadorVoucher: f.voucherA, clientTxnId: txnLegitima });
  ok("caja cerrada: el reintento de una venta ya escrita es duplicado, no error",
    reintento.ok === true && reintento.isDuplicate === true, `${reintento.status} ${reintento.error ?? ""}`);
  igual("caja cerrada: el reintento no escribe nada", await huella(), antesReintento);
  // El mismo id hacia otra caja pasa primero por las reglas de siempre (B, en
  // su caja operativa) y después por la idempotencia de siempre: no escribe.
  const antesAjeno = await huella();
  await venderEn(f.B, turnoB2, { origenOffline: true, clientTxnId: txnLegitima });
  igual("el mismo id hacia otra caja no escribe otra venta", await huella(), antesAjeno);
  const abreA3 = await p.abrir(f.A);
  requerir("A abre otra caja", abreA3.ok === true, `${abreA3.status} ${abreA3.error ?? ""}`);

  // Un operador deshabilitado después del PIN deja de identificar a nadie, aunque
  // su cookie siga sin vencer: es lo mismo que exige el login al firmarla.
  await prisma.operadorLocal.update({ where: { id: f.opA.id }, data: { activo: false } });
  const actualInactivo = await p.actual(f.A, f.local.id);
  ok("con A deshabilitado, su cookie no encuentra caja y pide operador",
    (actualInactivo.turno ?? null) === null && actualInactivo.needsOperador === true, JSON.stringify(actualInactivo).slice(0, 160));
  const movInactivo = await p.movimiento(f.A, abreA3.turno.id, "INGRESO", 100);
  ok("ni mueve su caja: 428", movInactivo.status === 428, `${movInactivo.status} ${movInactivo.error ?? ""}`);
  await prisma.operadorLocal.update({ where: { id: f.opA.id }, data: { activo: true } });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("11. Local SIN operario obligatorio: igual, ninguna caja sin operador");

  // Hasta el 2026-10-14 la cuenta de este local abría sin PIN una caja de la
  // cuenta, y todos los que la usaban la compartían (las 836 a 872 de Mini
  // unidas). Ahora `exigirOperador: false` no libera la caja.
  const cajasAntes = await prisma.turno.count({ where: { localId: f.localSinOperario.id } });
  const abreSinPin = await p.abrir(f.sinOperario);
  ok("la cuenta sin PIN no abre caja: 428", abreSinPin.status === 428, `${abreSinPin.status} ${abreSinPin.error ?? ""}`);
  igual("y no se creó ningún turno", await prisma.turno.count({ where: { localId: f.localSinOperario.id } }), cajasAntes);
  const abreC = await p.abrir(f.sinOperarioConPinC);
  requerir("con el PIN de C, abre la caja de C", abreC.ok === true, `${abreC.status} ${abreC.error ?? ""}`);
  igual("el turno es de C", (await prisma.turno.findUnique({ where: { id: abreC.turno.id } })).operadorId, f.opC.id);
  const vC = await p.vender(f.sinOperarioConPinC, abreC.turno.id, { localId: f.localSinOperario.id, producto: f.productoSinOperario, cantidad: 1 });
  ok("C vende en su caja", vC.ok === true, `${vC.status} ${vC.error ?? ""}`);

  // LAS CAJAS DE CUENTA QUE QUEDARON ABIERTAS. Las abiertas antes de esta
  // regla siguen en la base; se arma una así, como la dejó el código viejo, para
  // ver qué se puede hacer con ella hoy: nada sin PIN, y con PIN tampoco, porque
  // no es de ningún operador. Se cierra forzando.
  const turnoCuenta = await prisma.turno.create({
    data: { localId: f.localSinOperario.id, vendedorId: f.cuentaSinOperario.id, montoInicial: 0 },
  });
  const vCuenta = await p.vender(f.sinOperario, turnoCuenta.id, { localId: f.localSinOperario.id, producto: f.productoSinOperario, cantidad: 1 });
  ok("la cuenta sin PIN ya no vende en la caja de cuenta vieja: 428", vCuenta.status === 428, `${vCuenta.status} ${vCuenta.error ?? ""}`);
  let errorIndiceCuenta = null;
  try {
    const intruso = await prisma.turno.create({
      data: { localId: f.localSinOperario.id, vendedorId: f.cuentaSinOperario.id, montoInicial: 0 },
    });
    await prisma.turno.delete({ where: { id: intruso.id } });
  } catch (e) {
    errorIndiceCuenta = e;
  }
  ok("la base sigue impidiendo dos cajas abiertas de la cuenta sin operador",
    errorIndiceCuenta?.code === "P2002", errorIndiceCuenta ? errorIndiceCuenta.code : "se creó");
  igual("sin PIN, el POS no le devuelve caja a la cuenta", (await p.actual(f.sinOperario, f.localSinOperario.id)).turno?.id ?? null, null);

  // Un PIN de esa cuenta no alcanza la caja de la cuenta: si la alcanzara, sería
  // otra vez un cajón compartido.
  const actualC = await p.actual(f.sinOperarioConPinC, f.localSinOperario.id);
  igual("con el PIN de C, el POS le devuelve SU caja, no la de la cuenta", actualC.turno?.id ?? null, abreC.turno.id);
  const movC = await p.movimiento(f.sinOperarioConPinC, turnoCuenta.id, "INGRESO", 100);
  ok("C no mueve la caja de la cuenta", movC.ok !== true && [403, 404].includes(movC.status), `${movC.status} ${movC.error ?? ""}`);
  const corteC = await p.iniciarCierre(f.sinOperarioConPinC, turnoCuenta.id, { 1000: 0 });
  ok("ni la cierra: 403", corteC.status === 403, `${corteC.status} ${corteC.error ?? ""}`);

  // Una cookie de operador firmada para OTRO local no vale en éste.
  const pinAjeno = { sesion: f.A.sesion, operador: firmarTokenOperador({ operadorId: f.opA.id, nombre: f.opA.nombre, localId: f.localSinOperario.id }) };
  const conPinAjeno = await p.actual(pinAjeno, f.local.id);
  igual("una cookie de operador de otro local no identifica a nadie acá", conPinAjeno.turno?.id ?? null, null);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("12. El Dueño sin PIN: su caja es de su cuenta, y retira de la de otro");

  // La segunda regla del 2026-10-14. El Dueño vende sin PIN en la caja de SU
  // cuenta, que es solo suya. Y puede retirar de la caja de otro operador: el
  // retiro queda con quién lo hizo y la diferencia sigue siendo de esa caja.
  // La caja de B es la segunda, la de la sección 10, que sigue abierta.
  const vB2 = await p.vender(f.B, turnoB2, { cantidad: 10 });
  requerir("B vende $10.000 más", vB2.ok === true, `${vB2.status} ${vB2.error ?? ""}`);

  const abreDueno = await p.abrir(f.dueno_);
  requerir("el Dueño abre sin PIN", abreDueno.ok === true, `${abreDueno.status} ${abreDueno.error ?? ""}`);
  const cajaDueno = await prisma.turno.findUnique({ where: { id: abreDueno.turno.id } });
  igual("la caja queda a nombre de la cuenta del Dueño, marcada como suya",
    [cajaDueno.vendedorId, cajaDueno.operadorId, cajaDueno.operaLaCuenta], [f.dueno.id, null, true]);
  const vDueno = await p.vender(f.dueno_, cajaDueno.id, { cantidad: 1 });
  ok("el Dueño vende sin PIN en su caja", vDueno.ok === true, `${vDueno.status} ${vDueno.error ?? ""}`);
  const vAenDueno = await p.vender(f.A, cajaDueno.id, { cantidad: 1 });
  ok("A no vende en la caja del Dueño", vAenDueno.ok !== true && [403, 404, 409].includes(vAenDueno.status), `${vAenDueno.status} ${vAenDueno.error ?? ""}`);
  const retiroAenDueno = await p.iniciarRetiro(f.A, cajaDueno.id, { 1000: 1 });
  ok("ni retira de ella: 403", retiroAenDueno.status === 403, `${retiroAenDueno.status} ${retiroAenDueno.error ?? ""}`);
  const corteAenDueno = await p.iniciarCierre(f.A, cajaDueno.id, { 1000: 1 });
  ok("ni la cierra: 403", corteAenDueno.status === 403, `${corteAenDueno.status} ${corteAenDueno.error ?? ""}`);
  // Alguien que hace PIN en la cuenta del Dueño opera SU caja, no la del Dueño.
  const pinEnCuentaDueno = { sesion: f.dueno_.sesion, operador: f.B.operador };
  igual("con un PIN en la cuenta del Dueño, el POS devuelve la caja de ese operador",
    (await p.actual(pinEnCuentaDueno, f.local.id)).turno?.id ?? null, turnoB2);
  const vPinEnDueno = await p.vender(pinEnCuentaDueno, cajaDueno.id, { cantidad: 1 });
  ok("y no vende en la caja del Dueño", vPinEnDueno.ok !== true, `${vPinEnDueno.status} ${vPinEnDueno.error ?? ""}`);

  // EL RETIRO EN CAJA AJENA. A —un cajero— no puede; el Dueño sí.
  const antesRetiroB2 = await fotoDe(turnoB2);
  const retiroCajero = await p.iniciarRetiro(f.A, turnoB2, { 1000: 1 });
  ok("A no retira de la caja de B: 403", retiroCajero.status === 403, `${retiroCajero.status} ${retiroCajero.error ?? ""}`);
  igual("y en la caja de B no apareció nada", await fotoDe(turnoB2), antesRetiroB2);
  // El Dueño deja $1.000 de cambio y retira el resto.
  const retiroDueno = await p.iniciarRetiro(f.dueno_, turnoB2, { 1000: 1 });
  requerir("el Dueño inicia un retiro de la caja de B", retiroDueno.ok === true, `${retiroDueno.status} ${retiroDueno.error ?? ""}`);
  const filaRetiro = await prisma.retiroPreparacion.findUnique({ where: { token: retiroDueno.retiro.token } });
  igual("el retiro dice quién lo hizo y no se atribuye a ningún operador",
    [filaRetiro.intervenidoPorUsuarioId, filaRetiro.iniciadoPorUsuarioId, filaRetiro.iniciadoPorOperadorId], [f.dueno.id, f.dueno.id, null]);
  // El Dueño cuenta $1.000 menos de lo esperado: el faltante es de la caja de B.
  const billetes = Number(filaRetiro.efectivoRetiradoEsperado) / 1000 - 1;
  requerir("el retiro esperado se puede contar en billetes de $1.000", Number.isInteger(billetes) && billetes > 0, String(filaRetiro.efectivoRetiradoEsperado));
  const aConfirma = await p.confirmarRetiro(f.A, retiroDueno.retiro.token, { 1000: billetes });
  ok("A no confirma el retiro del Dueño: 403", aConfirma.status === 403, `${aConfirma.status} ${aConfirma.error ?? ""}`);
  const finRetiro = await p.confirmarRetiro(f.dueno_, retiroDueno.retiro.token, { 1000: billetes });
  requerir("el Dueño confirma el retiro", finRetiro.ok === true, `${finRetiro.status} ${finRetiro.error ?? ""}`);
  const filaConfirmada = await prisma.retiroPreparacion.findUnique({ where: { token: retiroDueno.retiro.token } });
  const arqueoRetiro = await prisma.arqueoCaja.findUnique({ where: { id: filaConfirmada.arqueoCajaId } });
  igual("el arqueo del retiro es de la caja de B, con el faltante, y lo hizo el Dueño",
    [arqueoRetiro.turnoId, arqueoRetiro.operadorId, arqueoRetiro.usuarioId, arqueoRetiro.realizadoPorId, Number(arqueoRetiro.diferencia)],
    [turnoB2, f.opB.id, f.cuenta.id, f.dueno.id, -1000]);
  igual("la caja sigue siendo de B", (await prisma.turno.findUnique({ where: { id: turnoB2 } })).operadorId, f.opB.id);

  // El Dueño cierra SU caja con el cierre normal: no la fuerza, es suya.
  const forzarPropia = await p.iniciarCierre(f.dueno_, cajaDueno.id, { 1000: 1 }, { forzado: true });
  ok("el Dueño no fuerza su propia caja: 400", forzarPropia.status === 400, `${forzarPropia.status} ${forzarPropia.error ?? ""}`);
  const corteDueno = await p.iniciarCierre(f.dueno_, cajaDueno.id, { 1000: 1 });
  requerir("el Dueño toma el corte de su caja", corteDueno.ok === true, `${corteDueno.status} ${corteDueno.error ?? ""}`);
  const finDueno = await p.confirmarCierre(f.dueno_, corteDueno.cierre.token, { 1000: 1 });
  requerir("y lo confirma", finDueno.ok === true, `${finDueno.status} ${finDueno.error ?? ""}`);
  const cerradaDueno = await prisma.turno.findUnique({ where: { id: cajaDueno.id } });
  igual("cerrada normal, sin marca de forzado, y sigue siendo de su cuenta",
    [cerradaDueno.cierre != null, cerradaDueno.cierreForzadoPorId, cerradaDueno.vendedorId, cerradaDueno.operaLaCuenta],
    [true, null, f.dueno.id, true]);
}

let fallo = null;
try {
  await correr();
} catch (e) {
  fallo = e;
  if (!String(e.message).startsWith("requisito:")) console.error(e);
} finally {
  await desmontar().catch((e) => console.error("[desmontar]", e));
  await prisma.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length || fallo) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  if (fallo && String(fallo.message).startsWith("requisito:")) console.log(`  (cortado: ${fallo.message})`);
  process.exit(1);
}
