// UNA VENTA NO ENTRA EN UNA CAJA QUE YA TOMÓ EL CORTE — contra PostgreSQL, con
// los handlers reales y las carreras FORZADAS (scripts/pruebas-db/carreraForzada.mjs).
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/carreraVentaCorte.mjs
//
// El caso que la motivó (R2c, auditoría de #130): `crear` validaba que el turno
// estuviera operativo ANTES de su transacción, esperaba el candado del local, y
// mientras tanto el corte de caja se tomaba. Cuando `crear` conseguía el
// candado escribía la venta en un turno ya cortado, después de la frontera que
// el corte acababa de congelar: corte con 0 ventas, venta con 200.
//
// Lo que se ejerce:
//   1. R2c contra el corte (`cierres/iniciar`): el corte gana y la venta no entra;
//   2. R2c contra el cierre directo (`turnos/cerrar`);
//   3. la carrera inversa: la venta ya está adentro y el corte la espera y la
//      incluye; y la venta que ya comprobó su turno pero todavía no escribió
//      también hace esperar al corte (3b: lo que la relectura sola no cubre);
//   4. dos ventas alrededor de la frontera: la de antes entra, la de después no;
//   5. un cobro offline PENDIENTE: el corte se niega mientras la venta no entró;
//      y uno en revisión, que no frena el corte, tampoco entra después;
//   6. idempotencia: reintentar la venta rechazada no la escribe, y una venta ya
//      escrita se sigue reconociendo como duplicada;
//   7. ventas, corte y retiro a la vez sobre la misma caja: ningún deadlock.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { retenerCandadoDelLocal, retenerFilaDeStock, retenerCobroOffline, esperarEnCandadoDelLocal, esperarEnFila } = await import("./carreraForzada.mjs");
const { firmarTokenOperador, firmarVoucherOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { cuerpoDeReplay } = await import("../../lib/pos-ventas/sincronizacionOffline.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaRegistrar = await import("../../app/api/pos-ventas/cobros-offline/registrar/route.js");
const rutaIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");
const rutaRetiro = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");

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

const SECRETO = process.env.AUTH_SECRET;
const BASE = "http://ci/api/pos-ventas";
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const pedido = (url, quien, cuerpo) => {
  const cookie = [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
  const req = new Request(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};

const marca = `ci-venta-corte-${Date.now()}`;
const creado = { grupoId: null, localId: null, usuarioId: null, rolId: null, operadorIds: [] };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["pos.usar"] } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.localId = local.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });
  const cuenta = await prisma.usuario.create({
    data: { nombre: `${marca}-cuenta`, email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  creado.usuarioId = cuenta.id;
  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-producto`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });
  const sesion = jwt.sign({ id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, localId: local.id, permisos: ["pos.usar"] }, SECRETO, { expiresIn: "1h" });
  return { grupo, local, cuenta, producto, sesion };
}

async function desmontar() {
  if (!creado.localId) return;
  const localId = creado.localId;
  const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
  await prisma.cobroOffline.deleteMany({ where: { localId } });
  await prisma.auditoriaBitacora.deleteMany({ where: { localId } });
  await prisma.clientePuntoMovimiento.deleteMany({ where: { localId } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId } } });
  await prisma.venta.deleteMany({ where: { localId } });
  await prisma.retiroPreparacion.deleteMany({ where: { localId } });
  await prisma.cambioPendiente.deleteMany({ where: { localId } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId } });
  // MovimientoStock no se borra: el libro de stock lo prohíbe (y cobrosOffline.mjs tampoco lo hace).
  await prisma.stockLocal.deleteMany({ where: { localId } });
  await prisma.productoLocal.deleteMany({ where: { localId } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { localId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
  await prisma.usuario.deleteMany({ where: { id: creado.usuarioId } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: localId } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

async function correr() {
  const f = await montar();
  let n = 0;
  const nuevoId = (etiqueta) => `${marca}-${etiqueta}-${(n += 1)}`;

  /** Una caja nueva: un operador nuevo con su turno abierto por la ruta real. */
  async function nuevaCaja() {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: f.local.id } });
    const quien = { sesion: f.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: f.local.id }) };
    const r = await leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000 })));
    requerir("abre la caja", r.ok === true, `${r.status} ${r.error ?? ""}`);
    return { op, quien, turnoId: r.turno.id, voucher: firmarVoucherOperador({ operadorId: op.id, localId: f.local.id }) };
  }

  /** El pedido de una venta online, en efectivo, por el total exacto. */
  const ventaOnline = (caja, id, cantidad = 1) => ({
    clientTxnId: id,
    localId: f.local.id,
    clienteId: null,
    turnoId: caja.turnoId,
    formaPago: "efectivo",
    esFiado: false,
    descuento: 0,
    descuentoPorPuntos: 0,
    puntosCanje: 0,
    items: [itemCrearPayload({ productoBaseId: f.producto.baseId, nombre: "P", precio: 1000, cantidad, precioCosto: 600 })],
  });
  /** El ítem de la cola offline, como lo arma la pantalla. */
  const cobroCola = (caja, id) => ({
    clientVentaId: id, createdAt: Date.now(), localId: f.local.id, grupoId: f.grupo.id, userId: f.cuenta.id,
    formaPago: "efectivo", subtotal: 1000, descuento: 0, descuentoPorPuntos: 0, total: 1000, clienteId: null,
    operadorId: caja.op.id, operadorVoucher: caja.voucher, turnoId: caja.turnoId,
    items: [itemCrearPayload({ productoBaseId: f.producto.baseId, nombre: "P", precio: 1000, cantidad: 1, precioCosto: 600 })],
  });

  const crear = async (caja, cuerpo) => leer(await rutaCrear.POST(pedido(`${BASE}/crear`, caja.quien, cuerpo)));
  const registrar = async (caja, c) => {
    const r = await leer(await rutaRegistrar.POST(pedido(`${BASE}/cobros-offline/registrar`, caja.quien, { relojDispositivo: Date.now(), cobros: [c] })));
    return r.resultados?.[0] ?? { error: r.error, status: r.status };
  };
  const iniciar = async (caja) => leer(await rutaIniciar.POST(pedido(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: {} })));
  const cerrar = async (caja) => leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, caja.quien, { turnoId: caja.turnoId, montoRealEfectivo: 1000 })));
  const retiro = async (caja) => leer(await rutaRetiro.POST(pedido(`${BASE}/retiros/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: {} })));

  const ventaDe = (id) => prisma.venta.findUnique({ where: { clientTxnId: id }, select: { id: true, turnoId: true } });
  const cobroDe = (id) => prisma.cobroOffline.findUnique({ where: { clientTxnId: id }, select: { estado: true, ultimoRechazoCodigo: true } });
  const corteDe = (turnoId) => prisma.cierrePreparacion.findFirst({
    where: { turnoId },
    select: { ultimaVentaId: true, cantidadVentasCorte: true, efectivoEsperadoCorte: true },
  });
  const turnoDe = (id) => prisma.turno.findUnique({ where: { id } });
  /** Todo lo económico del local. */
  const huella = async () => ({
    ventas: await prisma.venta.count({ where: { localId: f.local.id } }),
    detalles: await prisma.ventaDetalle.count({ where: { venta: { localId: f.local.id } } }),
    pagos: await prisma.ventaPago.count({ where: { venta: { localId: f.local.id } } }),
    stock: Number((await prisma.stockLocal.aggregate({ where: { localId: f.local.id }, _sum: { cantidad: true } }))._sum.cantidad ?? 0),
    movimientosStock: await prisma.movimientoStock.count({ where: { localId: f.local.id } }),
    movimientosCaja: await prisma.cajaMovimiento.count({ where: { turno: { localId: f.local.id } } }),
    contador: (await prisma.posVentaCounter.findUnique({ where: { localId: f.local.id }, select: { ultimoNumero: true } }))?.ultimoNumero ?? null,
  });
  /** Las ventas de una caja que quedaron DESPUÉS de la frontera de su corte. */
  const fueraDeLaFrontera = async (turnoId) => {
    const corte = await corteDe(turnoId);
    if (!corte) return [];
    return prisma.venta.findMany({
      where: { turnoId, ...(corte.ultimaVentaId == null ? {} : { id: { gt: corte.ultimaVentaId } }) },
      select: { id: true, clientTxnId: true },
    });
  };

  /**
   * La venta valida su turno, queda esperando el candado del local, y mientras
   * tanto corre `accion` (el corte o el cierre). Devuelve las dos respuestas.
   */
  async function ventaDetenidaEnElCandado(caja, cuerpo, accion) {
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pVenta; let resultadoAccion; let esperando = 0;
    try {
      pVenta = crear(caja, cuerpo);
      esperando = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 10_000);
      resultadoAccion = await accion();
    } finally {
      await candado.soltar();
    }
    return { venta: await pVenta, accion: resultadoAccion, esperando };
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. R2c: la venta validó su turno, el CORTE gana y la venta no entra");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("r2c-corte");
    const antes = await huella();
    const { venta, accion: corte, esperando } = await ventaDetenidaEnElCandado(caja, ventaOnline(caja, id), () => iniciar(caja));
    requerir("la venta ya había validado el turno y esperaba el candado", esperando === 1, `${esperando}`);
    ok("el corte se toma", corte.ok === true, `${corte.status} ${corte.error ?? ""}`);
    ok("la venta se rechaza: 403 TURNO_EN_CORTE", venta.status === 403 && venta.code === "TURNO_EN_CORTE" && venta.turnoEnPreparacionDeCierre === true,
      `${venta.status} ${venta.code} ${venta.error ?? ""}`);
    ok("la venta no existe", (await ventaDe(id)) === null);
    igual("ningún efecto económico: ventas, líneas, pagos, stock, movimientos, caja, contador", await huella(), antes);
    const c = await corteDe(caja.turnoId);
    igual("el corte sigue igual: 0 ventas, el esperado de la apertura", [c.cantidadVentasCorte, Number(c.efectivoEsperadoCorte), c.ultimaVentaId], [0, 1000, null]);
    ok("el turno sigue cortado", (await turnoDe(caja.turnoId)).cierreEnPreparacionEn !== null);
    igual("ninguna venta fuera de la frontera", await fueraDeLaFrontera(caja.turnoId), []);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. R2c contra el cierre directo (turnos/cerrar)");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("r2c-cierre");
    const antes = await huella();
    const { venta, accion: cierre } = await ventaDetenidaEnElCandado(caja, ventaOnline(caja, id), () => cerrar(caja));
    ok("el cierre pasa", cierre.ok === true, `${cierre.status} ${cierre.error ?? ""}`);
    ok("la venta se rechaza: 403 TURNO_CERRADO", venta.status === 403 && venta.code === "TURNO_CERRADO", `${venta.status} ${venta.code} ${venta.error ?? ""}`);
    ok("la venta no existe", (await ventaDe(id)) === null);
    // El cierre crea su arqueo y, si hay, su retiro: lo que no puede cambiar es lo de la venta.
    const despues = await huella();
    igual("ningún efecto de la venta", { ...despues, movimientosCaja: 0 }, { ...antes, movimientosCaja: 0 });
    const t = await turnoDe(caja.turnoId);
    igual("el turno cerrado con 0 ventas", [t.cierre !== null, t.cantidadVentas], [true, 0]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. Inversa: la venta ya está adentro, el corte la espera y la incluye");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("inversa");
    // La venta queda detenida DESPUÉS de escribirse, con el turno tomado.
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pCorte; let enFila1 = 0; let enFila2 = 0;
    try {
      pVenta = crear(caja, ventaOnline(caja, id));
      enFila1 = await esperarEnFila(prisma, 1, 10_000);
      pCorte = iniciar(caja);
      enFila2 = await esperarEnFila(prisma, 2, 10_000);
    } finally {
      await fila.soltar();
    }
    const [venta, corte] = await Promise.all([pVenta, pCorte]);
    ok("la venta quedó detenida con el turno tomado, y el corte la esperó", enFila1 >= 1 && enFila2 >= 2, `${enFila1} ${enFila2}`);
    ok("la venta entra", venta.ok === true, `${venta.status} ${venta.error ?? ""}`);
    ok("el corte se toma después", corte.ok === true, `${corte.status} ${corte.error ?? ""}`);
    const v = await ventaDe(id);
    const c = await corteDe(caja.turnoId);
    igual("el corte la incluye: 1 venta, su frontera es ésa, esperado 1000 + 1000", [c.cantidadVentasCorte, c.ultimaVentaId, Number(c.efectivoEsperadoCorte)], [1, v.id, 2000]);
    igual("ninguna venta fuera de la frontera", await fueraDeLaFrontera(caja.turnoId), []);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3b. La venta ya comprobó su turno y TODAVÍA no escribió: el corte espera");

  {
    // El hueco que la relectura sola no cierra: entre comprobar el turno y
    // escribir la venta, un corte que entra tiene que esperar. Se detiene a
    // `crear` ahí reteniendo la fila del cobro offline, que `crear` lee con
    // FOR UPDATE en ese punto. El cobro está en revisión para que el corte no lo
    // cuente y no se niegue por eso: lo que lo tiene que frenar es el turno.
    const caja = await nuevaCaja();
    const id = nuevoId("hueco");
    const c = cobroCola(caja, id);
    await registrar(caja, c);
    await prisma.cobroOffline.update({ where: { clientTxnId: id }, data: { estado: "REQUIERE_REVISION" } }); // estado forzado en la base de prueba
    const cobroFila = await retenerCobroOffline(prisma, id);
    let pVenta; let pCorte; let enFila1 = 0; let enFila2 = 0;
    try {
      pVenta = crear(caja, cuerpoDeReplay(c, caja.turnoId));
      enFila1 = await esperarEnFila(prisma, 1, 10_000);
      pCorte = iniciar(caja);
      enFila2 = await esperarEnFila(prisma, 2, 3_000);
    } finally {
      await cobroFila.soltar();
    }
    const [venta, corte] = await Promise.all([pVenta, pCorte]);
    ok("crear quedó detenido después de comprobar el turno", enFila1 >= 1, `${enFila1}`);
    ok("el corte esperó al turno tomado por la venta", enFila2 >= 2, `${enFila2}`);
    ok("la venta entra y el corte se toma después", venta.ok === true && corte.ok === true, `${venta.status} ${venta.code} / ${corte.status} ${corte.code}`);
    const v = await ventaDe(id);
    const cp = await corteDe(caja.turnoId);
    igual("el corte la incluye", [cp?.cantidadVentasCorte, cp?.ultimaVentaId], [1, v?.id]);
    igual("ninguna venta fuera de la frontera", await fueraDeLaFrontera(caja.turnoId), []);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3c. Lo mismo contra el cierre directo: el cierre espera a la venta");

  {
    // Por esto el turno se toma FOR SHARE y no FOR KEY SHARE: el UPDATE de
    // `turnos/cerrar` toma FOR NO KEY UPDATE, que con KEY SHARE no choca, y el
    // cierre se confirmaría ANTES de que la venta se escriba en su turno.
    //
    // Lo que no se afirma acá: `turnos/cerrar` calcula sus totales antes de su
    // transacción, así que aun esperando cierra con totales que no ven esta
    // venta. Es de esa ruta, anterior a esto y fuera de este cambio.
    const caja = await nuevaCaja();
    const id = nuevoId("hueco-cierre");
    const c = cobroCola(caja, id);
    await registrar(caja, c);
    await prisma.cobroOffline.update({ where: { clientTxnId: id }, data: { estado: "REQUIERE_REVISION" } }); // estado forzado en la base de prueba
    const cobroFila = await retenerCobroOffline(prisma, id);
    let pVenta; let pCierre; let enFila2 = 0; let cierreAntesDeSoltar = null;
    try {
      pVenta = crear(caja, cuerpoDeReplay(c, caja.turnoId));
      await esperarEnFila(prisma, 1, 10_000);
      let terminado = false;
      pCierre = cerrar(caja).then((r) => { terminado = true; return r; });
      enFila2 = await esperarEnFila(prisma, 2, 3_000);
      await new Promise((r) => setTimeout(r, 300));
      cierreAntesDeSoltar = terminado;
    } finally {
      await cobroFila.soltar();
    }
    const [venta, cierre] = await Promise.all([pVenta, pCierre]);
    ok("el cierre esperó al turno tomado por la venta: no terminó antes de que la venta siguiera", enFila2 >= 2 && cierreAntesDeSoltar === false,
      `${enFila2} ${cierreAntesDeSoltar}`);
    ok("la venta entra y el cierre se confirma después", venta.ok === true && cierre.ok === true, `${venta.status} ${venta.code} / ${cierre.status}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. Dos ventas alrededor de la frontera");

  {
    const caja = await nuevaCaja();
    const idA = nuevoId("antes");
    const idB = nuevoId("despues");
    const ventaA = await crear(caja, ventaOnline(caja, idA));
    requerir("A entra antes del corte", ventaA.ok === true, `${ventaA.status} ${ventaA.error ?? ""}`);
    const { venta: ventaB, accion: corte } = await ventaDetenidaEnElCandado(caja, ventaOnline(caja, idB, 2), () => iniciar(caja));
    ok("el corte se toma con B esperando", corte.ok === true);
    ok("B se rechaza: TURNO_EN_CORTE", ventaB.status === 403 && ventaB.code === "TURNO_EN_CORTE", `${ventaB.status} ${ventaB.code}`);
    const a = await ventaDe(idA);
    ok("A existe y B no", a?.turnoId === caja.turnoId && (await ventaDe(idB)) === null);
    const c = await corteDe(caja.turnoId);
    igual("el corte incluye A y no B: 1 venta, frontera en A, esperado 2000", [c.cantidadVentasCorte, c.ultimaVentaId, Number(c.efectivoEsperadoCorte)], [1, a.id, 2000]);
    igual("una sola venta con cada id", [await prisma.venta.count({ where: { clientTxnId: idA } }), await prisma.venta.count({ where: { clientTxnId: idB } })], [1, 0]);

    // Y con A EN VUELO cuando llegan B y el corte: lo que entra queda adentro
    // de la frontera, y lo que queda afuera no existe.
    const caja2 = await nuevaCaja();
    const idA2 = nuevoId("en-vuelo-a");
    const idB2 = nuevoId("en-vuelo-b");
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pA; let pB; let pCorte;
    try {
      pA = crear(caja2, ventaOnline(caja2, idA2));
      await esperarEnFila(prisma, 1, 10_000);
      pB = crear(caja2, ventaOnline(caja2, idB2));
      await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 10_000);
      pCorte = iniciar(caja2);
      await esperarEnFila(prisma, 2, 10_000);
    } finally {
      await fila.soltar();
    }
    const [rA, rB, rCorte] = await Promise.all([pA, pB, pCorte]);
    ok("A entra y el corte se toma", rA.ok === true && rCorte.ok === true, `${rA.status} ${rCorte.status}`);
    const entraB = rB.ok === true;
    ok("B entra o se rechaza con TURNO_EN_CORTE, nada más", entraB || (rB.status === 403 && rB.code === "TURNO_EN_CORTE"), `${rB.status} ${rB.code}`);
    igual("ninguna venta fuera de la frontera", await fueraDeLaFrontera(caja2.turnoId), []);
    const c2 = await corteDe(caja2.turnoId);
    igual("el corte cuenta exactamente las que existen", c2.cantidadVentasCorte, await prisma.venta.count({ where: { turnoId: caja2.turnoId } }));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5. Cobro offline: PENDIENTE frena el corte; en revisión no entra después");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("offline-pendiente");
    const c = cobroCola(caja, id);
    igual("registrado PENDIENTE", (await registrar(caja, c)).estado, "PENDIENTE");
    const { venta, accion: corte } = await ventaDetenidaEnElCandado(caja, cuerpoDeReplay(c, caja.turnoId), () => iniciar(caja));
    ok("el corte se niega: el cobro sigue PENDIENTE", corte.status === 409 && corte.code === "COBROS_OFFLINE_PENDIENTES", JSON.stringify(corte));
    ok("la venta entra en su caja y el cobro queda SINCRONIZADA", venta.ok === true && (await ventaDe(id))?.turnoId === caja.turnoId
      && (await cobroDe(id)).estado === "SINCRONIZADA", `${venta.status} ${venta.code}`);
    const corte2 = await iniciar(caja);
    const cp = await corteDe(caja.turnoId);
    ok("el corte siguiente la incluye", corte2.ok === true && cp.cantidadVentasCorte === 1 && cp.ultimaVentaId === (await ventaDe(id)).id, JSON.stringify(cp));

    // Un cobro en revisión no frena el corte; la venta que llega tarde no entra.
    const caja2 = await nuevaCaja();
    const id2 = nuevoId("offline-revision");
    const c2 = cobroCola(caja2, id2);
    await registrar(caja2, c2);
    await prisma.cobroOffline.update({ where: { clientTxnId: id2 }, data: { estado: "REQUIERE_REVISION" } }); // estado forzado en la base de prueba
    const antes = await huella();
    const { venta: v2, accion: corteRev } = await ventaDetenidaEnElCandado(caja2, cuerpoDeReplay(c2, caja2.turnoId), () => iniciar(caja2));
    ok("el corte pasa: en revisión no cuenta", corteRev.ok === true, `${corteRev.status} ${corteRev.code}`);
    ok("la venta se rechaza: TURNO_EN_CORTE", v2.status === 403 && v2.code === "TURNO_EN_CORTE", `${v2.status} ${v2.code}`);
    ok("no existe, y el cobro sigue en revisión con el rechazo anotado", (await ventaDe(id2)) === null
      && (await cobroDe(id2)).estado === "REQUIERE_REVISION" && (await cobroDe(id2)).ultimoRechazoCodigo === "TURNO_EN_CORTE", JSON.stringify(await cobroDe(id2)));
    igual("ningún efecto económico", await huella(), antes);
    igual("ninguna venta fuera de la frontera", await fueraDeLaFrontera(caja2.turnoId), []);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("6. Idempotencia: reintentar la rechazada no la escribe; la escrita sigue siendo duplicada");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("reintento");
    const cuerpo = ventaOnline(caja, id);
    const { venta } = await ventaDetenidaEnElCandado(caja, cuerpo, () => iniciar(caja));
    requerir("perdió contra el corte", venta.code === "TURNO_EN_CORTE", `${venta.status} ${venta.code}`);
    const antes = await huella();
    const otra = await crear(caja, cuerpo);
    ok("el reintento con el mismo clientTxnId: otra vez TURNO_EN_CORTE", otra.status === 403 && otra.code === "TURNO_EN_CORTE", `${otra.status} ${otra.code}`);
    ok("y no existe ninguna venta con ese id", (await prisma.venta.count({ where: { clientTxnId: id } })) === 0);
    igual("sin efectos", await huella(), antes);

    // La venta que SÍ entró antes del corte (la respuesta se perdió): el
    // reintento después del corte la reconoce, no se rechaza ni se duplica.
    const caja2 = await nuevaCaja();
    const id2 = nuevoId("ya-escrita");
    const cuerpo2 = ventaOnline(caja2, id2);
    const primera = await crear(caja2, cuerpo2);
    requerir("entra", primera.ok === true);
    requerir("el corte se toma después", (await iniciar(caja2)).ok === true);
    const reintento = await crear(caja2, cuerpo2);
    ok("el reintento después del corte: la misma venta, como duplicada", reintento.ok === true && reintento.isDuplicate === true && reintento.ventaId === primera.ventaId,
      `${reintento.status} ${reintento.code} ${reintento.ventaId}`);
    igual("una sola venta con ese id", await prisma.venta.count({ where: { clientTxnId: id2 } }), 1);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("7. Ventas, corte y retiro a la vez sobre la misma caja: sin deadlock");

  {
    const ERRORES_DE_BLOQUEO = /deadlock|40P01|P2034|could not serialize|Transaction already closed|timed out/i;
    let deadlocks = 0;
    let fuera = 0;
    let quintos = 0;
    let ventasOk = 0;
    let cortesOk = 0;
    for (let ronda = 0; ronda < 6; ronda++) {
      const caja = await nuevaCaja();
      const ids = [nuevoId("rafaga"), nuevoId("rafaga"), nuevoId("rafaga"), nuevoId("rafaga")];
      const errores = [];
      const capturar = (p) => p.catch((e) => { errores.push(String(e?.message ?? e)); return { status: 0, error: String(e) }; });
      // Las ventas salen primero; el retiro y el corte, cuando ya hay ventas
      // peleando el candado del local: así unas entran antes y otras quedan del
      // otro lado de la frontera, que es la carrera que hay que medir.
      const ventas = ids.map((id) => capturar(crear(caja, ventaOnline(caja, id))));
      await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
      const resultados = await Promise.all([
        ...ventas,
        capturar(ronda % 2 === 0 ? retiro(caja) : Promise.resolve({ ok: true })),
        capturar(ronda % 3 === 2 ? cerrar(caja) : iniciar(caja)),
      ]);
      const textos = [...errores, ...resultados.map((r) => `${r.error ?? ""}`)];
      deadlocks += textos.filter((t) => ERRORES_DE_BLOQUEO.test(t)).length;
      fuera += (await fueraDeLaFrontera(caja.turnoId)).length;
      const estados = resultados.map((r) => (r.ok ? "ok" : `${r.status}${r.code ? `:${r.code}` : ""}`));
      console.log(`    ronda ${ronda + 1}: ventas ${estados.slice(0, 4).join(" ")} · retiro ${estados[4]} · ${ronda % 3 === 2 ? "cierre" : "corte"} ${estados[5]}`);
      quintos += resultados.filter((r) => r.status >= 500 || r.status === 0).length;
      ventasOk += resultados.slice(0, 4).filter((r) => r.ok).length;
      cortesOk += resultados[5].ok ? 1 : 0;
    }
    igual("ningún 5xx ni excepción", quintos, 0);
    ok("hubo ventas que entraron y cortes o cierres que se tomaron (la carrera ocurrió)", ventasOk > 0 && cortesOk === 6, `${ventasOk} ventas, ${cortesOk} cortes`);
    igual("ningún deadlock ni transacción vencida en seis rondas", deadlocks, 0);
    igual("ninguna venta fuera de la frontera de su corte", fuera, 0);
  }
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
  process.exit(1);
}
