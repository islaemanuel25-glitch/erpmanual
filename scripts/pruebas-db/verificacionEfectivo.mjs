// LA VERIFICACIÓN DE EFECTIVO CONTRA POSTGRESQL: LO QUE LA BASE SOSTIENE SOLA.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/verificacionEfectivo.mjs
//
// La persistencia de la verificación (prisma/migrations/20261004120000_verificacion_efectivo)
// pone sus garantías en la base: CHECK, índice único parcial, FK compuestas y
// triggers. Ninguna se puede probar con una función pura ni con un mock, así que
// todo lo de acá corre contra Postgres de verdad, y cada rechazo se reconoce por
// el NOMBRE de la defensa que lo produjo —un rechazo por otro motivo no cuenta—.
//
// Las entregas salen del camino real: las cajas se abren, venden, retiran y
// cierran por las rutas del POS, y la lista de entregas es la que devuelve
// `leerTesoreria`. La verificación se arma con `armarVerificacionEfectivo` y se
// escribe como la va a escribir la acción: padre y entregas en UNA transacción.
//
// Lo que se ejerce, con el número de la lista de la PR:
//   B. una verificación con varias entregas de varias cajas (1, 2, 3, 13, 14, 16);
//   C. lo que la base rechaza al crear (4, 15, y la foto falsa);
//   D. una entrega en una sola verificación vigente (7);
//   E. dos verificaciones simultáneas de la misma entrega (8);
//   F. idempotencia por local, y la foto sin operador (5, 6, 18);
//   G. anular sin perder historia, y verificar de nuevo (9, 10);
//   H. el movimiento corregido después de verificar (11, 12);
//   I. sin mezclar locales (17);
//   J. nada se borra ni en cascada (19);
//   K. ninguna identidad de turno comercial persistida (20).
//
// NO DESMONTA. Una verificación no se borra —es la regla que se prueba— y sus
// FK RESTRICT sostienen todo lo que cuelga de ella: el local, los turnos, los
// movimientos, los usuarios. Los datos quedan con una marca única en la base
// efímera de la prueba (la del CI se tira con el job). Correr esto contra una
// base que no sea descartable deja filas que nadie puede borrar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { esperarEnFila } = await import("./carreraForzada.mjs");
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { DENOMINACIONES } = await import("../../lib/caja/conteoBilletes.js");
const { leerTesoreria, rangoDeTesoreria } = await import("../../lib/tesoreria/lecturaTesoreriaServer.js");
const { armarVerificacionEfectivo, datosDeAnulacion, entregaDesactualizada, ESTADO_VERIFICACION } =
  await import("../../lib/tesoreria/verificacionEfectivo.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
const rutaCierreIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaCierreConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");

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

/** Corre `fn` y devuelve si anduvo o con qué error, sin tirar. */
async function intento(fn) {
  try {
    return { ok: true, valor: await fn() };
  } catch (e) {
    return { ok: false, codigo: e?.code ?? null, mensaje: `${e?.message ?? e} ${JSON.stringify(e?.meta ?? {})}` };
  }
}
/** Rechazado, y por la defensa que se nombra: un rechazo por otra causa no prueba nada. */
const rechazado = (t, r, patron) =>
  ok(t, !r.ok && patron.test(`${r.codigo} ${r.mensaje}`), r.ok ? "se aceptó" : `otro motivo: ${r.codigo} ${r.mensaje.slice(0, 220)}`);
const aceptado = (t, r) => ok(t, r.ok, r.ok ? "" : `${r.codigo} ${r.mensaje.slice(0, 220)}`);

const SECRETO = process.env.AUTH_SECRET;
const BASE = "http://ci/api/pos-ventas";
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const pedido = (url, quien, cuerpo) => {
  const cookie = [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
  const req = new Request(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });

/** Un desglose de billetes que suma exactamente `monto` (múltiplo de 100). */
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

const marca = `ci-verif-${Date.now()}`;
const PERMISOS_POS = ["pos.usar"];
let n = 0;
const clave = () => `${marca}-${(n += 1)}`;

/** Un local con su cuenta, su producto y su sesión. */
async function montarLocal(nombre, exigirOperador) {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-${nombre}-rol`, permisos: PERMISOS_POS } });
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-${nombre}-grupo` } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-${nombre}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador, allowNegativeStock: false } });
  const cuenta = await prisma.usuario.create({
    data: { nombre: `${marca}-${nombre}-cuenta`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-${nombre}-producto`, precioVenta: 1000, precioCosto: 600, stock: 10000,
  });
  const sesion = jwt.sign({ id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, localId: local.id, permisos: PERMISOS_POS }, SECRETO, { expiresIn: "1h" });
  return { local, cuenta, producto, sesion, exigirOperador };
}

async function nuevaCaja(l, fondo = 1000) {
  let op = null;
  let operador = null;
  if (l.exigirOperador) {
    op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: l.local.id } });
    operador = firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: l.local.id });
  }
  const quien = { sesion: l.sesion, operador };
  const r = await leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: fondo })));
  requerir("abre la caja", r.ok === true, `${r.status} ${r.error ?? ""}`);
  return { l, op, quien, turnoId: r.turno.id };
}
async function vender(caja, monto) {
  const r = await leer(await rutaCrear.POST(pedido(`${BASE}/crear`, caja.quien, {
    clientTxnId: clave(), localId: caja.l.local.id, clienteId: null, turnoId: caja.turnoId, formaPago: "EFECTIVO",
    esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
    items: [itemCrearPayload({ productoBaseId: caja.l.producto.baseId, nombre: "P", precio: 1000, cantidad: monto / 1000, precioCosto: 600 })],
  })));
  requerir(`vende $${monto} en efectivo`, r.ok === true, `${r.status} ${r.error ?? ""}`);
}
async function retirar(caja, cambio, contado) {
  const ini = await leer(await rutaRetiroIniciar.POST(pedido(`${BASE}/retiros/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
  requerir("inicia el retiro", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
  const tok = ini.retiro?.token ?? ini.preparacion?.token ?? ini.token;
  const fin = await leer(await rutaRetiroConfirmar.POST(pedido(`${BASE}/retiros/${tok}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(tok)));
  requerir("confirma el retiro", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
}
async function cerrar(caja, cambio, contado) {
  const ini = await leer(await rutaCierreIniciar.POST(pedido(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
  requerir("inicia el cierre", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
  const fin = await leer(await rutaCierreConfirmar.POST(pedido(`${BASE}/cierres/${ini.cierre.token}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(ini.cierre.token)));
  requerir("confirma el cierre", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
}
async function mover(caja, tipo, monto) {
  const r = await leer(await rutaMovimiento.POST(pedido(`${BASE}/caja-movimientos/crear`, caja.quien, { turnoId: caja.turnoId, tipo, monto, motivo: `${tipo} manual` })));
  requerir(`Caja ${tipo} $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
}

/** Las entregas de un local, tal como las devuelve la lectura canónica. */
async function entregasDe(l) {
  const rango = await rangoDeTesoreria(prisma, { localId: l.local.id, unidad: "DIA" });
  const lectura = await leerTesoreria(prisma, { localId: l.local.id, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin });
  return lectura.entregas;
}

/**
 * Escribe una verificación como la va a escribir la acción: padre y entregas en
 * una transacción. `alterar` deja torcer los datos ya armados, para probar lo
 * que la base hace con un dato que el armado no habría producido.
 */
function escribir(db, datos, alterar = (x) => x) {
  const { verificacion, entregas } = alterar(datos);
  const cuerpo = async (tx) => {
    const v = await tx.verificacionEfectivo.create({ data: verificacion });
    if (entregas.length) {
      await tx.verificacionEfectivoEntrega.createMany({ data: entregas.map((e) => ({ ...e, verificacionEfectivoId: v.id })) });
    }
    return v;
  };
  return db === prisma ? prisma.$transaction(cuerpo) : cuerpo(db);
}

async function correr() {
  // ── A. MONTAJE ───────────────────────────────────────────────────────────
  seccion("A. Entregas reales por las rutas del POS");
  const A = await montarLocal("A", true);
  const B = await montarLocal("B", false);
  const c1 = await nuevaCaja(A);
  const c2 = await nuevaCaja(A);
  const c3 = await nuevaCaja(A);
  const c4 = await nuevaCaja(A);
  const c5 = await nuevaCaja(A);
  const c6 = await nuevaCaja(A);
  const cb = await nuevaCaja(B);
  await vender(c1, 100000);
  await retirar(c1, 51000, 50000); // RECAUDACION 50.000
  await cerrar(c1, 1000, 50000); //   CIERRE 50.000
  await vender(c2, 10000);
  await cerrar(c2, 1000, 10000); //   CIERRE 10.000
  await vender(c3, 20000);
  await cerrar(c3, 1000, 20000); //   CIERRE 20.000, para la carrera
  await vender(c4, 30000);
  await cerrar(c4, 1000, 30000); //   CIERRE 30.000, para la corrección
  await vender(c6, 40000);
  await cerrar(c6, 1000, 40000); //   CIERRE 40.000, para la carrera que se cae
  await mover(c5, "INGRESO", 5000); // ni entregas ni de recaudación
  await mover(c5, "RETIRO", 3000);
  await vender(cb, 8000);
  await cerrar(cb, 1000, 8000); //    CIERRE 8.000, local sin operador
  const cb2 = await nuevaCaja(B);
  await vender(cb2, 6000);
  await cerrar(cb2, 1000, 6000); //   CIERRE 6.000, nunca verificada: para mezclar locales

  const eA = await entregasDe(A);
  const eB = await entregasDe(B);
  const de = (lista, caja, clase) => lista.find((e) => e.turnoId === caja.turnoId && e.clase === clase);
  const e1R = de(eA, c1, "RECAUDACION");
  const e1C = de(eA, c1, "CIERRE");
  const e2C = de(eA, c2, "CIERRE");
  const e3C = de(eA, c3, "CIERRE");
  const e4C = de(eA, c4, "CIERRE");
  const e6C = de(eA, c6, "CIERRE");
  const ebC = de(eB, cb, "CIERRE");
  const eb2C = de(eB, cb2, "CIERRE");
  requerir("la lectura devuelve las ocho entregas", [e1R, e1C, e2C, e3C, e4C, e6C, ebC, eb2C].every(Boolean), JSON.stringify(eA.map((e) => [e.turnoId, e.clase])));
  const movsC5 = await prisma.cajaMovimiento.findMany({ where: { turnoId: c5.turnoId }, orderBy: { id: "asc" } });
  const ingresoManual = movsC5.find((m) => m.tipo === "INGRESO");
  const retiroManual = movsC5.find((m) => m.tipo === "RETIRO");
  requerir("los movimientos manuales están en la base", Boolean(ingresoManual && retiroManual));

  const armar = (entregas, importeVerificado, extra = {}) => armarVerificacionEfectivo({
    localId: A.local.id, entregas, importeVerificado, verificadaPorUsuarioId: A.cuenta.id, idempotencyKey: clave(), ...extra,
  });
  const cuantas = () => prisma.verificacionEfectivo.count({ where: { localId: { in: [A.local.id, B.local.id] } } });

  // ── B. UNA VERIFICACIÓN, VARIAS ENTREGAS ─────────────────────────────────
  seccion("B. Varias entregas de varias cajas");
  const datosV1 = armar([e1R, e1C, e2C], 109500, { observacion: "Faltan $500 en el sobre de la caja 2" });
  const rV1 = await intento(() => escribir(prisma, datosV1));
  requerir("crea la verificación con tres entregas", rV1.ok, rV1.mensaje);
  const V1 = await prisma.verificacionEfectivo.findUnique({ where: { id: rV1.valor.id }, include: { entregas: { orderBy: { cajaMovimientoId: "asc" } } } });
  igual("tres entregas, de dos cajas", [V1.entregas.length, new Set(V1.entregas.map((e) => e.turnoIdSnapshot)).size], [3, 2]);
  const sumaFotos = V1.entregas.reduce((s, e) => s + Math.round(Number(e.montoDeclaradoSnapshot) * 100), 0);
  igual("el declarado es la suma de las fotos: $110.000", [Number(V1.importeDeclarado), sumaFotos / 100], [110000, 110000]);
  igual("la diferencia es exacta: 109.500 − 110.000 = −500,00", V1.diferencia.toFixed(2), "-500.00");
  const foto1R = V1.entregas.find((e) => e.cajaMovimientoId === e1R.cajaMovimientoId);
  const foto1C = V1.entregas.find((e) => e.cajaMovimientoId === e1C.cajaMovimientoId);
  igual("foto RECAUDACION válida: clase, monto, turno, local, operador, instante",
    [foto1R.claseSnapshot, Number(foto1R.montoDeclaradoSnapshot), foto1R.turnoIdSnapshot, foto1R.localIdSnapshot, foto1R.operadorIdSnapshot, foto1R.instanteEntregaSnapshot.toISOString()],
    ["RECAUDACION", 50000, c1.turnoId, A.local.id, c1.op.id, new Date(e1R.instante).toISOString()]);
  igual("foto CIERRE válida: clase, monto, turno, local, operador, instante",
    [foto1C.claseSnapshot, Number(foto1C.montoDeclaradoSnapshot), foto1C.turnoIdSnapshot, foto1C.localIdSnapshot, foto1C.operadorIdSnapshot, foto1C.instanteEntregaSnapshot.toISOString()],
    ["CIERRE", 50000, c1.turnoId, A.local.id, c1.op.id, new Date(e1C.instante).toISOString()]);
  igual("nace vigente, sin anulación", [V1.estado, V1.vigente, V1.anuladaEn, V1.anuladaPorUsuarioId, V1.motivoAnulacion, V1.entregas.every((e) => e.vigente)],
    [ESTADO_VERIFICACION.VIGENTE, true, null, null, null, true]);

  // ── C. LO QUE LA BASE RECHAZA AL CREAR ───────────────────────────────────
  seccion("C. Datos que el armado no produciría");
  const antesC = await cuantas();
  rechazado("diferencia que no es verificado − declarado: rechazada",
    await intento(() => escribir(prisma, armar([e3C], 20000), (d) => ({ ...d, verificacion: { ...d.verificacion, diferencia: "0.01" } }))),
    /VerificacionEfectivo_diferencia_exacta/);
  rechazado("declarado distinto de la suma: rechazado al confirmar",
    await intento(() => escribir(prisma, armar([e3C], 20000), (d) => ({ ...d, verificacion: { ...d.verificacion, importeDeclarado: "20001.00", diferencia: "-1.00" } }))),
    /no es la suma de sus entregas/);
  rechazado("verificación sin entregas: rechazada al confirmar",
    await intento(() => escribir(prisma, armar([e3C], 20000), (d) => ({ ...d, entregas: [] }))),
    /no cubre ninguna entrega/);
  rechazado("foto con monto falso: rechazada",
    await intento(() => escribir(prisma, armar([{ ...e3C, montoDeclarado: 19000 }], 19000))),
    /no coincide con el movimiento real/);
  rechazado("foto con operador falso: rechazada",
    await intento(() => escribir(prisma, armar([{ ...e3C, operadorId: null }], 20000))),
    /no coincide con el movimiento real/);
  rechazado("foto con instante falso: rechazada",
    await intento(() => escribir(prisma, armar([{ ...e3C, instante: new Date(new Date(e3C.instante).getTime() - 1000) }], 20000))),
    /no coincide con el movimiento real/);
  rechazado("un CIERRE declarado como RECAUDACION: rechazado",
    await intento(() => escribir(prisma, armar([{ ...e3C, clase: "RECAUDACION" }], 20000))),
    /no es la del vínculo/);
  rechazado("un Caja − manual como RECAUDACION: rechazado",
    await intento(() => escribir(prisma, armar([{ cajaMovimientoId: retiroManual.id, clase: "RECAUDACION", montoDeclarado: 3000, instante: retiroManual.createdAt, turnoId: c5.turnoId, operadorId: c5.op.id }], 3000))),
    /no es una entrega: no es retiro de cierre ni de recaudación/);
  rechazado("un Caja + como CIERRE: rechazado",
    await intento(() => escribir(prisma, armar([{ cajaMovimientoId: ingresoManual.id, clase: "CIERRE", montoDeclarado: 5000, instante: ingresoManual.createdAt, turnoId: c5.turnoId, operadorId: c5.op.id }], 5000))),
    /no es un retiro/);
  rechazado("otra clase que RECAUDACION o CIERRE: rechazada por el enum",
    await intento(() => prisma.$transaction(async (tx) => {
      const v = await escribir(tx, armar([e3C], 20000), (d) => ({ ...d, entregas: [] }));
      await tx.$executeRawUnsafe(
        `INSERT INTO "VerificacionEfectivoEntrega" ("verificacionEfectivoId","cajaMovimientoId","montoDeclaradoSnapshot","localIdSnapshot","turnoIdSnapshot","claseSnapshot","instanteEntregaSnapshot")
         SELECT $1, m."id", m."monto", $2, m."turnoId", 'INGRESO', m."createdAt" FROM "CajaMovimiento" m WHERE m."id" = $3`,
        v.id, A.local.id, e3C.cajaMovimientoId);
    })),
    /ClaseEntregaEfectivo|22P02/);
  igual("ninguno de los rechazos dejó una fila", await cuantas(), antesC);

  // ── D. UNA ENTREGA, UNA SOLA VERIFICACIÓN VIGENTE ────────────────────────
  seccion("D. Exclusividad de la entrega");
  rechazado("otra verificación vigente sobre la misma entrega: rechazada",
    await intento(() => escribir(prisma, armar([e1C], 50000))),
    /P2002/);
  rechazado("la misma entrega dos veces en una verificación: rechazada",
    await intento(() => escribir(prisma, armar([e3C], 20000), (d) => ({ ...d, verificacion: { ...d.verificacion, importeDeclarado: "40000.00", importeVerificado: "40000.00", diferencia: "0.00" }, entregas: [d.entregas[0], d.entregas[0]] }))),
    /P2002/);
  igual("la entrega sigue en UNA verificación vigente",
    await prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId: e1C.cajaMovimientoId, vigente: true } }), 1);

  // ── E. CONCURRENCIA ──────────────────────────────────────────────────────
  seccion("E. Dos verificaciones simultáneas de la misma entrega");
  async function carrera(entrega, monto, primeraConfirma) {
    let soltar;
    const puedeTerminar = new Promise((r) => { soltar = r; });
    let avisarEscrita;
    const escrita = new Promise((r) => { avisarEscrita = r; });
    const primera = prisma.$transaction(async (tx) => {
      await escribir(tx, armar([entrega], monto));
      avisarEscrita();
      await puedeTerminar;
      if (!primeraConfirma) throw new Error("la primera se cae a propósito");
    }, { maxWait: 10_000, timeout: 60_000 }).then(() => ({ ok: true }), (e) => ({ ok: false, mensaje: e.message }));
    await Promise.race([escrita, primera]);
    const segunda = intento(() => prisma.$transaction((tx) => escribir(tx, armar([entrega], monto)), { maxWait: 10_000, timeout: 60_000 }));
    const enFila = await esperarEnFila(prisma, 1, 8_000);
    soltar();
    return { enFila, primera: await primera, segunda: await segunda };
  }
  {
    const r = await carrera(e3C, 20000, true);
    ok("la segunda queda esperando en el índice, no adivina", r.enFila >= 1, `en fila: ${r.enFila}`);
    ok("la primera confirma", r.primera.ok, r.primera.mensaje);
    rechazado("la segunda se rechaza al ver confirmada la primera", r.segunda, /P2002/);
    igual("una sola verificación vigente cubre la entrega",
      await prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId: e3C.cajaMovimientoId, vigente: true } }), 1);
  }
  {
    const r = await carrera(e6C, 40000, false);
    ok("si la primera se cae, la segunda esperaba", r.enFila >= 1, `en fila: ${r.enFila}`);
    aceptado("y entra, porque el índice solo cuenta lo confirmado", r.segunda);
    igual("una sola verificación vigente, la segunda",
      await prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId: e6C.cajaMovimientoId, vigente: true } }), 1);
  }

  // ── F. IDEMPOTENCIA POR LOCAL ────────────────────────────────────────────
  seccion("F. La clave de idempotencia es del local");
  rechazado("misma clave en el mismo local: rechazada",
    await intento(() => escribir(prisma, armar([e4C], 30000, { idempotencyKey: V1.idempotencyKey }))),
    /P2002/);
  const datosVB = armarVerificacionEfectivo({
    localId: B.local.id, entregas: [ebC], importeVerificado: 8000, verificadaPorUsuarioId: B.cuenta.id, idempotencyKey: V1.idempotencyKey,
  });
  const rVB = await intento(() => escribir(prisma, datosVB));
  aceptado("la misma clave en otro local: aceptada", rVB);
  if (rVB.ok) {
    const fotoB = await prisma.verificacionEfectivoEntrega.findFirst({ where: { verificacionEfectivoId: rVB.valor.id } });
    igual("la foto de un local sin operador lleva operador null", [fotoB?.operadorIdSnapshot, fotoB?.localIdSnapshot, Number(fotoB?.montoDeclaradoSnapshot)], [null, B.local.id, 8000]);
  }

  // ── G. ANULAR SIN PERDER HISTORIA ────────────────────────────────────────
  seccion("G. Anulación");
  const fotosAntes = JSON.stringify(V1.entregas.map(({ vigente, ...resto }) => resto));
  const rAnular = await intento(() => prisma.verificacionEfectivo.update({
    where: { id: V1.id }, data: datosDeAnulacion({ anuladaPorUsuarioId: A.cuenta.id, motivo: "Se contó el sobre equivocado" }),
  }));
  requerir("anula la verificación", rAnular.ok, rAnular.mensaje);
  const V1b = await prisma.verificacionEfectivo.findUnique({ where: { id: V1.id }, include: { entregas: { orderBy: { cajaMovimientoId: "asc" } } } });
  igual("la anulada sigue en la base con lo que se verificó",
    [V1b.estado, V1b.vigente, Number(V1b.importeDeclarado), Number(V1b.importeVerificado), V1b.diferencia.toFixed(2), V1b.motivoAnulacion, V1b.anuladaPorUsuarioId],
    ["ANULADA", false, 110000, 109500, "-500.00", "Se contó el sobre equivocado", A.cuenta.id]);
  igual("sus tres fotos siguen, intactas", JSON.stringify(V1b.entregas.map(({ vigente, ...resto }) => resto)), fotosAntes);
  igual("y dejaron de ser vigentes con el padre", V1b.entregas.map((e) => e.vigente), [false, false, false]);
  rechazado("anular dos veces: rechazado",
    await intento(() => prisma.verificacionEfectivo.update({ where: { id: V1.id }, data: { motivoAnulacion: "Otra vez" } })),
    /no se edita: solo se anula, una vez/);
  rechazado("una anulación sin motivo: rechazada",
    await intento(() => prisma.$executeRaw`UPDATE "VerificacionEfectivo" SET "estado" = 'ANULADA', "vigente" = false, "anuladaEn" = now(), "anuladaPorUsuarioId" = ${A.cuenta.id} WHERE id = ${rVB.valor?.id ?? 0}`),
    /VerificacionEfectivo_anulacion_completa/);
  rechazado("editar el verificado de una vigente: rechazado",
    await intento(() => prisma.verificacionEfectivo.update({ where: { id: rVB.valor?.id ?? 0 }, data: { importeVerificado: "8100.00", diferencia: "100.00" } })),
    /no se edita: solo se anula/);
  rechazado("anular cambiando el verificado: rechazado",
    await intento(() => prisma.verificacionEfectivo.update({ where: { id: rVB.valor?.id ?? 0 }, data: { ...datosDeAnulacion({ anuladaPorUsuarioId: B.cuenta.id, motivo: "x" }), importeVerificado: "8100.00", diferencia: "100.00" } })),
    /no cambia lo que se verificó/);
  rechazado("editar la foto de una entrega: rechazado",
    await intento(() => prisma.verificacionEfectivoEntrega.update({ where: { id: V1b.entregas[0].id }, data: { montoDeclaradoSnapshot: "1.00" } })),
    /no se edita/);
  rechazado("devolverle la vigencia a una entrega anulada: rechazado",
    await intento(() => prisma.$executeRaw`UPDATE "VerificacionEfectivoEntrega" SET "vigente" = true WHERE id = ${V1b.entregas[0].id}`),
    /no se edita|VerificacionEfectivoEntrega_verificacionEfectivoId_vigente_fkey/);
  const rV3 = await intento(() => escribir(prisma, armar([e1R, e1C, e2C], 110000)));
  aceptado("después de anular, las mismas entregas se verifican de nuevo", rV3);
  igual("cada entrega: una vigente y una anulada",
    await Promise.all([e1R, e1C, e2C].map(async (e) => [
      await prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId: e.cajaMovimientoId, vigente: true } }),
      await prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId: e.cajaMovimientoId, vigente: false } }),
    ])),
    [[1, 1], [1, 1], [1, 1]]);

  // ── H. EL MOVIMIENTO CORREGIDO DESPUÉS ───────────────────────────────────
  seccion("H. Corrección del movimiento después de verificar");
  const rV4 = await intento(() => escribir(prisma, armar([e4C], 30000)));
  requerir("verifica la entrega de $30.000", rV4.ok, rV4.mensaje);
  // Lo que haría una corrección histórica: reescribir el importe del movimiento.
  await prisma.cajaMovimiento.update({ where: { id: e4C.cajaMovimientoId }, data: { monto: 29000 } });
  const foto4 = await prisma.verificacionEfectivoEntrega.findFirst({ where: { verificacionEfectivoId: rV4.valor.id } });
  const V4 = await prisma.verificacionEfectivo.findUnique({ where: { id: rV4.valor.id } });
  igual("la foto y la verificación no se movieron", [Number(foto4.montoDeclaradoSnapshot), Number(V4.importeDeclarado), V4.estado], [30000, 30000, "VIGENTE"]);
  const actual = (await entregasDe(A)).find((e) => e.cajaMovimientoId === e4C.cajaMovimientoId);
  igual("la lectura ya dice $29.000", actual?.montoDeclarado, 29000);
  igual("el cambio se detecta comparando foto contra movimiento", entregaDesactualizada(foto4.montoDeclaradoSnapshot, actual?.montoDeclarado), true);
  const desactualizadas = await prisma.$queryRaw`
    SELECT e."id" FROM "VerificacionEfectivoEntrega" e
      JOIN "CajaMovimiento" m ON m."id" = e."cajaMovimientoId"
     WHERE e."vigente" AND e."localIdSnapshot" = ${A.local.id} AND e."montoDeclaradoSnapshot" <> m."monto"`;
  igual("y por SQL: es la única vigente desactualizada del local", desactualizadas.map((x) => x.id), [foto4.id]);
  await prisma.verificacionEfectivo.update({ where: { id: V4.id }, data: datosDeAnulacion({ anuladaPorUsuarioId: A.cuenta.id, motivo: "El movimiento se corrigió" }) });
  rechazado("verificar de nuevo con la foto vieja: rechazado",
    await intento(() => escribir(prisma, armar([e4C], 30000))),
    /no coincide con el movimiento real/);
  aceptado("verificar de nuevo con el importe corregido: aceptado", await intento(() => escribir(prisma, armar([actual], 29000))));

  // ── I. SIN MEZCLAR LOCALES ───────────────────────────────────────────────
  // Con una entrega del B que nadie verificó: si no, la rechazaría la
  // exclusividad y no se sabría si la frena el local.
  seccion("I. Una verificación es de un solo local");
  rechazado("una entrega del local B en una verificación del A: rechazada",
    await intento(() => escribir(prisma, armar([eb2C], 6000))),
    /no coincide con el movimiento real/);
  rechazado("la foto con el local real B bajo un padre del A: rechazada",
    await intento(() => escribir(prisma, armar([eb2C], 6000), (d) => ({ ...d, entregas: d.entregas.map((e) => ({ ...e, localIdSnapshot: B.local.id })) }))),
    /VerificacionEfectivoEntrega_verificacionEfectivoId_localId_fkey|P2003/);
  igual("la entrega del B sigue sin verificar", await prisma.verificacionEfectivoEntrega.count({ where: { cajaMovimientoId: eb2C.cajaMovimientoId } }), 0);

  // ── J. NADA SE BORRA ─────────────────────────────────────────────────────
  seccion("J. Sin borrado ni cascada destructiva");
  const fks = await prisma.$queryRaw`
    SELECT c.conname, c.confdeltype::text AS al_borrar, cl.relname AS tabla
      FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid
     WHERE c.contype = 'f' AND cl.relname IN ('VerificacionEfectivo', 'VerificacionEfectivoEntrega')
     ORDER BY c.conname`;
  igual("las seis FK existen", fks.length, 6);
  igual("ninguna borra en cascada ni anula: todas RESTRICT", fks.filter((f) => f.al_borrar !== "r").map((f) => f.conname), []);
  rechazado("borrar una verificación: rechazado",
    await intento(() => prisma.verificacionEfectivo.delete({ where: { id: V1.id } })),
    /no se borran: se anulan/);
  rechazado("borrar una entrega verificada: rechazado",
    await intento(() => prisma.verificacionEfectivoEntrega.delete({ where: { id: V1b.entregas[0].id } })),
    /no se borran: se anulan/);
  rechazado("borrar el movimiento verificado: rechazado",
    await intento(() => prisma.$executeRaw`DELETE FROM "CajaMovimiento" WHERE id = ${e2C.cajaMovimientoId}`),
    /VerificacionEfectivoEntrega_cajaMovimientoId_fkey/);
  rechazado("borrar el local: rechazado",
    await intento(() => prisma.$executeRaw`DELETE FROM "Local" WHERE id = ${B.local.id}`),
    /violates foreign key constraint|23503/);
  igual("la anulada y sus fotos siguen ahí",
    [await prisma.verificacionEfectivo.count({ where: { id: V1.id } }), await prisma.verificacionEfectivoEntrega.count({ where: { verificacionEfectivoId: V1.id } })], [1, 3]);

  // ── K. NINGUNA IDENTIDAD DE TURNO COMERCIAL ──────────────────────────────
  seccion("K. Lo que la base NO guarda");
  const columnas = await prisma.$queryRaw`
    SELECT table_name AS tabla, column_name AS columna FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name IN ('VerificacionEfectivo', 'VerificacionEfectivoEntrega')
     ORDER BY table_name, ordinal_position`;
  const de_ = (t) => columnas.filter((c) => c.tabla === t).map((c) => c.columna).sort();
  igual("las columnas de la verificación son exactamente estas", de_("VerificacionEfectivo"), [
    "anuladaEn", "anuladaPorUsuarioId", "createdAt", "diferencia", "estado", "id", "idempotencyKey", "importeDeclarado",
    "importeVerificado", "localId", "motivoAnulacion", "observacion", "verificadaEn", "verificadaPorOperadorId",
    "verificadaPorUsuarioId", "vigente",
  ]);
  igual("las de la entrega, exactamente estas", de_("VerificacionEfectivoEntrega"), [
    "cajaMovimientoId", "claseSnapshot", "id", "instanteEntregaSnapshot", "localIdSnapshot", "montoDeclaradoSnapshot",
    "operadorIdSnapshot", "turnoIdSnapshot", "verificacionEfectivoId", "vigente",
  ]);
  igual("ninguna es turno comercial, franja ni fecha comercial",
    columnas.filter((c) => /comercial|franja|fecha|dia/i.test(c.columna)).map((c) => c.columna), []);
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
