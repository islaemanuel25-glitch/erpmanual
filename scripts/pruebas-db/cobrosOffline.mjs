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
// PR C — cuando la venta no se puede escribir:
//  16. los rechazos que se reintentan dejan el cobro PENDIENTE, con su rastro;
//  17. los del contenido (stock, lista) lo pasan a REQUIERE_REVISION, y el
//      rechazo sobrevive al rollback de crear;
//  18. la caja original cerrada o de otro día: revisión, sin tocar el turno;
//  19. un id que es venta de otro local: ni duplicada ni datos ajenos;
//  20. un rechazo mientras otro pedido escribe la venta: nunca venta + rechazo;
//  21. quién ve qué cobros;
//  22. descartar: permiso, local, motivo, evidencia, terminal, crear no revive;
//  23. descartar contra la venta y contra otro descarte, con el candado real.
//
// PR B — el motor de sincronización del POS (lib/pos-ventas/sincronizacionOffline.js),
// el MISMO que corre la pantalla, contra estos handlers:
//  24. tres ventas al reconectar, y la respuesta perdida;
//  25. 428 y varios operadores con sus cajas: nadie sincroniza la de otro;
//  26. el cierre: una caja con cobros PENDIENTES no se corta ni se cierra;
//  27. revisión sin reintentos, y el descarte que la saca de la cola;
//  28. otro local: ni se manda ni se apropia.
//
// Los cuerpos son los que arma la pantalla: el ítem de la cola de
// `guardarVentaPendiente` y el pedido de `procesarCola`.
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
const { LIMITES_REGISTRO, MAXIMO_INT32, sanearCobro, hashDePayload } = await import("../../lib/pos-ventas/cobroOffline.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");
const rutaRegistrar = await import("../../app/api/pos-ventas/cobros-offline/registrar/route.js");
const rutaListar = await import("../../app/api/pos-ventas/cobros-offline/route.js");
const rutaDetalle = await import("../../app/api/pos-ventas/cobros-offline/[id]/route.js");
const rutaDescartar = await import("../../app/api/pos-ventas/cobros-offline/[id]/descartar/route.js");
const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");
const rutaIniciarCierre = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaContexto = await import("../../app/api/contexto-activo/get/route.js");
const { sincronizarCola, RESULTADO_SINCRONIZACION, ESTADO_LOCAL, CODIGO_COBROS_OFFLINE_PENDIENTES } = await import("../../lib/pos-ventas/sincronizacionOffline.js");
const { PERMISO_RESOLVER_COBROS_OFFLINE } = await import("../../lib/pos-ventas/cobroOffline.js");
const { ACCION_DESCARTAR_COBRO_OFFLINE } = await import("../../lib/pos-ventas/cobroOfflineServidor.js");

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
const sesionDe = (usuario, localId, permisos = ["pos.usar"]) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos }, SECRETO, { expiresIn: "1h" });
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
const pedidoGet = (url, quien) => {
  const req = new Request(url, { method: "GET", headers: { cookie: cookies(quien) } });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const conId = (id) => ({ params: Promise.resolve({ id: String(id) }) });
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
    // Quien puede resolver cobros offline: la misma cuenta, con el permiso.
    resolutor: { sesion: sesionDe(cuenta, local.id, ["pos.usar", PERMISO_RESOLVER_COBROS_OFFLINE]), operador: pin(opA) },
    resolutorOtroLocal: { sesion: sesionDe(cuentaOtroLocal, otroLocal.id, ["pos.usar", PERMISO_RESOLVER_COBROS_OFFLINE]) },
    // Quien ve todas las cajas del local, sin poder resolver.
    supervisor: { sesion: sesionDe(otraCuenta, local.id, ["pos.usar", "turnos.ver_todos"]) },
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

  const abrir = async (quien) =>
    leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000, turnoOperativoId: await turnoOperativoDeSesion(prisma, quien) })));

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
  // La reversión se lleva la sincronización: sin venta y sin vínculo. Desde la
  // PR C además se anota el rechazo, y como el stock no se arregla
  // reintentando el mismo cobro, queda en revisión (sección 17).
  ok("y el cobro no se sincronizó: sin venta, sin vínculo, con el rechazo anotado", cr.estado === "REQUIERE_REVISION" && cr.ventaId === null
    && cr.ultimoRechazoCodigo === "STOCK_INSUFICIENTE" && !(await ventaDe(idRollback)), JSON.stringify({ e: cr.estado, c: cr.ultimoRechazoCodigo }));
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

  // ═════════════════════════════════════════════════════════════════════════
  // PR C — LO QUE PASA CUANDO LA VENTA NO SE PUEDE ESCRIBIR
  // ═════════════════════════════════════════════════════════════════════════
  const listar = async (quien, estado) =>
    leer(await rutaListar.GET(pedidoGet(`${BASE}/cobros-offline${estado ? `?estado=${estado}` : ""}`, quien)));
  const detalle = async (quien, id) => leer(await rutaDetalle.GET(pedidoGet(`${BASE}/cobros-offline/${id}`, quien), conId(id)));
  const descartar = async (quien, id, motivo) =>
    leer(await rutaDescartar.POST(pedido(`${BASE}/cobros-offline/${id}/descartar`, quien, { motivo }), conId(id)));
  /** Lo que el rechazo deja en el cobro. */
  const rastro = (c) => c && { estado: c.estado, intentos: c.intentos, status: c.ultimoRechazoStatus, codigo: c.ultimoRechazoCodigo, motivo: c.revisionMotivo, ultimoIntento: c.ultimoIntentoEn instanceof Date };
  const turnoCompleto = (id) => prisma.turno.findUnique({ where: { id } });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("16. Rechazos que se reintentan: el cobro sigue PENDIENTE, con su rastro");

  {
    // Sin PIN: 428. La caja de A sigue abierta: A puede sincronizarla.
    const id = nuevoId("sin-pin");
    const c = cobroCola(id, { turnoId: turnoA });
    await registrarUno(f.A, c);
    const r = await replay(f.sinPin, c);
    ok("sin PIN: 428", r.status === 428, `${r.status}`);
    const cobro = await cobroDe(id);
    igual("PENDIENTE, un intento, status 428, sin código", rastro(cobro), { estado: "PENDIENTE", intentos: 1, status: 428, codigo: null, motivo: null, ultimoIntento: true });
    ok("con el mensaje del rechazo", typeof cobro.ultimoRechazoMensaje === "string" && cobro.ultimoRechazoMensaje.length > 0);

    // B con su PIN intenta la caja de A, sin voucher: TURNO_AJENO, y la caja de
    // A sigue operativa: el dueño todavía puede.
    const rB = await replay(f.B, c);
    ok("B en la caja de A: 403 TURNO_AJENO", rB.status === 403 && rB.code === "TURNO_AJENO", `${rB.status} ${rB.code}`);
    igual("sigue PENDIENTE, dos intentos, último 403 TURNO_AJENO", rastro(await cobroDe(id)), { estado: "PENDIENTE", intentos: 2, status: 403, codigo: "TURNO_AJENO", motivo: null, ultimoIntento: true });

    // Con el voucher de A: VENTA_DE_OTRO_OPERADOR, también se reintenta.
    const conVoucher = { ...c, operadorVoucher: f.voucherA };
    const rV = await replay(f.B, conVoucher);
    ok("B con el voucher de A: 409 VENTA_DE_OTRO_OPERADOR", rV.status === 409 && rV.code === "VENTA_DE_OTRO_OPERADOR", `${rV.status} ${rV.code}`);
    igual("sigue PENDIENTE, tres intentos", rastro(await cobroDe(id)), { estado: "PENDIENTE", intentos: 3, status: 409, codigo: "VENTA_DE_OTRO_OPERADOR", motivo: null, ultimoIntento: true });

    // El dueño, con su PIN: la venta se crea, el cobro se sincroniza y el rastro queda.
    const rA = await replay(f.A, c);
    const final = await cobroDe(id);
    ok("A la sincroniza: SINCRONIZADA, con su venta, y los tres intentos fallidos quedan", rA.ok === true && final.estado === "SINCRONIZADA"
      && final.ventaId === rA.ventaId && final.intentos === 3, `${rA.status} ${JSON.stringify(rastro(final))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("17. Rechazos que no se arreglan reintentando: REQUIERE_REVISION");

  {
    // Stock: la transacción de crear se revierte entera, y el rechazo sobrevive.
    const antes = await huella();
    const idStock = nuevoId("stock");
    const cStock = cobroCola(idStock, { turnoId: turnoA, cantidad: 5000 });
    await registrarUno(f.A, cStock);
    const rS = await replay(f.A, cStock);
    ok("stock insuficiente: 409 STOCK_INSUFICIENTE", rS.status === 409 && rS.code === "STOCK_INSUFICIENTE", `${rS.status} ${rS.code}`);
    ok("la venta se revirtió", !(await ventaDe(idStock)));
    igual("el rechazo sobrevivió al rollback: REQUIERE_REVISION por STOCK_INSUFICIENTE", rastro(await cobroDe(idStock)),
      { estado: "REQUIERE_REVISION", intentos: 1, status: 409, codigo: "STOCK_INSUFICIENTE", motivo: "STOCK_INSUFICIENTE", ultimoIntento: true });
    igual("sin escrituras económicas", await huella(), antes);

    // Lista de precios que ya no corresponde.
    const idLista = nuevoId("lista");
    const cLista = cobroCola(idLista, { turnoId: turnoA });
    cLista.items = [{ ...cLista.items[0], listaPrecioId: 999999 }];
    await registrarUno(f.A, cLista);
    const rL = await replay(f.A, cLista);
    ok("lista cambiada: 409 LISTA_PRECIOS_CAMBIADA", rL.status === 409 && rL.code === "LISTA_PRECIOS_CAMBIADA", `${rL.status} ${rL.code}`);
    igual("REQUIERE_REVISION por LISTA_PRECIOS_CAMBIADA", rastro(await cobroDe(idLista)),
      { estado: "REQUIERE_REVISION", intentos: 1, status: 409, codigo: "LISTA_PRECIOS_CAMBIADA", motivo: "LISTA_PRECIOS_CAMBIADA", ultimoIntento: true });

    // Un rechazo posterior no reescribe por qué entró a revisión.
    await replay(f.sinPin, cLista);
    igual("el segundo rechazo queda como último, el motivo de revisión no cambia", rastro(await cobroDe(idLista)),
      { estado: "REQUIERE_REVISION", intentos: 2, status: 428, codigo: null, motivo: "LISTA_PRECIOS_CAMBIADA", ultimoIntento: true });
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("18. La caja original cerró o es de otro día: REQUIERE_REVISION, sin tocar el turno");

  {
    // B cierra su caja por la ruta real, y DESPUÉS llega un cobro de esa caja.
    // Hasta PR B el cobro se registraba antes del cierre; desde PR B una caja
    // con un cobro PENDIENTE no se cierra (sección 24), así que la caja cerrada
    // con un cobro sin venta se produce así: el equipo que lo guardó estaba sin
    // conexión cuando la caja se cerró, y lo registra al volver.
    const idCerrada = nuevoId("caja-cerrada");
    const cCerrada = cobroCola(idCerrada, { turnoId: turnoB, operador: f.opB });
    const cierre = await leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, f.B, { turnoId: turnoB, montoRealEfectivo: 1000 })));
    requerir("B cierra su caja", cierre.ok === true, `${cierre.status} ${cierre.error ?? ""}`);
    await registrarUno(f.B, cCerrada);
    const turnoAntes = await turnoCompleto(turnoB);
    const antes = await huella();
    const r = await replay(f.B, cCerrada);
    ok("su venta: 403 TURNO_CERRADO", r.status === 403 && r.code === "TURNO_CERRADO", `${r.status} ${r.code}`);
    igual("REQUIERE_REVISION por TURNO_CERRADO", rastro(await cobroDe(idCerrada)),
      { estado: "REQUIERE_REVISION", intentos: 1, status: 403, codigo: "TURNO_CERRADO", motivo: "TURNO_CERRADO", ultimoIntento: true });
    // Aunque el rechazo diga otra cosa (sin PIN), con la caja cerrada va a revisión igual.
    // (Registrar acepta un turno cerrado del local: es evidencia, no venta.)
    const idCerrada2 = nuevoId("caja-cerrada-sin-pin");
    const cCerrada2 = cobroCola(idCerrada2, { turnoId: turnoB, operador: f.opB });
    await registrarUno(f.B, cCerrada2);
    await replay(f.sinPin, cCerrada2);
    igual("un 428 sobre una caja cerrada también va a revisión, por la caja", rastro(await cobroDe(idCerrada2)),
      { estado: "REQUIERE_REVISION", intentos: 1, status: 428, codigo: null, motivo: "TURNO_CERRADO", ultimoIntento: true });
    igual("el turno cerrado no cambió", JSON.stringify(await turnoCompleto(turnoB)), JSON.stringify(turnoAntes));
    igual("sin escrituras económicas", await huella(), antes);

    // Otro día: un operador nuevo abre su caja, y la apertura se lleva a ayer.
    const opC = await prisma.operadorLocal.create({ data: { nombre: `${marca}-c`, pinHash: "x" } });
    creado.operadorIds.push(opC.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: opC.id, localId: f.local.id } });
    const C = { sesion: f.A.sesion, operador: firmarTokenOperador({ operadorId: opC.id, nombre: opC.nombre, localId: f.local.id }) };
    const abreC = await abrir(C);
    requerir("C abre su caja", abreC.ok === true, `${abreC.status} ${abreC.error ?? ""}`);
    const turnoC = abreC.turno.id;
    const idAyer = nuevoId("otro-dia");
    const cAyer = cobroCola(idAyer, { turnoId: turnoC, operador: opC });
    await registrarUno(C, cAyer);
    await prisma.turno.update({ where: { id: turnoC }, data: { apertura: new Date(Date.now() - 36 * 3600 * 1000) } });
    const rAyer = await replay(C, cAyer);
    ok("caja de otro día: 403 TURNO_DE_OTRO_DIA", rAyer.status === 403 && rAyer.code === "TURNO_DE_OTRO_DIA", `${rAyer.status} ${rAyer.code}`);
    igual("REQUIERE_REVISION por TURNO_DE_OTRO_DIA", rastro(await cobroDe(idAyer)),
      { estado: "REQUIERE_REVISION", intentos: 1, status: 403, codigo: "TURNO_DE_OTRO_DIA", motivo: "TURNO_DE_OTRO_DIA", ultimoIntento: true });
    f.idCajaCerrada = idCerrada;
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("19. Un id que es una venta de OTRO local: ni duplicada ni datos ajenos");

  {
    const id = nuevoId("cruce-local");
    const c = cobroCola(id, { turnoId: turnoA });
    await registrarUno(f.A, c);
    const ajena = await replay(f.otro, cobroCola(id, { turnoId: turnoOtro, localId: f.otroLocal.id, producto: f.productoOtro, operador: null }), f.otroLocal.id);
    requerir("el otro local tiene una venta con ese id", ajena.ok === true && ajena.isDuplicate !== true, `${ajena.status} ${ajena.error ?? ""}`);
    const r = await replay(f.A, c);
    ok("A recibe 409 ID_DE_OTRO_LOCAL, no un duplicado", r.status === 409 && r.code === "ID_DE_OTRO_LOCAL" && r.isDuplicate !== true, `${r.status} ${r.code}`);
    ok("sin ningún dato de la venta ajena", r.ventaId === undefined && r.numero === undefined && r.breakdown === undefined, JSON.stringify(r));
    igual("el cobro de A: REQUIERE_REVISION por ID_DE_OTRO_LOCAL, sin vínculo", { ...rastro(await cobroDe(id)), ventaId: (await cobroDe(id)).ventaId },
      { estado: "REQUIERE_REVISION", intentos: 1, status: 409, codigo: "ID_DE_OTRO_LOCAL", motivo: "ID_DE_OTRO_LOCAL", ultimoIntento: true, ventaId: null });

    // Y el rechazo de otro local no toca el cobro de este.
    const idAislado = nuevoId("aislado");
    await registrarUno(f.A, cobroCola(idAislado, { turnoId: turnoA }));
    const rOtro = await replay(f.otro, cobroCola(idAislado, { turnoId: 999999999, localId: f.otroLocal.id, producto: f.productoOtro, operador: null }), f.otroLocal.id);
    ok("el otro local es rechazado por su turno", rOtro.ok !== true, `${rOtro.status}`);
    igual("y el cobro de A no registra ese intento", rastro(await cobroDe(idAislado)), { estado: "PENDIENTE", intentos: 0, status: null, codigo: null, motivo: null, ultimoIntento: false });
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("20. Un rechazo mientras otro pedido escribe la venta: nunca venta + cobro rechazado");

  {
    // A escribe la venta y queda detenido en la fila de stock, con el candado
    // del local tomado. Mientras, un pedido sin PIN del mismo cobro es
    // rechazado (428) antes de la transacción, y su anotación espera el
    // candado. Al soltar, la venta confirma y la anotación la encuentra.
    const id = nuevoId("rechazo-y-venta");
    const c = cobroCola(id, { turnoId: turnoA });
    await registrarUno(f.A, c);
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pRechazo; let enFila = 0; let enCandado = 0;
    try {
      pVenta = replay(f.A, c);
      enFila = await esperarEnFila(prisma, 1);
      pRechazo = replay(f.sinPin, c);
      enCandado = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
    } finally {
      await fila.soltar();
    }
    const [rv, rr] = await Promise.all([pVenta, pRechazo]);
    ok("la venta se escribió y el otro pedido fue rechazado (428), con su anotación esperando el candado", rv.ok === true && rr.status === 428 && enFila >= 1 && enCandado === 1,
      `${rv.status} ${rr.status} ${enFila} ${enCandado}`);
    const cobro = await cobroDe(id);
    ok("el cobro queda SINCRONIZADA con la venta, sin el rechazo anotado", cobro.estado === "SINCRONIZADA" && cobro.ventaId === rv.ventaId && cobro.intentos === 0,
      JSON.stringify(rastro(cobro)));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("21. Ver los cobros: cada uno ve su caja, quien ve todas ve todas, nadie ve otro local");

  {
    const pendientesA = await listar(f.A);
    const cajasA = new Set(pendientesA.items?.map((i) => i.turno?.id));
    ok("A ve los de su caja y no los de B", pendientesA.ok === true && cajasA.has(turnoA) && !cajasA.has(turnoB), JSON.stringify([...cajasA]));
    const sinTurno = (await prisma.cobroOffline.findMany({ where: { localId: f.local.id, turnoId: null, estado: { in: ["PENDIENTE", "REQUIERE_REVISION"] } }, select: { id: true } })).map((x) => x.id);
    ok("A no ve los que no son de ninguna caja", !pendientesA.items.some((i) => sinTurno.includes(i.id)), `${sinTurno.length}`);
    const todos = await listar(f.supervisor);
    const cajasSup = new Set(todos.items?.map((i) => i.turno?.id));
    ok("quien ve todas las cajas ve también los de B y los sin caja", cajasSup.has(turnoA) && cajasSup.has(turnoB) && sinTurno.every((sid) => todos.items.some((i) => i.id === sid)));
    const delResolutor = await listar(f.resolutor);
    ok("quien resuelve ve los de todas las cajas", delResolutor.items?.length === todos.items.length, `${delResolutor.items?.length} ${todos.items.length}`);
    const otroLocal = await listar(f.resolutorOtroLocal);
    ok("el otro local no ve ninguno de este", otroLocal.ok === true && !otroLocal.items.some((i) => i.localId === f.local.id));
    ok("un estado desconocido: 400", (await listar(f.A, "INVENTADO")).status === 400);
    const revision = await listar(f.supervisor, "REQUIERE_REVISION");
    ok("se filtra por estado", revision.items.length > 0 && revision.items.every((i) => i.estado === "REQUIERE_REVISION"));

    const cerrada = await cobroDe(f.idCajaCerrada);
    const d = await detalle(f.supervisor, cerrada.id);
    ok("el detalle trae caja, operador, hora, total, ítems, intentos, rechazo y motivo", d.ok === true && d.item.turno?.id === turnoB
      && d.item.turno.estado === "CERRADO" && d.item.operadorDeclarado?.id === f.opB.id && d.item.operadorDeclarado.nombre === f.opB.nombre
      && d.item.cobradoEnDispositivo && d.item.totalDeclarado === "1000" && d.item.payload.items.length === 1
      && d.item.intentos === 1 && d.item.ultimoRechazo?.codigo === "TURNO_CERRADO" && d.item.revisionMotivo === "TURNO_CERRADO",
      JSON.stringify(d.item && { t: d.item.turno, o: d.item.operadorDeclarado, total: d.item.totalDeclarado, r: d.item.ultimoRechazo }));
    ok("el detalle, desde la caja de A: 404", (await detalle(f.A, cerrada.id)).status === 404);
    ok("el detalle, desde otro local: 404", (await detalle(f.resolutorOtroLocal, cerrada.id)).status === 404);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("22. Descartar: con permiso, del local, con motivo; sin tocar nada económico");

  {
    const cerrada = await cobroDe(f.idCajaCerrada);
    const hashAntes = cerrada.payloadHash;
    const payloadAntes = JSON.stringify(cerrada.payload);
    ok("sin el permiso: 403", (await descartar(f.A, cerrada.id, "no se pudo sincronizar")).status === 403);
    ok("desde otro local: 404", (await descartar(f.resolutorOtroLocal, cerrada.id, "no se pudo sincronizar")).status === 404);
    ok("sin motivo: 400", (await descartar(f.resolutor, cerrada.id, "   ")).status === 400);
    igual("nada de eso lo tocó", (await cobroDe(f.idCajaCerrada)).estado, "REQUIERE_REVISION");

    const turnoAntes = await turnoCompleto(turnoB);
    const antes = await huella();
    const bitacoraAntes = await prisma.auditoriaBitacora.count({ where: { accion: ACCION_DESCARTAR_COBRO_OFFLINE, entidadId: String(cerrada.id) } });
    const r = await descartar(f.resolutor, cerrada.id, "  La caja cerró antes de volver la conexión  ");
    ok("con permiso y motivo: DESCARTADA", r.ok === true && r.estado === "DESCARTADA", `${r.status} ${r.error ?? ""}`);
    const despues = await cobroDe(f.idCajaCerrada);
    ok("quién, con qué PIN, cuándo y por qué", despues.estado === "DESCARTADA" && despues.resueltoPorUsuarioId === f.cuenta.id
      && despues.resueltoPorOperadorId === f.opA.id && despues.resueltoEn instanceof Date && despues.motivoResolucion === "La caja cerró antes de volver la conexión",
      JSON.stringify({ e: despues.estado, u: despues.resueltoPorUsuarioId, o: despues.resueltoPorOperadorId, m: despues.motivoResolucion }));
    ok("el cobro no se borró y su payload es el mismo", despues.payloadHash === hashAntes && JSON.stringify(despues.payload) === payloadAntes && despues.ventaId === null);
    const bitacora = await prisma.auditoriaBitacora.findMany({ where: { accion: ACCION_DESCARTAR_COBRO_OFFLINE, entidadId: String(cerrada.id) } });
    ok("una fila en la bitácora, con el motivo y el estado anterior", bitacora.length === bitacoraAntes + 1
      && bitacora.at(-1).localId === f.local.id && bitacora.at(-1).cambios?.[0]?.resolucion?.estadoAnterior === "REQUIERE_REVISION"
      && bitacora.at(-1).cambios[0].resolucion.motivo === "La caja cerró antes de volver la conexión");
    igual("ninguna venta, línea, pago, stock, movimiento, caja, puntos, contador, libro ni Finanzas", await huella(), antes);
    igual("el turno cerrado no cambió", JSON.stringify(await turnoCompleto(turnoB)), JSON.stringify(turnoAntes));

    const otraVez = await descartar(f.resolutor, cerrada.id, "otra vez");
    ok("DESCARTADA es terminal: 409 COBRO_YA_RESUELTO", otraVez.status === 409 && otraVez.code === "COBRO_YA_RESUELTO" && otraVez.estado === "DESCARTADA", `${otraVez.status} ${otraVez.code}`);
    const intentosAntes = (await cobroDe(f.idCajaCerrada)).intentos;
    const rCrear = await replay(f.A, cobroCola(f.idCajaCerrada, { turnoId: turnoA }));
    ok("crear no la revive: 409 COBRO_OFFLINE_DESCARTADO", rCrear.status === 409 && rCrear.code === "COBRO_OFFLINE_DESCARTADO" && !(await ventaDe(f.idCajaCerrada)), `${rCrear.status} ${rCrear.code}`);
    ok("y un cobro descartado no anota intentos", (await cobroDe(f.idCajaCerrada)).intentos === intentosAntes && (await cobroDe(f.idCajaCerrada)).estado === "DESCARTADA");

    // Uno SINCRONIZADA no se descarta.
    const sincronizado = (await prisma.cobroOffline.findFirst({ where: { localId: f.local.id, estado: "SINCRONIZADA" } }));
    const rSinc = await descartar(f.resolutor, sincronizado.id, "no");
    ok("SINCRONIZADA: 409 COBRO_YA_RESUELTO, sigue SINCRONIZADA", rSinc.status === 409 && rSinc.code === "COBRO_YA_RESUELTO"
      && (await prisma.cobroOffline.findUnique({ where: { id: sincronizado.id } })).estado === "SINCRONIZADA", `${rSinc.status} ${rSinc.code}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("23. Descartar contra la venta y contra otro descarte, con el candado real");

  {
    // Dos descartes a la vez: uno gana, el otro encuentra el cobro resuelto.
    const id = nuevoId("dos-descartes");
    await registrarUno(f.A, cobroCola(id, { turnoId: turnoA }));
    const cobroId = (await cobroDe(id)).id;
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pedidos = []; let enFila = 0;
    try {
      pedidos = [descartar(f.resolutor, cobroId, "primero"), descartar(f.resolutor, cobroId, "segundo")];
      enFila = await esperarEnCandadoDelLocal(prisma, f.local.id, 2);
    } finally {
      await candado.soltar();
    }
    const respuestas = await Promise.all(pedidos);
    ok("los dos esperaron el candado del local", enFila === 2, `${enFila}`);
    igual("uno descarta y el otro recibe COBRO_YA_RESUELTO", respuestas.map((x) => x.ok === true ? "DESCARTADA" : x.code).sort(), ["COBRO_YA_RESUELTO", "DESCARTADA"]);
    igual("una sola fila de bitácora", await prisma.auditoriaBitacora.count({ where: { accion: ACCION_DESCARTAR_COBRO_OFFLINE, entidadId: String(cobroId) } }), 1);

    // Descartar mientras crear escribe la venta: el descarte espera, la encuentra y no descarta.
    const idV = nuevoId("descarte-y-venta");
    const cV = cobroCola(idV, { turnoId: turnoA });
    await registrarUno(f.A, cV);
    const cobroV = (await cobroDe(idV)).id;
    const fila = await retenerFilaDeStock(prisma, { localId: f.local.id, productoLocalId: f.producto.productoLocalId });
    let pVenta; let pDescarte; let enStock = 0; let enCandado = 0;
    try {
      pVenta = replay(f.A, cV);
      enStock = await esperarEnFila(prisma, 1);
      pDescarte = descartar(f.resolutor, cobroV, "llegó tarde");
      enCandado = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
    } finally {
      await fila.soltar();
    }
    const [rv, rd] = await Promise.all([pVenta, pDescarte]);
    ok("crear detenido con la venta escrita y el descarte esperando el candado", enStock >= 1 && enCandado === 1, `${enStock} ${enCandado}`);
    // crear sincronizó el cobro en su misma transacción: el descarte, al
    // entrar, lo encuentra SINCRONIZADA y no lo toca.
    ok("la venta se escribió y el descarte se negó: 409 COBRO_YA_RESUELTO", rv.ok === true && rd.status === 409 && rd.code === "COBRO_YA_RESUELTO" && rd.estado === "SINCRONIZADA",
      `${rv.status} ${rd.status} ${rd.code} ${rd.estado}`);
    const cobroFinal = await cobroDe(idV);
    ok("nunca venta + DESCARTADA: el cobro quedó SINCRONIZADA con su venta", cobroFinal.estado === "SINCRONIZADA" && cobroFinal.ventaId === rv.ventaId && cobroFinal.resueltoEn === null,
      JSON.stringify(rastro(cobroFinal)));

    // Un cobro en revisión cuyo id ya es la venta de OTRA caja (sección 5): no
    // se descarta, y la respuesta no dice cuál es esa venta.
    const otraCaja = await prisma.cobroOffline.findFirst({ where: { localId: f.local.id, revisionMotivo: "ID_EN_OTRA_VENTA", estado: "REQUIERE_REVISION" } });
    requerir("hay un cobro cuyo id es la venta de otra caja", Boolean(otraCaja));
    const rOtra = await descartar(f.resolutor, otraCaja.id, "es de otra caja");
    ok("409 COBRO_CON_VENTA, sin el id de esa venta", rOtra.status === 409 && rOtra.code === "COBRO_CON_VENTA" && rOtra.ventaId === undefined, JSON.stringify(rOtra));
    igual("sigue en revisión, sin resolver", (await cobroDe(otraCaja.clientTxnId)).estado, "REQUIERE_REVISION");

    // La defensa de la misma caja: una venta de su caja con el cobro todavía
    // sin resolver no se produce por construcción (crear lo sincroniza en su
    // transacción y el registro lo reconcilia), así que el estado se FUERZA en
    // la base de prueba para ejercerla: el descarte reconcilia en vez de descartar.
    const idF = nuevoId("forzado-venta-sin-sincronizar");
    const cF = cobroCola(idF, { turnoId: turnoA });
    await registrarUno(f.A, cF);
    const vF = await replay(f.A, cF);
    await prisma.cobroOffline.update({ where: { clientTxnId: idF }, data: { estado: "PENDIENTE", ventaId: null, sincronizadaEn: null } });
    const rF = await descartar(f.resolutor, (await cobroDe(idF)).id, "forzado");
    const cobroF = await cobroDe(idF);
    ok("con la venta de su caja: 409 COBRO_CON_VENTA y el cobro reconciliado, no descartado", rF.status === 409 && rF.code === "COBRO_CON_VENTA"
      && rF.ventaId === vF.ventaId && cobroF.estado === "SINCRONIZADA" && cobroF.ventaId === vF.ventaId, JSON.stringify(rF));

    // Descartar espera una venta larga sin vencer (más de 5 s), y después descarta.
    const idL = nuevoId("descarte-espera");
    await registrarUno(f.A, cobroCola(idL, { turnoId: turnoA }));
    const cobroL = (await cobroDe(idL)).id;
    const retencion = await retenerCandadoDelLocal(prisma, f.local.id);
    let pL; let t0 = 0; let esperando = 0;
    try {
      t0 = Date.now();
      pL = descartar(f.resolutor, cobroL, "espera larga");
      esperando = await esperarEnCandadoDelLocal(prisma, f.local.id, 1, 5_000);
      await new Promise((res) => setTimeout(res, Math.max(0, 5_750 - (Date.now() - t0))));
    } finally {
      await retencion.soltar();
    }
    const rL = await pL;
    ok("el descarte esperó más de 5 s el candado y descartó", esperando === 1 && Date.now() - t0 > 5_000 && rL.ok === true, `${esperando} ${rL.status} ${rL.error ?? ""}`);
  }

  // ── PR B: el motor del POS contra los handlers reales ─────────────────────
  //
  // La cola es la del navegador en memoria (misma forma: leer/marcar/quitar) y
  // la API llama a los handlers. `llamadas` cuenta cuántas veces se pidió cada
  // venta, para afirmar que nada se pide dos veces ni se reintenta de más.
  const colaDePrueba = (items) => {
    const c = {
      items: items.map((i) => ({ ...i })),
      leer: () => ({ ok: true, items: c.items.map((i) => ({ ...i })) }),
      marcar: (id, sync) => { c.items = c.items.map((i) => (i.clientVentaId === id ? { ...i, sync } : i)); return { ok: true }; },
      quitar: (id) => { c.items = c.items.filter((i) => i.clientVentaId !== id); return { ok: true }; },
      ids: () => c.items.map((i) => i.clientVentaId),
      de: (id) => c.items.find((i) => i.clientVentaId === id),
    };
    return c;
  };
  const llamadas = [];
  const apiDe = (quien, { despuesDeCrear = null } = {}) => ({
    registrar: async (item) => {
      const r = await registrar(quien, [item]);
      return { red: true, status: r.status, data: r };
    },
    crear: async (cuerpo) => {
      llamadas.push(cuerpo.clientTxnId);
      const r = await leer(await rutaCrearVenta.POST(pedido(`${BASE}/crear`, quien, cuerpo)));
      return despuesDeCrear ? despuesDeCrear(r) : { red: true, status: r.status, data: r };
    },
  });
  const sincronizar = (cola, quien, operador, extra = {}) =>
    sincronizarCola({ cola, api: apiDe(quien, extra), localId: f.local.id, operadorActivoId: operador?.id ?? null });
  const vecesPedida = (id) => llamadas.filter((x) => x === id).length;
  const ventasCon = (id) => prisma.venta.count({ where: { clientTxnId: id } });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("24. PR B: tres ventas al reconectar, y la respuesta que se pierde");

  {
    // El grupo con que la pantalla guarda la venta: el del contexto activo, de la
    // misma función que usa el servidor (`getGrupoIdDeLocal`).
    const ctx = await leer(await rutaContexto.GET(pedidoGet(`http://ci/api/contexto-activo/get`, f.A)));
    ok("contexto-activo trae el grupo canónico del local", ctx.ok === true && ctx.localId === f.local.id && ctx.grupoId === f.grupo.id, JSON.stringify(ctx));
  }

  {
    const ids = [nuevoId("motor-1"), nuevoId("motor-2"), nuevoId("motor-3")];
    const cola = colaDePrueba(ids.map((id, i) => cobroCola(id, { turnoId: turnoA, cantidad: i + 1, voucher: f.voucherA })));
    const r = await sincronizar(cola, f.A, f.opA);
    ok("COMPLETA, tres sincronizadas, la cola vacía", r.resultado === RESULTADO_SINCRONIZACION.COMPLETA && r.sincronizadas === 3 && cola.ids().length === 0, JSON.stringify(r));
    const ventas = await prisma.venta.findMany({ where: { clientTxnId: { in: ids } }, select: { clientTxnId: true, turnoId: true, total: true }, orderBy: { id: "asc" } });
    igual("tres ventas, en la caja de A, con el mismo id de la cola y el total cobrado", ventas.map((v) => [v.clientTxnId, v.turnoId, Number(v.total)]),
      ids.map((id, i) => [id, turnoA, 1000 * (i + 1)]));
    const cobros = await prisma.cobroOffline.findMany({ where: { clientTxnId: { in: ids } }, select: { estado: true, ventaId: true } });
    ok("los tres cobros SINCRONIZADA con su venta", cobros.length === 3 && cobros.every((c) => c.estado === "SINCRONIZADA" && c.ventaId), JSON.stringify(cobros));
    igual("cada venta se pidió una sola vez", ids.map(vecesPedida), [1, 1, 1]);

    // D: la venta se escribe y la respuesta no llega.
    const idD = nuevoId("motor-perdida");
    const colaD = colaDePrueba([cobroCola(idD, { turnoId: turnoA, voucher: f.voucherA })]);
    const r1 = await sincronizar(colaD, f.A, f.opA, { despuesDeCrear: () => ({ red: false }) });
    ok("sin respuesta: SIN_RED y la venta sigue en la cola", r1.resultado === RESULTADO_SINCRONIZACION.SIN_RED && colaD.ids().length === 1, JSON.stringify(r1));
    igual("pero el servidor sí la escribió", await ventasCon(idD), 1);
    const r2 = await sincronizar(colaD, f.A, f.opA);
    ok("la siguiente la reconoce y la saca, sin pedirla otra vez", r2.sincronizadas === 1 && colaD.ids().length === 0 && vecesPedida(idD) === 1, `${JSON.stringify(r2)} pedida ${vecesPedida(idD)}`);
    igual("una sola venta con ese id", await ventasCon(idD), 1);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("25. PR B: 428 y varios operadores: nadie sincroniza la caja de otro");

  // D abre su caja: la de B quedó cerrada en la sección 18.
  const opD = await prisma.operadorLocal.create({ data: { nombre: `${marca}-d`, pinHash: "x" } });
  creado.operadorIds.push(opD.id);
  await prisma.operadorEnLocal.create({ data: { operadorId: opD.id, localId: f.local.id } });
  const D = { sesion: f.A.sesion, operador: firmarTokenOperador({ operadorId: opD.id, nombre: opD.nombre, localId: f.local.id }) };
  const voucherD = firmarVoucherOperador({ operadorId: opD.id, localId: f.local.id });
  const abreD = await abrir(D);
  requerir("D abre su caja", abreD.ok === true, `${abreD.status} ${abreD.error ?? ""}`);
  const turnoD = abreD.turno.id;

  {
    // La pantalla cree que hay PIN y el servidor no lo tiene: 428.
    const id428 = nuevoId("motor-428");
    const cola = colaDePrueba([cobroCola(id428, { turnoId: turnoA, voucher: f.voucherA })]);
    const r = await sincronizar(cola, f.sinPin, f.opA);
    ok("428: ESPERA_PIN pidiendo el operador que la cobró", r.resultado === RESULTADO_SINCRONIZACION.ESPERA_PIN && r.operadorRequerido?.operadorId === f.opA.id, JSON.stringify(r));
    ok("la venta sigue en la cola, esperando, y no hay venta", cola.de(id428)?.sync?.estado === ESTADO_LOCAL.ESPERA_OPERADOR && (await ventasCon(id428)) === 0);
    igual("el cobro sigue PENDIENTE: un 428 no lo da por perdido", (await cobroDe(id428)).estado, "PENDIENTE");
    const r2 = await sincronizar(cola, f.A, f.opA);
    ok("con el PIN, entra en la caja de A con el mismo id", r2.sincronizadas === 1 && cola.ids().length === 0
      && (await prisma.venta.findUnique({ where: { clientTxnId: id428 }, select: { turnoId: true } }))?.turnoId === turnoA, JSON.stringify(r2));

    // A y D en el mismo equipo, cada uno con su caja.
    const idA = nuevoId("motor-de-a");
    const idDd = nuevoId("motor-de-d");
    const colaK = colaDePrueba([
      cobroCola(idA, { turnoId: turnoA, voucher: f.voucherA }),
      cobroCola(idDd, { turnoId: turnoD, voucher: voucherD, operador: opD }),
    ]);
    const rA = await sincronizar(colaK, f.A, f.opA);
    ok("con A: entra la de A; la de D espera", rA.sincronizadas === 1 && rA.esperanOperador === 1 && colaK.ids().join() === idDd, JSON.stringify(rA));
    ok("la de D no se pidió con el PIN de A, y no hay venta", vecesPedida(idDd) === 0 && (await ventasCon(idDd)) === 0);
    igual("su cobro: PENDIENTE, en la caja de D", [(await cobroDe(idDd)).estado, (await cobroDe(idDd)).turnoId], ["PENDIENTE", turnoD]);
    f.idDeD = idDd;
    f.colaK = colaK;
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("26. PR B: una caja con cobros PENDIENTES no se corta ni se cierra");

  {
    const turnoAntes = await turnoCompleto(turnoD);
    const corte = await leer(await rutaIniciarCierre.POST(pedido(`${BASE}/cierres/iniciar`, D, { turnoId: turnoD, desgloseCambio: {} })));
    ok("iniciar el corte: 409 COBROS_OFFLINE_PENDIENTES", corte.status === 409 && corte.code === CODIGO_COBROS_OFFLINE_PENDIENTES && corte.cantidad === 1, JSON.stringify(corte));
    const cierre = await leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, D, { turnoId: turnoD, montoRealEfectivo: 1000 })));
    ok("cerrar el turno: 409 COBROS_OFFLINE_PENDIENTES", cierre.status === 409 && cierre.code === CODIGO_COBROS_OFFLINE_PENDIENTES, JSON.stringify(cierre));
    igual("el turno no cambió", JSON.stringify(await turnoCompleto(turnoD)), JSON.stringify(turnoAntes));
    igual("ningún corte ni sobre creado", await prisma.cierrePreparacion.count({ where: { turnoId: turnoD } }), 0);

    // Un cobro de esa caja en revisión NO bloquea: ya no depende de ella.
    const idRev = nuevoId("motor-revision-d");
    const cRev = cobroCola(idRev, { turnoId: turnoD, voucher: voucherD, operador: opD, cantidad: 100_000 });
    const colaRev = colaDePrueba([cRev]);

    // Entra D: la suya entra en SU caja, y la de stock imposible va a revisión.
    f.colaK.items.push(...colaRev.items);
    const rD = await sincronizar(f.colaK, D, opD);
    ok("con D: una sincronizada y una en revisión", rD.sincronizadas === 1 && rD.enRevision === 1 && f.colaK.ids().join() === idRev, JSON.stringify(rD));
    igual("la venta de D, en la caja de D", (await prisma.venta.findUnique({ where: { clientTxnId: f.idDeD }, select: { turnoId: true } }))?.turnoId, turnoD);
    igual("el cobro de stock imposible: REQUIERE_REVISION", (await cobroDe(idRev)).estado, "REQUIERE_REVISION");
    const cierreOk = await leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, D, { turnoId: turnoD, montoRealEfectivo: 1000 })));
    ok("ya sin PENDIENTES (la de revisión no cuenta), la caja se cierra", cierreOk.ok === true, `${cierreOk.status} ${cierreOk.error ?? ""}`);
    f.idRevisionD = idRev;
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("27. PR B: revisión sin reintentos, y el descarte que la saca de la cola");

  {
    // Una venta de la caja de B, que ya cerró, registrada después.
    const idG = nuevoId("motor-caja-cerrada");
    const cola = colaDePrueba([cobroCola(idG, { turnoId: turnoB, operador: f.opB })]);
    const r = await sincronizar(cola, f.B, f.opB);
    ok("a revisión, marcada con el código del rechazo", r.enRevision === 1 && cola.de(idG)?.sync?.estado === ESTADO_LOCAL.REVISION
      && cola.de(idG)?.sync?.codigo === "TURNO_CERRADO", JSON.stringify({ r, sync: cola.de(idG)?.sync }));
    for (let i = 0; i < 3; i++) await sincronizar(cola, f.B, f.opB);
    igual("la venta se pidió UNA vez en cuatro sincronizaciones", vecesPedida(idG), 1);
    igual("el cobro: un solo intento anotado", (await cobroDe(idG)).intentos, 1);
    igual("sigue visible en la cola", cola.ids(), [idG]);

    const des = await descartar(f.resolutor, (await cobroDe(idG)).id, "cobrado en una caja ya cerrada");
    requerir("el encargado la descarta", des.ok === true, JSON.stringify(des));
    const h = await huella();
    const r2 = await sincronizar(cola, f.B, f.opB);
    ok("la siguiente sincronización la saca de la cola sin pedir la venta", cola.ids().length === 0 && vecesPedida(idG) === 1, JSON.stringify(r2));
    igual("sin ninguna escritura económica", await huella(), h);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("28. PR B: otro local: ni se manda ni se apropia");

  {
    const h = await huella();
    // Una venta guardada en este equipo mientras estaba en el otro local.
    const idOtro = nuevoId("motor-otro-local");
    const deOtro = cobroCola(idOtro, { localId: f.otroLocal.id, turnoId: turnoOtro, producto: f.productoOtro, operador: null });
    // Un id que ya es de un cobro del otro local.
    const idAjeno = nuevoId("motor-id-ajeno");
    await registrarUno(f.otro, cobroCola(idAjeno, { localId: f.otroLocal.id, turnoId: turnoOtro, producto: f.productoOtro, operador: null }));
    const cola = colaDePrueba([deOtro, cobroCola(idAjeno, { turnoId: turnoA, voucher: f.voucherA })]);
    const r = await sincronizar(cola, f.A, f.opA);
    ok("la del otro local ni se registró ni se mandó", (await cobroDe(idOtro)) === null && vecesPedida(idOtro) === 0 && cola.de(idOtro) !== undefined);
    ok("el id ajeno: RECHAZADA, sin venta, y el cobro del otro local intacto", r.rechazadas === 1 && cola.de(idAjeno)?.sync?.codigo === "ID_DE_OTRO_LOCAL"
      && vecesPedida(idAjeno) === 0 && (await cobroDe(idAjeno)).localId === f.otroLocal.id, JSON.stringify({ r, sync: cola.de(idAjeno)?.sync }));
    igual("sin ninguna escritura económica", await huella(), h);
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
