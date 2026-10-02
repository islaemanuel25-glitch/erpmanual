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
// —ni por la ruta ni directo a la base con otra cuenta— no puede existir. Y la
// intervención que ya existía —el Dueño de su local— sigue pudiendo arquear la
// caja de un operador, con su autoría.
//
// Al final, un local SIN operario: la caja es de la cuenta, como siempre, y un
// PIN de esa cuenta no la alcanza.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
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
      leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial }))),
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
    iniciarCierre: async (quien, turnoId, desgloseCambio) =>
      leer(await rutaCierreIniciar.POST(pedido(`${BASE}/cierres/iniciar`, quien, { turnoId, desgloseCambio }))),
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
  seccion("5. Arqueos parciales: cada uno el suyo; el Dueño interviene con su autoría");

  const arqA = await p.arquear(f.A, turnoA.id, 21000);
  requerir("A arquea su caja", arqA.ok === true, `${arqA.status} ${arqA.error ?? ""}`);
  const arqB = await p.arquear(f.B, turnoB.id, 21000);
  requerir("B arquea su caja", arqB.ok === true, `${arqB.status} ${arqB.error ?? ""}`);
  const antesB3 = await fotoDe(turnoB.id);
  const arqCruzado = await p.arquear(f.A, turnoB.id, 21000);
  ok("A arqueando la caja de B: rechazo", arqCruzado.ok !== true && [403, 404].includes(arqCruzado.status), `${arqCruzado.status} ${arqCruzado.error ?? ""}`);
  igual("y no apareció ningún arqueo en la caja de B", await fotoDe(turnoB.id), antesB3);

  const arqDueno = await p.arquear(f.dueno_, turnoB.id, 21000);
  ok("el Dueño de Casiano arquea la caja de B", arqDueno.ok === true, `${arqDueno.status} ${arqDueno.error ?? ""}`);
  const ultimoArqueoB = await prisma.arqueoCaja.findFirst({ where: { turnoId: turnoB.id }, orderBy: { id: "desc" } });
  igual("con su autoría real en realizadoPorId", ultimoArqueoB?.realizadoPorId, f.dueno.id);

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
  const finA = await p.confirmarCierre(f.A, corteA.cierre.token, { 10000: 1, 1000: 5 });
  requerir("A confirma: contó $16.000", finA.ok === true, `${finA.status} ${finA.error ?? ""}`);
  // B deja $1.000 de cambio y cuenta $25.000: el cajón tenía $26.000.
  const corteB = await p.iniciarCierre(f.B, turnoB.id, { 1000: 1 });
  requerir("B toma el corte de su caja", corteB.ok === true, `${corteB.status} ${corteB.error ?? ""}`);
  const finB = await p.confirmarCierre(f.B, corteB.cierre.token, { 20000: 1, 1000: 5 });
  requerir("B confirma: contó $26.000", finB.ok === true, `${finB.status} ${finB.error ?? ""}`);

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
  seccion("10. Venta offline: se preserva en la caja donde se cobró");

  // Una caja nueva de A para recibir la sincronización: la anterior cerró.
  const abreA2 = await p.abrir(f.A);
  requerir("A abre una caja nueva", abreA2.ok === true, `${abreA2.status} ${abreA2.error ?? ""}`);
  // La pantalla había encolado esta venta con el turno de A y el voucher de B:
  // se cobró en el cajón de A. Al sincronizar no se pierde ni se muda.
  const offline = await p.vender(f.A, abreA2.turno.id, {
    cantidad: 1,
    extra: { origenOffline: true, operadorVoucher: f.voucherB },
  });
  ok("la venta offline con voucher de otro operador se graba", offline.ok === true, `${offline.status} ${offline.error ?? ""}`);
  const vOff = await prisma.venta.findFirst({ where: { turnoId: abreA2.turno.id }, select: { turnoId: true, operadorId: true } });
  igual("queda en la caja donde se cobró, con el operador del voucher a la vista",
    [vOff?.turnoId, vOff?.operadorId], [abreA2.turno.id, f.opB.id]);

  // Un operador deshabilitado después del PIN deja de identificar a nadie, aunque
  // su cookie siga sin vencer: es lo mismo que exige el login al firmarla.
  await prisma.operadorLocal.update({ where: { id: f.opA.id }, data: { activo: false } });
  const actualInactivo = await p.actual(f.A, f.local.id);
  ok("con A deshabilitado, su cookie no encuentra caja y pide operador",
    (actualInactivo.turno ?? null) === null && actualInactivo.needsOperador === true, JSON.stringify(actualInactivo).slice(0, 160));
  const movInactivo = await p.movimiento(f.A, abreA2.turno.id, "INGRESO", 100);
  ok("ni mueve su caja: 428", movInactivo.status === 428, `${movInactivo.status} ${movInactivo.error ?? ""}`);
  await prisma.operadorLocal.update({ where: { id: f.opA.id }, data: { activo: true } });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("11. Local SIN operario: la caja es de la cuenta, como siempre");

  const abreCuenta = await p.abrir(f.sinOperario);
  requerir("la cuenta abre sin PIN", abreCuenta.ok === true, `${abreCuenta.status} ${abreCuenta.error ?? ""}`);
  const turnoCuenta = await prisma.turno.findUnique({ where: { id: abreCuenta.turno.id } });
  igual("el turno queda sin operador", turnoCuenta.operadorId, null);
  const otraVezCuenta = await p.abrir(f.sinOperario);
  ok("la misma cuenta no abre otra: 409", otraVezCuenta.status === 409, `${otraVezCuenta.status}`);
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
  const vCuenta = await p.vender(f.sinOperario, turnoCuenta.id, { localId: f.localSinOperario.id, producto: f.productoSinOperario, cantidad: 1 });
  ok("la cuenta vende en su caja", vCuenta.ok === true, `${vCuenta.status} ${vCuenta.error ?? ""}`);
  igual("el turno actual de la cuenta es ése", (await p.actual(f.sinOperario, f.localSinOperario.id)).turno?.id, turnoCuenta.id);

  // Un PIN de esa cuenta no alcanza la caja de la cuenta: si la alcanzara, sería
  // otra vez un cajón compartido.
  const actualC = await p.actual(f.sinOperarioConPinC, f.localSinOperario.id);
  igual("con el PIN de C, la caja de la cuenta no es la suya", actualC.turno?.id ?? null, null);
  const movC = await p.movimiento(f.sinOperarioConPinC, turnoCuenta.id, "INGRESO", 100);
  ok("C no mueve la caja de la cuenta", movC.ok !== true && [403, 404].includes(movC.status), `${movC.status} ${movC.error ?? ""}`);

  // Una cookie de operador firmada para OTRO local no vale en éste.
  const pinAjeno = { sesion: f.A.sesion, operador: firmarTokenOperador({ operadorId: f.opA.id, nombre: f.opA.nombre, localId: f.localSinOperario.id }) };
  const conPinAjeno = await p.actual(pinAjeno, f.local.id);
  igual("una cookie de operador de otro local no identifica a nadie acá", conPinAjeno.turno?.id ?? null, null);
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
