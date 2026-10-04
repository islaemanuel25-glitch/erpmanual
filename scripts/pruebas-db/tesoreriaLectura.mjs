// LA LECTURA DE TESORERÍA CONTRA POSTGRESQL, CON LAS RUTAS REALES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/tesoreriaLectura.mjs
//
// Los candados de lib/tesoreria/lecturaTesoreria.test.mjs ejercen el armado con
// filas de la forma real. Esto ejerce el CAMINO: las cajas se abren, venden,
// retiran y cierran por las rutas del POS; los pagos salen por las funciones
// canónicas de Finanzas; y recién entonces `leerTesoreria` lee la base. Así se
// prueba que los vínculos que la lectura usa existen en los datos que el
// sistema produce, y que las COPIAS del mismo retiro —Turno, ArqueoCaja,
// preparaciones— están en la base y aun así no se suman.
//
// Lo que se ejerce:
//   A. dos cajas de un mismo turno comercial: 100.000 + 10.000 de efectivo
//      entregado, MP y crédito consolidados, drill-down por caja; una entrega
//      RECAUDACION y otra CIERRE en la misma caja, cada una una vez;
//   B. un pago a proveedor de $20.000 en efectivo desde la caja: la caja entrega
//      $130.000 y Tesorería no lo vuelve a restar;
//   C. pagos que no son efectivo: egresos exteriores que sí restan;
//   D. Caja +/− manual: se muestra, no suma ni resta;
//   E. dos operadores con diferencias opuestas: no se compensan, y la entrega es
//      lo contado;
//   F. un cierre sin conteo: sin importe declarado, nunca $0.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { turnoOperativoDeSesion } = await import("./fixtureTurnoOperativo.mjs");
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { DENOMINACIONES } = await import("../../lib/caja/conteoBilletes.js");
const { crearCuentaPorPagarDesdeCompra, registrarPagoProveedor } = await import("../../lib/finanzas/pagosProveedoresServer.js");
const { crearGasto, categoriasDeGasto } = await import("../../lib/finanzas/gastosServer.js");
const { leerTesoreria, rangoDeTesoreria } = await import("../../lib/tesoreria/lecturaTesoreriaServer.js");
const { ALERTA, ESTADO_DIGITAL } = await import("../../lib/tesoreria/lecturaTesoreria.js");
const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
const rutaCierreIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaCierreConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
const rutaSinConteo = await import("../../app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js");

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

const marca = `ci-tesoreria-${Date.now()}`;
const creado = { grupoId: null, localId: null, usuarioId: null, rolId: null, operadorIds: [], proveedorId: null, pedidoIds: [], gastoIds: [] };
const PERMISOS_POS = ["pos.usar", "pos.cerrar_sin_conteo"];
const PERMISOS_FIN = ["finanzas.ver", "finanzas.gastos.registrar", "finanzas.pagos_proveedores.registrar"];

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: [...PERMISOS_POS, ...PERMISOS_FIN] } });
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
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-producto`, precioVenta: 1000, precioCosto: 600, stock: 10000,
  });
  const sesion = jwt.sign({ id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, localId: local.id, permisos: PERMISOS_POS }, SECRETO, { expiresIn: "1h" });
  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-panadero` } });
  creado.proveedorId = proveedor.id;
  return { grupo, local, cuenta, producto, sesion, proveedor };
}

async function desmontar() {
  if (!creado.localId) return;
  const localId = creado.localId;
  const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
  // Los pagos primero: el CHECK no deja desvincular un efectivo de su movimiento.
  if (creado.pedidoIds.length) {
    await prisma.pagoProveedor.deleteMany({ where: { cuenta: { pedidoProveedorId: { in: creado.pedidoIds } } } });
    await prisma.cuentaPorPagarProveedor.deleteMany({ where: { pedidoProveedorId: { in: creado.pedidoIds } } });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: creado.pedidoIds } } });
  }
  if (creado.gastoIds.length) {
    await prisma.pagoGasto.deleteMany({ where: { gastoId: { in: creado.gastoIds } } });
    await prisma.gasto.deleteMany({ where: { id: { in: creado.gastoIds } } });
  }
  if (creado.proveedorId) await prisma.proveedor.deleteMany({ where: { id: creado.proveedorId } });
  await prisma.auditoriaBitacora.deleteMany({ where: { localId } });
  await prisma.clientePuntoMovimiento.deleteMany({ where: { localId } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId } } });
  await prisma.venta.deleteMany({ where: { localId } });
  await prisma.cambioPendiente.deleteMany({ where: { localId } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId } });
  await prisma.retiroPreparacion.deleteMany({ where: { turnoId: { in: turnos } } });
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
  const clave = () => `${marca}-${(n += 1)}`;

  async function nuevaCaja(fondo = 1000) {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: f.local.id } });
    const quien = { sesion: f.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: f.local.id }) };
    const r = await leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: fondo, turnoOperativoId: await turnoOperativoDeSesion(prisma, quien) })));
    requerir("abre la caja", r.ok === true, `${r.status} ${r.error ?? ""}`);
    return { op, quien, turnoId: r.turno.id };
  }
  async function vender(caja, formaPago, monto) {
    const r = await leer(await rutaCrear.POST(pedido(`${BASE}/crear`, caja.quien, {
      clientTxnId: clave(), localId: f.local.id, clienteId: null, turnoId: caja.turnoId, formaPago,
      esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
      items: [itemCrearPayload({ productoBaseId: f.producto.baseId, nombre: "P", precio: 1000, cantidad: monto / 1000, precioCosto: 600 })],
    })));
    requerir(`vende ${formaPago} $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
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
  const mover = async (caja, tipo, monto) => {
    const r = await leer(await rutaMovimiento.POST(pedido(`${BASE}/caja-movimientos/crear`, caja.quien, { turnoId: caja.turnoId, tipo, monto, motivo: `${tipo} manual` })));
    requerir(`Caja ${tipo} $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
  };

  const rango = await rangoDeTesoreria(prisma, { localId: f.local.id, unidad: "DIA" });
  const lectura = () => leerTesoreria(prisma, { localId: f.local.id, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin });
  const cajaDe = (l, turnoId) => l.cajas.find((c) => c.turnoId === turnoId);
  const medioDe = (lista, medio) => (lista || []).find((m) => m.medio === medio);

  // ── A. DOS CAJAS, UN TURNO COMERCIAL ─────────────────────────────────────
  seccion("A. Dos cajas consolidadas, entregas una sola vez");
  const c1 = await nuevaCaja();
  const c2 = await nuevaCaja();
  await vender(c1, "EFECTIVO", 100000);
  await vender(c1, "MERCADOPAGO", 5000);
  await vender(c1, "CREDITO", 5000);
  await vender(c2, "EFECTIVO", 10000);
  await vender(c2, "MERCADOPAGO", 1000);
  await vender(c2, "CREDITO", 1000);
  // Caja 1: retira 50.000 de recaudación (quedan 51.000 en el cajón) y al cerrar
  // deja 1.000 de cambio y se lleva 50.000. Caja 2: deja 1.000 y se lleva 10.000.
  await retirar(c1, 51000, 50000);
  await cerrar(c1, 1000, 50000);
  await cerrar(c2, 1000, 10000);
  {
    const l = await lectura();
    igual("un solo turno comercial", l.grupos.length, 1);
    const g = l.grupos[0];
    igual("efectivo entregado consolidado $110.000", g.efectivoDeclaradoEntregado, 110000);
    igual("MP $6.000 y crédito $6.000 consolidados", [medioDe(g.cobradoPorMedio, "MERCADOPAGO")?.montoDeclarado, medioDe(g.cobradoPorMedio, "CREDITO")?.montoDeclarado], [6000, 6000]);
    const g1 = g.cajas.find((c) => c.turnoId === c1.turnoId);
    const g2 = g.cajas.find((c) => c.turnoId === c2.turnoId);
    igual("drill-down caja 1: 100.000 / 5.000 / 5.000", [g1?.efectivoDeclaradoEntregado, medioDe(g1?.cobradoPorMedio, "MERCADOPAGO")?.montoDeclarado, medioDe(g1?.cobradoPorMedio, "CREDITO")?.montoDeclarado], [100000, 5000, 5000]);
    igual("drill-down caja 2: 10.000 / 1.000 / 1.000", [g2?.efectivoDeclaradoEntregado, medioDe(g2?.cobradoPorMedio, "MERCADOPAGO")?.montoDeclarado, medioDe(g2?.cobradoPorMedio, "CREDITO")?.montoDeclarado], [10000, 1000, 1000]);
    const e1 = cajaDe(l, c1.turnoId).entregas;
    igual("caja 1: una RECAUDACION y un CIERRE, cada uno una vez", e1.map((e) => [e.clase, e.montoDeclarado]).sort(), [["CIERRE", 50000], ["RECAUDACION", 50000]]);
    igual("cada entrega con su propio CajaMovimiento.id", new Set(l.entregas.map((e) => e.cajaMovimientoId)).size, l.entregas.length);
    igual("operador de la caja en cada entrega", e1.every((e) => e.operadorId === c1.op.id), true);

    // Las copias del mismo dinero EXISTEN en la base, y aun así no se sumaron.
    const t1 = await prisma.turno.findUnique({ where: { id: c1.turnoId }, select: { efectivoRetiradoCierre: true } });
    const arqueos = await prisma.arqueoCaja.findMany({ where: { turnoId: c1.turnoId }, select: { tipo: true, efectivoRetirado: true } });
    const prep = await prisma.cierrePreparacion.findFirst({ where: { turnoId: c1.turnoId }, select: { retiroFinal: true } });
    const retiroPrep = await prisma.retiroPreparacion.findFirst({ where: { turnoId: c1.turnoId }, select: { totalRetiroContado: true } });
    igual("las copias están en la base (Turno, arqueos, preparaciones)",
      [Number(t1.efectivoRetiradoCierre), arqueos.map((a) => [a.tipo, Number(a.efectivoRetirado)]).sort(), Number(prep.retiroFinal), Number(retiroPrep.totalRetiroContado)],
      [50000, [["FINAL", 50000], ["PARCIAL", 50000]], 50000, 50000]);
    igual("y la caja 1 declaró $100.000, no $200.000 ni $250.000", cajaDe(l, c1.turnoId).efectivoDeclaradoEntregado, 100000);
    igual("el fondo que queda en el sobre no es ingreso: base = 110.000 + 12.000", l.resumen.baseConocida, 122000);
    igual("lo digital es declarado por el POS", l.resumen.estadoDigital, ESTADO_DIGITAL.DECLARADO_POS);
    igual("la venta en efectivo se informa aparte de lo entregado", l.resumen.efectivoCobradoDeclarado, 110000);
  }

  // ── B. UN PAGO DE $20.000 DESDE LA CAJA NO SE RESTA OTRA VEZ ─────────────
  seccion("B. Pago a proveedor en efectivo desde la caja");
  const antesB = (await lectura()).resumen;
  const c3 = await nuevaCaja();
  await vender(c3, "EFECTIVO", 150000);
  const pedidoPan = await prisma.pedidoProveedor.create({
    data: { grupoId: f.grupo.id, depositoId: f.local.id, proveedorId: f.proveedor.id, estado: "RECIBIDO" },
  });
  creado.pedidoIds.push(pedidoPan.id);
  const { cuenta: cuentaPan } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, { pedidoProveedorId: pedidoPan.id, localGastoId: f.local.id, total: 50000, usuarioId: f.cuenta.id })
  );
  await prisma.$transaction((tx) =>
    registrarPagoProveedor(tx, {
      cuentaId: cuentaPan.id, monto: 20000, medio: "EFECTIVO", turnoId: c3.turnoId,
      localOrigenId: f.local.id, localOperativoId: f.local.id, usuarioId: f.cuenta.id, idempotencyKey: clave(),
    })
  );
  // En el cajón: 1.000 + 150.000 − 20.000 = 131.000. Deja 1.000 y entrega 130.000.
  await cerrar(c3, 1000, 130000);
  {
    const l = await lectura();
    const c = cajaDe(l, c3.turnoId);
    igual("la caja entregó $130.000", c.efectivoDeclaradoEntregado, 130000);
    igual("el pago figura desde la caja, una vez", c.pagosDesdeCaja.map((p) => [p.origen, p.montoPagado, p.pagadoDesdeCaja]), [["PAGO_PROVEEDOR", 20000, true]]);
    igual("su movimiento no es manual ni entrega", [c.movimientosManuales.length, c.entregas.length], [0, 1]);
    igual("la base sube exactamente $130.000 (no $110.000)", l.resumen.baseConocida - antesB.baseConocida, 130000);
    igual("el pago no es egreso exterior", l.resumen.egresosExterioresConocidos - antesB.egresosExterioresConocidos, 0);
    igual("y se informa aparte", l.resumen.pagosDesdeCajaInformativos - antesB.pagosDesdeCajaInformativos, 20000);
  }

  // ── C. PAGOS QUE NO SON EFECTIVO ─────────────────────────────────────────
  seccion("C. Egresos exteriores: transferencia y Mercado Pago");
  const antesC = (await lectura()).resumen;
  await prisma.$transaction((tx) =>
    registrarPagoProveedor(tx, {
      cuentaId: cuentaPan.id, monto: 30000, medio: "TRANSFERENCIA",
      localOrigenId: f.local.id, localOperativoId: f.local.id, usuarioId: f.cuenta.id, idempotencyKey: clave(),
    })
  );
  const sesionFin = { id: f.cuenta.id, esAdmin: false, permisos: PERMISOS_FIN, localId: f.local.id };
  const categoria = (await categoriasDeGasto(prisma)).find((x) => x.nombre === "Servicios");
  const g = await prisma.$transaction((tx) =>
    crearGasto(tx, {
      session: sesionFin, grupoId: f.grupo.id, localId: f.local.id, localOperativoId: f.local.id,
      categoriaId: categoria.id, concepto: "Luz", total: 12000, fecha: hoyArgentinaISO(), idempotencyKey: clave(),
      pagoInicial: { monto: 12000, medio: "MERCADO_PAGO" },
    })
  );
  creado.gastoIds.push(g.gasto.id);
  {
    const l = await lectura();
    igual("egresos exteriores +$42.000", l.resumen.egresosExterioresConocidos - antesC.egresosExterioresConocidos, 42000);
    igual("la base baja $42.000", l.resumen.baseConocida - antesC.baseConocida, -42000);
    igual("ninguno es pago desde caja", l.egresosExteriores.every((e) => e.pagadoDesdeCaja === false), true);
  }

  // ── D. CAJA +/− MANUAL ───────────────────────────────────────────────────
  seccion("D. Caja +/− manual: sin semántica");
  const antesD = (await lectura()).resumen;
  const c4 = await nuevaCaja();
  await mover(c4, "INGRESO", 5000);
  await mover(c4, "RETIRO", 3000);
  {
    const l = await lectura();
    const c = cajaDe(l, c4.turnoId);
    igual("se muestran como manuales", c.movimientosManuales.map((m) => [m.tipo, m.monto]), [["INGRESO", 5000], ["RETIRO", 3000]]);
    igual("no tocan la base ni los egresos", [l.resumen.baseConocida - antesD.baseConocida, l.resumen.egresosExterioresConocidos - antesD.egresosExterioresConocidos], [0, 0]);
    ok("la caja abierta avisa que su efectivo declarado está incompleto", c.alertas.includes(ALERTA.CAJA_SIN_CERRAR));
  }

  // ── E. DIFERENCIAS DE DOS OPERADORES ─────────────────────────────────────
  seccion("E. Diferencias opuestas no se compensan");
  const c5 = await nuevaCaja();
  const c6 = await nuevaCaja();
  await vender(c5, "EFECTIVO", 10000);
  await vender(c6, "EFECTIVO", 10000);
  await cerrar(c5, 1000, 9000); // faltan 1.000
  await cerrar(c6, 1000, 11000); // sobran 1.000
  {
    const l = await lectura();
    igual("cada caja con su diferencia", [cajaDe(l, c5.turnoId).diferenciaCaja, cajaDe(l, c6.turnoId).diferenciaCaja], [-1000, 1000]);
    igual("la entrega es lo contado, no lo esperado", [cajaDe(l, c5.turnoId).efectivoDeclaradoEntregado, cajaDe(l, c6.turnoId).efectivoDeclaradoEntregado], [9000, 11000]);
    igual("ningún agregado suma diferencias", [JSON.stringify(l.resumen).includes("diferencia"), JSON.stringify(l.grupos).includes("diferencia")], [false, false]);
  }

  // ── F. CERRAR SIN CONTEO ─────────────────────────────────────────────────
  seccion("F. Cierre sin conteo: sin importe, no $0");
  const c7 = await nuevaCaja();
  await vender(c7, "EFECTIVO", 25000);
  {
    const ini = await leer(await rutaCierreIniciar.POST(pedido(`${BASE}/cierres/iniciar`, c7.quien, { turnoId: c7.turnoId, desgloseCambio: desgloseDe(1000) })));
    requerir("corte tomado", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
    // El plazo es de doce horas: se corre hacia atrás, como en cierreCaja.mjs.
    await prisma.cierrePreparacion.update({ where: { token: ini.cierre.token }, data: { venceEn: new Date(Date.now() - 60 * 1000) } });
    const r = await leer(await rutaSinConteo.POST(pedido(`${BASE}/cierres/${ini.cierre.token}/cerrar-sin-conteo`, c7.quien, { motivo: "El cajero se fue sin contar" }), conToken(ini.cierre.token)));
    requerir("cerrado sin conteo", r.ok === true, `${r.status} ${r.error ?? ""}`);
    const l = await lectura();
    const c = cajaDe(l, c7.turnoId);
    igual("sin importe declarado: null, no 0", [c.efectivoDeclaradoEntregado, c.sinImporteDeclarado], [null, true]);
    ok("la alerta lo nombra", l.alertas.some((a) => a.codigo === ALERTA.SIN_IMPORTE_DECLARADO && a.turnoId === c7.turnoId));
    igual("la base avisa que está incompleta", l.resumen.baseIncompleta, true);
  }
}

try {
  await correr();
} catch (e) {
  fallas.push(`[${seccionActual}] excepción: ${e.message}`);
  if (!String(e.message).startsWith("requisito:")) console.error(e);
} finally {
  await desmontar().catch((e) => console.error("desmontar:", e.message));
  await prisma.$disconnect();
}

console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} en verde, ${fallas.length} en rojo`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
