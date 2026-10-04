// LA API DE TESORERÍA CONTRA POSTGRESQL — GET /api/finanzas/tesoreria.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/tesoreriaApi.mjs
//
// La lectura en sí ya la ejerce tesoreriaLectura.mjs. Esto ejerce la PUERTA:
//   A. autenticación y permiso: sin sesión 401, sin `tesoreria.ver` 403 (aunque
//      tenga `finanzas.ver`), y el comodín "*" pasa;
//   B. alcance territorial: un local no lee a otro, ni pidiéndolo por `destino`
//      ni por `localId`; el depósito sí lee a los locales de su grupo;
//   C. el período: Día, Semana y Mes devuelven el mismo rango que `rangoFinanciero`
//      y los instantes con que se filtró la base;
//   D. la respuesta trae la lectura canónica: dos cajas consolidadas en
//      110.000 / 6.000 / 6.000 con su drill-down; el pago de $20.000 desde la
//      caja no se resta otra vez; el pago exterior sí; el cierre sin conteo
//      avisa y no inventa $0; el turno anulado conserva su entrega y avisa;
//   E. sin N+1: la lectura hace la MISMA cantidad de consultas con 1 caja que con
//      7, y ninguna es una escritura;
//   F. un GET no escribe nada en la base;
//   G. «Otro» (PR #138): un rango elegido de hoy da la MISMA lectura que el Día,
//      filtra, se describe como «Período elegido», no navega, rechaza con 400
//      cada forma mal armada y no salta el alcance;
//   H. cada pago se nombra con su proveedor o su gasto reales, nunca con el
//      motivo del movimiento, sin cambiar la base, y nada de eso cruza a B.
//
// Lo que necesita verificaciones —quién verificó, el agrupado por caja, lo
// parcial, los actos que cruzan, las capacidades— va en
// verificacionEfectivoAcciones.mjs: una verificación no se borra, y esta prueba
// desmonta lo que siembra.
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
const { rangoFinanciero } = await import("../../lib/finanzas/periodoFinanciero.js");
const { getRangoArgentina, hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
const { leerTesoreria, rangoDeTesoreria } = await import("../../lib/tesoreria/lecturaTesoreriaServer.js");
const { ALERTA, ESTADO_DIGITAL } = await import("../../lib/tesoreria/lecturaTesoreria.js");

const rutaTesoreria = await import("../../app/api/finanzas/tesoreria/route.js");
const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
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
const pedidoPos = (url, quien, cuerpo) => {
  const cookie = [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
  const req = new Request(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });
const sesionDe = (usuario, localId, permisos) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos }, SECRETO, { expiresIn: "1h" });
/** GET a la API con la sesión dada (o sin sesión). */
async function tesoreria(sesion, query = "") {
  const url = `http://ci/api/finanzas/tesoreria${query ? `?${query}` : ""}`;
  const headers = sesion ? { cookie: `erpazul_sesion=${sesion}` } : {};
  return leer(await rutaTesoreria.GET(new Request(url, { headers })));
}

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

const marca = `ci-tesoreria-api-${Date.now()}`;
const creado = { grupoId: null, localIds: [], usuarioIds: [], rolId: null, operadorIds: [], proveedorId: null, pedidoIds: [], gastoIds: [] };
const PERMISOS_POS = ["pos.usar", "pos.cerrar_sin_conteo"];
const PERMISOS_FIN = ["finanzas.ver", "finanzas.gastos.registrar", "finanzas.pagos_proveedores.registrar"];

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: [...PERMISOS_POS, ...PERMISOS_FIN, "tesoreria.ver"] } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const nuevoLocal = async (sufijo, extra = {}) => {
    const local = await prisma.local.create({ data: { nombre: `${marca}-${sufijo}`, tipo: extra.es_deposito ? "deposito" : "local", ...extra } });
    creado.localIds.push(local.id);
    await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
    await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });
    const usuario = await prisma.usuario.create({
      data: { nombre: `${marca}-${sufijo}-cuenta`, email: `${marca}-${sufijo}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
    });
    creado.usuarioIds.push(usuario.id);
    return { local, usuario };
  };
  const A = await nuevoLocal("A");
  const B = await nuevoLocal("B");
  const D = await nuevoLocal("deposito", { es_deposito: true });
  const productoA = await crearProductoVendible(prisma, { grupoId: grupo.id, localId: A.local.id, nombre: `${marca}-pA`, precioVenta: 1000, precioCosto: 600, stock: 10000 });
  const productoB = await crearProductoVendible(prisma, { grupoId: grupo.id, localId: B.local.id, nombre: `${marca}-pB`, precioVenta: 1000, precioCosto: 600, stock: 10000 });
  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-panadero` } });
  creado.proveedorId = proveedor.id;
  return { grupo, A: { ...A, producto: productoA }, B: { ...B, producto: productoB }, D, proveedor };
}

async function desmontar() {
  if (!creado.localIds.length) return;
  const localIds = creado.localIds;
  const turnos = (await prisma.turno.findMany({ where: { localId: { in: localIds } }, select: { id: true } })).map((t) => t.id);
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
  await prisma.auditoriaBitacora.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.clientePuntoMovimiento.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId: { in: localIds } } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.venta.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cambioPendiente.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.retiroPreparacion.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.updateMany({ where: { localId: { in: localIds } }, data: { retiroCierreMovimientoId: null } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId: { in: localIds } } });
  // MovimientoStock no se borra: el libro de stock lo prohíbe.
  await prisma.stockLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarioIds } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: { in: localIds } } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

/**
 * Un cliente que CUENTA las consultas y anota cualquier escritura. Envuelve los
 * delegados de modelo y los métodos crudos; lo que la lectura llame pasa por acá.
 */
function clienteQueCuenta(db) {
  let consultas = 0;
  const escrituras = [];
  const ESCRIBE = /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/;
  const proxy = new Proxy(db, {
    get(objetivo, clave) {
      const valor = objetivo[clave];
      if (typeof clave === "string" && /^\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe|transaction)$/.test(clave)) {
        return (...args) => {
          consultas += 1;
          if (!/^\$queryRaw/.test(clave)) escrituras.push(clave);
          return valor.apply(objetivo, args);
        };
      }
      if (valor && typeof valor === "object" && typeof valor.findMany === "function") {
        return new Proxy(valor, {
          get(delegado, op) {
            const f = delegado[op];
            if (typeof f !== "function") return f;
            return (...args) => {
              consultas += 1;
              if (ESCRIBE.test(String(op))) escrituras.push(`${String(clave)}.${String(op)}`);
              return f.apply(delegado, args);
            };
          },
        });
      }
      return valor;
    },
  });
  return { db: proxy, consultas: () => consultas, escrituras };
}

async function correr() {
  const f = await montar();
  let n = 0;
  const clave = () => `${marca}-${(n += 1)}`;
  const sesionPosDe = (L) => sesionDe(L.usuario, L.local.id, PERMISOS_POS);

  async function nuevaCaja(L) {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: L.local.id } });
    const quien = { sesion: sesionPosDe(L), operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: L.local.id }) };
    const r = await leer(await rutaAbrir.POST(pedidoPos(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000, turnoOperativoId: await turnoOperativoDeSesion(prisma, quien) })));
    requerir("abre la caja", r.ok === true, `${r.status} ${r.error ?? ""}`);
    return { op, quien, turnoId: r.turno.id, L };
  }
  async function vender(caja, formaPago, monto) {
    const r = await leer(await rutaCrear.POST(pedidoPos(`${BASE}/crear`, caja.quien, {
      clientTxnId: clave(), localId: caja.L.local.id, clienteId: null, turnoId: caja.turnoId, formaPago,
      esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
      items: [itemCrearPayload({ productoBaseId: caja.L.producto.baseId, nombre: "P", precio: 1000, cantidad: monto / 1000, precioCosto: 600 })],
    })));
    requerir(`vende ${formaPago} $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
  }
  async function cerrar(caja, cambio, contado) {
    const ini = await leer(await rutaCierreIniciar.POST(pedidoPos(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
    requerir("inicia el cierre", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
    const fin = await leer(await rutaCierreConfirmar.POST(pedidoPos(`${BASE}/cierres/${ini.cierre.token}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(ini.cierre.token)));
    requerir("confirma el cierre", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
  }

  const verA = sesionDe(f.A.usuario, f.A.local.id, ["tesoreria.ver"]);
  const verB = sesionDe(f.B.usuario, f.B.local.id, ["tesoreria.ver"]);
  const cajaDe = (l, turnoId) => l.cajas.find((c) => c.turnoId === turnoId);
  const medioDe = (lista, medio) => (lista || []).find((m) => m.medio === medio);

  // ── LOS DATOS: local A con el escenario completo, local B con lo suyo ─────
  const c1 = await nuevaCaja(f.A);
  const c2 = await nuevaCaja(f.A);
  await vender(c1, "EFECTIVO", 100000);
  await vender(c1, "MERCADOPAGO", 5000);
  await vender(c1, "CREDITO", 5000);
  await vender(c2, "EFECTIVO", 10000);
  await vender(c2, "MERCADOPAGO", 1000);
  await vender(c2, "CREDITO", 1000);
  await cerrar(c1, 1000, 100000);
  await cerrar(c2, 1000, 10000);

  const c3 = await nuevaCaja(f.A);
  await vender(c3, "EFECTIVO", 150000);
  const pedidoPan = await prisma.pedidoProveedor.create({
    data: { grupoId: f.grupo.id, depositoId: f.D.local.id, proveedorId: f.proveedor.id, estado: "RECIBIDO" },
  });
  creado.pedidoIds.push(pedidoPan.id);
  const { cuenta } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, { pedidoProveedorId: pedidoPan.id, localGastoId: f.A.local.id, total: 50000, usuarioId: f.A.usuario.id })
  );
  await prisma.$transaction((tx) =>
    registrarPagoProveedor(tx, {
      cuentaId: cuenta.id, monto: 20000, medio: "EFECTIVO", turnoId: c3.turnoId,
      localOrigenId: f.A.local.id, localOperativoId: f.A.local.id, usuarioId: f.A.usuario.id, idempotencyKey: clave(),
    })
  );
  await cerrar(c3, 1000, 130000);

  const sesionFin = { id: f.A.usuario.id, esAdmin: false, permisos: PERMISOS_FIN, localId: f.A.local.id };
  const categoria = (await categoriasDeGasto(prisma)).find((x) => x.nombre === "Servicios");
  const g = await prisma.$transaction((tx) =>
    crearGasto(tx, {
      session: sesionFin, grupoId: f.grupo.id, localId: f.A.local.id, localOperativoId: f.A.local.id,
      categoriaId: categoria.id, concepto: "Luz", total: 12000, fecha: hoyArgentinaISO(), idempotencyKey: clave(),
      pagoInicial: { monto: 12000, medio: "MERCADO_PAGO" },
    })
  );
  creado.gastoIds.push(g.gasto.id);

  const c4 = await nuevaCaja(f.A);
  await vender(c4, "EFECTIVO", 25000);
  {
    const ini = await leer(await rutaCierreIniciar.POST(pedidoPos(`${BASE}/cierres/iniciar`, c4.quien, { turnoId: c4.turnoId, desgloseCambio: desgloseDe(1000) })));
    requerir("corte tomado", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
    // El plazo es de doce horas: se corre hacia atrás, como en cierreCaja.mjs.
    await prisma.cierrePreparacion.update({ where: { token: ini.cierre.token }, data: { venceEn: new Date(Date.now() - 60 * 1000) } });
    const r = await leer(await rutaSinConteo.POST(pedidoPos(`${BASE}/cierres/${ini.cierre.token}/cerrar-sin-conteo`, c4.quien, { motivo: "Sin conteo" }), conToken(ini.cierre.token)));
    requerir("cerrado sin conteo", r.ok === true, `${r.status} ${r.error ?? ""}`);
  }

  const c5 = await nuevaCaja(f.A);
  await vender(c5, "EFECTIVO", 40000);
  await cerrar(c5, 1000, 40000);
  // Ninguna ruta de la app anula un turno hoy: `anuladoEn` existe en datos
  // históricos. Se marca acá para ejercer cómo lo LEE Tesorería.
  await prisma.turno.update({ where: { id: c5.turnoId }, data: { anuladoEn: new Date(), motivoAnulacion: "prueba de lectura" } });

  const cB = await nuevaCaja(f.B);
  await vender(cB, "EFECTIVO", 77000);
  await cerrar(cB, 1000, 77000);

  // ── A. AUTENTICACIÓN Y PERMISO ───────────────────────────────────────────
  seccion("A. Autenticación y permiso");
  igual("sin sesión: 401", (await tesoreria(null)).status, 401);
  const soloFinanzas = sesionDe(f.A.usuario, f.A.local.id, ["finanzas.ver"]);
  igual("con finanzas.ver y sin tesoreria.ver: 403", (await tesoreria(soloFinanzas)).status, 403);
  igual("con tesoreria.ver: 200", (await tesoreria(verA)).status, 200);
  igual("el comodín \"*\" pasa, como en todo el ERP", (await tesoreria(sesionDe(f.A.usuario, f.A.local.id, ["*"]))).status, 200);

  // ── B. ALCANCE TERRITORIAL ───────────────────────────────────────────────
  seccion("B. Un local no lee a otro");
  igual("A pidiendo B por destino: 403", (await tesoreria(verA, `destino=${f.B.local.id}`)).status, 403);
  igual("A pidiendo B por localId: 403", (await tesoreria(verA, `localId=${f.B.local.id}`)).status, 403);
  igual("B pidiendo A por destino: 403", (await tesoreria(verB, `destino=${f.A.local.id}`)).status, 403);
  {
    const rA = await tesoreria(verA);
    const rB = await tesoreria(verB);
    igual("A sin pedir nada lee A", rA.local?.id, f.A.local.id);
    igual("B lee solo lo suyo: $77.000 entregados", [rB.local?.id, rB.tesoreria?.resumen?.efectivoDeclaradoEntregado], [f.B.local.id, 77000]);
    ok("ninguna caja de B aparece en A", rA.status === 200 && !(rA.tesoreria?.cajas ?? []).some((c) => c.turnoId === cB.turnoId));
    const verD = sesionDe(f.D.usuario, f.D.local.id, ["tesoreria.ver"]);
    const rD = await tesoreria(verD, `destino=${f.A.local.id}`);
    igual("el depósito lee a un local de su grupo", [rD.status, rD.local?.id], [200, f.A.local.id]);
    const entrada = await tesoreria(verD, "entrada=1");
    igual("el depósito sin local elegido recibe la lista, sin importes", [entrada.vista, "tesoreria" in entrada], ["ENTRADA", false]);
  }

  // ── C. EL PERÍODO ────────────────────────────────────────────────────────
  seccion("C. Día, Semana y Mes con el rango de Finanzas");
  for (const unidad of ["DIA", "SEMANA", "MES"]) {
    const r = await tesoreria(verA, `unidad=${unidad}`);
    const esperado = rangoFinanciero({ unidad, desplazamiento: 0, vigencias: [] });
    const { fechaInicio, fechaFin } = getRangoArgentina(esperado.desde, esperado.hasta);
    igual(`${unidad}: el rango es el de rangoFinanciero`, r.periodo?.rango, { desde: esperado.desde, hasta: esperado.hasta });
    igual(`${unidad}: los instantes son los del corte argentino`, r.periodo?.instantes, { desde: fechaInicio.toISOString(), hasta: fechaFin.toISOString() });
    ok(`${unidad}: trae su descripción armada en el servidor`, Boolean(r.periodo?.descripcion));
  }
  {
    const anterior = await tesoreria(verA, "unidad=DIA&desplazamiento=-1");
    igual("el día anterior no trae las entregas de hoy", anterior.tesoreria?.resumen?.efectivoDeclaradoEntregado, 0);
    igual("y no se puede avanzar más allá de hoy", (await tesoreria(verA, "unidad=DIA")).puedeAvanzar, false);
  }

  // ── D. LA LECTURA CANÓNICA EN LA RESPUESTA ───────────────────────────────
  seccion("D. La respuesta trae la lectura canónica");
  const r = await tesoreria(verA, "unidad=DIA");
  requerir("la lectura de A responde 200 con su tesorería", r.status === 200 && Boolean(r.tesoreria), `${r.status} ${r.error ?? ""}`);
  const t = r.tesoreria;
  {
    const g0 = t.grupos[0];
    // Antes era «un solo turno comercial, provisorio por día». Las cinco cajas
    // se abren ahora en el mismo turno operativo elegido, así que siguen siendo
    // un grupo, pero nombrado por ese turno y no por el día.
    igual("un solo grupo: el turno operativo con que se abrieron las cinco cajas",
      [t.grupos.length, g0.criterio, g0.sinTurno], [1, "TURNO_OPERATIVO", false]);
    const g1 = g0.cajas.find((c) => c.turnoId === c1.turnoId);
    const g2 = g0.cajas.find((c) => c.turnoId === c2.turnoId);
    igual("Caja 1 $100.000 + Caja 2 $10.000 = $110.000", [g1.efectivoDeclaradoEntregado, g2.efectivoDeclaradoEntregado, g1.efectivoDeclaradoEntregado + g2.efectivoDeclaradoEntregado], [100000, 10000, 110000]);
    igual("MP $5.000 + $1.000 = $6.000", [medioDe(g1.cobradoPorMedio, "MERCADOPAGO").montoDeclarado, medioDe(g2.cobradoPorMedio, "MERCADOPAGO").montoDeclarado, medioDe(g0.cobradoPorMedio, "MERCADOPAGO").montoDeclarado], [5000, 1000, 6000]);
    igual("Crédito $5.000 + $1.000 = $6.000", [medioDe(g1.cobradoPorMedio, "CREDITO").montoDeclarado, medioDe(g2.cobradoPorMedio, "CREDITO").montoDeclarado, medioDe(g0.cobradoPorMedio, "CREDITO").montoDeclarado], [5000, 1000, 6000]);
    igual("las cinco cajas de A en el drill-down del grupo", g0.cajas.map((c) => c.turnoId).sort((a, b) => a - b), [c1.turnoId, c2.turnoId, c3.turnoId, c4.turnoId, c5.turnoId]);
  }
  {
    // Efectivo SOLO de entregas: 100.000 + 10.000 + 130.000 + 40.000 (anulado,
    // conservado); la caja sin conteo no entrega nada. Lo vendido en efectivo
    // (100 + 10 + 150 + 25 + 40 = 325.000) se informa aparte y no es esto.
    igual("efectivo declarado = solo entregas RECAUDACION/CIERRE", t.resumen.efectivoDeclaradoEntregado, 280000);
    igual("lo vendido en efectivo va aparte", t.resumen.efectivoCobradoDeclarado, 325000);
    ok("cada entrega es RECAUDACION o CIERRE, una vez por id",
      t.entregas.every((e) => e.clase === "RECAUDACION" || e.clase === "CIERRE") && new Set(t.entregas.map((e) => e.cajaMovimientoId)).size === t.entregas.length);
    igual("digital declarado por el POS, no conciliado", [t.resumen.digitalCobradoDeclarado, t.resumen.estadoDigital, medioDe(t.resumen.cobradoPorMedio, "MERCADOPAGO").estado], [12000, ESTADO_DIGITAL.DECLARADO_POS, ESTADO_DIGITAL.DECLARADO_POS]);
    ok("ninguna clave afirma acreditado, conciliado ni disponible", !/acreditad|conciliad|disponible/i.test(JSON.stringify(r)));
  }
  {
    const c = cajaDe(t, c3.turnoId);
    igual("caja que vendió 150.000 y pagó 20.000 entrega 130.000", c.efectivoDeclaradoEntregado, 130000);
    igual("el pago figura desde la caja", c.pagosDesdeCaja.map((p) => [p.montoPagado, p.pagadoDesdeCaja]), [[20000, true]]);
    igual("pagos desde caja, informativos: 20.000", t.resumen.pagosDesdeCajaInformativos, 20000);
    igual("egreso exterior: el gasto pagado por MP, 12.000", t.resumen.egresosExterioresConocidos, 12000);
    // 280.000 entregados + 12.000 digitales − 12.000 exteriores. Si se volviera a
    // restar el pago desde la caja daría 260.000.
    igual("base conocida = 280.000 + 12.000 − 12.000 = 280.000 (no 260.000)", t.resumen.baseConocida, 280000);
  }
  {
    const c = cajaDe(t, c4.turnoId);
    igual("cierre sin conteo: sin importe declarado, null y no 0", [c.efectivoDeclaradoEntregado, c.sinImporteDeclarado], [null, true]);
    ok("y su alerta, en la caja y en el grupo", c.alertas.includes(ALERTA.SIN_IMPORTE_DECLARADO) && t.grupos[0].alertas.some((a) => a.codigo === ALERTA.SIN_IMPORTE_DECLARADO && a.turnoId === c4.turnoId));
    const a = cajaDe(t, c5.turnoId);
    igual("turno anulado: su entrega se conserva", a.efectivoDeclaradoEntregado, 40000);
    ok("y lo avisa, en la caja y en el grupo", a.alertas.includes(ALERTA.TURNO_ANULADO) && t.grupos[0].alertas.some((x) => x.codigo === ALERTA.TURNO_ANULADO && x.turnoId === c5.turnoId));
    igual("drill-down de la caja: operador y cuenta", [cajaDe(t, c1.turnoId).operadorId, cajaDe(t, c1.turnoId).vendedorId], [c1.op.id, f.A.usuario.id]);
  }

  // ── E. SIN N+1 Y SIN ESCRITURAS EN LA LECTURA ────────────────────────────
  seccion("E. La cantidad de consultas no crece con las cajas");
  {
    const rango = await rangoDeTesoreria(prisma, { localId: f.A.local.id, unidad: "DIA" });
    const conA = clienteQueCuenta(prisma);
    await leerTesoreria(conA.db, { localId: f.A.local.id, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin });
    const conB = clienteQueCuenta(prisma);
    await leerTesoreria(conB.db, { localId: f.B.local.id, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin });
    igual("5 cajas y 1 caja: la misma cantidad de consultas", conA.consultas(), conB.consultas());
    ok(`son ${conA.consultas()} consultas, un número fijo`, conA.consultas() <= 12, String(conA.consultas()));
    igual("ninguna es una escritura", [...conA.escrituras, ...conB.escrituras], []);
  }

  // ── F. UN GET NO ESCRIBE NADA ────────────────────────────────────────────
  seccion("F. El GET no escribe");
  {
    const contar = () => Promise.all([
      prisma.venta.count(), prisma.cajaMovimiento.count(), prisma.turno.count(), prisma.arqueoCaja.count(),
      prisma.auditoriaBitacora.count(), prisma.pagoProveedor.count(), prisma.pagoGasto.count(),
    ]);
    const antes = await contar();
    const marcaTurno = await prisma.turno.findUnique({ where: { id: c1.turnoId }, select: { updatedAt: true } });
    for (const unidad of ["DIA", "SEMANA", "MES"]) await tesoreria(verA, `unidad=${unidad}`);
    igual("ninguna tabla cambió de tamaño", await contar(), antes);
    igual("ni se tocó un turno leído", (await prisma.turno.findUnique({ where: { id: c1.turnoId }, select: { updatedAt: true } })).updatedAt.getTime(), marcaTurno.updatedAt.getTime());
  }

  // ── G. «OTRO»: EL RANGO ELEGIDO (PR #138) ────────────────────────────────
  seccion("G. Otro: rango elegido, validado, sin navegar");
  {
    const hoy = hoyArgentinaISO();
    const dia = await tesoreria(verA, "unidad=DIA");
    const otro = await tesoreria(verA, `unidad=OTRO&desde=${hoy}&hasta=${hoy}`);
    requerir("Otro de hoy a hoy: 200", otro.status === 200, `${otro.status} ${otro.error ?? ""}`);
    igual("da EXACTAMENTE la misma lectura que el Día", JSON.stringify(otro.tesoreria), JSON.stringify(dia.tesoreria));
    igual("con los mismos instantes", otro.periodo.instantes, dia.periodo.instantes);
    igual("se describe como «Período elegido» y no navega",
      [otro.unidad, otro.desplazamiento, otro.periodo.descripcion.titulo, otro.puedeAvanzar, otro.puedeRetroceder], ["OTRO", null, "Período elegido", false, false]);
    const ayer = (await tesoreria(verA, "unidad=DIA&desplazamiento=-1")).periodo.rango.desde;
    // Un rango posterior al primer movimiento es el único en que «retroceder»
    // daría true si Otro navegara: los de hoy y de ayer no lo distinguen.
    const manana = new Date(Date.parse(`${hoy}T12:00:00-03:00`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const futuro = await tesoreria(verA, `unidad=OTRO&desde=${manana}&hasta=${manana}`);
    igual("Otro en el futuro: 200, en cero, y tampoco retrocede", [futuro.status, futuro.tesoreria?.entregas.length, futuro.puedeRetroceder, futuro.puedeAvanzar], [200, 0, false, false]);
    const soloAyer = await tesoreria(verA, `unidad=OTRO&desde=${ayer}&hasta=${ayer}`);
    igual("Otro solo de ayer filtra: ninguna entrega de hoy", [soloAyer.status, soloAyer.tesoreria?.entregas.length, soloAyer.tesoreria?.resumen.efectivoDeclaradoEntregado], [200, 0, 0]);
    const amplio = await tesoreria(verA, `unidad=OTRO&desde=${ayer}&hasta=${hoy}`);
    igual("Otro de ayer a hoy: lo de hoy, sin sumar dos veces", amplio.tesoreria?.resumen.baseConocida, dia.tesoreria.resumen.baseConocida);
    const { fechaInicio, fechaFin } = getRangoArgentina(ayer, hoy);
    igual("los instantes son el corte argentino del rango, no UTC", amplio.periodo?.instantes, { desde: fechaInicio.toISOString(), hasta: fechaFin.toISOString() });
    for (const [que, query] of [
      ["desde inválido", `unidad=OTRO&desde=2026-02-30&hasta=${hoy}`],
      ["hasta inválido", `unidad=OTRO&desde=${hoy}&hasta=ayer`],
      ["desde después de hasta", `unidad=OTRO&desde=${hoy}&hasta=${ayer}`],
      ["falta hasta", `unidad=OTRO&desde=${hoy}`],
      ["faltan las dos", "unidad=OTRO"],
      ["fechas sin Otro", `unidad=DIA&desde=${hoy}&hasta=${hoy}`],
      ["fechas sin unidad", `desde=${hoy}&hasta=${hoy}`],
      ["Otro con desplazamiento", `unidad=OTRO&desde=${hoy}&hasta=${hoy}&desplazamiento=-1`],
    ]) {
      const r = await tesoreria(verA, query);
      igual(`${que}: 400 con mensaje, sin lectura`, [r.status, r.ok, typeof r.error, "tesoreria" in r], [400, false, "string", false]);
    }
    igual("Otro no salta el alcance: A pidiendo B, 403", (await tesoreria(verA, `unidad=OTRO&desde=${ayer}&hasta=${hoy}&destino=${f.B.local.id}`)).status, 403);
    const verD = sesionDe(f.D.usuario, f.D.local.id, ["tesoreria.ver"]);
    igual("el depósito con Otro lee a un local de su grupo", [(await tesoreria(verD, `unidad=OTRO&desde=${hoy}&hasta=${hoy}&destino=${f.A.local.id}`)).local?.id], [f.A.local.id]);
    // El mes en curso cuenta HASTA HOY (antes, hasta fin de mes); el anterior no cuenta.
    const n = Number(hoy.slice(8));
    const mesActual = await tesoreria(verA, "unidad=MES");
    igual("Mes en curso: «en curso» y los días que van hasta hoy",
      [mesActual.periodo?.descripcion?.titulo?.endsWith("· en curso"), mesActual.periodo?.descripcion?.subtitulo?.endsWith(`· van ${n} ${n === 1 ? "día" : "días"}`)], [true, true]);
    const mesAnterior = await tesoreria(verA, "unidad=MES&desplazamiento=-1");
    ok("Mes anterior: sin «en curso» ni contador", !/en curso|van \d/.test(`${mesAnterior.periodo?.descripcion?.titulo} ${mesAnterior.periodo?.descripcion?.subtitulo}`),
      JSON.stringify(mesAnterior.periodo?.descripcion));
    // Los ejemplos reales del contrato, para el informe.
    for (const q of ["unidad=DIA", "unidad=SEMANA", "unidad=MES", `unidad=OTRO&desde=${ayer}&hasta=${hoy}`]) {
      const r = await tesoreria(verA, q);
      console.log(`    · ${q}: ${JSON.stringify({ unidad: r.unidad, desplazamiento: r.desplazamiento, periodo: r.periodo, puedeAvanzar: r.puedeAvanzar, puedeRetroceder: r.puedeRetroceder })}`);
    }
  }

  // ── H. CÓMO SE NOMBRA CADA PAGO (PR #138) ────────────────────────────────
  seccion("H. Pagos con su proveedor o su gasto, de la base");
  {
    const t = (await tesoreria(verA, "unidad=DIA")).tesoreria;
    const pc = t.pagosDesdeCaja.find((p) => p.turnoId === c3.turnoId);
    igual("pago desde caja: el proveedor real y su pedido",
      [pc?.beneficiario, pc?.concepto, pc?.categoria, pc?.referencia, pc?.pagadoDesdeCaja], [`${marca}-panadero`, null, null, { tipo: "PEDIDO_PROVEEDOR", id: pedidoPan.id }, true]);
    const ex = t.egresosExteriores.find((p) => p.origen === "PAGO_GASTO");
    igual("egreso exterior de un gasto: concepto y categoría reales, sin beneficiario cargado → null",
      [ex?.concepto, ex?.categoria, ex?.beneficiario, ex?.referencia, ex?.pagadoDesdeCaja], ["Luz", "Servicios", null, { tipo: "GASTO", id: g.gasto.id }, false]);
    igual("nombrarlos no cambia la base: sigue 280.000", t.resumen.baseConocida, 280000);
    const motivos = (await prisma.cajaMovimiento.findMany({ where: { turnoId: c3.turnoId, motivo: { not: null } }, select: { motivo: true } })).map((m) => m.motivo);
    ok("ningún pago se nombra con el motivo libre del movimiento",
      motivos.every((m) => ![...t.pagosDesdeCaja, ...t.egresosExteriores].some((p) => [p.beneficiario, p.concepto, p.categoria].includes(m))), JSON.stringify(motivos));
    const tB = JSON.stringify(await tesoreria(verB, "unidad=DIA"));
    ok("B no ve ni el proveedor ni el gasto de A, ni sus cuentas ni operadores",
      // Entre comillas: "op1" es prefijo de "op12", que puede ser el de B.
      !tB.includes(`"${marca}-panadero"`) && !tB.includes("\"Luz\"") && !tB.includes(`"${marca}-A-cuenta"`) && !tB.includes(`"${c1.op.nombre}"`));
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
