// VERIFICAR Y ANULAR EFECTIVO CONTRA POSTGRESQL, POR LAS RUTAS REALES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/verificacionEfectivoAcciones.mjs
//
// La persistencia y sus defensas de base las ejerce verificacionEfectivo.mjs.
// Esto ejerce el CIRCUITO de la PR #137, siempre por las rutas:
//   POST /api/finanzas/tesoreria/verificaciones
//   POST /api/finanzas/tesoreria/verificaciones/:id/anular
//   GET  /api/finanzas/tesoreria                     (la lectura con el estado)
//   POST /api/caja/correcciones/{ensayo,aplicar}     (el candado de la corrección)
//
// Las entregas salen de cajas abiertas, vendidas, retiradas y cerradas por las
// rutas del POS. Las carreras se FUERZAN: se retiene el turno —el mismo candado
// que toman las cuatro operaciones—, se encolan los pedidos mirando pg_locks y
// recién entonces se suelta. Nada de sleeps.
//
// Los números entre corchetes son los de la lista de la PR.
//
// NO DESMONTA: una verificación no se borra y sus FK RESTRICT sostienen todo lo
// demás. Corre en la base efímera de la prueba.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { retenerTurno, esperarEnFila } = await import("./carreraForzada.mjs");
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { DENOMINACIONES } = await import("../../lib/caja/conteoBilletes.js");
const { crearCuentaPorPagarDesdeCompra, registrarPagoProveedor } = await import("../../lib/finanzas/pagosProveedoresServer.js");
const { ejecutarCorreccion, RESULTADO, CODIGO_CORRECCION } = await import("../../lib/caja/correcciones/motor.js");
const { PERMISO_CORREGIR_HISTORICO } = await import("../../lib/caja/correcciones/plan.js");
const { ALERTA, ESTADO_ENTREGA } = await import("../../lib/tesoreria/lecturaTesoreria.js");
const { MOTIVO_DESACTUALIZADA } = await import("../../lib/tesoreria/desactualizacion.js");
const { CODIGO_VERIFICACION } = await import("../../lib/tesoreria/verificacionEfectivoServer.js");
const { PERMISO_VER_TESORERIA, PERMISO_VERIFICAR_EFECTIVO, PERMISO_ANULAR_VERIFICACION } = await import("../../lib/tesoreria/permisos.js");

const rutaVerificar = await import("../../app/api/finanzas/tesoreria/verificaciones/route.js");
const rutaAnular = await import("../../app/api/finanzas/tesoreria/verificaciones/[id]/anular/route.js");
const rutaTesoreria = await import("../../app/api/finanzas/tesoreria/route.js");
const rutaEnsayo = await import("../../app/api/caja/correcciones/ensayo/route.js");
const rutaAplicar = await import("../../app/api/caja/correcciones/aplicar/route.js");
const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
const rutaCierreIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaCierreConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };
function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d || "falló"}`); console.log(`  ✗ ${t} — ${d || "falló"}`); }
}
const igual = (t, o, e) => ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);
function requerir(t, c, d = "") {
  ok(t, c, d);
  if (!c) throw new Error(`requisito: ${t} — ${d}`);
}
/** Un rechazo con su estado Y su código: un 409 por otra causa no prueba nada. */
const rechazo = (t, r, status, codigo) =>
  ok(t, r.status === status && (codigo == null || r.codigo === codigo), `${r.status} ${r.codigo ?? ""} ${r.error ?? ""}`);

const SECRETO = process.env.AUTH_SECRET;
const BASE = "http://ci/api/pos-ventas";
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const conCookie = (url, cookie, cuerpo, metodo = "POST") => {
  const req = new Request(url, {
    method: metodo,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    ...(metodo === "GET" ? {} : { body: JSON.stringify(cuerpo ?? {}) }),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const pedidoPos = (url, quien, cuerpo) =>
  conCookie(url, [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; "), cuerpo);
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });
const conId = (id) => ({ params: Promise.resolve({ id: String(id) }) });
const firmar = (usuario, localId, permisos, extra = {}) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos, ...extra }, SECRETO, { expiresIn: "1h" });

/** POST de verificar con la sesión dada (o sin sesión). */
const verificar = async (sesion, cuerpo) =>
  leer(await rutaVerificar.POST(conCookie("http://ci/api/finanzas/tesoreria/verificaciones", sesion ? `erpazul_sesion=${sesion}` : null, cuerpo)));
const anular = async (sesion, id, cuerpo) =>
  leer(await rutaAnular.POST(conCookie(`http://ci/api/finanzas/tesoreria/verificaciones/${id}/anular`, sesion ? `erpazul_sesion=${sesion}` : null, cuerpo), conId(id)));
const lectura = async (sesion) =>
  leer(await rutaTesoreria.GET(conCookie("http://ci/api/finanzas/tesoreria", `erpazul_sesion=${sesion}`, null, "GET")));
const ensayar = async (sesion, codigo) =>
  leer(await rutaEnsayo.POST(conCookie("http://ci/api/caja/correcciones/ensayo", `erpazul_sesion=${sesion}`, { codigo })));
const aplicarPorRuta = async (sesion, codigo) =>
  leer(await rutaAplicar.POST(conCookie("http://ci/api/caja/correcciones/aplicar", `erpazul_sesion=${sesion}`, { codigo, confirmacion: codigo })));

function desgloseDe(monto) {
  const d = {};
  let resto = monto;
  for (const { valor } of DENOMINACIONES) {
    const n = Math.floor(resto / valor);
    if (n > 0) { d[valor] = n; resto -= n * valor; }
  }
  if (resto !== 0) throw new Error(`desgloseDe: ${monto} no es múltiplo de 100`);
  return d;
}

const marca = `ci-verif-acc-${Date.now()}`;
let n = 0;
const clave = (s = "") => `${marca}-${s}${(n += 1)}`;
const PERMISOS_POS = ["pos.usar"];

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES: tres ubicaciones, cajas por las rutas del POS
// ═══════════════════════════════════════════════════════════════════════════

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS_POS } });
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  const ubicacion = async (sufijo, { exigirOperador, es_deposito = false }) => {
    const local = await prisma.local.create({ data: { nombre: `${marca}-${sufijo}`, tipo: es_deposito ? "deposito" : "local", es_deposito } });
    await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
    await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador, allowNegativeStock: false } });
    const usuario = await prisma.usuario.create({
      data: { nombre: `${marca}-${sufijo}-cuenta`, email: `${marca}-${sufijo}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
    });
    const producto = es_deposito ? null : await crearProductoVendible(prisma, {
      grupoId: grupo.id, localId: local.id, nombre: `${marca}-${sufijo}-p`, precioVenta: 1000, precioCosto: 600, stock: 100000,
    });
    const s = (permisos, extra) => firmar(usuario, local.id, permisos, extra);
    return {
      local, usuario, producto, exigirOperador,
      pos: s(PERMISOS_POS),
      ver: s([PERMISO_VER_TESORERIA]),
      soloVerificar: s([PERMISO_VERIFICAR_EFECTIVO]),
      soloAnular: s([PERMISO_ANULAR_VERIFICACION]),
      todo: s([PERMISO_VER_TESORERIA, PERMISO_VERIFICAR_EFECTIVO, PERMISO_ANULAR_VERIFICACION]),
      corrector: s([PERMISO_CORREGIR_HISTORICO]),
      admin: s(["*"], { esAdmin: true, grupoId: grupo.id }),
    };
  };
  const A = await ubicacion("A", { exigirOperador: true });
  const B = await ubicacion("B", { exigirOperador: false });
  const D = await ubicacion("D", { exigirOperador: false, es_deposito: true });
  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-panadero` } });
  return { grupo, A, B, D, proveedor };
}

async function nuevaCaja(u, fondo = 1000) {
  let operador = null;
  let op = null;
  if (u.exigirOperador) {
    op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: u.local.id } });
    operador = firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: u.local.id });
  }
  const quien = { sesion: u.pos, operador };
  const r = await leer(await rutaAbrir.POST(pedidoPos(`${BASE}/turnos/abrir`, quien, { montoInicial: fondo })));
  requerir("abre la caja", r.ok === true, `${r.status} ${r.error ?? ""}`);
  return { u, op, quien, turnoId: r.turno.id };
}
async function vender(caja, monto) {
  const r = await leer(await rutaCrear.POST(pedidoPos(`${BASE}/crear`, caja.quien, {
    clientTxnId: clave("v"), localId: caja.u.local.id, clienteId: null, turnoId: caja.turnoId, formaPago: "EFECTIVO",
    esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
    items: [itemCrearPayload({ productoBaseId: caja.u.producto.baseId, nombre: "P", precio: 1000, cantidad: monto / 1000, precioCosto: 600 })],
  })));
  requerir(`vende $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
}
async function retirar(caja, cambio, contado) {
  const ini = await leer(await rutaRetiroIniciar.POST(pedidoPos(`${BASE}/retiros/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
  requerir("inicia el retiro", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
  const tok = ini.retiro?.token ?? ini.preparacion?.token ?? ini.token;
  const fin = await leer(await rutaRetiroConfirmar.POST(pedidoPos(`${BASE}/retiros/${tok}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(tok)));
  requerir("confirma el retiro", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
}
/** Cierra por las rutas. `retiro` puede ser un desglose literal (el ×1000), con su confirmación. */
async function cerrar(caja, cambio, retiro, totalConfirmado = null) {
  const ini = await leer(await rutaCierreIniciar.POST(pedidoPos(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
  requerir("inicia el cierre", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
  const desglose = typeof retiro === "number" ? desgloseDe(retiro) : retiro;
  const fin = await leer(await rutaCierreConfirmar.POST(
    pedidoPos(`${BASE}/cierres/${ini.cierre.token}/confirmar`, caja.quien, { desgloseRetiroContado: desglose, totalConfirmado }),
    conToken(ini.cierre.token)
  ));
  requerir("confirma el cierre", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
  return prisma.cierrePreparacion.findFirst({ where: { token: ini.cierre.token } });
}
/** El id del movimiento de una entrega, por su vínculo estructural. */
async function entregaDe(caja, clase) {
  if (clase === "CIERRE") {
    const t = await prisma.turno.findUnique({ where: { id: caja.turnoId }, select: { retiroCierreMovimientoId: true } });
    return t.retiroCierreMovimientoId;
  }
  const a = await prisma.arqueoCaja.findFirst({ where: { turnoId: caja.turnoId, cajaMovimientoRetiroId: { not: null } }, select: { cajaMovimientoRetiroId: true } });
  return a.cajaMovimientoRetiroId;
}
/** Una caja con un único cierre de `monto` en efectivo. Devuelve el id de la entrega. */
async function cajaConCierre(u, monto) {
  const c = await nuevaCaja(u);
  await vender(c, monto);
  await cerrar(c, 1000, monto);
  return { caja: c, id: await entregaDe(c, "CIERRE") };
}
/** Un incidente ×1000: un cierre contado 8.000 billetes de $1.000 donde había 8. */
async function incidente(u) {
  const c = await nuevaCaja(u, 10000);
  const corte = await cerrar(c, 2000, { 1000: 8000 }, "8000000");
  const id = await entregaDe(c, "CIERRE");
  const manifiesto = {
    // El formato que pide el motor: mayúsculas, dígitos, guiones; hasta 40.
    codigo: `CI-VERIF-${Date.now()}-${(n += 1)}`,
    estado: "PROPUESTO",
    motivo: "Retiro contado ×1000",
    evidencia: "Prueba de base",
    correcciones: [{ tipo: "CORTE", cierrePreparacionId: corte.id, antes: { desgloseRetiroContado: { 1000: 8000 } }, despues: { desgloseRetiroContado: { 1000: 8 } } }],
  };
  return { caja: c, id, manifiesto };
}
const vigentesDe = (cajaMovimientoId) => prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId, vigente: true } });
const montoDe = async (id) => Number((await prisma.cajaMovimiento.findUnique({ where: { id }, select: { monto: true } })).monto);

/**
 * Encola operaciones detrás del turno retenido, en el orden dado, mirando
 * pg_locks; suelta y devuelve los resultados en ese orden.
 */
async function enFila(turnoId, operaciones) {
  const retencion = await retenerTurno(prisma, turnoId);
  const promesas = [];
  const enEspera = [];
  try {
    for (const op of operaciones) {
      promesas.push(op());
      // Menos que el timeout de las transacciones (OPCIONES_TX, 10 s): si un
      // pedido no llega a la fila, se suelta antes de que el primero venza.
      enEspera.push(await esperarEnFila(prisma, promesas.length, 4_000));
    }
  } finally {
    await retencion.soltar();
  }
  return { resultados: await Promise.all(promesas), enEspera };
}

// ═══════════════════════════════════════════════════════════════════════════

async function correr() {
  seccion("0. Montaje por las rutas del POS");
  const f = await montar();
  const { A, B, D } = f;

  // Caja 1 entrega $100.000 y caja 2 $10.000: el caso de la PR.
  const k1 = await cajaConCierre(A, 100000);
  const k2 = await cajaConCierre(A, 10000);
  // Una caja con RECAUDACION y CIERRE.
  const c3 = await nuevaCaja(A);
  await vender(c3, 60000);
  await retirar(c3, 31000, 30000);
  await cerrar(c3, 1000, 30000);
  const e3R = await entregaDe(c3, "RECAUDACION");
  const e3C = await entregaDe(c3, "CIERRE");
  const k4 = await cajaConCierre(A, 20000); // carrera A
  const k5 = await cajaConCierre(A, 5000); //  carrera C
  const k6 = await cajaConCierre(A, 7000); //  carrera D
  const k7 = await cajaConCierre(A, 4000); //  una sola entrega, idempotencia
  const k9 = await cajaConCierre(A, 3000); //  fuente que cambia sola
  const kB = await cajaConCierre(B, 8000); //  sin operador; la verifica el depósito
  const kB2 = await cajaConCierre(B, 6000); // la verifica B
  // Un Caja − manual: no es entrega.
  const c7m = await nuevaCaja(A);
  {
    const r = await leer(await rutaMovimiento.POST(pedidoPos(`${BASE}/caja-movimientos/crear`, c7m.quien, { turnoId: c7m.turnoId, tipo: "RETIRO", monto: 500, motivo: "manual" })));
    requerir("Caja − manual", r.ok === true, `${r.status} ${r.error ?? ""}`);
  }
  const manual = await prisma.cajaMovimiento.findFirst({ where: { turnoId: c7m.turnoId, tipo: "RETIRO" }, select: { id: true } });
  // Un pago a proveedor de $2.000 en efectivo desde la caja 8, y uno de $3.000 por transferencia.
  const c8 = await nuevaCaja(A);
  await vender(c8, 12000);
  const pedidoPan = await prisma.pedidoProveedor.create({
    data: { grupoId: f.grupo.id, depositoId: A.local.id, proveedorId: f.proveedor.id, estado: "RECIBIDO" },
  });
  const { cuenta } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, { pedidoProveedorId: pedidoPan.id, localGastoId: A.local.id, total: 10000, usuarioId: A.usuario.id })
  );
  await prisma.$transaction((tx) => registrarPagoProveedor(tx, {
    cuentaId: cuenta.id, monto: 2000, medio: "EFECTIVO", turnoId: c8.turnoId,
    localOrigenId: A.local.id, localOperativoId: A.local.id, usuarioId: A.usuario.id, idempotencyKey: clave("p"),
  }));
  // En el cajón: 1.000 + 12.000 − 2.000 = 11.000. Deja 1.000 y entrega 10.000.
  await cerrar(c8, 1000, 10000);
  const e8 = await entregaDe(c8, "CIERRE");
  const movPago = await prisma.pagoProveedor.findFirst({ where: { cuentaId: cuenta.id, medio: "EFECTIVO" }, select: { cajaMovimientoId: true } });
  // Incidentes ×1000: uno para el candado, dos para la carrera con la corrección.
  const x1 = await incidente(A);
  const x2 = await incidente(A);
  const x3 = await incidente(A);
  ok("0: montaje completo", true);

  // ── LECTURA ANTES ────────────────────────────────────────────────────────
  seccion("1. La lectura antes de verificar [32]");
  const antes = await lectura(A.todo);
  requerir("la lectura responde", antes.ok === true, `${antes.status} ${antes.error ?? ""}`);
  const entregaEn = (l, id) => l.tesoreria.entregas.find((e) => e.cajaMovimientoId === id);
  igual("[32] todas las entregas están PENDIENTES", antes.tesoreria.entregas.every((e) => e.estadoVerificacion === ESTADO_ENTREGA.PENDIENTE), true);
  igual("[32] el resumen separa lo pendiente: nada verificado todavía",
    [antes.tesoreria.resumen.verificacion.entregasVerificadas, antes.tesoreria.resumen.verificacion.efectivoVerificado, antes.tesoreria.resumen.verificacion.entregadoPendienteDeVerificar],
    [0, 0, antes.tesoreria.resumen.efectivoDeclaradoEntregado]);
  const baseAntes = antes.tesoreria.resumen.baseConocida;

  // ── PERMISOS ─────────────────────────────────────────────────────────────
  seccion("2. Autenticación y permisos [1, 2, 3]");
  const cuerpoCaso = (extra = {}) => ({ cajaMovimientoIds: [k1.id, k2.id], importeVerificado: 108000, idempotencyKey: `${marca}-caso`, ...extra });
  rechazo("[1] verificar sin sesión: 401", await verificar(null, cuerpoCaso()), 401);
  rechazo("[1] anular sin sesión: 401", await anular(null, 1, { motivo: "x" }), 401);
  rechazo("[2] tesoreria.ver solo no verifica: 403", await verificar(A.ver, cuerpoCaso()), 403);
  rechazo("[2] anular no autoriza verificar: 403", await verificar(A.soloAnular, cuerpoCaso()), 403);
  rechazo("[3] verificar no autoriza anular: 403", await anular(A.soloVerificar, 1, { motivo: "x" }), 403);
  rechazo("[3] tesoreria.ver solo no anula: 403", await anular(A.ver, 1, { motivo: "x" }), 403);
  igual("ningún rechazo escribió", await prisma.verificacionEfectivo.count({ where: { localId: { in: [A.local.id, B.local.id] } } }), 0);

  // ── EL CLIENTE NO DECIDE EL DECLARADO ────────────────────────────────────
  seccion("3. Lo que el cliente no decide [12, 13, 11]");
  rechazo("[13] mandar importeDeclarado: 400", await verificar(A.todo, cuerpoCaso({ importeDeclarado: 108000 })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("[13] mandar diferencia: 400", await verificar(A.todo, cuerpoCaso({ diferencia: 0 })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("[13] mandar localId: 400", await verificar(A.todo, cuerpoCaso({ localId: B.local.id })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("[13] mandar fotos: 400", await verificar(A.todo, cuerpoCaso({ entregas: [{ cajaMovimientoId: k1.id, montoDeclaradoSnapshot: 1 }] })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("importe con más de dos decimales: 400", await verificar(A.todo, cuerpoCaso({ importeVerificado: 1.005 })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("importe negativo: 400", await verificar(A.todo, cuerpoCaso({ importeVerificado: -1 })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("sin clave: 400", await verificar(A.todo, cuerpoCaso({ idempotencyKey: "  " })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("la misma entrega dos veces: 400", await verificar(A.todo, cuerpoCaso({ cajaMovimientoIds: [k1.id, k1.id] })), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("[11] un Caja − manual no es entrega: 400", await verificar(A.todo, { cajaMovimientoIds: [manual.id], importeVerificado: 500, idempotencyKey: clave() }), 400, CODIGO_VERIFICACION.NO_ES_ENTREGA);
  rechazo("[11] el movimiento de un pago desde caja no es entrega: 400", await verificar(A.todo, { cajaMovimientoIds: [movPago.cajaMovimientoId], importeVerificado: 2000, idempotencyKey: clave() }), 400, CODIGO_VERIFICACION.NO_ES_ENTREGA);
  rechazo("un movimiento que no existe: 404", await verificar(A.todo, { cajaMovimientoIds: [2147483000], importeVerificado: 1, idempotencyKey: clave() }), 404, CODIGO_VERIFICACION.ENTREGA_NO_EXISTE);

  // ── ALCANCE ──────────────────────────────────────────────────────────────
  seccion("4. Alcance territorial [4, 5, 10]");
  rechazo("[5] A no verifica una entrega de B: 403", await verificar(A.todo, { cajaMovimientoIds: [kB.id], importeVerificado: 8000, idempotencyKey: clave() }), 403, CODIGO_VERIFICACION.FUERA_DE_ALCANCE);
  {
    const r = await verificar(A.todo, { cajaMovimientoIds: [k7.id, kB.id], importeVerificado: 12000, idempotencyKey: clave() });
    rechazo("[4] A mezclando una de B: 403, sin decir cuál", r, 403, CODIGO_VERIFICACION.FUERA_DE_ALCANCE);
    igual("[4] el rechazo no nombra ids ni locales ajenos", r.detalle, null);
  }
  rechazo("[10] el depósito no mezcla locales: 400", await verificar(D.todo, { cajaMovimientoIds: [k7.id, kB.id], importeVerificado: 12000, idempotencyKey: clave() }), 400, CODIGO_VERIFICACION.LOCALES_MEZCLADOS);
  const rD = await verificar(D.todo, { cajaMovimientoIds: [kB.id], importeVerificado: 8000, idempotencyKey: `${marca}-compartida` });
  igual("[4] el depósito verifica una entrega de B de su grupo: 201", rD.status, 201);
  igual("[4] la verificación es de B, y la autoría del usuario del depósito", [rD.verificacion?.localId, rD.verificacion?.verificadaPorUsuarioId], [B.local.id, D.usuario.id]);
  igual("la foto de un local sin operador lleva operador null, y nadie inventa uno", [rD.verificacion?.entregas?.[0]?.operadorId, rD.verificacion?.verificadaPorOperadorId], [null, null]);
  rechazo("[6] A no anula una verificación de B: 403", await anular(A.todo, rD.verificacion.id, { motivo: "no es mía" }), 403, CODIGO_VERIFICACION.FUERA_DE_ALCANCE);
  igual("[6] y la de B sigue vigente", (await prisma.verificacionEfectivo.findUnique({ where: { id: rD.verificacion.id } })).estado, "VIGENTE");
  const rB = await verificar(B.todo, { cajaMovimientoIds: [kB2.id], importeVerificado: 6000, idempotencyKey: clave() });
  igual("B verifica lo suyo: 201", rB.status, 201);

  // ── EL CASO DE LA PR ─────────────────────────────────────────────────────
  seccion("5. Caja 1 $100.000 + caja 2 $10.000, contado $108.000 [9, 12, 14, 16]");
  const rCaso = await verificar(A.todo, cuerpoCaso());
  requerir("[9] dos cajas del mismo local juntas: 201", rCaso.status === 201, `${rCaso.status} ${rCaso.codigo ?? ""} ${rCaso.error ?? ""}`);
  const V = rCaso.verificacion;
  igual("[16] declarado 110.000, verificado 108.000, diferencia −2.000", [V.importeDeclarado, V.importeVerificado, V.diferencia, V.correcta], [110000, 108000, -2000, false]);
  igual("[12] el declarado es el de los movimientos de la base", V.importeDeclarado, (await montoDe(k1.id)) + (await montoDe(k2.id)));
  igual("[14] diferencia = verificado − declarado, exacta", V.diferencia, V.importeVerificado - V.importeDeclarado);
  igual("las fotos: una por caja, con su monto, turno y operador",
    V.entregas.map((e) => [e.cajaMovimientoId, e.clase, e.montoDeclarado, e.turnoId, e.operadorId]),
    [[k1.id, "CIERRE", 100000, k1.caja.turnoId, k1.caja.op.id], [k2.id, "CIERRE", 10000, k2.caja.turnoId, k2.caja.op.id]]);
  igual("autoría: la cuenta ERP que ejecutó; sin PIN, operador null", [V.verificadaPorUsuarioId, V.verificadaPorOperadorId], [A.usuario.id, null]);
  ok("trae la huella del contenido", /^[0-9a-f]{64}$/.test(V.huella ?? ""), V.huella);

  // ── IDEMPOTENCIA ─────────────────────────────────────────────────────────
  seccion("6. Idempotencia por local, con huella [17, 18, 19]");
  {
    const r = await verificar(A.todo, cuerpoCaso());
    igual("[17] el reintento idéntico devuelve la misma verificación, 200", [r.status, r.repetida, r.verificacion?.id], [200, true, V.id]);
    const r2 = await verificar(A.todo, cuerpoCaso({ cajaMovimientoIds: [k2.id, k1.id] }));
    igual("[19] las mismas entregas en otro orden: el mismo intento", [r2.status, r2.verificacion?.id, r2.verificacion?.huella], [200, V.id, V.huella]);
    const r3 = await verificar(A.todo, cuerpoCaso({ importeVerificado: 109000 }));
    rechazo("[18] misma clave, otro importe: 409", r3, 409, CODIGO_VERIFICACION.IDEMPOTENCIA_CONFLICTO);
    igual("[18] el conflicto nombra la verificación y las dos huellas", [r3.detalle?.verificacionId, r3.detalle?.huellaGuardada === V.huella, r3.detalle?.huellaPedida !== V.huella], [V.id, true, true]);
    rechazo("[18] misma clave, otras entregas: 409", await verificar(A.todo, cuerpoCaso({ cajaMovimientoIds: [k7.id] })), 409, CODIGO_VERIFICACION.IDEMPOTENCIA_CONFLICTO);
    rechazo("[18] misma clave, otra observación: 409", await verificar(A.todo, cuerpoCaso({ observacion: "otra" })), 409, CODIGO_VERIFICACION.IDEMPOTENCIA_CONFLICTO);
    igual("ninguno escribió otra verificación", await prisma.verificacionEfectivo.count({ where: { idempotencyKey: `${marca}-caso` } }), 1);
    const rOtro = await verificar(A.todo, { cajaMovimientoIds: [k7.id], importeVerificado: 4000, idempotencyKey: `${marca}-compartida` });
    igual("[6 del modelo] la clave que usó el depósito para B es libre en A", rOtro.status, 201);
    seccion("7. Una entrega, y el caso correcto [7, 8, 15]");
    igual("[7] una sola entrega se verifica", rOtro.verificacion?.entregas?.length, 1);
    const rC = await verificar(A.todo, { cajaMovimientoIds: [e3C, e3R], importeVerificado: "60000", idempotencyKey: clave() });
    igual("[8] RECAUDACION y CIERRE de una caja, juntas: 201", rC.status, 201);
    igual("[15] contó lo declarado: diferencia 0 y correcta", [rC.verificacion?.importeDeclarado, rC.verificacion?.importeVerificado, rC.verificacion?.diferencia, rC.verificacion?.correcta], [60000, 60000, 0, true]);
    igual("[8] las clases salen del vínculo", rC.verificacion?.entregas?.map((e) => e.clase), [e3R < e3C ? "RECAUDACION" : "CIERRE", e3R < e3C ? "CIERRE" : "RECAUDACION"]);
  }

  // ── EXCLUSIVIDAD ─────────────────────────────────────────────────────────
  seccion("8. Una entrega en una sola verificación vigente [20]");
  {
    const r = await verificar(A.todo, { cajaMovimientoIds: [k1.id], importeVerificado: 100000, idempotencyKey: clave() });
    rechazo("[20] la entrega de la caja 1 ya está verificada: 409", r, 409, CODIGO_VERIFICACION.ENTREGA_YA_VERIFICADA);
    igual("[20] y dice en cuál", r.detalle?.entregas, [{ cajaMovimientoId: k1.id, verificacionEfectivoId: V.id }]);
    igual("[20] sigue habiendo una sola vigente", await vigentesDe(k1.id), 1);
  }

  // ── LA LECTURA DESPUÉS ───────────────────────────────────────────────────
  seccion("9. La lectura después [33, 34, 38, 39]");
  {
    const l = await lectura(A.todo);
    const e1 = entregaEn(l, k1.id);
    const e2 = entregaEn(l, k2.id);
    igual("[33] las dos entregas quedan VERIFICADAS por la misma verificación",
      [e1?.estadoVerificacion, e2?.estadoVerificacion, e1?.verificacionId, e2?.verificacionId], ["VERIFICADA", "VERIFICADA", V.id, V.id]);
    igual("[33] y con su foto", [e1?.montoDeclaradoVerificado, e2?.montoDeclaradoVerificado], [100000, 10000]);
    const acto = l.tesoreria.verificaciones.find((v) => v.id === V.id);
    igual("[34] la diferencia es del acto: −2.000, una vez", [acto?.importeDeclarado, acto?.importeVerificado, acto?.diferencia], [110000, 108000, -2000]);
    igual("[34] ninguna entrega ni caja lleva una diferencia de Tesorería repartida",
      [Object.keys(e1).some((k) => /diferencia|verificado$/i.test(k) && k !== "montoDeclaradoVerificado"),
       l.tesoreria.cajas.some((c) => "diferenciaTesoreria" in c || "importeVerificado" in c)],
      [false, false]);
    const rv = l.tesoreria.resumen.verificacion;
    igual("lo verificado va aparte de lo declarado", rv.efectivoVerificado, 108000 + 4000 + 60000);
    igual("y lo pendiente también", rv.entregadoPendienteDeVerificar, l.tesoreria.resumen.efectivoDeclaradoEntregado - rv.entregadoCubiertoPorVerificaciones);
    igual("[38][39] verificar no cambia la base declarada", l.tesoreria.resumen.baseConocida, baseAntes);
    igual("[38] el pago de $2.000 desde la caja sigue informativo y la entrega es $10.000",
      [entregaEn(l, e8)?.montoDeclarado, l.tesoreria.pagosDesdeCaja.filter((p) => p.cajaMovimientoId === movPago.cajaMovimientoId).length],
      [10000, 1]);
  }
  {
    // [38] y [39] con la entrega del pago VERIFICADA, y un egreso exterior nuevo.
    const antesPago = (await lectura(A.todo)).tesoreria.resumen;
    const rP = await verificar(A.todo, { cajaMovimientoIds: [e8], importeVerificado: 10000, idempotencyKey: clave() });
    igual("la entrega de la caja que pagó se verifica por $10.000", [rP.status, rP.verificacion?.importeDeclarado], [201, 10000]);
    await prisma.$transaction((tx) => registrarPagoProveedor(tx, {
      cuentaId: cuenta.id, monto: 3000, medio: "TRANSFERENCIA",
      localOrigenId: A.local.id, localOperativoId: A.local.id, usuarioId: A.usuario.id, idempotencyKey: clave("p"),
    }));
    const despues = (await lectura(A.todo)).tesoreria.resumen;
    igual("[38] el pago desde caja no se resta: la base solo baja por el exterior", despues.baseConocida - antesPago.baseConocida, -3000);
    igual("[39] el egreso exterior suma una vez", despues.egresosExterioresConocidos - antesPago.egresosExterioresConocidos, 3000);
    igual("[38] los pagos desde caja no cambiaron", despues.pagosDesdeCajaInformativos, antesPago.pagosDesdeCajaInformativos);
  }

  // ── ANULACIÓN ────────────────────────────────────────────────────────────
  seccion("10. Anulación [22, 23, 24, 25]");
  rechazo("[23] sin motivo: 400", await anular(A.todo, V.id, {}), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("[23] motivo en blanco: 400", await anular(A.todo, V.id, { motivo: "   " }), 400, CODIGO_VERIFICACION.PEDIDO_INVALIDO);
  rechazo("una verificación que no existe: 404", await anular(A.todo, 2147483000, { motivo: "x" }), 404, CODIGO_VERIFICACION.VERIFICACION_NO_EXISTE);
  {
    const r = await anular(A.todo, V.id, { motivo: "Se contó el sobre de otra caja" });
    igual("[22] anula: 200", [r.status, r.yaEstabaAnulada], [200, false]);
    igual("[22] conserva lo verificado y suma la anulación",
      [r.verificacion?.estado, r.verificacion?.importeDeclarado, r.verificacion?.importeVerificado, r.verificacion?.diferencia, r.verificacion?.motivoAnulacion, r.verificacion?.anuladaPorUsuarioId, r.verificacion?.entregas?.length],
      ["ANULADA", 110000, 108000, -2000, "Se contó el sobre de otra caja", A.usuario.id, 2]);
    const r2 = await anular(A.todo, V.id, { motivo: "otro motivo" });
    igual("[24] anular otra vez: 200, ya estaba, sin pisar el motivo", [r2.status, r2.yaEstabaAnulada, r2.verificacion?.motivoAnulacion], [200, true, "Se contó el sobre de otra caja"]);
    const crudo = await prisma.$executeRaw`UPDATE "VerificacionEfectivo" SET "estado" = 'VIGENTE', "vigente" = true WHERE id = ${V.id}`.then(() => "aceptado", (e) => String(e.message));
    ok("[24] la base no deja volverla a VIGENTE", /no se edita/.test(crudo), crudo.slice(0, 160));
    const r3 = await verificar(A.todo, { cajaMovimientoIds: [k1.id, k2.id], importeVerificado: 110000, idempotencyKey: clave() });
    igual("[25] las mismas entregas se verifican de nuevo: 201, correcta", [r3.status, r3.verificacion?.correcta], [201, true]);
    const l = await lectura(A.todo);
    igual("[25] la lectura muestra la nueva", entregaEn(l, k1.id)?.verificacionId, r3.verificacion?.id);
    const r4 = await verificar(A.todo, cuerpoCaso());
    igual("la clave de la anulada sigue siendo suya: el reintento devuelve la ANULADA", [r4.status, r4.verificacion?.id, r4.verificacion?.estado], [200, V.id, "ANULADA"]);
  }

  // ── CORRECCIÓN HISTÓRICA ─────────────────────────────────────────────────
  seccion("11. La corrección no reescribe una entrega verificada [27, 28, 29, 30]");
  {
    const vx = await verificar(A.todo, { cajaMovimientoIds: [x1.id], importeVerificado: 8000000, idempotencyKey: clave() });
    requerir("se verifica el retiro de $8.000.000", vx.status === 201, `${vx.status} ${vx.error ?? ""}`);
    const ens = await ensayar(A.corrector, "NO-EXISTE");
    igual("(control) la ruta de ensayo contesta", ens.status, 404);
    const r = await ejecutarCorreccion(prisma, x1.manifiesto, { modo: "ensayo", usuarioId: A.usuario.id });
    igual("[28] el ensayo se rechaza con ENTREGA_VERIFICADA_EN_TESORERIA", [r.resultado, r.codigoRechazo], [RESULTADO.RECHAZADA, CODIGO_CORRECCION.ENTREGA_VERIFICADA_EN_TESORERIA]);
    igual("[28] nombra la verificación y el movimiento", r.verificacionesQueBloquean, [{ verificacionId: vx.verificacion.id, cajaMovimientoIds: [x1.id] }]);
    ok("[28] y dice que hay que anular primero", /debe anularse antes de corregir/.test(r.errores.join(" ")), r.errores.join(" "));
    // Para aplicar hace falta la huella del plan: se toma de un ensayo sin la verificación.
    // No se puede sacar el bloqueo sin anular, así que se pide aplicar con la huella de un
    // plan cualquiera: el candado de Tesorería frena antes de comparar huellas.
    const autorizado = { ...x1.manifiesto, estado: "AUTORIZADO", autorizacion: { hash: "0".repeat(64), autorizadoPorUsuarioId: A.usuario.id } };
    const ra = await ejecutarCorreccion(prisma, autorizado, { modo: "aplicar", usuarioId: A.usuario.id });
    igual("[28] aplicar también se rechaza por Tesorería, antes de la huella", ra.codigoRechazo, CODIGO_CORRECCION.ENTREGA_VERIFICADA_EN_TESORERIA);
    igual("[28] el movimiento sigue en $8.000.000", await montoDe(x1.id), 8000000);
    // [30] Admin, por la ruta, con el comodín: el mismo motor, el mismo candado.
    const { MANIFIESTOS } = await import("../../lib/caja/correcciones/manifiestos.js");
    MANIFIESTOS.push(autorizado);
    const rAdmin = await aplicarPorRuta(A.admin, autorizado.codigo);
    igual("[30] Admin por la ruta de aplicar: 409 ENTREGA_VERIFICADA_EN_TESORERIA", [rAdmin.status, rAdmin.codigoRechazo], [409, CODIGO_CORRECCION.ENTREGA_VERIFICADA_EN_TESORERIA]);
    MANIFIESTOS.pop();

    // [29] anular, ensayar, aplicar.
    const an = await anular(A.todo, vx.verificacion.id, { motivo: "Hay que corregir el ×1000" });
    igual("anulada para poder corregir", an.status, 200);
    const e2 = await ejecutarCorreccion(prisma, x1.manifiesto, { modo: "ensayo", usuarioId: A.usuario.id });
    igual("[29] con la verificación anulada, el ensayo pasa", [e2.resultado, e2.codigoRechazo ?? null], [RESULTADO.ENSAYO, null]);
    const ap = await ejecutarCorreccion(prisma, { ...x1.manifiesto, estado: "AUTORIZADO", autorizacion: { hash: e2.hash, autorizadoPorUsuarioId: A.usuario.id } }, { modo: "aplicar", usuarioId: A.usuario.id });
    igual("[29] y se aplica: el retiro queda en $8.000", [ap.resultado, await montoDe(x1.id)], [RESULTADO.APLICADA, 8000]);
    const foto = await prisma.verificacionEfectivoEntrega.findFirst({ where: { verificacionEfectivoId: vx.verificacion.id } });
    const vAnulada = await prisma.verificacionEfectivo.findUnique({ where: { id: vx.verificacion.id } });
    igual("[27] la anulada conserva su foto y sus importes de $8.000.000",
      [Number(foto.montoDeclaradoSnapshot), Number(vAnulada.importeDeclarado), vAnulada.estado], [8000000, 8000000, "ANULADA"]);
    const rv = await verificar(A.todo, { cajaMovimientoIds: [x1.id], importeVerificado: 8000, idempotencyKey: clave() });
    igual("y se vuelve a verificar con el importe corregido", [rv.status, rv.verificacion?.importeDeclarado, rv.verificacion?.correcta], [201, 8000, true]);
  }

  // ── DESACTUALIZADA ───────────────────────────────────────────────────────
  seccion("12. La fuente cambia por debajo [35, 36, 37]");
  {
    const v9 = await verificar(A.todo, { cajaMovimientoIds: [k9.id], importeVerificado: 2900, idempotencyKey: clave() });
    requerir("verifica $3.000 contando $2.900", v9.status === 201, `${v9.status} ${v9.error ?? ""}`);
    // Un cambio que NO pasó por ninguna regla: el caso que el aviso existe para atrapar.
    await prisma.cajaMovimiento.update({ where: { id: k9.id }, data: { monto: 2500 } });
    const l = await lectura(A.todo);
    const alerta = l.tesoreria.alertas.find((a) => a.codigo === ALERTA.VERIFICACION_DESACTUALIZADA && a.cajaMovimientoId === k9.id);
    igual("[35] VERIFICACION_DESACTUALIZADA, con la verificación y el motivo", [alerta?.verificacionId, alerta?.motivos], [v9.verificacion.id, [MOTIVO_DESACTUALIZADA.MONTO]]);
    const e9 = entregaEn(l, k9.id);
    igual("[35] la entrega lo dice: sigue verificada, pero desactualizada", [e9?.estadoVerificacion, e9?.desactualizada, e9?.montoDeclarado, e9?.montoDeclaradoVerificado], ["VERIFICADA", true, 2500, 3000]);
    const acto = l.tesoreria.verificaciones.find((v) => v.id === v9.verificacion.id);
    igual("[36] no recalcula la foto ni el declarado", [acto?.entregas?.[0]?.montoDeclarado, acto?.importeDeclarado], [3000, 3000]);
    igual("[37] no recalcula la diferencia, ni anula", [acto?.diferencia, acto?.estado, acto?.desactualizada], [-100, "VIGENTE", true]);
    const enBase = await prisma.verificacionEfectivo.findUnique({ where: { id: v9.verificacion.id } });
    igual("[36][37] y en la base tampoco cambió nada", [Number(enBase.importeDeclarado), Number(enBase.diferencia), enBase.estado], [3000, -100, "VIGENTE"]);
    igual("el resumen cuenta el acto desactualizado", l.tesoreria.resumen.verificacion.actosDesactualizados >= 1, true);
  }

  // ── GET SIN ESCRITURAS ───────────────────────────────────────────────────
  seccion("13. El GET no escribe [40]");
  {
    const contar = () => Promise.all([
      prisma.verificacionEfectivo.count(), prisma.verificacionEfectivoEntrega.count({ where: { vigente: true } }),
      prisma.auditoriaBitacora.count(), prisma.cajaMovimiento.count(),
    ]);
    const a = await contar();
    await lectura(A.todo);
    await lectura(A.todo);
    igual("[40] dos lecturas: ninguna fila nueva ni cambiada", await contar(), a);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAS CUATRO CARRERAS, FORZADAS
  // ══════════════════════════════════════════════════════════════════════════
  seccion("14. Carrera A: dos verificaciones de la misma entrega [21]");
  {
    const { resultados: [r1, r2], enEspera } = await enFila(k4.caja.turnoId, [
      () => verificar(A.todo, { cajaMovimientoIds: [k4.id], importeVerificado: 20000, idempotencyKey: clave("ra") }),
      () => verificar(A.todo, { cajaMovimientoIds: [k4.id], importeVerificado: 19000, idempotencyKey: clave("ra") }),
    ]);
    igual("las dos quedaron esperando el turno", enEspera, [1, 2]);
    igual("[21] la primera entra", r1.status, 201);
    rechazo("[21] la segunda ve la primera y se rechaza con su código", r2, 409, CODIGO_VERIFICACION.ENTREGA_YA_VERIFICADA);
    igual("[21] una sola vigente", await vigentesDe(k4.id), 1);
  }
  {
    // El mismo intento enviado dos veces a la vez: la segunda devuelve la primera.
    const cuerpo = { cajaMovimientoIds: [k6.id], importeVerificado: 7000, idempotencyKey: clave("rr") };
    const { resultados: [r1, r2] } = await enFila(k6.caja.turnoId, [() => verificar(A.todo, cuerpo), () => verificar(A.todo, cuerpo)]);
    igual("mismo intento simultáneo: 201 y 200 con la misma verificación", [r1.status, r2.status, r2.repetida, r1.verificacion?.id === r2.verificacion?.id], [201, 200, true, true]);
  }

  seccion("15. Carrera B: verificación contra corrección del mismo movimiento [31]");
  const consistente = async (id) => {
    const vig = await prisma.verificacionEfectivoEntrega.findMany({ where: { cajaMovimientoId: id, vigente: true } });
    const monto = await montoDe(id);
    return vig.every((e) => Number(e.montoDeclaradoSnapshot) === monto);
  };
  {
    // Orden 1: la verificación llega primero.
    const ensayo = await ejecutarCorreccion(prisma, x2.manifiesto, { modo: "ensayo", usuarioId: A.usuario.id });
    const autorizado = { ...x2.manifiesto, estado: "AUTORIZADO", autorizacion: { hash: ensayo.hash, autorizadoPorUsuarioId: A.usuario.id } };
    const { resultados: [rv, rc], enEspera } = await enFila(x2.caja.turnoId, [
      () => verificar(A.todo, { cajaMovimientoIds: [x2.id], importeVerificado: 8000000, idempotencyKey: clave("rb") }),
      () => ejecutarCorreccion(prisma, autorizado, { modo: "aplicar", usuarioId: A.usuario.id }),
    ]);
    igual("orden 1: las dos esperaron el turno", enEspera, [1, 2]);
    igual("[31] orden 1: la verificación entra con la foto de $8.000.000", [rv.status, rv.verificacion?.importeDeclarado], [201, 8000000]);
    igual("[31] orden 1: la corrección se rechaza por Tesorería", [rc.resultado, rc.codigoRechazo], [RESULTADO.RECHAZADA, CODIGO_CORRECCION.ENTREGA_VERIFICADA_EN_TESORERIA]);
    igual("[31] orden 1: el movimiento no cambió y la foto lo representa", [await montoDe(x2.id), await consistente(x2.id)], [8000000, true]);
  }
  {
    // Orden 2: la corrección llega primero.
    const ensayo = await ejecutarCorreccion(prisma, x3.manifiesto, { modo: "ensayo", usuarioId: A.usuario.id });
    const autorizado = { ...x3.manifiesto, estado: "AUTORIZADO", autorizacion: { hash: ensayo.hash, autorizadoPorUsuarioId: A.usuario.id } };
    const { resultados: [rc, rv], enEspera } = await enFila(x3.caja.turnoId, [
      () => ejecutarCorreccion(prisma, autorizado, { modo: "aplicar", usuarioId: A.usuario.id }),
      () => verificar(A.todo, { cajaMovimientoIds: [x3.id], importeVerificado: 8000, idempotencyKey: clave("rb") }),
    ]);
    igual("orden 2: las dos esperaron el turno", enEspera, [1, 2]);
    igual("[31] orden 2: la corrección se aplica", rc.resultado, RESULTADO.APLICADA);
    igual("[31] orden 2: la verificación fotografía el importe corregido", [rv.status, rv.verificacion?.importeDeclarado, rv.verificacion?.correcta], [201, 8000, true]);
    igual("[31] orden 2: foto y movimiento coinciden", [await montoDe(x3.id), await consistente(x3.id)], [8000, true]);
  }

  seccion("16. Carrera C: anulación contra nueva verificación");
  {
    const v5 = await verificar(A.todo, { cajaMovimientoIds: [k5.id], importeVerificado: 5000, idempotencyKey: clave() });
    requerir("verifica la caja 5", v5.status === 201, `${v5.status}`);
    // La nueva verificación llega primero: ve la vigente y se rechaza; la anulación pasa.
    const { resultados: [rv, ra] } = await enFila(k5.caja.turnoId, [
      () => verificar(A.todo, { cajaMovimientoIds: [k5.id], importeVerificado: 5000, idempotencyKey: clave("rc") }),
      () => anular(A.todo, v5.verificacion.id, { motivo: "carrera C" }),
    ]);
    rechazo("verificar primero: ve la vigente y se rechaza", rv, 409, CODIGO_VERIFICACION.ENTREGA_YA_VERIFICADA);
    igual("y la anulación pasa", [ra.status, ra.yaEstabaAnulada], [200, false]);
    igual("ninguna vigente: la entrega quedó libre", await vigentesDe(k5.id), 0);
    // Ahora otra, y la anulación llega primero: la nueva verificación ve la entrega libre.
    const v5b = await verificar(A.todo, { cajaMovimientoIds: [k5.id], importeVerificado: 5000, idempotencyKey: clave() });
    const { resultados: [ra2, rv2] } = await enFila(k5.caja.turnoId, [
      () => anular(A.todo, v5b.verificacion.id, { motivo: "carrera C, al revés" }),
      () => verificar(A.todo, { cajaMovimientoIds: [k5.id], importeVerificado: 4900, idempotencyKey: clave("rc") }),
    ]);
    igual("anular primero: pasa", ra2.status, 200);
    igual("y la nueva verificación entra después", rv2.status, 201);
    igual("una sola vigente, la nueva", [await vigentesDe(k5.id), (await prisma.verificacionEfectivoEntrega.findFirst({ where: { cajaMovimientoId: k5.id, vigente: true } }))?.verificacionEfectivoId], [1, rv2.verificacion?.id]);
  }

  seccion("17. Carrera D: dos anulaciones simultáneas [26]");
  {
    const v6 = await prisma.verificacionEfectivo.findFirst({ where: { entregas: { some: { cajaMovimientoId: k6.id } }, vigente: true } });
    const { resultados: [a1, a2] } = await enFila(k6.caja.turnoId, [
      () => anular(A.todo, v6.id, { motivo: "primera" }),
      () => anular(A.todo, v6.id, { motivo: "segunda" }),
    ]);
    igual("[26] las dos contestan 200", [a1.status, a2.status], [200, 200]);
    igual("[26] una anula y la otra encuentra lo hecho", [a1.yaEstabaAnulada, a2.yaEstabaAnulada], [false, true]);
    const final = await prisma.verificacionEfectivo.findUnique({ where: { id: v6.id } });
    igual("[26] queda la anulación de la primera, sin pisar", [final.estado, final.motivoAnulacion], ["ANULADA", "primera"]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EL CONTRATO QUE LEE LA PANTALLA MÓVIL (PR #138)
  // ══════════════════════════════════════════════════════════════════════════
  const lecturaCon = async (sesion, query) =>
    leer(await rutaTesoreria.GET(conCookie(`http://ci/api/finanzas/tesoreria?${query}`, `erpazul_sesion=${sesion}`, null, "GET")));

  seccion("18. Quién verificó, y cuántas cajas juntó el acto [#138: 15, 16, 26]");
  {
    const l = await lectura(A.todo);
    const acto = l.tesoreria.verificaciones.find((v) => v.id === entregaEn(l, k1.id)?.verificacionId);
    requerir("el acto de las cajas 1 y 2 está en la lectura", Boolean(acto));
    igual("verificó: id y nombre de la cuenta, nada más", acto.verificadaPor, { id: A.usuario.id, nombre: A.usuario.nombre });
    igual("sin PIN, el operador es null y no se completa con la cuenta", [acto.verificadaPorOperadorId, acto.verificadaPorOperador], [null, null]);
    igual("\"2 cajas incluidas\", con UNA diferencia del acto", [acto.cantidadDeCajas, typeof acto.diferencia], [2, "number"]);
    const texto = JSON.stringify(l);
    ok("ningún email ni hash de clave en la respuesta", !texto.includes(A.usuario.email) && !/passwordHash|"email"/.test(texto));
  }

  seccion("19. Las entregas se agrupan por caja con su identidad [#138: 17]");
  {
    const l = await lectura(A.todo);
    const e1 = entregaEn(l, k1.id);
    igual("identidad de la entrega: movimiento, turno, operador, clase, monto, instante y estado",
      [e1.cajaMovimientoId, e1.turnoId, e1.operadorId, e1.operadorNombre, e1.clase, e1.montoDeclarado, typeof e1.instante, e1.estadoVerificacion],
      [k1.id, k1.caja.turnoId, k1.caja.op.id, k1.caja.op.nombre, "CIERRE", 100000, "string", "VERIFICADA"]);
    igual("el rótulo sale del operador, no de un número de caja", e1.etiquetaCaja, `Caja de ${k1.caja.op.nombre}`);
    ok("cada entrega lleva el rótulo de SU caja", l.tesoreria.entregas.every((e) => e.etiquetaCaja === l.tesoreria.cajas.find((c) => c.turnoId === e.turnoId)?.etiqueta));
    ok("ningún rótulo inventa \"Caja 1\"", !/"Caja \d/.test(JSON.stringify(l)));
    const lB = await lectura(B.todo);
    const eB = lB.tesoreria.entregas.find((e) => e.cajaMovimientoId === kB2.id);
    igual("sin operador: rótulo neutro del turno, operador null", [eB?.etiquetaCaja, eB?.operadorId, eB?.operadorNombre], [`Caja del turno #${kB2.caja.turnoId}`, null, null]);
  }

  seccion("20. Lo parcial se deriva, no se guarda [#138: 18]");
  {
    const l = await lectura(A.todo);
    const rv = l.tesoreria.resumen.verificacion;
    const pendientes = l.tesoreria.entregas.filter((e) => e.estadoVerificacion === ESTADO_ENTREGA.PENDIENTE);
    igual("declarado = lo entregado del período", rv.entregadoDeclarado, l.tesoreria.resumen.efectivoDeclaradoEntregado);
    igual("declarado = cubierto + pendiente", Math.round((rv.entregadoCubiertoPorVerificaciones + rv.entregadoPendienteDeVerificar) * 100), Math.round(rv.entregadoDeclarado * 100));
    igual("los ids pendientes son exactamente los PENDIENTES", [...rv.entregasPendientesIds].sort((a, b) => a - b), pendientes.map((e) => e.cajaMovimientoId).sort((a, b) => a - b));
    igual("y su suma es \"Verificar lo pendiente · $X\"", Math.round(pendientes.reduce((s, e) => s + e.montoDeclarado, 0) * 100), Math.round(rv.entregadoPendienteDeVerificar * 100));
    ok("ninguna verificación guarda un estado PARCIAL", !(await prisma.verificacionEfectivo.findFirst({ where: { estado: { notIn: ["VIGENTE", "ANULADA"] } } })));
  }

  seccion("21. Un acto que cruza el período: entero, aparte, sin sumarse [#138: 19, 20]");
  {
    const kAyer = await cajaConCierre(A, 3000);
    const kHoy = await cajaConCierre(A, 2000);
    // Ninguna ruta crea una entrega con fecha pasada: se corre el reloj de una,
    // como el plazo en cierreCaja.mjs, ANTES de verificar —así la foto la toma
    // tal cual y nada queda desactualizado—. 24 h atrás es siempre el día
    // argentino anterior.
    await prisma.cajaMovimiento.update({ where: { id: kAyer.id }, data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    const hoy = await lectura(A.todo);
    const rX = await verificar(A.todo, { cajaMovimientoIds: [kAyer.id, kHoy.id], importeVerificado: 4900, idempotencyKey: clave("x") });
    requerir("verifica juntas la de ayer y la de hoy: 201", rX.status === 201, `${rX.status} ${rX.codigo ?? ""} ${rX.error ?? ""}`);
    const X = rX.verificacion;
    const dia = await lecturaCon(A.todo, "unidad=DIA");
    const enDia = dia.tesoreria.verificaciones.find((v) => v.id === X.id);
    igual("en el Día: el acto va ENTERO —5.000 / 4.900 / −100—, marcado incompleto",
      [enDia?.importeDeclarado, enDia?.importeVerificado, enDia?.diferencia, enDia?.completaEnElPeriodo, enDia?.entregasEnElPeriodo], [5000, 4900, -100, false, [kHoy.id]]);
    ok("y se nombra entre los que cruzan", dia.tesoreria.resumen.verificacion.actosQueCruzanIds.includes(X.id));
    igual("lo verificado del Día no suma ni un pedazo de él", dia.tesoreria.resumen.verificacion.efectivoVerificado, hoy.tesoreria.resumen.verificacion.efectivoVerificado);
    igual("la entrega de hoy sí figura cubierta", entregaEn(dia, kHoy.id)?.estadoVerificacion, "VERIFICADA");
    const ayer = await lecturaCon(A.todo, "unidad=DIA&desplazamiento=-1");
    ok("en el día anterior también cruza", ayer.tesoreria.resumen.verificacion.actosQueCruzanIds.includes(X.id));
    const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
    const fechaHoy = hoyArgentinaISO();
    const fechaAyer = ayer.periodo.rango.desde;
    const otro = await lecturaCon(A.todo, `unidad=OTRO&desde=${fechaAyer}&hasta=${fechaHoy}`);
    const enOtro = otro.tesoreria?.verificaciones.find((v) => v.id === X.id);
    igual("con «Otro» de ayer a hoy queda completo y deja de cruzar",
      [otro.status, enOtro?.completaEnElPeriodo, otro.tesoreria?.resumen.verificacion.actosQueCruzanIds.includes(X.id)], [200, true, false]);
    const rA = await anular(A.todo, X.id, { motivo: "prueba del contrato" });
    igual("la anulación nombra a quien anuló, sin datos de la cuenta", [rA.verificacion?.anuladaPor, rA.verificacion?.verificadaPor], [{ id: A.usuario.id, nombre: A.usuario.nombre }, { id: A.usuario.id, nombre: A.usuario.nombre }]);
  }

  seccion("22. Las capacidades salen de los permisos reales [#138: 16]");
  {
    const capacidades = async (sesion, query = "unidad=DIA") => {
      const r = await lecturaCon(sesion, query);
      return [r.status, r.puedeVerificarEfectivo, r.puedeAnularVerificacion];
    };
    igual("solo ver: no ofrece ni verificar ni anular", await capacidades(A.ver), [200, false, false]);
    igual("ver + verificar", await capacidades(firmar(A.usuario, A.local.id, [PERMISO_VER_TESORERIA, PERMISO_VERIFICAR_EFECTIVO])), [200, true, false]);
    igual("ver + anular", await capacidades(firmar(A.usuario, A.local.id, [PERMISO_VER_TESORERIA, PERMISO_ANULAR_VERIFICACION])), [200, false, true]);
    igual("el comodín \"*\"", await capacidades(firmar(A.usuario, A.local.id, ["*"])), [200, true, true]);
    igual("las capacidades no saltan el alcance: A con todo pidiendo B, 403", (await lecturaCon(A.todo, `destino=${B.local.id}`)).status, 403);
    igual("ni con «Otro»", (await lecturaCon(A.todo, `unidad=OTRO&desde=2026-01-01&hasta=2026-12-31&destino=${B.local.id}`)).status, 403);
    igual("el depósito sí, sobre un local de su grupo", await capacidades(D.todo, `destino=${B.local.id}`), [200, true, true]);
  }
}

try {
  await correr();
} catch (e) {
  fallas.push(`[${seccionActual}] excepción: ${e.message}`);
  if (!String(e.message).startsWith("requisito:")) console.error(e);
} finally {
  await prisma.$disconnect();
}

console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} en verde, ${fallas.length} en rojo`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
