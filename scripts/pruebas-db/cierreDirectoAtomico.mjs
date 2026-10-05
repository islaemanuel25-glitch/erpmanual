// EL CIERRE DIRECTO CONGELA LO QUE DE VERDAD QUEDÓ EN EL TURNO — contra
// PostgreSQL, con los handlers reales y las carreras FORZADAS
// (scripts/pruebas-db/carreraForzada.mjs).
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/cierreDirectoAtomico.mjs
//
// El caso que la motivó (auditoría de #131): `turnos/cerrar` calculaba ventas,
// efectivo esperado y diferencia ANTES de su transacción. Una venta que
// confirmaba entre ese cálculo y el cierre quedaba en el turno cerrado sin estar
// en sus totales: cantidadVentas 0 con 1 venta y una diferencia inventada.
//
// La regla que se ejerce: nunca "la venta es del turno y el cierre no la contó".
//   1. la venta gana: el cierre la espera y la fotografía la incluye —cantidad,
//      totales, esperado, diferencia, arqueo FINAL, retiro—, con diferencia 0
//      cuando lo contado es lo que hay;
//   2. el cierre gana: la venta se rechaza (#131) y la fotografía sigue correcta;
//   3. dos ventas alrededor del cierre;
//   4. cobro offline: el que está entrando, entra y se cuenta; el PENDIENTE frena;
//   5. doble cierre: un solo arqueo FINAL, un solo retiro;
//   6. rondas de ventas, cierres dobles y cobros a la vez: sin deadlock y sin
//      fotografía fuera de la frontera.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { turnoOperativoDeSesion } = await import("./fixtureTurnoOperativo.mjs");
const { retenerCandadoDelLocal, retenerFilaDeStock, esperarEnCandadoDelLocal, esperarEnFila } = await import("./carreraForzada.mjs");
const { firmarTokenOperador, firmarVoucherOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { cuerpoDeReplay } = await import("../../lib/pos-ventas/sincronizacionOffline.js");
const { calcularEfectivoEsperado } = await import("../../lib/caja/efectivoEsperado.js");
const { whereVentaComercial } = await import("../../lib/ventas/filtroVentaComercial.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaRegistrar = await import("../../app/api/pos-ventas/cobros-offline/registrar/route.js");
const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");

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

const marca = `ci-cierre-directo-${Date.now()}`;
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
  await prisma.cambioPendiente.deleteMany({ where: { localId } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.updateMany({ where: { localId }, data: { retiroCierreMovimientoId: null } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId } });
  // MovimientoStock no se borra: el libro de stock lo prohíbe.
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

  async function nuevaCaja() {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: f.local.id } });
    const quien = { sesion: f.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: f.local.id }) };
    const r = await leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000, turnoOperativoId: await turnoOperativoDeSesion(prisma, quien) })));
    requerir("abre la caja con $1.000", r.ok === true, `${r.status} ${r.error ?? ""}`);
    return { op, quien, turnoId: r.turno.id, voucher: firmarVoucherOperador({ operadorId: op.id, localId: f.local.id }) };
  }
  const ventaOnline = (caja, id) => ({
    clientTxnId: id, localId: f.local.id, clienteId: null, turnoId: caja.turnoId, formaPago: "efectivo",
    esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
    items: [itemCrearPayload({ productoBaseId: f.producto.baseId, nombre: "P", precio: 1000, cantidad: 1, precioCosto: 600 })],
  });
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
  /** Cierra con el reparto sugerido: deja el fondo de apertura y retira el resto. */
  const cerrar = async (caja, contado) =>
    leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, caja.quien, { turnoId: caja.turnoId, montoRealEfectivo: contado })));
  const ventaDe = (id) => prisma.venta.findUnique({ where: { clientTxnId: id }, select: { id: true, turnoId: true } });

  /**
   * Lo que el cierre persistió, contra lo que hay de verdad en el turno: las
   * ventas comerciales que existen y los movimientos de caja ANTERIORES al
   * retiro del propio cierre, con la fórmula canónica.
   */
  async function fotografia(turnoId) {
    const t = await prisma.turno.findUnique({ where: { id: turnoId } });
    const ventas = await prisma.venta.findMany({
      where: whereVentaComercial({ turnoId }),
      select: { total: true, formaPago: true, esFiado: true, pagos: { select: { medio: true, monto: true } } },
    });
    const movimientos = await prisma.cajaMovimiento.findMany({
      where: { turnoId, ...(t.retiroCierreMovimientoId ? { id: { not: t.retiroCierreMovimientoId } } : {}) },
      select: { tipo: true, monto: true },
    });
    const real = calcularEfectivoEsperado({ montoInicial: t.montoInicial, ventas, movimientos });
    const arqueos = await prisma.arqueoCaja.findMany({ where: { turnoId, tipo: "FINAL" } });
    const retiros = t.cierre ? await prisma.cajaMovimiento.findMany({ where: { turnoId, tipo: "RETIRO", id: t.retiroCierreMovimientoId ?? -1 } }) : [];
    return {
      cerrado: t.cierre !== null,
      persistido: {
        cantidadVentas: t.cantidadVentas,
        totalVentasEfectivo: Number(t.totalVentasEfectivo),
        esperado: Number(t.montoEsperadoEfectivo),
        diferencia: Number(t.diferenciaEfectivo),
      },
      real: {
        cantidadVentas: ventas.length,
        totalVentasEfectivo: real.ventasEfectivo,
        esperado: real.efectivoEsperado,
        diferencia: Number(t.montoRealEfectivo) - real.efectivoEsperado,
      },
      arqueos: arqueos.map((a) => ({ esperado: Number(a.efectivoEsperado), diferencia: Number(a.diferencia) })),
      retiros: retiros.map((r) => Number(r.monto)),
      retirado: Number(t.efectivoRetiradoCierre),
      fondo: Number(t.fondoDejadoCierre),
      cierre: t.cierre,
    };
  }
  /** La regla: lo persistido es lo real, y el arqueo FINAL dice lo mismo. */
  function coherente(t, foto) {
    igual(`${t}: lo persistido es lo que de verdad quedó en el turno`, foto.persistido, foto.real);
    igual(`${t}: un solo arqueo FINAL, con el mismo esperado y la misma diferencia`, foto.arqueos, [{ esperado: foto.real.esperado, diferencia: foto.real.diferencia }]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. La venta gana: el cierre la espera y la fotografía la incluye");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("gana-venta");
    // La venta queda detenida con la venta ESCRITA y el turno tomado.
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pCierre; let enFila1 = 0; let enFila2 = 0;
    try {
      pVenta = crear(caja, ventaOnline(caja, id));
      enFila1 = await esperarEnFila(prisma, 1, 10_000);
      // Lo contado es lo que de verdad hay: $1.000 de fondo + $1.000 de la venta.
      pCierre = cerrar(caja, 2000);
      enFila2 = await esperarEnFila(prisma, 2, 10_000);
    } finally {
      await fila.soltar();
    }
    const [venta, cierre] = await Promise.all([pVenta, pCierre]);
    requerir("la venta quedó detenida con el turno tomado, y el cierre la esperó", enFila1 >= 1 && enFila2 >= 2, `${enFila1} ${enFila2}`);
    ok("la venta entra y el cierre se confirma", venta.ok === true && cierre.ok === true, `${venta.status} ${venta.code} / ${cierre.status} ${cierre.error ?? ""}`);
    const foto = await fotografia(caja.turnoId);
    console.log("    fotografía:", JSON.stringify({ persistido: foto.persistido, real: foto.real }));
    coherente("venta gana", foto);
    igual("cuenta la venta: 1 venta, $1.000 en efectivo, esperado $2.000, diferencia 0", foto.persistido, { cantidadVentas: 1, totalVentasEfectivo: 1000, esperado: 2000, diferencia: 0 });
    igual("reparto sobre lo contado: retira $1.000, deja el fondo de $1.000, un solo retiro", [foto.retirado, foto.fondo, foto.retiros], [1000, 1000, [1000]]);
    const v = await prisma.venta.findUnique({ where: { clientTxnId: id }, select: { fecha: true } });
    ok("la venta es anterior al instante del cierre", v.fecha <= foto.cierre, `${v.fecha?.toISOString()} ${foto.cierre?.toISOString()}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. El cierre gana: la venta se rechaza y la fotografía sigue correcta");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("gana-cierre");
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pVenta; let cierre; let esperando = 0;
    try {
      pVenta = crear(caja, ventaOnline(caja, id));
      esperando = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 10_000);
      cierre = await cerrar(caja, 1000);
    } finally {
      await candado.soltar();
    }
    const venta = await pVenta;
    requerir("la venta había validado el turno y esperaba", esperando === 1);
    ok("el cierre se confirma", cierre.ok === true, `${cierre.status} ${cierre.error ?? ""}`);
    ok("la venta se rechaza: TURNO_CERRADO, y no existe", venta.status === 403 && venta.code === "TURNO_CERRADO" && (await ventaDe(id)) === null,
      `${venta.status} ${venta.code}`);
    const foto = await fotografia(caja.turnoId);
    coherente("cierre gana", foto);
    igual("0 ventas, esperado $1.000, diferencia 0", foto.persistido, { cantidadVentas: 0, totalVentasEfectivo: 0, esperado: 1000, diferencia: 0 });
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. Dos ventas alrededor del cierre");

  {
    // Determinista: A entra; B valida y espera; el cierre gana; B se rechaza.
    const caja = await nuevaCaja();
    const idA = nuevoId("a");
    const idB = nuevoId("b");
    requerir("A entra", (await crear(caja, ventaOnline(caja, idA))).ok === true);
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pB; let cierre;
    try {
      pB = crear(caja, ventaOnline(caja, idB));
      await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 10_000);
      cierre = await cerrar(caja, 2000);
    } finally {
      await candado.soltar();
    }
    const ventaB = await pB;
    ok("el cierre se confirma y B se rechaza", cierre.ok === true && ventaB.code === "TURNO_CERRADO", `${cierre.status} ${ventaB.status} ${ventaB.code}`);
    ok("A existe y B no", (await ventaDe(idA))?.turnoId === caja.turnoId && (await ventaDe(idB)) === null);
    const foto = await fotografia(caja.turnoId);
    coherente("A sí, B no", foto);
    igual("cuenta A y no B, diferencia 0", foto.persistido, { cantidadVentas: 1, totalVentasEfectivo: 1000, esperado: 2000, diferencia: 0 });

    // Con A EN VUELO cuando llegan B y el cierre: lo que entra, se cuenta.
    const caja2 = await nuevaCaja();
    const idA2 = nuevoId("a-en-vuelo");
    const idB2 = nuevoId("b-en-vuelo");
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pA; let pB2; let pC;
    try {
      pA = crear(caja2, ventaOnline(caja2, idA2));
      await esperarEnFila(prisma, 1, 10_000);
      pB2 = crear(caja2, ventaOnline(caja2, idB2));
      await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 10_000);
      pC = cerrar(caja2, 2000);
      await esperarEnFila(prisma, 2, 10_000);
    } finally {
      await fila.soltar();
    }
    const [rA, rB, rC] = await Promise.all([pA, pB2, pC]);
    ok("A entra y el cierre se confirma", rA.ok === true && rC.ok === true, `${rA.status} ${rC.status} ${rC.error ?? ""}`);
    ok("B entra o se rechaza con TURNO_CERRADO, nada más", rB.ok === true || rB.code === "TURNO_CERRADO", `${rB.status} ${rB.code}`);
    const foto2 = await fotografia(caja2.turnoId);
    console.log("    B", rB.ok ? "entró" : "se rechazó", "·", JSON.stringify(foto2.persistido));
    igual("lo persistido es lo que de verdad quedó en el turno", foto2.persistido.cantidadVentas === foto2.real.cantidadVentas && foto2.persistido.esperado === foto2.real.esperado, true);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. Cobro offline: el que está entrando se cuenta; el PENDIENTE frena");

  {
    const caja = await nuevaCaja();
    const id = nuevoId("offline-entrando");
    const c = cobroCola(caja, id);
    igual("registrado PENDIENTE", (await registrar(caja, c)).estado, "PENDIENTE");
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pCierre; let enFila2 = 0;
    try {
      pVenta = crear(caja, cuerpoDeReplay(c, caja.turnoId));
      await esperarEnFila(prisma, 1, 10_000);
      pCierre = cerrar(caja, 2000);
      enFila2 = await esperarEnFila(prisma, 2, 10_000);
    } finally {
      await fila.soltar();
    }
    const [venta, cierre] = await Promise.all([pVenta, pCierre]);
    ok("el cierre esperó a la venta que estaba entrando", enFila2 >= 2, `${enFila2}`);
    ok("la venta entra, el cobro queda SINCRONIZADA y el cierre se confirma después", venta.ok === true && cierre.ok === true
      && (await prisma.cobroOffline.findUnique({ where: { clientTxnId: id } })).estado === "SINCRONIZADA", `${venta.status} / ${cierre.status} ${cierre.code ?? ""}`);
    const foto = await fotografia(caja.turnoId);
    coherente("offline entrando", foto);
    igual("la cuenta: 1 venta, esperado $2.000, diferencia 0", foto.persistido, { cantidadVentas: 1, totalVentasEfectivo: 1000, esperado: 2000, diferencia: 0 });

    // Uno PENDIENTE que no está entrando: el cierre se niega y no escribe nada.
    const caja2 = await nuevaCaja();
    const id2 = nuevoId("offline-pendiente");
    await registrar(caja2, cobroCola(caja2, id2));
    const r = await cerrar(caja2, 1000);
    ok("409 COBROS_OFFLINE_PENDIENTES", r.status === 409 && r.code === "COBROS_OFFLINE_PENDIENTES", JSON.stringify(r));
    const t2 = await prisma.turno.findUnique({ where: { id: caja2.turnoId } });
    ok("el turno sigue abierto, sin arqueo ni retiro", t2.cierre === null && (await prisma.arqueoCaja.count({ where: { turnoId: caja2.turnoId } })) === 0
      && (await prisma.cajaMovimiento.count({ where: { turnoId: caja2.turnoId } })) === 0);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5. Doble cierre: un solo arqueo FINAL, un solo retiro");

  {
    const caja = await nuevaCaja();
    requerir("una venta", (await crear(caja, ventaOnline(caja, nuevoId("doble")))).ok === true);
    const [r1, r2] = await Promise.all([cerrar(caja, 2000), cerrar(caja, 2000)]);
    const estados = [r1, r2].map((r) => r.status).sort();
    igual("uno se confirma y el otro 409", estados, [200, 409]);
    const foto = await fotografia(caja.turnoId);
    coherente("doble cierre", foto);
    igual("un solo retiro de $1.000", foto.retiros, [1000]);
    igual("ningún otro movimiento de caja", await prisma.cajaMovimiento.count({ where: { turnoId: caja.turnoId } }), 1);
    const r3 = await cerrar(caja, 2000);
    ok("cerrar otra vez: rechazado, sin efectos", r3.ok !== true && (await prisma.arqueoCaja.count({ where: { turnoId: caja.turnoId } })) === 1
      && (await prisma.cajaMovimiento.count({ where: { turnoId: caja.turnoId } })) === 1, `${r3.status} ${r3.error}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("6. Ventas, cierres dobles y cobros offline a la vez: sin deadlock");

  {
    const BLOQUEO = /deadlock|40P01|P2034|P2028|could not serialize|Transaction already closed|timed out/i;
    let bloqueos = 0; let quintos = 0; let incoherentes = 0; let entraron = 0; let rechazadas = 0;
    for (let ronda = 0; ronda < 6; ronda++) {
      const caja = await nuevaCaja();
      const capturar = (p) => p.catch((e) => ({ status: 0, error: String(e?.message ?? e) }));
      // Un cobro offline de la caja, para que también compita una venta offline.
      const idOff = nuevoId("rafaga-offline");
      const cOff = cobroCola(caja, idOff);
      await registrar(caja, cOff);
      const ventas = [
        ...[0, 1, 2].map(() => capturar(crear(caja, ventaOnline(caja, nuevoId("rafaga"))))),
        capturar(crear(caja, cuerpoDeReplay(cOff, caja.turnoId))),
      ];
      await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
      const resultados = await Promise.all([...ventas, capturar(cerrar(caja, 1000)), capturar(cerrar(caja, 1000))]);
      const textos = resultados.map((r) => `${r.error ?? ""}`);
      bloqueos += textos.filter((t) => BLOQUEO.test(t)).length;
      quintos += resultados.filter((r) => r.status >= 500 || r.status === 0).length;
      entraron += resultados.slice(0, 4).filter((r) => r.ok).length;
      rechazadas += resultados.slice(0, 4).filter((r) => !r.ok).length;
      const t = await prisma.turno.findUnique({ where: { id: caja.turnoId } });
      if (t.cierre) {
        const foto = await fotografia(caja.turnoId);
        if (foto.persistido.cantidadVentas !== foto.real.cantidadVentas || foto.persistido.esperado !== foto.real.esperado
          || foto.arqueos.length !== 1) incoherentes += 1;
      }
      console.log(`    ronda ${ronda + 1}: ${resultados.map((r) => (r.ok ? "ok" : `${r.status}${r.code ? `:${r.code}` : ""}`)).join(" ")}`);
    }
    igual("ningún deadlock ni transacción vencida", bloqueos, 0);
    igual("ningún 5xx ni excepción", quintos, 0);
    igual("ningún cierre con una fotografía distinta de lo que quedó", incoherentes, 0);
    ok("la carrera ocurrió: hubo ventas que entraron y ventas rechazadas", entraron > 0 && rechazadas > 0, `${entraron} ${rechazadas}`);
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
