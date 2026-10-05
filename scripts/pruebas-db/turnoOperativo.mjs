// EL TURNO OPERATIVO CONTRA POSTGRESQL — migración 20261004200000_turno_operativo.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/turnoOperativo.mjs
//
// Tesorería verifica el efectivo POR TURNO OPERATIVO: la caja elige su turno al
// abrirse, Tesorería agrupa por (local, fecha operativa, turno) de la caja, y
// una verificación es de UN turno. Lo que depende de la base —FK compuestas,
// CHECK, triggers, transacciones— se prueba acá, contra PostgreSQL y por las
// rutas reales; lo puro está en lib/tesoreria/lecturaTesoreria.test.mjs.
//
//   A. El catálogo es de cada local                                   [TO-12]
//   B. Abrir caja: turno de otro local, inactivo, sin turno           [TO-4, TO-5]
//   C. Las tres rutas de apertura guardan turno y fecha               [TO-11]
//   D. La base sostiene la caja: CHECK, FK compuesta, inmutable       [TO-4, TO-8]
//   E. Tesorería agrupa por el turno de la caja                       [TO-1, TO-2, TO-8]
//   F. No se verifican juntos dos turnos ni dos fechas                [TO-6, TO-7]
//   G. La verificación congela su turno; la base lo exige y lo cuida  [TO-6, TO-9]
//   H. La ventana de reconocimiento: propone, pregunta, y la fecha
//      operativa sale del turno FINAL                                 [TO-H]
//   I. El ciclo: actual y siguiente, nada más                         [TO-C]
//   T. La transición por local: legado hasta el primer turno          [TO-T]
//
// No desmonta: una verificación no se borra —la base lo impide— y sus cajas
// tampoco. Todo lleva una marca única por corrida.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { DENOMINACIONES } = await import("../../lib/caja/conteoBilletes.js");
const { hoyArgentinaISO, momentoArgentina } = await import("../../lib/fechas/rangoArgentina.js");
const { cicloDeTurnos, horaDeMinutos, sumarDias } = await import("../../lib/caja/turnoOperativo.js");
const { reconocimientoDeApertura, turnoOperativoDeApertura } = await import("../../lib/caja/turnoOperativoServer.js");
const { leerTesoreria, rangoDeTesoreria } = await import("../../lib/tesoreria/lecturaTesoreriaServer.js");
const { CRITERIO_SIN_TURNO, CRITERIO_TURNO_OPERATIVO } = await import("../../lib/tesoreria/turnoComercial.js");
const { PERMISO_VER_TESORERIA, PERMISO_VERIFICAR_EFECTIVO, PERMISO_ANULAR_VERIFICACION } = await import("../../lib/tesoreria/permisos.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaAbrirSinCambio = await import("../../app/api/pos-ventas/turnos/abrir-sin-cambio/route.js");
const rutaAbrirConCambio = await import("../../app/api/pos-ventas/turnos/abrir-con-cambio/route.js");
const rutaReservar = await import("../../app/api/pos-ventas/cambios-pendientes/reservar/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaCierreIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaCierreConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
const rutaVerificar = await import("../../app/api/finanzas/tesoreria/verificaciones/route.js");
const rutaCatalogo = await import("../../app/api/config/turnos-operativos/route.js");
const rutaTurnoDelCatalogo = await import("../../app/api/config/turnos-operativos/[id]/route.js");
const rutaCorregir = await import("../../app/api/pos-ventas/turnos/[id]/turno-operativo/route.js");
const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");

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
async function intento(fn) {
  try {
    return { ok: true, valor: await fn() };
  } catch (e) {
    return { ok: false, codigo: e?.code ?? null, mensaje: `${e?.message ?? e} ${JSON.stringify(e?.meta ?? {})}` };
  }
}
/** Rechazado, y por la defensa que se nombra: un rechazo por otra causa no prueba nada. */
const rechazado = (t, r, patron) =>
  ok(t, !r.ok && patron.test(`${r.codigo} ${r.mensaje}`), r.ok ? "se aceptó" : `otro motivo: ${r.codigo} ${r.mensaje.slice(0, 240)}`);

const SECRETO = process.env.AUTH_SECRET;
const BASE = "http://ci/api/pos-ventas";
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
function conCookie(url, cookie, cuerpo, metodo = "POST") {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const req = new Request(url, { method: metodo, headers, body: metodo === "GET" ? undefined : JSON.stringify(cuerpo ?? {}) });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}
const pedido = (url, quien, cuerpo, metodo = "POST") =>
  conCookie(url, [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; "), cuerpo, metodo);
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });
const conId = (id) => ({ params: Promise.resolve({ id: String(id) }) });
const firmar = (usuario, localId, permisos) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos }, SECRETO, { expiresIn: "1h" });

function desgloseDe(monto) {
  const d = {};
  let resto = monto;
  for (const { valor } of DENOMINACIONES) {
    const k = Math.floor(resto / valor);
    if (k > 0) { d[valor] = k; resto -= k * valor; }
  }
  if (resto !== 0) throw new Error(`desgloseDe: ${monto} no es múltiplo de 100`);
  return d;
}

const marca = `ci-turno-op-${Date.now()}`;
let n = 0;
const clave = () => `${marca}-${(n += 1)}`;
const HOY = hoyArgentinaISO();
const AYER = new Date(new Date(`${HOY}T12:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const comoFecha = (iso) => new Date(`${iso}T00:00:00.000Z`);
const isoDe = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Un local con operario obligatorio, su cuenta, su producto y sus sesiones. */
async function montarLocal(nombre) {
  const permisos = ["pos.usar"];
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-${nombre}-rol`, permisos } });
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-${nombre}-grupo` } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-${nombre}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });
  const cuenta = await prisma.usuario.create({
    data: { nombre: `${marca}-${nombre}-cuenta`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-${nombre}-producto`, precioVenta: 1000, precioCosto: 600, stock: 100000,
  });
  return {
    local, cuenta, producto,
    sesion: firmar(cuenta, local.id, permisos),
    config: firmar(cuenta, local.id, ["config_local.pos"]),
    tesoreria: firmar(cuenta, local.id, [PERMISO_VER_TESORERIA, PERMISO_VERIFICAR_EFECTIVO, PERMISO_ANULAR_VERIFICACION]),
  };
}
async function operador(L) {
  const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
  await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: L.local.id } });
  return { op, quien: { sesion: L.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: L.local.id }) } };
}
/** Abre por la ruta clásica con el cuerpo dado. Devuelve la respuesta. */
async function abrirCon(L, cuerpo) {
  const { op, quien } = await operador(L);
  const r = await leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000, ...cuerpo })));
  return { r, op, quien, L };
}
/** Una caja abierta por la ruta con este turno. */
async function cajaPorRuta(L, turnoOperativoId) {
  const c = await abrirCon(L, { turnoOperativoId });
  requerir("abre la caja por la ruta", c.r.ok === true, `${c.r.status} ${c.r.error ?? ""}`);
  return { ...c, turnoId: c.r.turno.id };
}
/**
 * Una caja escrita directo en la base: la de AYER —ninguna ruta abre con otra
 * fecha— o una VIEJA, sin turno, como las anteriores a la migración. Se vende
 * y se cierra por las rutas reales.
 */
async function cajaEnLaBase(L, { turnoOperativoId = null, fechaOperativa = null } = {}) {
  const { op, quien } = await operador(L);
  const t = await prisma.turno.create({
    data: { localId: L.local.id, vendedorId: L.cuenta.id, operadorId: op.id, montoInicial: 1000, turnoOperativoId, fechaOperativa },
  });
  return { op, quien, L, turnoId: t.id };
}
async function vender(caja, monto) {
  const r = await leer(await rutaCrear.POST(pedido(`${BASE}/crear`, caja.quien, {
    clientTxnId: clave(), localId: caja.L.local.id, clienteId: null, turnoId: caja.turnoId, formaPago: "EFECTIVO",
    esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
    items: [itemCrearPayload({ productoBaseId: caja.L.producto.baseId, nombre: "P", precio: 1000, cantidad: monto / 1000, precioCosto: 600 })],
  })));
  requerir(`vende $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
}
async function cerrar(caja, cambio, retiro) {
  const ini = await leer(await rutaCierreIniciar.POST(pedido(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
  requerir("inicia el cierre", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
  const fin = await leer(await rutaCierreConfirmar.POST(
    pedido(`${BASE}/cierres/${ini.cierre.token}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(retiro) }),
    conToken(ini.cierre.token)
  ));
  requerir("confirma el cierre", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
  return prisma.cierrePreparacion.findFirst({ where: { token: ini.cierre.token } });
}
/** Un retiro de recaudación con la caja abierta, por las rutas reales. */
async function retirar(caja, cambio, contado) {
  const ini = await leer(await rutaRetiroIniciar.POST(pedido(`${BASE}/retiros/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
  requerir("inicia el retiro", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
  const tok = ini.retiro?.token ?? ini.preparacion?.token ?? ini.token;
  const fin = await leer(await rutaRetiroConfirmar.POST(pedido(`${BASE}/retiros/${tok}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(tok)));
  requerir("confirma el retiro", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
}
/** Vende, cierra y devuelve el id del movimiento de la entrega de cierre. */
async function entregaDeCierre(caja, monto) {
  await vender(caja, monto);
  await cerrar(caja, 1000, monto);
  const t = await prisma.turno.findUnique({ where: { id: caja.turnoId }, select: { retiroCierreMovimientoId: true } });
  return t.retiroCierreMovimientoId;
}
const verificar = async (L, cuerpo) =>
  leer(await rutaVerificar.POST(conCookie("http://ci/api/finanzas/tesoreria/verificaciones", `erpazul_sesion=${L.tesoreria}`, cuerpo)));
async function lecturaDel(L, desplazamiento = 0) {
  const rango = await rangoDeTesoreria(prisma, { localId: L.local.id, unidad: "DIA", desplazamiento });
  return leerTesoreria(prisma, { localId: L.local.id, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin });
}
const turnoDeCaja = (id) => prisma.turno.findUnique({ where: { id }, select: { turnoOperativoId: true, fechaOperativa: true } });

async function correr() {
  const A = await montarLocal("A");
  const B = await montarLocal("B");
  // Las secciones A a G no prueban el ciclo: sus dos turnos empiezan los dos a
  // las 00:00, así que los dos son siempre la ocurrencia actual —se extiende
  // hasta su próximo comienzo—, con la fecha de hoy, a cualquier hora.
  const todoElDia = { horaInicioReconocimiento: "00:00", horaFinReconocimiento: "01:00" };
  const [mañana, tarde, vieja] = await Promise.all([
    prisma.turnoOperativo.create({ data: { localId: A.local.id, nombre: "Mañana", orden: 0, ...todoElDia } }),
    prisma.turnoOperativo.create({ data: { localId: A.local.id, nombre: "Tarde", orden: 1, ...todoElDia } }),
    prisma.turnoOperativo.create({ data: { localId: A.local.id, nombre: "Noche vieja", orden: 2, activo: false } }),
  ]);
  const mañanaB = await prisma.turnoOperativo.create({ data: { localId: B.local.id, nombre: "Mañana", orden: 0, ...todoElDia } });

  seccion("A. El catálogo es de cada local [TO-12]");
  {
    const catalogo = async (sesion, query = "") =>
      leer(await rutaCatalogo.GET(conCookie(`http://ci/api/config/turnos-operativos${query}`, `erpazul_sesion=${sesion}`, null, "GET")));
    const deA = await catalogo(A.sesion);
    igual("A ve los suyos, en su orden, y ninguno de B", deA.turnos?.map((t) => t.nombre), ["Mañana", "Tarde", "Noche vieja"]);
    ok("ningún id de B en el catálogo de A", !deA.turnos?.some((t) => t.id === mañanaB.id));
    igual("con ?activos=1, solo los que se ofrecen para abrir", (await catalogo(A.sesion, "?activos=1")).turnos?.map((t) => t.nombre), ["Mañana", "Tarde"]);
    igual("B ve solo el suyo", (await catalogo(B.sesion)).turnos?.map((t) => t.id), [mañanaB.id]);
    igual("con la ventana desde las 00:00, la fecha operativa que ofrece cada turno es la de hoy",
      (await catalogo(A.sesion, "?activos=1")).turnos?.map((t) => t.fechaOperativa), [HOY, HOY]);
    const ajeno = await leer(await rutaTurnoDelCatalogo.PATCH(
      conCookie(`http://ci/api/config/turnos-operativos/${mañanaB.id}`, `erpazul_sesion=${A.config}`, { activo: false }, "PATCH"), conId(mañanaB.id)));
    igual("A no puede tocar el turno de B: 404, como si no existiera", ajeno.status, 404);
    igual("y el de B sigue activo", (await prisma.turnoOperativo.findUnique({ where: { id: mañanaB.id } })).activo, true);
    const reordenAjeno = await leer(await rutaCatalogo.PUT(
      conCookie("http://ci/api/config/turnos-operativos", `erpazul_sesion=${A.config}`, { orden: [mañanaB.id] }, "PUT")));
    igual("ni reordenarlo", reordenAjeno.status, 400);
    const repetido = await leer(await rutaCatalogo.POST(conCookie("http://ci/api/config/turnos-operativos", `erpazul_sesion=${A.config}`, { nombre: "  Mañana ", ...todoElDia })));
    igual("un nombre repetido en el mismo local: 409", repetido.status, 409);
    const sinPermiso = await leer(await rutaCatalogo.POST(conCookie("http://ci/api/config/turnos-operativos", `erpazul_sesion=${A.sesion}`, { nombre: "Siesta", ...todoElDia })));
    igual("dar de alta pide config_local.pos", sinPermiso.status, 403);
  }

  seccion("B. Abrir caja exige un turno activo de ESTE local [TO-4, TO-5]");
  {
    const antes = await prisma.turno.count({ where: { localId: A.local.id } });
    const deB = await abrirCon(A, { turnoOperativoId: mañanaB.id });
    igual("con un turno de otro local: 400 y su código", [deB.r.status, deB.r.codigo], [400, "TURNO_OPERATIVO_DE_OTRO_LOCAL"]);
    const inactivo = await abrirCon(A, { turnoOperativoId: vieja.id });
    igual("con un turno inactivo: 400 y su código", [inactivo.r.status, inactivo.r.codigo], [400, "TURNO_OPERATIVO_INACTIVO"]);
    const sin = await abrirCon(A, {});
    igual("sin turno: 400, pide elegirlo", [sin.r.status, sin.r.codigo], [400, "TURNO_OPERATIVO_REQUERIDO"]);
    igual("ninguno de los rechazos abrió una caja", await prisma.turno.count({ where: { localId: A.local.id } }), antes);
    // Un local que nunca tuvo turnos sigue en modo legado: ver la sección T.
  }

  seccion("C. Las tres rutas de apertura guardan turno y fecha operativa [TO-11]");
  {
    const clasica = await cajaPorRuta(A, mañana.id);
    igual("abrir: turno y fecha de hoy", [(await turnoDeCaja(clasica.turnoId)).turnoOperativoId, isoDe((await turnoDeCaja(clasica.turnoId)).fechaOperativa)], [mañana.id, HOY]);
    // La fecha la decide el servidor: una que mande el cliente se ignora.
    const conFechaAjena = await abrirCon(A, { turnoOperativoId: mañana.id, fechaOperativa: AYER });
    requerir("con una fecha de ayer en el pedido igual abre", conFechaAjena.r.ok === true, `${conFechaAjena.r.status} ${conFechaAjena.r.error ?? ""}`);
    igual("y guarda la que calculó el servidor, no la del cliente", isoDe((await turnoDeCaja(conFechaAjena.r.turno.id)).fechaOperativa), HOY);

    const { quien: qSin } = await operador(A);
    const rSin = await leer(await rutaAbrirSinCambio.POST(pedido(`${BASE}/turnos/abrir-sin-cambio`, qSin, {
      desgloseContado: desgloseDe(2000), motivo: "fondo propio", turnoOperativoId: tarde.id, fechaOperativa: HOY,
    })));
    requerir("abrir-sin-cambio abre", rSin.ok === true, `${rSin.status} ${rSin.error ?? ""}`);
    const tSin = await turnoDeCaja(rSin.turno.id);
    igual("abrir-sin-cambio: turno y fecha de hoy", [tSin.turnoOperativoId, isoDe(tSin.fechaOperativa)], [tarde.id, HOY]);

    // Un sobre de verdad: una caja que cierra dejando cambio.
    const deja = await cajaPorRuta(A, mañana.id);
    await vender(deja, 5000);
    const corte = await cerrar(deja, 3000, 5000);
    const sobre = await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: corte.id } });
    requerir("el cierre dejó un sobre", Boolean(sobre), "sin sobre");
    const { quien: qCon } = await operador(A);
    const reserva = await leer(await rutaReservar.POST(pedido(`${BASE}/cambios-pendientes/reservar`, qCon, { cambioPendienteId: sobre.id })));
    requerir("reserva el sobre", reserva.ok === true, `${reserva.status} ${reserva.error ?? ""}`);
    const conTurnoAjeno = await leer(await rutaAbrirConCambio.POST(pedido(`${BASE}/turnos/abrir-con-cambio`, qCon, {
      cambioPendienteId: sobre.id, desgloseRecibido: desgloseDe(3000), turnoOperativoId: mañanaB.id,
    })));
    igual("abrir-con-cambio con un turno de otro local: 400", [conTurnoAjeno.status, conTurnoAjeno.codigo], [400, "TURNO_OPERATIVO_DE_OTRO_LOCAL"]);
    igual("y el sobre no se consumió", (await prisma.cambioPendiente.findUnique({ where: { id: sobre.id } })).turnoDestinoId, null);
    const rCon = await leer(await rutaAbrirConCambio.POST(pedido(`${BASE}/turnos/abrir-con-cambio`, qCon, {
      cambioPendienteId: sobre.id, desgloseRecibido: desgloseDe(3000), turnoOperativoId: tarde.id, fechaOperativa: HOY,
    })));
    requerir("abrir-con-cambio abre", rCon.ok === true, `${rCon.status} ${rCon.error ?? ""}`);
    const tCon = await turnoDeCaja(rCon.turno.id);
    igual("abrir-con-cambio: turno y fecha de hoy", [tCon.turnoOperativoId, isoDe(tCon.fechaOperativa)], [tarde.id, HOY]);
  }

  seccion("D. La base sostiene la caja: CHECK, FK compuesta e inmutable [TO-4, TO-8]");
  {
    const { op } = await operador(A);
    rechazado("turno sin fecha: el CHECK lo frena",
      await intento(() => prisma.turno.create({ data: { localId: A.local.id, vendedorId: A.cuenta.id, operadorId: op.id, montoInicial: 0, turnoOperativoId: mañana.id } })),
      /Turno_turno_operativo_completo_chk/);
    rechazado("una caja de A con el turno de B: la FK compuesta la frena",
      await intento(() => prisma.turno.create({ data: { localId: A.local.id, vendedorId: A.cuenta.id, operadorId: op.id, montoInicial: 0, turnoOperativoId: mañanaB.id, fechaOperativa: comoFecha(HOY) } })),
      /Turno_turnoOperativoId_localId_fkey|P2003/);
    // [TO-4] El turno de una caja es inmutable, con UNA excepción desde
    // 20261005100000: corregirlo de un turno a otro con la caja abierta y sin
    // efectivo en una verificación vigente. La última parte, en la sección J.
    const conTurno = await cajaPorRuta(A, mañana.id);
    const corregida = await intento(() => prisma.turno.update({ where: { id: conTurno.turnoId }, data: { turnoOperativoId: tarde.id } }));
    ok("[TO-4] una caja ABIERTA con turno: la base acepta corregirlo de un turno a otro", corregida.ok, corregida.mensaje);
    await prisma.turno.update({ where: { id: conTurno.turnoId }, data: { turnoOperativoId: mañana.id } });
    rechazado("[TO-4] una caja con turno no lo pierde",
      await intento(() => prisma.turno.update({ where: { id: conTurno.turnoId }, data: { turnoOperativoId: null, fechaOperativa: null } })),
      /una con turno no lo pierde/);
    const vieja1 = await cajaEnLaBase(A);
    rechazado("[TO-4] una caja vieja no recibe turno después: no hay backfill posible",
      await intento(() => prisma.turno.update({ where: { id: vieja1.turnoId }, data: { turnoOperativoId: mañana.id, fechaOperativa: comoFecha(HOY) } })),
      /una caja sin turno no recibe uno/);
    for (const [estado, marcaDeEstado] of [
      ["cerrada", { cierre: new Date() }],
      ["en cierre", { cierreEnPreparacionEn: new Date() }],
      ["anulada", { anuladoEn: new Date() }],
    ]) {
      const c = await cajaEnLaBase(A, { turnoOperativoId: mañana.id, fechaOperativa: comoFecha(HOY) });
      await prisma.turno.update({ where: { id: c.turnoId }, data: marcaDeEstado });
      rechazado(`[TO-4] una caja ${estado} no cambia su turno`,
        await intento(() => prisma.turno.update({ where: { id: c.turnoId }, data: { turnoOperativoId: tarde.id } })),
        /solo se corrige con la caja abierta/);
    }
    const vivo = await intento(() => prisma.turno.update({ where: { id: conTurno.turnoId }, data: { observaciones: "una escritura de siempre" } }));
    ok("las escrituras de siempre sobre la caja no se frenan", vivo.ok, vivo.mensaje);
  }

  // Los datos de E, F y G: Mañana (dos cajas), Tarde (una), Mañana de AYER
  // (cerrada hoy) y una caja vieja sin turno.
  const m1 = await cajaPorRuta(A, mañana.id);
  const m2 = await cajaPorRuta(A, mañana.id);
  const t1 = await cajaPorRuta(A, tarde.id);
  const ay = await cajaEnLaBase(A, { turnoOperativoId: mañana.id, fechaOperativa: comoFecha(AYER) });
  const vj = await cajaEnLaBase(A);
  const eM1 = await entregaDeCierre(m1, 5000);
  const eM2 = await entregaDeCierre(m2, 3000);
  const eT1 = await entregaDeCierre(t1, 4000);
  const eAy = await entregaDeCierre(ay, 2000);
  const eVj = await entregaDeCierre(vj, 6000);

  seccion("E. Tesorería agrupa por el turno de la caja [TO-1, TO-2, TO-8]");
  {
    const hoy = await lecturaDel(A);
    const grupoDe = (id) => hoy.entregas.find((e) => e.cajaMovimientoId === id)?.grupo;
    const g = (clave) => hoy.grupos.find((x) => x.clave === clave);
    igual("Mañana y Tarde del mismo día: grupos distintos", grupoDe(eM1) !== grupoDe(eT1), true);
    igual("las dos cajas de Mañana: el mismo grupo", grupoDe(eM1), grupoDe(eM2));
    const gM = g(grupoDe(eM1));
    ok("el grupo de Mañana tiene sus dos cajas", gM && [m1.turnoId, m2.turnoId].every((id) => gM.cajas.some((c) => c.turnoId === id)), JSON.stringify(gM?.cajas?.map((c) => c.turnoId)));
    igual("y se llama por el turno, con su criterio", [gM?.etiqueta, gM?.criterio, gM?.fechaOperativa], ["Mañana", CRITERIO_TURNO_OPERATIVO, HOY]);
    const gV = g(grupoDe(eVj));
    igual("la caja vieja va a «Sin turno asignado», aparte", [gV?.etiqueta, gV?.criterio, gV?.sinTurno], ["Sin turno asignado", CRITERIO_SIN_TURNO, true]);
    igual("y no recibe un turno inventado", hoy.cajas.find((c) => c.turnoId === vj.turnoId)?.turnoOperativo, null);
    ok("la caja de Mañana de AYER no entra en hoy aunque cerró hoy", !hoy.entregas.some((e) => e.cajaMovimientoId === eAy));
    const ayer = await lecturaDel(A, -1);
    const enAyer = ayer.entregas.find((e) => e.cajaMovimientoId === eAy);
    igual("entra ENTERA en ayer, en su Mañana", [Boolean(enAyer), ayer.grupos.find((x) => x.clave === enAyer?.grupo)?.etiqueta], [true, "Mañana"]);
  }

  seccion("F. No se verifican juntos dos turnos ni dos fechas [TO-6, TO-7]");
  {
    const antes = await prisma.verificacionEfectivo.count({ where: { localId: A.local.id } });
    const mezcla = await verificar(A, { cajaMovimientoIds: [eM1, eT1], importeVerificado: 9000, idempotencyKey: clave() });
    igual("Mañana + Tarde: 400 TURNOS_OPERATIVOS_MEZCLADOS", [mezcla.status, mezcla.codigo], [400, "TURNOS_OPERATIVOS_MEZCLADOS"]);
    const dosFechas = await verificar(A, { cajaMovimientoIds: [eM1, eAy], importeVerificado: 7000, idempotencyKey: clave() });
    igual("Mañana de hoy + Mañana de ayer: 400 FECHAS_OPERATIVAS_MEZCLADAS", [dosFechas.status, dosFechas.codigo], [400, "FECHAS_OPERATIVAS_MEZCLADAS"]);
    const conVieja = await verificar(A, { cajaMovimientoIds: [eM1, eVj], importeVerificado: 11000, idempotencyKey: clave() });
    igual("Mañana + una caja sin turno: también se rechaza", [conVieja.status, conVieja.codigo], [400, "TURNOS_OPERATIVOS_MEZCLADOS"]);
    igual("ningún rechazo escribió nada", await prisma.verificacionEfectivo.count({ where: { localId: A.local.id } }), antes);
  }

  seccion("G. La verificación congela su turno; la base lo exige y lo cuida [TO-6, TO-9]");
  {
    const turnoM = await verificar(A, { cajaMovimientoIds: [eM1, eM2], importeVerificado: 8000, idempotencyKey: clave() });
    requerir("las dos cajas de Mañana se verifican juntas: 201", turnoM.status === 201, `${turnoM.status} ${turnoM.codigo ?? ""} ${turnoM.error ?? ""}`);
    igual("la verificación congela Mañana y la fecha de hoy", [turnoM.verificacion.turnoOperativo, turnoM.verificacion.fechaOperativa], [{ id: mañana.id, nombre: "Mañana" }, HOY]);
    const fila = await prisma.verificacionEfectivo.findUnique({ where: { id: turnoM.verificacion.id } });
    igual("y así quedó en la base", [fila.turnoOperativoId, isoDe(fila.fechaOperativa)], [mañana.id, HOY]);

    const vieja = await verificar(A, { cajaMovimientoIds: [eVj], importeVerificado: 5900, idempotencyKey: clave() });
    requerir("una caja sin turno se sigue pudiendo verificar sola: 201", vieja.status === 201, `${vieja.status} ${vieja.codigo ?? ""}`);
    igual("sin turno: NULL, no se le asigna uno", [vieja.verificacion.turnoOperativo, vieja.verificacion.fechaOperativa], [null, null]);
    const hoy = await lecturaDel(A);
    const leida = hoy.verificaciones.find((v) => v.id === vieja.verificacion.id);
    igual("se sigue leyendo, con sus importes del acto, sin recalcular", [leida?.importeDeclarado, leida?.importeVerificado, leida?.diferencia, leida?.turnoOperativo], [6000, 5900, -100, null]);

    // La base, aunque la aplicación se equivoque: una entrega de Tarde en una
    // verificación de Mañana.
    const foto = await prisma.cajaMovimiento.findUnique({ where: { id: eT1 }, include: { turno: true } });
    const torcida = await intento(() => prisma.$transaction(async (tx) => {
      const v = await tx.verificacionEfectivo.create({ data: {
        localId: A.local.id, importeDeclarado: foto.monto, importeVerificado: foto.monto, diferencia: 0,
        verificadaPorUsuarioId: A.cuenta.id, idempotencyKey: clave(), turnoOperativoId: mañana.id, fechaOperativa: comoFecha(HOY),
      } });
      await tx.verificacionEfectivoEntrega.create({ data: {
        verificacionEfectivoId: v.id, cajaMovimientoId: eT1, montoDeclaradoSnapshot: foto.monto, localIdSnapshot: A.local.id,
        turnoIdSnapshot: foto.turnoId, operadorIdSnapshot: foto.turno.operadorId, claseSnapshot: "CIERRE", instanteEntregaSnapshot: foto.createdAt,
      } });
    }));
    rechazado("la base no acepta una entrega de Tarde en una verificación de Mañana", torcida, /otro turno operativo/);
    rechazado("la verificación no apunta a un turno de otro local",
      await intento(() => prisma.verificacionEfectivo.create({ data: {
        localId: A.local.id, importeDeclarado: 1, importeVerificado: 1, diferencia: 0, verificadaPorUsuarioId: A.cuenta.id,
        idempotencyKey: clave(), turnoOperativoId: mañanaB.id, fechaOperativa: comoFecha(HOY),
      } })),
      /VerificacionEfectivo_turnoOperativoId_localId_fkey|P2003/);
    rechazado("anular no cambia el turno que se verificó",
      await intento(() => prisma.verificacionEfectivo.update({ where: { id: turnoM.verificacion.id }, data: {
        estado: "ANULADA", vigente: false, anuladaEn: new Date(), anuladaPorUsuarioId: A.cuenta.id, motivoAnulacion: "prueba", turnoOperativoId: tarde.id,
      } })),
      /no cambia lo que se verificó/);
  }

  seccion("H. La ventana: propone o pregunta; la fecha sale del turno FINAL [TO-H]");
  {
    const H = await montarLocal("H");
    const urlCatalogo = "http://ci/api/config/turnos-operativos";
    const alta = async (nombre, desde, hasta) =>
      leer(await rutaCatalogo.POST(conCookie(urlCatalogo, `erpazul_sesion=${H.config}`, { nombre, horaInicioReconocimiento: desde, horaFinReconocimiento: hasta })));
    const cambiar = async (id, cuerpo) =>
      leer(await rutaTurnoDelCatalogo.PATCH(conCookie(`${urlCatalogo}/${id}`, `erpazul_sesion=${H.config}`, cuerpo, "PATCH"), conId(id)));
    const oferta = async (L) => leer(await rutaCatalogo.GET(conCookie(`${urlCatalogo}?activos=1`, `erpazul_sesion=${L.sesion}`, null, "GET")));
    // Ventanas armadas alrededor de la hora del servidor, con horas de margen:
    // la prueba no depende de a qué hora corre.
    const base = momentoArgentina().minuto;
    const h = (delta) => horaDeMinutos((((base + delta) % 1440) + 1440) % 1440);

    const uno = await alta("Uno", h(-60), h(60));
    const dos = await alta("Dos", h(180), h(240));
    requerir("se dan de alta con su ventana", uno.ok === true && dos.ok === true, `${uno.error ?? ""} ${dos.error ?? ""}`);
    igual("la ventana se guarda tal cual", [uno.turno.horaInicioReconocimiento, uno.turno.horaFinReconocimiento], [h(-60), h(60)]);

    let o = await oferta(H);
    igual("[TO-H1] una coincidencia: el servidor propone ese turno", [o.reconocimiento?.estado, o.reconocimiento?.sugeridoId], ["UNICO", uno.turno.id]);

    // Dos está fuera de su ventana, pero es el que sigue en el ciclo.
    const cambiado = await abrirCon(H, { turnoOperativoId: dos.turno.id });
    requerir("abre con el turno siguiente del ciclo, fuera de su ventana", cambiado.r.ok === true, `${cambiado.r.status} ${cambiado.r.error ?? ""}`);
    igual("[TO-H4] la caja guarda el turno FINAL que eligió la persona, no el propuesto",
      (await turnoDeCaja(cambiado.r.turno.id)).turnoOperativoId, dos.turno.id);

    const solapa = await cambiar(dos.turno.id, { horaInicioReconocimiento: h(-30), horaFinReconocimiento: h(90) });
    igual("[TO-H12] una ventana que se solapa con otra se guarda", solapa.status, 200);
    o = await oferta(H);
    igual("[TO-H3] dos coincidencias: pregunta y no propone ninguno",
      [o.reconocimiento?.estado, o.reconocimiento?.sugeridoId, [...(o.reconocimiento?.candidatosIds ?? [])].sort((a, b) => a - b)],
      ["VARIOS", null, [uno.turno.id, dos.turno.id].sort((a, b) => a - b)]);

    await cambiar(uno.turno.id, { horaInicioReconocimiento: h(300), horaFinReconocimiento: h(360) });
    await cambiar(dos.turno.id, { horaInicioReconocimiento: h(400), horaFinReconocimiento: h(460) });
    o = await oferta(H);
    igual("[TO-H2] ninguna coincidencia: pregunta y no propone ninguno", [o.reconocimiento?.estado, o.reconocimiento?.sugeridoId], ["NINGUNO", null]);
    igual("[TO-H2] y ofrece los dos del ciclo para elegir", o.turnos?.length, 2);

    const apagado = await alta("Apagado", h(-60), h(60));
    await cambiar(apagado.turno.id, { activo: false });
    o = await oferta(H);
    ok("[TO-H6] un turno inactivo no se propone ni se ofrece aunque su ventana coincida",
      !o.reconocimiento?.candidatosIds?.includes(apagado.turno.id) && !o.turnos?.some((t) => t.id === apagado.turno.id));
    const conApagado = await abrirCon(H, { turnoOperativoId: apagado.turno.id });
    igual("[TO-H6] abrir con él: 400", [conApagado.r.status, conApagado.r.codigo], [400, "TURNO_OPERATIVO_INACTIVO"]);
    const conAjeno = await abrirCon(H, { turnoOperativoId: mañana.id });
    igual("[TO-H6] ni con uno de otro local", [conAjeno.r.status, conAjeno.r.codigo], [400, "TURNO_OPERATIVO_DE_OTRO_LOCAL"]);

    const rotos = [await alta("Medio", h(0), ""), await alta("Igual", h(0), h(0)), await alta("Raro", "25:00", "01:00")];
    igual("un rango roto: 400 con su código", rotos.map((r) => [r.status, r.codigo]), Array(3).fill([400, "RANGO_DE_RECONOCIMIENTO_INVALIDO"]));
    rechazado("[TO-HR6] la base tampoco guarda una ventana a medias, ni en un turno inactivo",
      await intento(() => prisma.turnoOperativo.create({ data: { localId: H.local.id, nombre: clave(), activo: false, horaInicioReconocimiento: "06:00" } })),
      /ventana_completa_chk/);
    rechazado("ni una hora que no es HH:MM",
      await intento(() => prisma.turnoOperativo.create({ data: { localId: H.local.id, nombre: clave(), horaInicioReconocimiento: "6:00", horaFinReconocimiento: "07:00" } })),
      /ventana_formato_chk|23514/);

    // UN TURNO ACTIVO TIENE HORARIO [TO-HR]: el alta, la edición y la
    // activación lo exigen, y la base lo sostiene.
    const HORARIO_REQUERIDO = "TURNO_OPERATIVO_HORARIO_REQUERIDO";
    const fila = (id) => prisma.turnoOperativo.findUnique({ where: { id }, select: { activo: true, horaInicioReconocimiento: true, horaFinReconocimiento: true } });
    rechazado("[TO-HR5] la base no guarda un turno activo sin horario",
      await intento(() => prisma.turnoOperativo.create({ data: { localId: H.local.id, nombre: clave() } })),
      /activo_con_ventana_chk/);
    rechazado("[TO-HR5] ni le saca el horario a uno activo",
      await intento(() => prisma.turnoOperativo.update({ where: { id: uno.turno.id }, data: { horaInicioReconocimiento: null, horaFinReconocimiento: null } })),
      /activo_con_ventana_chk/);
    const sinHora = await alta("Sin hora", "", "");
    igual("[TO-HR1] dar de alta sin horario: 400 y su código", [sinHora.status, sinHora.codigo], [400, HORARIO_REQUERIDO]);
    ok("[TO-HR1] y no se creó", !(await prisma.turnoOperativo.findFirst({ where: { localId: H.local.id, nombre: "Sin hora" } })));

    const quitar = await cambiar(dos.turno.id, { horaInicioReconocimiento: null, horaFinReconocimiento: null });
    igual("[TO-HR3] sacarle el horario a un turno activo: 400 y su código", [quitar.status, quitar.codigo], [400, HORARIO_REQUERIDO]);
    igual("[TO-HR3] y el turno sigue activo, con su horario: no se lo desactiva solo", await fila(dos.turno.id),
      { activo: true, horaInicioReconocimiento: h(400), horaFinReconocimiento: h(460) });
    const bajaSinHora = await cambiar(dos.turno.id, { activo: false, horaInicioReconocimiento: null, horaFinReconocimiento: null });
    igual("[TO-HR4] desactivándolo en el mismo pedido, sí: queda inactivo y sin horario", [bajaSinHora.status, await fila(dos.turno.id)],
      [200, { activo: false, horaInicioReconocimiento: null, horaFinReconocimiento: null }]);
    const reactivar = await cambiar(dos.turno.id, { activo: true });
    igual("[TO-HR2] activarlo sin horario: 400 y su código", [reactivar.status, reactivar.codigo], [400, HORARIO_REQUERIDO]);
    igual("[TO-HR2] y sigue inactivo", (await fila(dos.turno.id)).activo, false);
    const conHora = await cambiar(dos.turno.id, { activo: true, horaInicioReconocimiento: h(400), horaFinReconocimiento: h(460) });
    igual("[TO-HR2] con el horario en el mismo pedido, se activa", [conHora.status, (await fila(dos.turno.id)).activo], [200, true]);

    o = await oferta(H);
    const ofrecidos = await Promise.all((o.turnos ?? []).map((t) => fila(t.id)));
    ok("[TO-HR8] todo lo que ofrece el ciclo es un turno activo con horario",
      ofrecidos.length > 0 && ofrecidos.every((t) => t.activo && t.horaInicioReconocimiento && t.horaFinReconocimiento));
    igual("[TO-HR9] y no hay bloqueo de ciclo", o.bloqueo, null);
  }

  seccion("I. El ciclo: la ocurrencia actual y la siguiente, nada más [TO-C]");
  {
    // CON EL RELOJ FIJADO: la regla compartida recibe el instante. Un ciclo de
    // tres con nombres cualquiera: el primero cruza la medianoche y abre la
    // jornada, el segundo es de la mañana y el tercero de la tarde.
    const K = await montarLocal("K");
    const [primero, segundo, tercero] = await Promise.all([
      prisma.turnoOperativo.create({ data: { localId: K.local.id, nombre: "Primero", orden: 0, horaInicioReconocimiento: "23:00", horaFinReconocimiento: "01:00" } }),
      prisma.turnoOperativo.create({ data: { localId: K.local.id, nombre: "Segundo", orden: 1, horaInicioReconocimiento: "06:00", horaFinReconocimiento: "11:00" } }),
      prisma.turnoOperativo.create({ data: { localId: K.local.id, nombre: "Tercero", orden: 2, horaInicioReconocimiento: "15:00", horaFinReconocimiento: "18:00" } }),
    ]);
    const domingo2330 = new Date("2026-10-05T02:30:00.000Z");
    const lunes0030 = new Date("2026-10-05T03:30:00.000Z");
    const lunes2200 = new Date("2026-10-06T01:00:00.000Z");
    // Lo que escribe la apertura con ese turno a esa hora, por la regla de las
    // tres rutas. Con una fecha del cliente que tiene que ignorarse.
    const abrirAs = (t, ahora) =>
      turnoOperativoDeApertura(prisma, { localId: K.local.id, body: { turnoOperativoId: t.id, fechaOperativa: "2020-01-01" }, ahora });
    const fechaDe = async (t, ahora) => isoDe((await abrirAs(t, ahora)).datos?.fechaOperativa);

    const r = await reconocimientoDeApertura(prisma, { localId: K.local.id, ahora: domingo2330 });
    igual("domingo 23:30: propone el turno de la ventana 23→01", [r.reconocimiento.estado, r.reconocimiento.sugeridoId], ["UNICO", primero.id]);
    igual("[TO-C1] domingo 23:30 + turno 23→01: jornada del LUNES", await fechaDe(primero, domingo2330), "2026-10-05");
    igual("[TO-C2] lunes 00:30, el mismo turno: jornada del LUNES", await fechaDe(primero, lunes0030), "2026-10-05");

    igual("[TO-C3] lunes 22:00: el turno de la tarde que se extiende sigue siendo del LUNES", await fechaDe(tercero, lunes2200), "2026-10-05");
    igual("[TO-C4] lunes 22:00: el siguiente del ciclo es el que cruza, del MARTES", await fechaDe(primero, lunes2200), "2026-10-06");
    const lejano = await abrirAs(segundo, lunes2200);
    igual("[TO-C5][TO-C8] lunes 22:00: el de la mañana, ya pasado y a dos pasos, se rechaza",
      [lejano.ok, lejano.status, lejano.codigo], [false, 409, "TURNO_OPERATIVO_FUERA_DE_CICLO"]);
    const a2200 = await reconocimientoDeApertura(prisma, { localId: K.local.id, ahora: lunes2200 });
    igual("[TO-C9] lunes 22:00: lo que se ofrece para elegir son esos dos, con su fecha",
      a2200.turnos.map((t) => [t.nombre, t.fechaOperativa]), [["Primero", "2026-10-06"], ["Tercero", "2026-10-05"]]);
    igual("[TO-C7] el turno final decide la fecha: el mismo momento da lunes o martes según cuál se elige",
      [await fechaDe(tercero, lunes2200), await fechaDe(primero, lunes2200)], ["2026-10-05", "2026-10-06"]);
    igual("[TO-H7] ventana normal a su hora: el día", await fechaDe(segundo, new Date("2026-10-04T10:30:00.000Z")), "2026-10-04");

    // [TO-C13] El orden lo cambia la configuración, por su ruta, y con él
    // cambia cuál es el siguiente.
    const reorden = await leer(await rutaCatalogo.PUT(
      conCookie("http://ci/api/config/turnos-operativos", `erpazul_sesion=${K.config}`, { orden: [primero.id, tercero.id, segundo.id] }, "PUT")));
    requerir("reordena por la ruta de configuración", reorden.ok === true, `${reorden.status} ${reorden.error ?? ""}`);
    const otroOrden = await reconocimientoDeApertura(prisma, { localId: K.local.id, ahora: lunes2200 });
    igual("[TO-C13] con otro orden, a las 22:00 el siguiente es el de la mañana del martes",
      otroOrden.turnos.map((t) => [t.nombre, t.fechaOperativa]), [["Tercero", "2026-10-05"], ["Segundo", "2026-10-06"]]);
    igual("[TO-C13] y el que cruza ya no es el siguiente: se rechaza", (await abrirAs(primero, lunes2200)).codigo, "TURNO_OPERATIVO_FUERA_DE_CICLO");

    // CON EL RELOJ REAL, POR LAS RUTAS: ventanas armadas alrededor de la hora
    // del servidor, con horas de margen. "Pasado" empezó hace diez horas,
    // "Actual" hace dos y "Próximo" empieza en dos.
    const base = momentoArgentina().minuto;
    const h = (delta) => horaDeMinutos((((base + delta) % 1440) + 1440) % 1440);
    const R = await montarLocal("R");
    const [pasado, actual, proximo] = await Promise.all([
      prisma.turnoOperativo.create({ data: { localId: R.local.id, nombre: "Pasado", orden: 0, horaInicioReconocimiento: h(-600), horaFinReconocimiento: h(-540) } }),
      prisma.turnoOperativo.create({ data: { localId: R.local.id, nombre: "Actual", orden: 1, horaInicioReconocimiento: h(-120), horaFinReconocimiento: h(-60) } }),
      prisma.turnoOperativo.create({ data: { localId: R.local.id, nombre: "Próximo", orden: 2, horaInicioReconocimiento: h(120), horaFinReconocimiento: h(180) } }),
    ]);
    const enPantalla = await leer(await rutaCatalogo.GET(conCookie("http://ci/api/config/turnos-operativos?activos=1", `erpazul_sesion=${R.sesion}`, null, "GET")));
    igual("[TO-C9] la pantalla recibe el actual y el próximo, y no el pasado",
      enPantalla.turnos?.map((t) => t.id), [actual.id, proximo.id]);
    const conPasado = await abrirCon(R, { turnoOperativoId: pasado.id });
    igual("[TO-C8] abrir por la ruta con el turno pasado: 409, aunque esté activo y sea del local",
      [conPasado.r.status, conPasado.r.codigo], [409, "TURNO_OPERATIVO_FUERA_DE_CICLO"]);
    const esperada = () => cicloDeTurnos([pasado, actual, proximo], momentoArgentina()).opciones.find((x) => x.id === proximo.id)?.fechaOperativa;
    const antes = esperada();
    const conProximo = await cajaPorRuta(R, proximo.id);
    const guardada = isoDe((await turnoDeCaja(conProximo.turnoId)).fechaOperativa);
    ok("el próximo abre y guarda la fecha de SU ocurrencia", guardada === antes || guardada === esperada(), `guardó ${guardada}`);

    // [TO-H13] Las tres rutas, con el reloj real, escriben la fecha de la
    // misma regla. Un turno solo, cuya ventana contiene la hora y cruza la
    // medianoche: salvo en la primera media hora del día, su jornada es la de
    // MAÑANA, no la de hoy, así que una ruta que guardara "hoy" se vería.
    const W2 = await montarLocal("W");
    const ahoraMin = momentoArgentina().minuto;
    const hr = (delta) => horaDeMinutos((((ahoraMin + delta) % 1440) + 1440) % 1440);
    const W = await prisma.turnoOperativo.create({ data: { localId: W2.local.id, nombre: "W", orden: 0, horaInicioReconocimiento: hr(-30), horaFinReconocimiento: hr(-31) } });
    const esperadas = () => new Set(cicloDeTurnos([W], momentoArgentina()).opciones.map((x) => x.fechaOperativa));
    const comprobar = async (ruta, turnoId, previas) => {
      const fecha = isoDe((await turnoDeCaja(turnoId)).fechaOperativa);
      ok(`[TO-H13] ${ruta}: guarda la fecha de la regla para el turno elegido`, previas.has(fecha) || esperadas().has(fecha), `guardó ${fecha}`);
      const m = momentoArgentina();
      ok(`[TO-H13] ${ruta}: y no es simplemente hoy`, m.minuto < 31 || fecha === sumarDias(m.fecha, 1), `guardó ${fecha}, hoy ${m.fecha}`);
    };
    let previas = esperadas();
    const porAbrir = await cajaPorRuta(W2, W.id);
    await comprobar("abrir", porAbrir.turnoId, previas);

    const { quien: qSin } = await operador(W2);
    previas = esperadas();
    const rSin = await leer(await rutaAbrirSinCambio.POST(pedido(`${BASE}/turnos/abrir-sin-cambio`, qSin, {
      desgloseContado: desgloseDe(2000), motivo: "fondo propio", turnoOperativoId: W.id,
    })));
    requerir("abrir-sin-cambio abre", rSin.ok === true, `${rSin.status} ${rSin.error ?? ""}`);
    await comprobar("abrir-sin-cambio", rSin.turno.id, previas);

    await vender(porAbrir, 5000);
    const corte = await cerrar(porAbrir, 3000, 5000);
    const sobre = await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: corte.id } });
    requerir("el cierre dejó un sobre", Boolean(sobre), "sin sobre");
    const { quien: qCon } = await operador(W2);
    const reserva = await leer(await rutaReservar.POST(pedido(`${BASE}/cambios-pendientes/reservar`, qCon, { cambioPendienteId: sobre.id })));
    requerir("reserva el sobre", reserva.ok === true, `${reserva.status} ${reserva.error ?? ""}`);
    previas = esperadas();
    const rCon = await leer(await rutaAbrirConCambio.POST(pedido(`${BASE}/turnos/abrir-con-cambio`, qCon, {
      cambioPendienteId: sobre.id, desgloseRecibido: desgloseDe(3000), turnoOperativoId: W.id,
    })));
    requerir("abrir-con-cambio abre", rCon.ok === true, `${rCon.status} ${rCon.error ?? ""}`);
    await comprobar("abrir-con-cambio", rCon.turno.id, previas);
  }

  seccion("J. Corregir el turno de una caja abierta desde el POS [TO-CC, TO-4]");
  {
    // Un ciclo de tres con nombres cualquiera, como en I: el primero cruza la
    // medianoche y abre la jornada, el segundo es de la mañana, el tercero de
    // la tarde. Las cajas se escriben con una APERTURA fija —domingo 4 a las
    // 23:30 y lunes 5 a las 22:00, hora argentina— para probar que las
    // opciones salen de ESA apertura y no de la hora en que corre la prueba.
    const J = await montarLocal("J");
    const [primero, segundo, tercero] = await Promise.all([
      prisma.turnoOperativo.create({ data: { localId: J.local.id, nombre: "Primero", orden: 0, horaInicioReconocimiento: "23:00", horaFinReconocimiento: "01:00" } }),
      prisma.turnoOperativo.create({ data: { localId: J.local.id, nombre: "Segundo", orden: 1, horaInicioReconocimiento: "06:00", horaFinReconocimiento: "11:00" } }),
      prisma.turnoOperativo.create({ data: { localId: J.local.id, nombre: "Tercero", orden: 2, horaInicioReconocimiento: "15:00", horaFinReconocimiento: "18:00" } }),
    ]);
    const apagado = await prisma.turnoOperativo.create({
      data: { localId: J.local.id, nombre: "Apagado", orden: 3, activo: false, horaInicioReconocimiento: "12:00", horaFinReconocimiento: "13:00" },
    });
    const DOMINGO_2330 = new Date("2026-10-05T02:30:00Z");
    const LUNES_2200 = new Date("2026-10-06T01:00:00Z");
    const cajaAbierta = async (apertura, turnoOperativoId, fecha) => {
      const c = await cajaEnLaBase(J, { turnoOperativoId, fechaOperativa: fecha ? comoFecha(fecha) : null });
      await prisma.turno.update({ where: { id: c.turnoId }, data: { apertura } });
      return c;
    };
    const urlDe = (c) => `${BASE}/turnos/${c.turnoId}/turno-operativo`;
    const opciones = async (c) => leer(await rutaCorregir.GET(pedido(urlDe(c), c.quien, null, "GET"), conId(c.turnoId)));
    const corregir = async (c, cuerpo, quien = c.quien) => leer(await rutaCorregir.POST(pedido(urlDe(c), quien, cuerpo), conId(c.turnoId)));
    const clasif = async (c) => {
      const t = await turnoDeCaja(c.turnoId);
      return [t.turnoOperativoId, isoDe(t.fechaOperativa)];
    };
    const resumen = (o) => (o.opciones ?? []).map((x) => [x.nombre, x.fechaOperativa]).sort();

    // Domingo 23:30: Primero en curso (jornada del lunes) y Segundo, que sigue.
    const cDom = await cajaAbierta(DOMINGO_2330, primero.id, "2026-10-05");
    // Lunes 22:00: Tercero extendido (lunes) y Primero, que sigue (martes).
    const cLun = await cajaAbierta(LUNES_2200, tercero.id, "2026-10-05");
    const oDom = await opciones(cDom);
    const oLun = await opciones(cLun);
    igual("[TO-CC1] las opciones son las de la APERTURA de la caja: domingo 23:30",
      resumen(oDom), [["Primero", "2026-10-05"], ["Segundo", "2026-10-05"]]);
    igual("[TO-CC1] y las de otra caja, abierta el lunes 22:00, son otras: la hora de ahora no las cambia",
      resumen(oLun), [["Primero", "2026-10-06"], ["Tercero", "2026-10-05"]]);
    igual("[TO-CC1] la pantalla recibe el turno de la caja y que se puede corregir",
      [oLun.caja?.turnoOperativo?.nombre, oLun.caja?.fechaOperativa, oLun.corregible], ["Tercero", "2026-10-05", true]);

    const antesDeCorregir = await prisma.turno.count({ where: { localId: J.local.id } });
    const aPrimero = await corregir(cLun, { turnoOperativoId: primero.id, fechaOperativa: "2020-01-01" });
    igual("[TO-CC2] corregir al siguiente de la apertura: ok, con la fecha que calcula el servidor (martes)",
      [aPrimero.status, aPrimero.cambio, aPrimero.caja?.turnoOperativo?.nombre, aPrimero.caja?.fechaOperativa],
      [200, true, "Primero", "2026-10-06"]);
    igual("[TO-CC2] la fecha que mandó el cliente se ignora: la base tiene la del servidor", await clasif(cLun), [primero.id, "2026-10-06"]);
    igual("[TO-CC2] es la misma caja: ninguna caja nueva", [aPrimero.caja?.id, await prisma.turno.count({ where: { localId: J.local.id } })], [cLun.turnoId, antesDeCorregir]);
    const aTercero = await corregir(cLun, { turnoOperativoId: tercero.id });
    igual("[TO-CC2] y volver al turno extendido de la apertura: ok, del lunes", [aTercero.status, await clasif(cLun)], [200, [tercero.id, "2026-10-05"]]);

    const imposible = await corregir(cLun, { turnoOperativoId: segundo.id });
    igual("[TO-CC3] un turno activo que en la apertura no era posible: 409 y su código",
      [imposible.status, imposible.codigo], [409, "TURNO_OPERATIVO_FUERA_DE_CICLO"]);
    igual("[TO-CC3] y la caja queda como estaba", await clasif(cLun), [tercero.id, "2026-10-05"]);

    const cruce = await corregir(cDom, { turnoOperativoId: segundo.id });
    igual("[TO-CC4] domingo 23:30 → Segundo: la jornada del lunes", [cruce.status, await clasif(cDom)], [200, [segundo.id, "2026-10-05"]]);
    const vuelta = await corregir(cDom, { turnoOperativoId: primero.id });
    igual("[TO-CC4] y de vuelta al que cruza la medianoche: también del lunes", [vuelta.status, await clasif(cDom)], [200, [primero.id, "2026-10-05"]]);

    const antes = await prisma.turno.findUnique({ where: { id: cDom.turnoId }, select: { updatedAt: true } });
    const mismo = await corregir(cDom, { turnoOperativoId: primero.id });
    const despues = await prisma.turno.findUnique({ where: { id: cDom.turnoId }, select: { updatedAt: true } });
    igual("[TO-CC5] elegir el mismo turno no escribe", [mismo.status, mismo.cambio, despues.updatedAt.getTime()], [200, false, antes.updatedAt.getTime()]);

    igual("[TO-CC6] un turno de otro local: 400 y su código",
      [(await corregir(cDom, { turnoOperativoId: mañanaB.id })).codigo, await clasif(cDom)], ["TURNO_OPERATIVO_DE_OTRO_LOCAL", [primero.id, "2026-10-05"]]);
    igual("[TO-CC6] un turno inactivo: 400 y su código", (await corregir(cDom, { turnoOperativoId: apagado.id })).codigo, "TURNO_OPERATIVO_INACTIVO");
    const otro = await operador(J);
    igual("[TO-CC6] la caja de otro operario: 403", (await corregir(cDom, { turnoOperativoId: segundo.id }, otro.quien)).status, 403);

    const legado = await cajaAbierta(DOMINGO_2330, null, null);
    const oLeg = await opciones(legado);
    igual("[TO-CC7] una caja sin turno se informa así y no ofrece opciones",
      [oLeg.caja?.turnoOperativo, oLeg.corregible, oLeg.motivo?.codigo, oLeg.opciones?.length], [null, false, "CAJA_SIN_TURNO_OPERATIVO", 0]);
    const aLeg = await corregir(legado, { turnoOperativoId: primero.id });
    igual("[TO-CC7] y no se le asigna uno: 409, sigue sin turno", [aLeg.status, aLeg.codigo, await clasif(legado)], [409, "CAJA_SIN_TURNO_OPERATIVO", [null, null]]);

    for (const [estado, marcaDeEstado] of [
      ["cerrada", { cierre: new Date() }],
      ["en cierre", { cierreEnPreparacionEn: new Date() }],
      ["anulada", { anuladoEn: new Date() }],
    ]) {
      const c = await cajaAbierta(DOMINGO_2330, primero.id, "2026-10-05");
      await prisma.turno.update({ where: { id: c.turnoId }, data: marcaDeEstado });
      const r = await corregir(c, { turnoOperativoId: segundo.id });
      igual(`[TO-CC8] una caja ${estado}: 409 y su código, sin cambios`, [r.status, r.codigo, await clasif(c)], [409, "CAJA_NO_ABIERTA", [primero.id, "2026-10-05"]]);
    }

    // Una caja abierta HOY por la ruta, con ventas, Caja + y un retiro de
    // recaudación. Corregirla no toca nada de eso.
    const catalogo = await leer(await rutaCatalogo.GET(conCookie(`http://ci/api/config/turnos-operativos?activos=1`, `erpazul_sesion=${J.sesion}`, null, "GET")));
    const deHoy = await cajaPorRuta(J, catalogo.turnos[0].id);
    await vender(deHoy, 5000);
    const mas = await leer(await rutaMovimiento.POST(pedido(`${BASE}/caja-movimientos/crear`, deHoy.quien, { turnoId: deHoy.turnoId, tipo: "INGRESO", monto: 700, motivo: "cambio" })));
    requerir("Caja + en la caja de hoy", mas.ok === true, `${mas.status} ${mas.error ?? ""}`);
    const huella = async () => {
      const [ventas, movs] = await Promise.all([
        prisma.venta.findMany({ where: { turnoId: deHoy.turnoId }, select: { id: true, total: true }, orderBy: { id: "asc" } }),
        prisma.cajaMovimiento.findMany({ where: { turnoId: deHoy.turnoId }, select: { id: true, tipo: true, monto: true }, orderBy: { id: "asc" } }),
      ]);
      return JSON.stringify({ ventas, movs });
    };
    const huellaAntes = await huella();
    const oHoy = await opciones(deHoy);
    const destino = oHoy.opciones.find((x) => x.id !== catalogo.turnos[0].id);
    requerir("la caja de hoy tiene otra opción en su apertura", Boolean(destino), JSON.stringify(oHoy.opciones));
    const rHoy = await corregir(deHoy, { turnoOperativoId: destino.id });
    igual("[TO-CC9] corregida, con la fecha de su ocurrencia", [rHoy.status, await clasif(deHoy)], [200, [destino.id, destino.fechaOperativa]]);
    igual("[TO-CC9] ventas, movimientos e importes quedan intactos", await huella(), huellaAntes);

    // El retiro verificado bloquea: ni la ruta ni la base cambian el turno.
    // 1000 de fondo + 5000 vendidos + 700 de Caja +; queda 1000 de cambio.
    await retirar(deHoy, 1000, 5700);
    const retiro = await prisma.cajaMovimiento.findFirst({ where: { turnoId: deHoy.turnoId, tipo: "RETIRO" }, orderBy: { id: "desc" } });
    const ver = await verificar(J, { cajaMovimientoIds: [retiro.id], importeVerificado: 5700, idempotencyKey: clave() });
    requerir("verifica el retiro de la caja abierta", ver.ok === true, `${ver.status} ${ver.error ?? ""}`);
    const conVer = await corregir(deHoy, { turnoOperativoId: catalogo.turnos[0].id });
    igual("[TO-CC10] con efectivo en una verificación vigente: 409 y su código, sin cambios",
      [conVer.status, conVer.codigo, await clasif(deHoy)], [409, "CAJA_CON_VERIFICACION_VIGENTE", [destino.id, destino.fechaOperativa]]);
    rechazado("[TO-4] la base tampoco cambia el turno de una caja con efectivo verificado",
      await intento(() => prisma.turno.update({ where: { id: deHoy.turnoId }, data: { turnoOperativoId: catalogo.turnos[0].id } })),
      /verificación vigente/);
  }

  seccion("T. La transición: un local sin turnos sigue en legado hasta que carga el primero [TO-T]");
  {
    const urlCatalogo = "http://ci/api/config/turnos-operativos";
    const oferta = async (L) => leer(await rutaCatalogo.GET(conCookie(`${urlCatalogo}?activos=1`, `erpazul_sesion=${L.sesion}`, null, "GET")));
    const sinTurno = async (turnoId) => {
      const t = await turnoDeCaja(turnoId);
      return t.turnoOperativoId === null && t.fechaOperativa === null;
    };
    const L0 = await montarLocal("T0");
    const L1 = await montarLocal("T1");
    igual("un local que nunca tuvo turnos se informa en legado", (await oferta(L0)).legado, true);

    const porAbrir = await abrirCon(L0, {});
    requerir("[TO-T1] abrir sin turno en un local legado: abre", porAbrir.r.ok === true, `${porAbrir.r.status} ${porAbrir.r.codigo ?? ""} ${porAbrir.r.error ?? ""}`);
    ok("[TO-T1] y la caja queda sin turno ni fecha operativa", await sinTurno(porAbrir.r.turno.id));
    const cajaVieja = { ...porAbrir, turnoId: porAbrir.r.turno.id };

    const { quien: qSin } = await operador(L0);
    const rSin = await leer(await rutaAbrirSinCambio.POST(pedido(`${BASE}/turnos/abrir-sin-cambio`, qSin, { desgloseContado: desgloseDe(2000), motivo: "fondo propio" })));
    requerir("[TO-T2] abrir-sin-cambio sin turno en un local legado: abre", rSin.ok === true, `${rSin.status} ${rSin.codigo ?? ""} ${rSin.error ?? ""}`);
    ok("[TO-T2] y la caja queda sin turno ni fecha operativa", await sinTurno(rSin.turno.id));
    const cajaQueSigue = { quien: qSin, L: L0, turnoId: rSin.turno.id };

    // El relevo de una caja legado: deja sobre, otro lo reserva y abre con él.
    await vender(cajaVieja, 5000);
    const corte = await cerrar(cajaVieja, 3000, 5000);
    const sobre = await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: corte.id } });
    requerir("la caja legado cerró dejando un sobre", Boolean(sobre), "sin sobre");
    const { quien: qCon } = await operador(L0);
    const reserva = await leer(await rutaReservar.POST(pedido(`${BASE}/cambios-pendientes/reservar`, qCon, { cambioPendienteId: sobre.id })));
    requerir("reserva el sobre", reserva.ok === true, `${reserva.status} ${reserva.error ?? ""}`);
    const rCon = await leer(await rutaAbrirConCambio.POST(pedido(`${BASE}/turnos/abrir-con-cambio`, qCon, { cambioPendienteId: sobre.id, desgloseRecibido: desgloseDe(3000) })));
    requerir("[TO-T3] el relevo con cambio en un local legado: abre", rCon.ok === true, `${rCon.status} ${rCon.codigo ?? ""} ${rCon.error ?? ""}`);
    ok("[TO-T3] y su caja queda sin turno ni fecha operativa", await sinTurno(rCon.turno.id));

    // Un primer turno sin horario no se crea, y el local sigue en legado.
    const incompleto = await leer(await rutaCatalogo.POST(conCookie(urlCatalogo, `erpazul_sesion=${L0.config}`, {
      nombre: "Único", horaInicioReconocimiento: "", horaFinReconocimiento: "",
    })));
    igual("[TO-HR7] un primer turno sin horario no se crea: 400 y su código", [incompleto.status, incompleto.codigo], [400, "TURNO_OPERATIVO_HORARIO_REQUERIDO"]);
    igual("[TO-HR7] y no saca al local del legado", [await prisma.turnoOperativo.count({ where: { localId: L0.local.id } }), (await oferta(L0)).legado], [0, true]);

    // El local carga su primer turno por la configuración: entra al sistema nuevo.
    const alta =await leer(await rutaCatalogo.POST(conCookie(urlCatalogo, `erpazul_sesion=${L0.config}`, {
      nombre: "Único", horaInicioReconocimiento: "00:00", horaFinReconocimiento: "01:00",
    })));
    requerir("da de alta su primer turno", alta.ok === true, `${alta.status} ${alta.error ?? ""}`);
    igual("[TO-T8] desde el primer turno el local deja de estar en legado", (await oferta(L0)).legado, false);
    const antes = await prisma.turno.count({ where: { localId: L0.local.id } });
    const sinElegir = await abrirCon(L0, {});
    igual("[TO-T4][TO-T8] una apertura sin turno ya no abre: 400 y su código", [sinElegir.r.status, sinElegir.r.codigo], [400, "TURNO_OPERATIVO_REQUERIDO"]);
    igual("[TO-T4] y no se escribió ninguna caja sin turno", await prisma.turno.count({ where: { localId: L0.local.id } }), antes);
    const conTurno = await abrirCon(L0, { turnoOperativoId: alta.turno.id });
    requerir("con el turno abre", conTurno.r.ok === true, `${conTurno.r.status} ${conTurno.r.error ?? ""}`);
    igual("y la caja lleva su turno", (await turnoDeCaja(conTurno.r.turno.id)).turnoOperativoId, alta.turno.id);

    // La transición es POR LOCAL.
    const otro = await abrirCon(L1, {});
    ok("[TO-T5] el otro local, sin configurar, sigue abriendo en legado", otro.r.ok === true && (await sinTurno(otro.r.turno.id)), `${otro.r.status} ${otro.r.codigo ?? ""}`);

    // Desactivar todos los turnos NO devuelve el local al legado.
    const baja = await leer(await rutaTurnoDelCatalogo.PATCH(
      conCookie(`${urlCatalogo}/${alta.turno.id}`, `erpazul_sesion=${L0.config}`, { activo: false }, "PATCH"), conId(alta.turno.id)));
    requerir("desactiva su único turno", baja.ok === true, `${baja.status} ${baja.error ?? ""}`);
    const sinActivos = await oferta(L0);
    igual("[TO-T9] sin turnos activos el local NO vuelve al legado: se dice qué falta",
      [sinActivos.legado, sinActivos.bloqueo?.codigo], [false, "LOCAL_SIN_TURNOS_OPERATIVOS"]);
    const antes2 = await prisma.turno.count({ where: { localId: L0.local.id } });
    const regresion = await abrirCon(L0, {});
    igual("[TO-T9] y una apertura sin turno no abre: 409", [regresion.r.status, regresion.r.codigo], [409, "LOCAL_SIN_TURNOS_OPERATIVOS"]);
    igual("[TO-T9] ni deja una caja sin turno", await prisma.turno.count({ where: { localId: L0.local.id } }), antes2);

    // La caja legado que estaba abierta sigue operando y cierra, sin turno.
    await vender(cajaQueSigue, 4000);
    const corteLegado = await cerrar(cajaQueSigue, 1000, 4000);
    ok("[TO-T6] la caja legado abierta antes de configurar vende y cierra", Boolean(corteLegado?.id));
    ok("[TO-T7] y no recibió turno ni fecha: no hay backfill", await sinTurno(cajaQueSigue.turnoId) && await sinTurno(cajaVieja.turnoId));
    igual("[TO-HR8] después de todo, ningún turno activo de ningún local quedó sin horario",
      await prisma.turnoOperativo.count({ where: { activo: true, OR: [{ horaInicioReconocimiento: null }, { horaFinReconocimiento: null }] } }), 0);
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
  console.log("\nFALLAS:");
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
