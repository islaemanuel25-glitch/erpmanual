// COBROS OFFLINE EN EL SERVIDOR — contra PostgreSQL, por los handlers reales.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/cobrosOffline.mjs
//
// El registro (`/api/pos-ventas/cobros-offline/registrar`) guarda la EVIDENCIA
// de un cobro hecho sin conexión; no es una venta. Esta prueba ejerce:
//
//   1. que registrar no escribe nada económico (venta, stock, caja, puntos,
//      libros, Finanzas);
//   2. la idempotencia del registro y quién no puede apropiarse de un id;
//   3. los cobros que nacen en revisión (sin turno, turno ajeno);
//   4. que el voucher y cualquier credencial no se guardan;
//   5. la reconciliación con una venta que ya existía;
//   6. la sincronización atómica con `crear` y su reversión;
//   7. las carreras registro/crear y crear/crear, FORZADAS con el candado real
//      del local (scripts/pruebas-db/carreraForzada.mjs), incluida la ventana
//      con la venta escrita y sin confirmar, cuando confirma (7c) y cuando se
//      revierte (7e);
//   8. que un cobro descartado no se convierte en venta;
//   9. los topes del pedido;
//  10. que la caja por operador (DEC-0012) sigue mandando;
//  11. que el registro espera una venta larga sin vencer (más de 5 s);
//  12. que un valor que la columna no puede guardar rechaza ESE cobro y no el
//      pedido;
//  13. dos locales registrando el mismo id a la vez, forzado;
//  14. que el aislamiento por local no depende del hash;
//  15. que un texto que la base no guarda o un id que no es id rechaza ESE
//      cobro y no el pedido.
//
// Los cuerpos son los que arma la pantalla: el ítem de la cola de
// `guardarVentaPendiente` y el pedido de `procesarCola`.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { retenerCandadoDelLocal, retenerFilaDeStock, esperarEnCandadoDelLocal, esperarEnFila } = await import("./carreraForzada.mjs");
const { firmarTokenOperador, firmarVoucherOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { LIMITES_REGISTRO, MAXIMO_INT32, sanearCobro, hashDePayload } = await import("../../lib/pos-ventas/cobroOffline.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");
const rutaRegistrar = await import("../../app/api/pos-ventas/cobros-offline/registrar/route.js");

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
function requerir(t, c, d = "") {
  ok(t, c, d);
  if (!c) throw new Error(`requisito: ${t} — ${d}`);
}

const SECRETO = process.env.AUTH_SECRET;
const sesionDe = (usuario, localId) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos: ["pos.usar"] }, SECRETO, { expiresIn: "1h" });
const cookies = ({ sesion, operador = null }) =>
  [`erpazul_sesion=${sesion}`, operador ? `${OperadorCookie.nombre}=${operador}` : null].filter(Boolean).join("; ");
const pedidoCrudo = (url, quien, texto) => {
  const req = new Request(url, {
    method: "POST",
    headers: { cookie: cookies(quien), "content-type": "application/json" },
    body: texto,
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const pedido = (url, quien, cuerpo) => pedidoCrudo(url, quien, JSON.stringify(cuerpo ?? {}));
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const BASE = "http://ci/api/pos-ventas";

const marca = `ci-cobros-offline-${Date.now()}`;
const creado = { grupoId: null, localIds: [], usuarioIds: [], operadorIds: [], rolId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["pos.usar"] } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  // El local del caso, con operario obligatorio y SIN stock negativo: una venta
  // por encima del stock se revierte, y eso ejerce la reversión del cobro.
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  // Otro local del mismo grupo, sin operario: para los ids de otro local.
  const otroLocal = await prisma.local.create({ data: { nombre: `${marca}-otro`, tipo: "local" } });
  creado.localIds.push(local.id, otroLocal.id);
  for (const l of [local, otroLocal]) await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });
  await prisma.configuracionLocal.create({ data: { localId: otroLocal.id, exigirOperador: false, allowNegativeStock: true } });

  const usuario = async (sufijo, localId) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${sufijo}`, email: `${marca}-${sufijo}@ci.local`, passwordHash: "x", rolId: rol.id, localId },
    });
    creado.usuarioIds.push(u.id);
    return u;
  };
  const cuenta = await usuario("cuenta", local.id);
  const otraCuenta = await usuario("otra-cuenta", local.id);
  const cuentaOtroLocal = await usuario("cuenta-otro", otroLocal.id);
  const operador = async (sufijo) => {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-${sufijo}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: local.id } });
    return op;
  };
  const opA = await operador("a");
  const opB = await operador("b");
  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-producto`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });
  const productoOtro = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: otroLocal.id, nombre: `${marca}-producto-otro`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });
  const pin = (op) => firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: local.id });
  return {
    grupo, local, otroLocal, cuenta, otraCuenta, cuentaOtroLocal, opA, opB, producto, productoOtro,
    A: { sesion: sesionDe(cuenta, local.id), operador: pin(opA) },
    B: { sesion: sesionDe(cuenta, local.id), operador: pin(opB) },
    AconOtraCuenta: { sesion: sesionDe(otraCuenta, local.id), operador: pin(opA) },
    sinPin: { sesion: sesionDe(cuenta, local.id) },
    otro: { sesion: sesionDe(cuentaOtroLocal, otroLocal.id) },
    voucherA: firmarVoucherOperador({ operadorId: opA.id, localId: local.id }),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const localIds = creado.localIds;
  const turnos = (await prisma.turno.findMany({ where: { localId: { in: localIds } }, select: { id: true } })).map((t) => t.id);
  await prisma.cobroOffline.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.auditoriaBitacora.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.clientePuntoMovimiento.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId: { in: localIds } } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.venta.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cambioPendiente.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: { in: localIds } } });
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

async function correr() {
  const f = await montar();
  let n = 0;
  const nuevoId = (etiqueta) => `${marca}-${etiqueta}-${(n += 1)}`;

  const abrir = async (quien) => leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000 })));

  /** El ítem de la cola, como lo arma `guardarVentaPendiente`. */
  const cobroCola = (id, { turnoId, cantidad = 1, localId = f.local.id, producto = f.producto, voucher = null, operador = f.opA, extra = {} } = {}) => ({
    clientVentaId: id,
    createdAt: Date.now(),
    localId,
    grupoId: f.grupo.id,
    userId: f.cuenta.id,
    formaPago: "efectivo",
    subtotal: 1000 * cantidad,
    descuento: 0,
    descuentoPorPuntos: 0,
    total: 1000 * cantidad,
    clienteId: null,
    operadorId: operador?.id ?? null,
    operadorVoucher: voucher,
    turnoId,
    items: [itemCrearPayload({ productoBaseId: producto.baseId, nombre: "Producto de prueba", precio: 1000, cantidad, precioCosto: 600 })],
    ...extra,
  });
  const registrar = async (quien, cobros, extra = {}) =>
    leer(await rutaRegistrar.POST(pedido(`${BASE}/cobros-offline/registrar`, quien, { relojDispositivo: Date.now(), cobros, ...extra })));
  const registrarUno = async (quien, cobro) => {
    const r = await registrar(quien, [cobro]);
    return { status: r.status, ok: r.ok, error: r.error, ...(r.resultados?.[0] ?? {}) };
  };
  /** El pedido de `procesarCola` para un ítem de la cola. */
  const replay = async (quien, c, localId = f.local.id) =>
    leer(await rutaCrearVenta.POST(pedido(`${BASE}/crear`, quien, {
      clientTxnId: c.clientVentaId,
      localId,
      clienteId: c.clienteId,
      turnoId: c.turnoId,
      formaPago: c.formaPago,
      esFiado: false,
      descuento: c.descuento,
      descuentoPorPuntos: c.descuentoPorPuntos,
      puntosCanje: 0,
      origenOffline: true,
      operadorVoucher: c.operadorVoucher ?? null,
      items: c.items,
    })));
  const cobroDe = (id) => prisma.cobroOffline.findUnique({ where: { clientTxnId: id } });
  const ventaDe = (id) => prisma.venta.findUnique({ where: { clientTxnId: id }, select: { id: true, turnoId: true } });

  /** Todo lo económico, en el local y en las tablas globales de libros y Finanzas. */
  const huella = async () => ({
    ventas: await prisma.venta.count({ where: { localId: { in: creado.localIds } } }),
    detalles: await prisma.ventaDetalle.count({ where: { venta: { localId: { in: creado.localIds } } } }),
    pagos: await prisma.ventaPago.count({ where: { venta: { localId: { in: creado.localIds } } } }),
    stock: Number((await prisma.stockLocal.aggregate({ where: { localId: { in: creado.localIds } }, _sum: { cantidad: true } }))._sum.cantidad ?? 0),
    movimientosStock: await prisma.movimientoStock.count({ where: { localId: { in: creado.localIds } } }),
    movimientosCaja: await prisma.cajaMovimiento.count({ where: { turno: { localId: { in: creado.localIds } } } }),
    puntos: await prisma.clientePuntoMovimiento.count({ where: { localId: { in: creado.localIds } } }),
    transferencias: await prisma.transferencia.count({ where: { venta: { localId: { in: creado.localIds } } } }),
    contadores: JSON.stringify(await prisma.posVentaCounter.findMany({ where: { localId: { in: creado.localIds } }, select: { localId: true, ultimoNumero: true }, orderBy: { localId: "asc" } })),
    costoBase: await prisma.costoBaseVersion.count(),
    costoUbicacion: await prisma.costoUbicacionVersion.count(),
    activacionCostos: await prisma.libroCostoActivacion.count(),
    gastos: await prisma.gasto.count(),
    pagosGasto: await prisma.pagoGasto.count(),
    pagosProveedor: await prisma.pagoProveedor.count(),
    cajaDePagos: await prisma.cajaMovimientoDePago.count(),
  });

  const abreA = await abrir(f.A);
  requerir("A abre su caja", abreA.ok === true, `${abreA.status} ${abreA.error ?? ""}`);
  const abreB = await abrir(f.B);
  requerir("B abre su caja", abreB.ok === true, `${abreB.status} ${abreB.error ?? ""}`);
  const abreOtro = await abrir(f.otro);
  requerir("el otro local abre su caja", abreOtro.ok === true, `${abreOtro.status} ${abreOtro.error ?? ""}`);
  const turnoA = abreA.turno.id;
  const turnoB = abreB.turno.id;
  const turnoOtro = abreOtro.turno.id;

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. Registrar no es vender: cero efectos económicos");

  const h0 = await huella();
  const id1 = nuevoId("neutro");
  const r1 = await registrarUno(f.A, cobroCola(id1, { turnoId: turnoA }));
  ok("registra el cobro: CREADO, PENDIENTE", r1.resultado === "CREADO" && r1.estado === "PENDIENTE", JSON.stringify(r1));
  igual("ninguna venta, línea, pago, stock, movimiento, caja, puntos, transferencia, contador, libro ni Finanzas", await huella(), h0);
  const c1 = await cobroDe(id1);
  ok("la fila: local y grupo del ámbito, turno de A, quién registró", c1 && c1.localId === f.local.id && c1.grupoId === f.grupo.id
    && c1.turnoId === turnoA && c1.registradoPorUsuarioId === f.cuenta.id && c1.registradoPorOperadorId === f.opA.id,
    JSON.stringify(c1 && { localId: c1.localId, grupoId: c1.grupoId, turnoId: c1.turnoId, u: c1.registradoPorUsuarioId, o: c1.registradoPorOperadorId }));
  ok("lo declarado queda como declarado", c1.cuentaDeclaradaId === f.cuenta.id && c1.operadorDeclaradoId === f.opA.id
    && Number(c1.totalDeclarado) === 1000 && c1.formaPagoDeclarada === "efectivo" && c1.cobradoEnDispositivo instanceof Date);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. Idempotencia del registro y quién no se apropia de un id");

  const antes2 = await cobroDe(id1);
  const r2 = await registrarUno(f.A, cobroCola(id1, { turnoId: turnoA, extra: { createdAt: c1.payload.createdAt } }));
  ok("el mismo cobro otra vez: YA_REGISTRADO", r2.resultado === "YA_REGISTRADO", JSON.stringify(r2));
  igual("una sola fila con ese id", await prisma.cobroOffline.count({ where: { clientTxnId: id1 } }), 1);
  const r3 = await registrarUno(f.AconOtraCuenta, cobroCola(id1, { turnoId: turnoA, extra: { createdAt: c1.payload.createdAt } }));
  ok("otra cuenta del mismo local, mismo contenido: el mismo cobro", r3.resultado === "YA_REGISTRADO", JSON.stringify(r3));
  const despues3 = await cobroDe(id1);
  ok("no cambia quién lo registró primero, ni el contenido ni el hash",
    despues3.registradoPorUsuarioId === f.cuenta.id && despues3.payloadHash === antes2.payloadHash
    && JSON.stringify(despues3.payload) === JSON.stringify(antes2.payload));
  ok("solo avanza ultimoRegistroEn", despues3.ultimoRegistroEn > antes2.ultimoRegistroEn && despues3.registradoEn.getTime() === antes2.registradoEn.getTime());

  const r4 = await registrarUno(f.A, cobroCola(id1, { turnoId: turnoA, cantidad: 2, extra: { createdAt: c1.payload.createdAt } }));
  ok("mismo id con otro contenido: RECHAZADO CONTENIDO_DISTINTO", r4.resultado === "RECHAZADO" && r4.codigo === "CONTENIDO_DISTINTO", JSON.stringify(r4));
  const despues4 = await cobroDe(id1);
  ok("el contenido original no se reemplazó", despues4.payloadHash === antes2.payloadHash && Number(despues4.totalDeclarado) === 1000);

  const r5 = await registrarUno(f.otro, cobroCola(id1, { turnoId: turnoOtro, localId: f.otroLocal.id, producto: f.productoOtro, operador: null, extra: { createdAt: c1.payload.createdAt } }));
  ok("el mismo id desde otro local: RECHAZADO ID_DE_OTRO_LOCAL, sin datos del cobro", r5.resultado === "RECHAZADO" && r5.codigo === "ID_DE_OTRO_LOCAL"
    && r5.estado === undefined && r5.ventaId === undefined, JSON.stringify(r5));
  ok("y el cobro del primer local sigue igual", (await cobroDe(id1)).localId === f.local.id && (await cobroDe(id1)).payloadHash === antes2.payloadHash);

  const idLocalAjeno = nuevoId("local-ajeno");
  const r6 = await registrarUno(f.A, cobroCola(idLocalAjeno, { turnoId: turnoOtro, localId: f.otroLocal.id }));
  ok("un cobro que declara otro local: RECHAZADO LOCAL_DECLARADO_DISTINTO, sin fila", r6.codigo === "LOCAL_DECLARADO_DISTINTO" && !(await cobroDe(idLocalAjeno)), JSON.stringify(r6));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. Los que nacen en revisión: sin turno y turno ajeno");

  const idSinTurno = nuevoId("sin-turno");
  const r7 = await registrarUno(f.A, cobroCola(idSinTurno, { turnoId: null }));
  const c7 = await cobroDe(idSinTurno);
  ok("sin turno: REQUIERE_REVISION, SIN_TURNO, sin turno estructurado", r7.estado === "REQUIERE_REVISION" && c7.revisionMotivo === "SIN_TURNO" && c7.turnoId === null, JSON.stringify(r7));

  const idInexistente = nuevoId("turno-inexistente");
  await registrarUno(f.A, cobroCola(idInexistente, { turnoId: 999999999 }));
  const c8 = await cobroDe(idInexistente);
  ok("turno inexistente: REQUIERE_REVISION, TURNO_AJENO, sin turno estructurado", c8.estado === "REQUIERE_REVISION" && c8.revisionMotivo === "TURNO_AJENO" && c8.turnoId === null);
  ok("el turno declarado crudo queda en el payload", c8.payload.turnoId === 999999999);

  const idAjeno = nuevoId("turno-ajeno");
  await registrarUno(f.A, cobroCola(idAjeno, { turnoId: turnoOtro }));
  const c9 = await cobroDe(idAjeno);
  ok("turno de otro local: REQUIERE_REVISION, TURNO_AJENO, sin turno estructurado", c9.estado === "REQUIERE_REVISION" && c9.revisionMotivo === "TURNO_AJENO" && c9.turnoId === null && c9.payload.turnoId === turnoOtro);

  const antesSinTurno = await huella();
  const rReplaySinTurno = await replay(f.A, { ...cobroCola(idSinTurno, { turnoId: turnoA }), clientVentaId: idSinTurno });
  // Si alguien manda la venta de un cobro sin turno con un turno, la venta la
  // decide `crear` con sus reglas; el cobro no se le atribuye a esa caja solo.
  const c7b = await cobroDe(idSinTurno);
  ok("un cobro sin turno no se autoasigna a la caja de una venta", c7b.estado === "REQUIERE_REVISION" && c7b.ventaId === null && c7b.turnoId === null,
    `${rReplaySinTurno.status} ${c7b.estado} ${c7b.ventaId}`);
  void antesSinTurno;

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. El voucher y cualquier credencial no se guardan");

  const idCred = nuevoId("credenciales");
  await registrarUno(f.A, cobroCola(idCred, {
    turnoId: turnoA,
    voucher: f.voucherA,
    extra: { pin: "1234", cookie: `${OperadorCookie.nombre}=${f.A.operador}`, token: f.A.sesion, sesion: f.A.sesion },
  }));
  const cCred = await cobroDe(idCred);
  const guardado = JSON.stringify(cCred);
  for (const [nombre, secreto] of [["el voucher", f.voucherA], ["la cookie del PIN", f.A.operador], ["la sesión", f.A.sesion], ["el PIN", "1234"]]) {
    ok(`${nombre} no está en la fila`, !guardado.includes(secreto));
  }
  ok("ninguna clave de credencial en el payload", !["operadorVoucher", "pin", "cookie", "token", "sesion"].some((k) => k in cCred.payload));
  ok("del voucher queda solo a quién pertenece", cCred.operadorVerificadoId === f.opA.id);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5. La venta ya existía");

  // El cobro online se creó, la respuesta se perdió, y la pantalla lo guardó
  // offline con el mismo id (lib/pos-ventas/intentoCobro.js).
  const idYa = nuevoId("venta-ya");
  const cYa = cobroCola(idYa, { turnoId: turnoA });
  const rv = await replay(f.A, { ...cYa });
  requerir("la venta online se creó", rv.ok === true && rv.isDuplicate !== true, `${rv.status} ${rv.error ?? ""}`);
  const antesRec = await huella();
  const r10 = await registrarUno(f.A, cYa);
  const c10 = await cobroDe(idYa);
  ok("registrarlo después: RECONCILIADO, SINCRONIZADA, apuntando a esa venta", r10.resultado === "RECONCILIADO" && c10.estado === "SINCRONIZADA"
    && c10.ventaId === rv.ventaId && c10.sincronizadaEn instanceof Date, JSON.stringify(r10));
  igual("y sin escribir nada económico", await huella(), antesRec);

  const idOtraCaja = nuevoId("venta-otra-caja");
  const rvA = await replay(f.A, cobroCola(idOtraCaja, { turnoId: turnoA }));
  requerir("venta de A con ese id", rvA.ok === true, `${rvA.status} ${rvA.error ?? ""}`);
  const r11 = await registrarUno(f.A, cobroCola(idOtraCaja, { turnoId: turnoB, operador: f.opB }));
  const c11 = await cobroDe(idOtraCaja);
  ok("el mismo id declarado en OTRA caja: REQUIERE_REVISION, ID_EN_OTRA_VENTA, sin vínculo",
    r11.estado === "REQUIERE_REVISION" && c11.revisionMotivo === "ID_EN_OTRA_VENTA" && c11.ventaId === null, JSON.stringify(r11));
  // Los otros dos caminos que atan un cobro a una venta: el reintento de esa
  // venta (camino de duplicado de `crear`) y registrar el cobro otra vez.
  const rDupOtraCaja = await replay(f.A, cobroCola(idOtraCaja, { turnoId: turnoA }));
  requerir("el reintento de la venta de A es un duplicado", rDupOtraCaja.ok === true && rDupOtraCaja.isDuplicate === true, `${rDupOtraCaja.status} ${rDupOtraCaja.error ?? ""}`);
  const r11b = await registrarUno(f.A, cobroCola(idOtraCaja, { turnoId: turnoB, operador: f.opB, extra: { createdAt: c11.payload.createdAt } }));
  const c11b = await cobroDe(idOtraCaja);
  ok("ni el duplicado de crear ni el re-registro le atribuyen la venta de otra caja",
    r11b.resultado === "YA_REGISTRADO" && c11b.estado === "REQUIERE_REVISION" && c11b.ventaId === null, JSON.stringify(r11b));

  const idVentaOtroLocal = nuevoId("venta-otro-local");
  const rvOtro = await replay(f.otro, cobroCola(idVentaOtroLocal, { turnoId: turnoOtro, localId: f.otroLocal.id, producto: f.productoOtro, operador: null }), f.otroLocal.id);
  requerir("venta en el otro local con ese id", rvOtro.ok === true, `${rvOtro.status} ${rvOtro.error ?? ""}`);
  const r12 = await registrarUno(f.A, cobroCola(idVentaOtroLocal, { turnoId: turnoA }));
  ok("un id que es de una venta de otro local: RECHAZADO ID_DE_OTRO_LOCAL, sin fila ni datos de la venta",
    r12.codigo === "ID_DE_OTRO_LOCAL" && r12.ventaId === undefined && !(await cobroDe(idVentaOtroLocal)), JSON.stringify(r12));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("6. Registrado → crear: sincronizado en la misma transacción");

  const idSync = nuevoId("sync");
  const cSync = cobroCola(idSync, { turnoId: turnoA });
  await registrarUno(f.A, cSync);
  const rs = await replay(f.A, cSync);
  requerir("el replay crea la venta", rs.ok === true && rs.isDuplicate !== true, `${rs.status} ${rs.error ?? ""}`);
  const cs = await cobroDe(idSync);
  ok("el cobro pasó a SINCRONIZADA apuntando a esa venta", cs.estado === "SINCRONIZADA" && cs.ventaId === rs.ventaId && cs.sincronizadaEn instanceof Date);

  const idRollback = nuevoId("rollback");
  const cRollback = cobroCola(idRollback, { turnoId: turnoA, cantidad: 5000 });
  await registrarUno(f.A, cRollback);
  const antesRollback = await huella();
  const rr = await replay(f.A, cRollback);
  ok("una venta por encima del stock se revierte", rr.ok !== true && rr.status === 409, `${rr.status} ${rr.error ?? ""}`);
  const cr = await cobroDe(idRollback);
  ok("y el cobro sigue PENDIENTE, sin venta", cr.estado === "PENDIENTE" && cr.ventaId === null && !(await ventaDe(idRollback)));
  igual("sin escrituras económicas", await huella(), antesRollback);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("7. Carreras forzadas con el candado real del local");

  // QUÉ CASO PRUEBA EL CANDADO DEL REGISTRO: el 7c. Sin el candado, 7a y 7b se
  // ponen rojos por el ORDEN de llegada, que es incidental (el estado final es
  // coherente igual); el 7c muestra el daño real —una venta confirmada con su
  // cobro PENDIENTE y sin vínculo—. Para que esa contraprueba llegue al 7c, la
  // espera del orden en 7a y 7b tiene un tope corto: sin candado, el registro
  // nunca se detiene, y con el tope de 30 s la retención vencía antes.
  const TOPE_ORDEN = 5_000;

  // 7a. crear primero, después el registro: los dos quedan detenidos en el
  // candado, en ese orden. Al soltar, crear crea; el registro ve la venta.
  {
    const id = nuevoId("crear-primero");
    const c = cobroCola(id, { turnoId: turnoA });
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pVenta; let pRegistro; let enFila1 = 0; let enFila2 = 0;
    try {
      pVenta = replay(f.A, c);
      enFila1 = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, TOPE_ORDEN);
      pRegistro = registrarUno(f.A, c);
      enFila2 = await esperarEnCandadoDelLocal(prisma, f.local.id, 2, TOPE_ORDEN);
    } finally {
      await candado.soltar();
    }
    const [rvv, rrg] = await Promise.all([pVenta, pRegistro]);
    ok("crear y el registro quedaron detenidos en el candado, en ese orden", enFila1 === 1 && enFila2 === 2, `${enFila1} ${enFila2}`);
    const cobro = await cobroDe(id);
    ok("crear primero: el registro nace RECONCILIADO con esa venta", rvv.ok === true && rrg.resultado === "RECONCILIADO"
      && cobro.estado === "SINCRONIZADA" && cobro.ventaId === rvv.ventaId, `${JSON.stringify(rrg)} ${cobro.estado}`);
  }

  // 7b. el registro primero, después crear: crear encuentra el cobro y lo
  // sincroniza en su transacción.
  {
    const id = nuevoId("registro-primero");
    const c = cobroCola(id, { turnoId: turnoA });
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pVenta; let pRegistro; let enFila1 = 0; let enFila2 = 0;
    try {
      pRegistro = registrarUno(f.A, c);
      enFila1 = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, TOPE_ORDEN);
      pVenta = replay(f.A, c);
      enFila2 = await esperarEnCandadoDelLocal(prisma, f.local.id, 2, TOPE_ORDEN);
    } finally {
      await candado.soltar();
    }
    const [rrg, rvv] = await Promise.all([pRegistro, pVenta]);
    ok("el registro y crear quedaron detenidos, en ese orden", enFila1 === 1 && enFila2 === 2, `${enFila1} ${enFila2}`);
    const cobro = await cobroDe(id);
    ok("registro primero: crear lo sincroniza en su transacción", rrg.resultado === "CREADO" && rvv.ok === true
      && cobro.estado === "SINCRONIZADA" && cobro.ventaId === rvv.ventaId, `${JSON.stringify(rrg)} ${cobro.estado}`);
  }

  // 7c. LA VENTANA PELIGROSA: crear ya escribió la venta pero no la confirmó
  // (detenido en la fila de stock, con el candado del local tomado) y llega
  // el registro. Si el registro no tomara el candado, leería que la venta no
  // existe y dejaría el cobro PENDIENTE de una venta que sí existe.
  {
    const id = nuevoId("ventana");
    const c = cobroCola(id, { turnoId: turnoA });
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pRegistro; let enFila = 0; let enCandado = 0;
    try {
      pVenta = replay(f.A, c);
      enFila = await esperarEnFila(prisma, 1);
      pRegistro = registrarUno(f.A, c);
      enCandado = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
    } finally {
      await fila.soltar();
    }
    const [rvv, rrg] = await Promise.all([pVenta, pRegistro]);
    ok("crear quedó detenido con la venta escrita y sin confirmar", enFila >= 1, `${enFila}`);
    ok("el registro esperó el candado del local", enCandado === 1, `${enCandado}`);
    const cobro = await cobroDe(id);
    const venta = await ventaDe(id);
    // La afirmación que pone rojo sacar el candado del registro.
    ok("ninguna venta confirmada con su cobro PENDIENTE y sin vínculo", !(venta && cobro?.estado === "PENDIENTE" && cobro.ventaId === null),
      `venta ${venta?.id} cobro ${cobro?.estado} ${cobro?.ventaId}`);
    ok("el registro entra después de la venta: RECONCILIADO y SINCRONIZADA", rvv.ok === true && rrg.resultado === "RECONCILIADO"
      && cobro.estado === "SINCRONIZADA" && cobro.ventaId === rvv.ventaId, `${JSON.stringify(rrg)} ${cobro?.estado}`);
  }

  // 7e. LA MISMA VENTANA, PERO crear FALLA: con la venta ya escrita y detenido
  // en la fila de stock, el pedido supera el stock (el local no vende en
  // negativo) y la transacción se revierte. El registro, que esperaba el
  // candado, entra después y no encuentra venta: queda PENDIENTE, sin vínculo.
  {
    const id = nuevoId("ventana-revertida");
    const c = cobroCola(id, { turnoId: turnoA, cantidad: 5000 });
    const antes = await huella();
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pRegistro; let enFila = 0; let enCandado = 0;
    try {
      pVenta = replay(f.A, c);
      enFila = await esperarEnFila(prisma, 1);
      pRegistro = registrarUno(f.A, c);
      enCandado = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
    } finally {
      await fila.soltar();
    }
    const [rvv, rrg] = await Promise.all([pVenta, pRegistro]);
    ok("crear detenido con la venta escrita, y el registro esperando el candado", enFila >= 1 && enCandado === 1, `${enFila} ${enCandado}`);
    ok("crear se revierte por stock: 409", rvv.status === 409 && rvv.ok !== true, `${rvv.status} ${rvv.error ?? ""}`);
    ok("la venta revertida no existe", !(await ventaDe(id)));
    const cobro = await cobroDe(id);
    ok("el registro entra después: CREADO, PENDIENTE, sin ventaId", rrg.resultado === "CREADO" && cobro?.estado === "PENDIENTE"
      && cobro.ventaId === null && cobro.sincronizadaEn === null, `${JSON.stringify(rrg)} ${cobro?.estado}`);
    igual("sin escrituras económicas parciales", await huella(), antes);
  }

  // 7d. dos replays del mismo cobro registrado a la vez: una venta.
  {
    const id = nuevoId("dos-replays");
    const c = cobroCola(id, { turnoId: turnoA });
    await registrarUno(f.A, c);
    const antes = await huella();
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pedidos = []; let enFila = 0;
    try {
      pedidos = [replay(f.A, c), replay(f.A, c)];
      enFila = await esperarEnCandadoDelLocal(prisma, f.local.id, 2);
    } finally {
      await candado.soltar();
    }
    const respuestas = await Promise.all(pedidos);
    ok("los dos replays quedaron detenidos en el candado", enFila === 2, `${enFila}`);
    const creadas = respuestas.filter((r) => r.ok === true && r.isDuplicate !== true).length;
    const duplicadas = respuestas.filter((r) => r.ok === true && r.isDuplicate === true).length;
    igual("una crea, la otra recibe la misma venta", [creadas, duplicadas], [1, 1]);
    const despues = await huella();
    igual("una sola venta", despues.ventas - antes.ventas, 1);
    const cobro = await cobroDe(id);
    ok("el cobro, SINCRONIZADA una vez, con esa venta", cobro.estado === "SINCRONIZADA" && cobro.ventaId === (await ventaDe(id)).id);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("8. Un cobro DESCARTADO no se convierte en venta");

  const idDesc = nuevoId("descartado");
  const cDesc = cobroCola(idDesc, { turnoId: turnoA });
  await registrarUno(f.A, cDesc);
  // El descarte productivo llega en la PR C; acá se lleva la fila al estado
  // que ese endpoint va a dejar.
  await prisma.cobroOffline.update({ where: { clientTxnId: idDesc }, data: { estado: "DESCARTADA", motivoResolucion: "prueba" } });
  const antesDesc = await huella();
  const rd = await replay(f.A, cDesc);
  ok("crear lo niega: 409 COBRO_OFFLINE_DESCARTADO", rd.ok !== true && rd.status === 409 && rd.code === "COBRO_OFFLINE_DESCARTADO", `${rd.status} ${rd.code ?? ""} ${rd.error ?? ""}`);
  igual("sin escrituras económicas", await huella(), antesDesc);
  ok("el cobro sigue DESCARTADA, sin venta", (await cobroDe(idDesc)).estado === "DESCARTADA" && !(await ventaDe(idDesc)));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("9. Topes del pedido");

  const muchos = Array.from({ length: LIMITES_REGISTRO.cobrosPorPedido + 1 }, (_, i) => cobroCola(`${marca}-tope-${i}`, { turnoId: turnoA }));
  const r51 = await registrar(f.A, muchos);
  ok(`más de ${LIMITES_REGISTRO.cobrosPorPedido} cobros: 400, sin filas`, r51.status === 400
    && (await prisma.cobroOffline.count({ where: { clientTxnId: { startsWith: `${marca}-tope-` } } })) === 0, `${r51.status}`);
  const lineas = Array.from({ length: LIMITES_REGISTRO.lineasPorCobro + 1 }, () =>
    itemCrearPayload({ productoBaseId: f.producto.baseId, nombre: "x", precio: 1, cantidad: 1 }));
  const idLineas = nuevoId("lineas");
  const r501 = await registrarUno(f.A, { ...cobroCola(idLineas, { turnoId: turnoA }), items: lineas });
  ok(`más de ${LIMITES_REGISTRO.lineasPorCobro} líneas: RECHAZADO INVALIDO, sin fila`, r501.codigo === "INVALIDO" && !(await cobroDe(idLineas)), JSON.stringify(r501));
  const grande = await leer(await rutaRegistrar.POST(pedidoCrudo(`${BASE}/cobros-offline/registrar`, f.A,
    JSON.stringify({ cobros: [cobroCola(nuevoId("grande"), { turnoId: turnoA })], relleno: "x".repeat(LIMITES_REGISTRO.bytesPorPedido) }))));
  ok("un cuerpo de más de 512 KB: 413", grande.status === 413, `${grande.status}`);
  const malformado = await leer(await rutaRegistrar.POST(pedidoCrudo(`${BASE}/cobros-offline/registrar`, f.A, "{no es json")));
  ok("un cuerpo que no es JSON: 400", malformado.status === 400, `${malformado.status}`);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("10. La caja por operador sigue mandando (DEC-0012)");

  const idW = nuevoId("caja-de-a");
  const cW = cobroCola(idW, { turnoId: turnoA, voucher: f.voucherA });
  await registrarUno(f.B, cW);
  const antesW = await huella();
  const rB = await replay(f.B, cW);
  ok("B con su PIN no crea la venta de un cobro de la caja de A", rB.ok !== true && [403, 409].includes(rB.status), `${rB.status} ${rB.error ?? ""}`);
  const rSinPin = await replay(f.sinPin, cW);
  ok("sin PIN tampoco (428)", rSinPin.status === 428, `${rSinPin.status}`);
  igual("sin escrituras económicas", await huella(), antesW);
  const cWb = await cobroDe(idW);
  ok("registrarlo no le dio autoridad: el cobro sigue PENDIENTE", cWb.estado === "PENDIENTE" && cWb.ventaId === null);
  const rA = await replay(f.A, cW);
  ok("A, con su PIN, en su caja: la venta se crea y el cobro se sincroniza", rA.ok === true && (await cobroDe(idW)).estado === "SINCRONIZADA", `${rA.status} ${rA.error ?? ""}`);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("11. El registro espera una venta larga sin vencer");

  // `crear` puede tener el candado hasta 30 s. El registro lo espera con los
  // mismos límites (LIMITES_TRANSACCION_DEL_LOCAL); con el default de Prisma
  // vencía a los 5 s con P2028 y el pedido entero respondía 500. El candado se
  // retiene apenas más que esos 5 s, contados desde que el registro empezó.
  {
    const VIEJO_LIMITE_MS = 5_000;
    const id = nuevoId("espera-larga");
    const retencion = await retenerCandadoDelLocal(prisma, f.local.id);
    let pRegistro; let enCandado = 0; let siguiaEsperando = 0; let t0 = 0;
    try {
      t0 = Date.now();
      pRegistro = registrarUno(f.A, cobroCola(id, { turnoId: turnoA }));
      enCandado = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
      await new Promise((r) => setTimeout(r, Math.max(0, VIEJO_LIMITE_MS + 750 - (Date.now() - t0))));
      siguiaEsperando = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 1_000);
    } finally {
      await retencion.soltar();
    }
    const r = await pRegistro;
    const espera = Date.now() - t0;
    ok("el registro quedó esperando el candado durante más que el viejo límite", enCandado === 1 && siguiaEsperando === 1 && espera > VIEJO_LIMITE_MS,
      `${enCandado} ${siguiaEsperando} ${espera} ms`);
    ok("terminó 200 CREADO, no 500", r.status === 200 && r.resultado === "CREADO", `${r.status} ${r.resultado ?? ""} ${r.error ?? ""}`);
    const filas = await prisma.cobroOffline.findMany({ where: { clientTxnId: id } });
    ok("exactamente un cobro, PENDIENTE, de su local y su turno", filas.length === 1 && filas[0].estado === "PENDIENTE"
      && filas[0].localId === f.local.id && filas[0].turnoId === turnoA, JSON.stringify(filas.map((x) => x.estado)));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("12. Un valor que la columna no puede guardar no tumba el pedido");

  {
    const antes = await huella();
    const ids = {
      turno: nuevoId("turno-fuera-int4"),
      cuenta: nuevoId("cuenta-fuera-int4"),
      total: nuevoId("total-fuera-decimal"),
      totalRedondeado: nuevoId("total-redondeado-fuera"),
      borde: nuevoId("total-borde"),
      vecino: nuevoId("vecino-valido"),
    };
    const r = await registrar(f.A, [
      cobroCola(ids.turno, { turnoId: MAXIMO_INT32 + 1 }),
      cobroCola(ids.cuenta, { turnoId: turnoA, extra: { userId: MAXIMO_INT32 + 1 } }),
      cobroCola(ids.total, { turnoId: turnoA, extra: { total: 10_000_000_000 } }),
      cobroCola(ids.totalRedondeado, { turnoId: turnoA, extra: { total: 9_999_999_999.999 } }),
      cobroCola(ids.borde, { turnoId: turnoA, extra: { total: 9_999_999_999.99 } }),
      cobroCola(ids.vecino, { turnoId: turnoA }),
    ]);
    ok("el pedido responde 200, no 500", r.status === 200 && r.ok === true, `${r.status} ${r.error ?? ""}`);
    const [rTurno, rCuenta, rTotal, rRedondeado, rBorde, rVecino] = r.resultados ?? [];
    for (const [nombre, res, id] of [
      ["turno fuera del int4", rTurno, ids.turno],
      ["cuenta fuera del int4", rCuenta, ids.cuenta],
      ["total de once enteros", rTotal, ids.total],
      ["total que redondeado no entra (9999999999.999)", rRedondeado, ids.totalRedondeado],
    ]) {
      ok(`${nombre}: RECHAZADO INVALIDO, sin fila`, res?.resultado === "RECHAZADO" && res.codigo === "INVALIDO" && !(await cobroDe(id)), JSON.stringify(res));
    }
    const borde = await cobroDe(ids.borde);
    ok("el máximo exacto del Decimal(12,2) se guarda tal cual", rBorde?.resultado === "CREADO" && borde?.totalDeclarado.toString() === "9999999999.99",
      `${JSON.stringify(rBorde)} ${borde?.totalDeclarado}`);
    ok("el vecino válido se registra", rVecino?.resultado === "CREADO" && (await cobroDe(ids.vecino))?.estado === "PENDIENTE", JSON.stringify(rVecino));
    igual("sin escrituras económicas", await huella(), antes);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("13. Dos locales registran el mismo id a la vez: decide el índice único");

  // Los candados son por local, así que A y B no se ordenan entre sí. Para que
  // la carrera OCURRA, un disparador que existe solo durante esta sección
  // detiene al primero DESPUÉS de insertar y antes de confirmar: el segundo no
  // ve la fila, inserta, y queda esperando en el índice único (se observa en
  // pg_locks). Al soltar, el primero confirma y el segundo recibe el P2002.
  // El disparador se borra en el `finally`, y solo actúa sobre los ids de esta
  // corrida.
  {
    const CLAVE_DETENER = 2_000_000_128;
    const prefijo = `${marca}-entre-locales-`;
    const ladoA = (id) => registrar(f.A, [cobroCola(id, { turnoId: turnoA })]);
    const ladoB = (id) => registrar(f.otro, [cobroCola(id, { turnoId: turnoOtro, localId: f.otroLocal.id, producto: f.productoOtro, operador: null })]);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ci_cobros_offline_detener() RETURNS trigger AS $$
      BEGIN
        IF NEW."clientTxnId" LIKE '${prefijo}%' THEN PERFORM pg_advisory_xact_lock(${CLAVE_DETENER}); END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ci_cobros_offline_detener ON "CobroOffline"`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ci_cobros_offline_detener AFTER INSERT ON "CobroOffline" FOR EACH ROW EXECUTE FUNCTION ci_cobros_offline_detener()`);
      for (const [orden, primero, segundo, ganador] of [
        ["A primero", ladoA, ladoB, f.local.id],
        ["B primero", ladoB, ladoA, f.otroLocal.id],
      ]) {
        const id = `${prefijo}${orden.replace(" ", "-")}`;
        const antes = await huella();
        const retencion = await retenerCandadoDelLocal(prisma, CLAVE_DETENER);
        let p1; let p2; let detenido = 0; let enIndice = 0;
        try {
          p1 = primero(id);
          detenido = await esperarEnCandadoDelLocal(prisma, CLAVE_DETENER, 1, 10_000);
          p2 = segundo(id);
          enIndice = await esperarEnFila(prisma, 1, 10_000);
        } finally {
          await retencion.soltar();
        }
        const [r1, r2] = await Promise.all([p1, p2]);
        ok(`${orden}: el primero, detenido después de insertar; el segundo, esperando en el índice`, detenido === 1 && enIndice >= 1, `${detenido} ${enIndice}`);
        ok(`${orden}: ningún 500`, r1.status === 200 && r2.status === 200, `${r1.status} ${r2.status}`);
        const filas = await prisma.cobroOffline.findMany({ where: { clientTxnId: id } });
        ok(`${orden}: una sola fila, del local que confirmó primero`, filas.length === 1 && filas[0].localId === ganador, JSON.stringify(filas.map((x) => x.localId)));
        const res1 = r1.resultados?.[0];
        const res2 = r2.resultados?.[0];
        ok(`${orden}: el primero, CREADO`, res1?.resultado === "CREADO", JSON.stringify(res1));
        ok(`${orden}: el perdedor, RECHAZADO ID_DE_OTRO_LOCAL y nada más (ni estado, ni ventaId, ni turno, ni payload)`,
          res2?.resultado === "RECHAZADO" && res2.codigo === "ID_DE_OTRO_LOCAL"
          && JSON.stringify(Object.keys(res2).sort()) === JSON.stringify(["clientTxnId", "codigo", "resultado"]), JSON.stringify(res2));
        const fila = filas[0];
        const delGanador = ganador === f.local.id
          ? cobroCola(id, { turnoId: turnoA, extra: { createdAt: fila?.payload?.createdAt } })
          : cobroCola(id, { turnoId: turnoOtro, localId: f.otroLocal.id, producto: f.productoOtro, operador: null, extra: { createdAt: fila?.payload?.createdAt } });
        const registrador = ganador === f.local.id ? f.cuenta.id : f.cuentaOtroLocal.id;
        ok(`${orden}: contenido y registrador del ganador intactos`, fila?.payloadHash === hashDePayload(sanearCobro(delGanador).payload)
          && fila.registradoPorUsuarioId === registrador && fila.ultimoRegistroEn.getTime() === fila.registradoEn.getTime());
        igual(`${orden}: sin escrituras económicas`, await huella(), antes);
      }
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ci_cobros_offline_detener ON "CobroOffline"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ci_cobros_offline_detener()`);
    }
    const quedo = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'ci_cobros_offline_detener'`;
    igual("el disparador de la prueba no quedó instalado", quedo[0].n, 0);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("14. El ámbito no depende del hash");

  // El hash protege que el contenido no cambie; el local protege de quién es.
  // En la práctica el contenido de otro local nunca da el mismo hash (el local
  // va adentro), así que la sección 2 no distingue las dos defensas. Acá se
  // fuerza el caso que el hash no puede ver: la fila de A con EXACTAMENTE el
  // hash que va a mandar B. Lo único que queda en pie es el chequeo de ámbito.
  {
    const id = nuevoId("hash-forzado");
    await registrarUno(f.A, cobroCola(id, { turnoId: turnoA }));
    const deB = cobroCola(id, { turnoId: turnoOtro, localId: f.otroLocal.id, producto: f.productoOtro, operador: null });
    await prisma.cobroOffline.update({ where: { clientTxnId: id }, data: { payloadHash: hashDePayload(sanearCobro(deB).payload) } });
    const antes = await cobroDe(id);
    const r = await registrar(f.otro, [deB]);
    const res = r.resultados?.[0];
    ok("B, con el mismo hash: RECHAZADO ID_DE_OTRO_LOCAL y nada más", r.status === 200 && res?.resultado === "RECHAZADO" && res.codigo === "ID_DE_OTRO_LOCAL"
      && JSON.stringify(Object.keys(res).sort()) === JSON.stringify(["clientTxnId", "codigo", "resultado"]), JSON.stringify(res));
    const despues = await cobroDe(id);
    ok("la fila de A intacta: local, registrador, contenido, estado y ultimoRegistroEn",
      despues.localId === f.local.id && despues.registradoPorUsuarioId === antes.registradoPorUsuarioId
      && despues.payloadHash === antes.payloadHash && JSON.stringify(despues.payload) === JSON.stringify(antes.payload)
      && despues.estado === antes.estado && despues.ultimoRegistroEn.getTime() === antes.ultimoRegistroEn.getTime()
      && despues.updatedAt.getTime() === antes.updatedAt.getTime());
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("15. Textos que la base no guarda e ids que no son ids: INVALIDO, sin tumbar el pedido");

  // PostgreSQL no guarda un NUL ni un surrogate suelto: llegaban a Prisma y el
  // pedido entero respondía 500. Y un id declarado se toma solo como entero o
  // decimal llano: `true` ya no es la cuenta 1, ni "0x7fffffff" un turno.
  {
    const ALTO = "\uD83D";
    const BAJO = "\uDE00";
    const antes = await huella();
    const conLinea = (id, cambios) => {
      const c = cobroCola(id, { turnoId: turnoA });
      c.items = [{ ...c.items[0], ...cambios }];
      return c;
    };
    const casos = [
      ["formaPago con NUL", (id) => cobroCola(id, { turnoId: turnoA, extra: { formaPago: "efectivo\u0000" } }), false],
      ["nombre de línea con NUL", (id) => conLinea(id, { nombre: "Producto\u0000" }), false],
      ["surrogate alto suelto", (id) => conLinea(id, { nombre: `Producto ${ALTO}` }), false],
      ["surrogate bajo suelto", (id) => conLinea(id, { nombre: `Producto ${BAJO}` }), false],
      ["userId true", (id) => cobroCola(id, { turnoId: turnoA, extra: { userId: true } }), false],
      ['turnoId "0x7fffffff"', (id) => cobroCola(id, { turnoId: "0x7fffffff" }), false],
      ['operadorId "1e3"', (id) => cobroCola(id, { turnoId: turnoA, extra: { operadorId: "1e3" } }), false],
      ['clienteId "1.0"', (id) => cobroCola(id, { turnoId: turnoA, extra: { clienteId: "1.0" } }), false],
      ["userId 1.5", (id) => cobroCola(id, { turnoId: turnoA, extra: { userId: 1.5 } }), false],
      ["clienteId objeto", (id) => cobroCola(id, { turnoId: turnoA, extra: { clienteId: { id: 1 } } }), false],
      ["operadorId arreglo", (id) => cobroCola(id, { turnoId: turnoA, extra: { operadorId: [1] } }), false],
      ["pareja surrogate válida", (id) => conLinea(id, { nombre: `Producto ${ALTO}${BAJO}` }), true],
      ["Unicode normal", (id) => conLinea(id, { nombre: "Ñandú, café ☕ 日本語" }), true],
      ["ids en decimal textual", (id) => cobroCola(id, { turnoId: String(turnoA), extra: { userId: String(f.cuenta.id), operadorId: String(MAXIMO_INT32) } }), true],
      ["vecino válido", (id) => cobroCola(id, { turnoId: turnoA }), true],
    ].map(([nombre, armar, valido]) => {
      const id = nuevoId("texto-id");
      return { nombre, id, cobro: armar(id), valido };
    });
    const r = await registrar(f.A, casos.map((c) => c.cobro));
    ok("el pedido responde 200, no 500", r.status === 200 && r.ok === true, `${r.status} ${r.error ?? ""}`);
    for (const [i, caso] of casos.entries()) {
      const res = r.resultados?.[i];
      const fila = await cobroDe(caso.id);
      if (caso.valido) {
        ok(`${caso.nombre}: CREADO, con su fila`, res?.resultado === "CREADO" && fila != null, JSON.stringify(res));
      } else {
        ok(`${caso.nombre}: RECHAZADO INVALIDO, sin fila`, res?.resultado === "RECHAZADO" && res.codigo === "INVALIDO" && fila == null, JSON.stringify(res));
      }
    }
    const pareja = await cobroDe(casos.find((c) => c.nombre === "pareja surrogate válida").id);
    const unicode = await cobroDe(casos.find((c) => c.nombre === "Unicode normal").id);
    ok("los textos válidos se guardan tal cual", pareja?.payload.items[0].nombre === `Producto ${ALTO}${BAJO}`
      && unicode?.payload.items[0].nombre === "Ñandú, café ☕ 日本語");
    const decimal = await cobroDe(casos.find((c) => c.nombre === "ids en decimal textual").id);
    ok("un id en decimal textual sigue siendo ese id", decimal?.turnoId === turnoA && decimal.cuentaDeclaradaId === f.cuenta.id
      && decimal.operadorDeclaradoId === MAXIMO_INT32 && decimal.estado === "PENDIENTE",
      JSON.stringify(decimal && { t: decimal.turnoId, c: decimal.cuentaDeclaradaId, o: decimal.operadorDeclaradoId, e: decimal.estado }));
    igual("sin escrituras económicas", await huella(), antes);
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
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
