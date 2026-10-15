// PRUEBAS DE BASE DEL AVISO DE PAGO PARCIAL AL PROVEEDOR (2026-10-15).
//
//   AUTH_SECRET=... node --import ./scripts/alias-loader.mjs scripts/pruebas-db/compraConSaldo.mjs
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
// El caso de Emanuel, con las rutas reales y contra PostgreSQL: se pagaron
// $10.000 desde la caja del POS, se cargó mercadería por $16.000 y se recibe.
//
//   A. Sin confirmar el saldo, 409 y NADA escrito: ni stock, ni cuenta, ni
//      fila, ni campanita. Con otro importe, lo mismo.
//   B. Confirmando ESE saldo: recibe, queda quién y cuándo, UNA campanita para
//      Finanzas con link a la cuenta, y la compra queda "Pago parcial" en la
//      lista y en el detalle. El reintento del mismo cierre no repite nada.
//   C. Azul Chat levanta UN evento por recepción, con el texto, y con su
//      cursor no lo repite. El ERP no llama a Chat: un Chat caído no toca la
//      recepción, que ya terminó; la fila espera a que Chat pregunte.
//   D. Se paga el saldo en Finanzas → "Pago parcial" se apaga.
//   E. Con pago ahora en el cierre —parcial— la regla mira lo pagado TOTAL.
//   F. Menor a lo pagado: sigue bloqueado, sin aviso que lo deje pasar.
//
// Todo se monta y se desmonta acá. El cliente es el de `clientePrisma.mjs`.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`); };
function ok(t, c, d = "falló") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d}`); console.log(`  ✗ ${t} — ${d}`); }
}
const igual = (t, o, e) => ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

const SECRETO = process.env.AUTH_SECRET;
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const rutaCrearOperador = await import("../../app/api/operador/crear/route.js");
const rutaPagar = await import("../../app/api/pos-ventas/pagar/route.js");
const rutaAgregar = await import("../../app/api/compras-proveedor/agregar-item/[id]/route.js");
const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
const rutaObtener = await import("../../app/api/compras-proveedor/obtener/route.js");
const rutaListar = await import("../../app/api/compras-proveedor/listar/route.js");
const rutaPagoFinanzas = await import("../../app/api/finanzas/pagos-proveedores/[cuentaId]/pagos/route.js");
const { comprasSaldoEventos } = await import("../../lib/integraciones/azul-chat/comprasSaldoEventos.js");

const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const cookieDe = (quien) =>
  [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
function pedido(url, quien, { metodo = "POST", cuerpo } = {}) {
  const req = new Request(url, {
    method: metodo,
    headers: { cookie: cookieDe(quien), "content-type": "application/json" },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo ?? {}),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}
const BASE = "http://ci/api";
const marca = `ci-compra-saldo-${Date.now()}`;
let n = 0;
const clave = () => `${marca}-${(n += 1)}`;
const creado = { grupoId: null, locales: [], usuarios: [], roles: [], operadorIds: [], bases: [], proveedorId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: [] } });
  creado.roles.push(rol.id);
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.locales.push(deposito.id, local.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });

  const usuario = async (nombre, permisos) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${nombre}`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
    });
    creado.usuarios.push(u.id);
    return { u, sesion: jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId: local.id, permisos }, SECRETO, { expiresIn: "1h" }) };
  };
  const encargado = await usuario("encargado", ["config_local.operadores"]);
  const cajero = await usuario("cajero", ["pos.usar"]);
  const compras = await usuario("compras", ["compras.ver", "compras.crear", "compras.recibir", "finanzas.ver", "finanzas.pagos_proveedores.registrar"]);

  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-Arcor`, creadoEnLocalId: local.id } });
  creado.proveedorId = proveedor.id;
  const base = await prisma.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-galletitas`, precio_costo: 100, precio_venta: 150, unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" },
  });
  creado.bases.push(base.id);
  const pl = await prisma.productoLocal.create({ data: { localId: local.id, baseId: base.id, precio_costo: 100, precio_venta: 150 } });

  const op = await leer(await rutaCrearOperador.POST(pedido(`${BASE}/operador/crear`, { sesion: encargado.sesion }, {
    cuerpo: { nombre: `${marca}-Caro`, pin: "1234", localIds: [local.id] },
  })));
  if (!op.ok) throw new Error(`operador: ${op.error}`);
  creado.operadorIds.push(op.operador.id);
  const turno = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajero.u.id, operadorId: op.operador.id, montoInicial: 50000, apertura: new Date() },
  });
  const quienCaja = { sesion: cajero.sesion, operador: firmarTokenOperador({ operadorId: op.operador.id, nombre: op.operador.nombre, localId: local.id }) };
  return { grupo, local, compras, proveedor, pl, turno, quienCaja };
}

async function desmontar() {
  const localId = creado.locales[1];
  if (localId) {
    const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
    const pedidos = (await prisma.pedidoProveedor.findMany({ where: { grupoId: creado.grupoId }, select: { id: true } })).map((p) => p.id);
    await prisma.notificacion.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.compraConSaldo.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.pagoProveedor.deleteMany({ where: { cuenta: { grupoId: creado.grupoId } } });
    await prisma.cuentaPorPagarProveedor.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.pagoGasto.deleteMany({ where: { gasto: { grupoId: creado.grupoId } } });
    await prisma.gasto.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.pedidoProveedorDetalle.deleteMany({ where: { pedidoId: { in: pedidos } } });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: pedidos } } });
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
    await prisma.turno.deleteMany({ where: { localId } });
    const pls = (await prisma.productoLocal.findMany({ where: { baseId: { in: creado.bases } }, select: { id: true } })).map((p) => p.id);
    await prisma.stockLocal.deleteMany({ where: { productoId: { in: pls } } });
    await prisma.configuracionLocal.deleteMany({ where: { localId } });
    const empleados = (await prisma.empleado.findMany({ where: { locales: { some: { localId } } }, select: { id: true } })).map((e) => e.id);
    await prisma.empleado.deleteMany({ where: { id: { in: empleados } } });
  }
  if (creado.proveedorId) await prisma.proveedor.updateMany({ where: { id: creado.proveedorId }, data: { activo: false } }).catch(() => {});
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } }).catch(() => {});
}

/** Una compra nacida de "Pagar → Proveedor" con su línea cargada a mano. */
async function compraPorCargar(f, { pagado, cargado }) {
  const prov = await leer(await rutaPagar.POST(pedido(`${BASE}/pos-ventas/pagar`, f.quienCaja, {
    cuerpo: { turnoId: f.turno.id, idempotencyKey: clave(), tipo: "PROVEEDOR", monto: String(pagado), proveedorId: f.proveedor.id },
  })));
  if (!prov.ok) throw new Error(`pagar: ${prov.error}`);
  const pedidoId = prov.pedidoProveedorId;
  const ctx = { params: Promise.resolve({ id: String(pedidoId) }) };
  const quien = { sesion: f.compras.sesion };
  const agregado = await leer(await rutaAgregar.POST(pedido(`${BASE}/compras-proveedor/agregar-item/${pedidoId}`, quien, {
    cuerpo: { productoLocalId: f.pl.id, cantidad: 1, cantidadRecibida: 1, precioCosto: cargado, unidad: "UNIDAD" },
  }), ctx));
  if (!agregado.ok) throw new Error(`agregar: ${agregado.error}`);
  const det = await prisma.pedidoProveedorDetalle.findFirst({ where: { pedidoId }, select: { id: true } });
  const recibir = async (pagoAlProveedor) =>
    leer(await rutaRecibir.POST(pedido(`${BASE}/compras-proveedor/recibir/${pedidoId}`, quien, {
      cuerpo: { recibidos: { [det.id]: 1 }, costosExcluidos: [det.id], pagoAlProveedor },
    }), ctx));
  return { pedidoId, recibir, quien };
}

const filasDe = (pedidoId) => prisma.compraConSaldo.findMany({ where: { pedidoProveedorId: pedidoId } });
const campanitas = (pedidoId) => prisma.notificacion.findMany({ where: { tipo: "COMPRA_CON_SALDO", entidadId: pedidoId } });
const estadoDe = async (pedidoId) => (await prisma.pedidoProveedor.findUnique({ where: { id: pedidoId }, select: { estado: true } })).estado;
const stockDe = async (f) =>
  Number((await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: f.local.id, productoId: f.pl.id } }, select: { cantidad: true } }))?.cantidad ?? 0);

async function pagoParcialEn(f, pedidoId) {
  const quien = { sesion: f.compras.sesion };
  const detalle = await leer(await rutaObtener.GET(pedido(`${BASE}/compras-proveedor/obtener?id=${pedidoId}`, quien, { metodo: "GET" })));
  const lista = await leer(await rutaListar.GET(pedido(`${BASE}/compras-proveedor/listar?pageSize=50`, quien, { metodo: "GET" })));
  return { detalle: detalle.pagoParcial, lista: (lista.items || []).find((x) => x.id === pedidoId)?.pagoParcial };
}

async function casos(f) {
  const PENDIENTE = { estado: "PENDIENTE", totalAPagar: "16000", totalConfirmado: true };
  const c = await compraPorCargar(f, { pagado: 10000, cargado: 16000 });
  const stockAntes = await stockDe(f);

  seccion("A · Sin confirmar el saldo no se recibe");
  const sin = await c.recibir(PENDIENTE);
  igual("409 con el código del aviso", [sin.status, sin.codigo], [409, "SALDO_SIN_CONFIRMAR"]);
  igual("el aviso dice pedido, pagado y lo que queda a deber",
    sin.error, `Pedido $16.000,00 · Pagado $10.000,00 · Quedan $6.000,00 a deber a ${marca}-Arcor`);
  igual("y trae los tres números", sin.aviso && [sin.aviso.total, sin.aviso.pagado, sin.aviso.saldo], [16000, 10000, 6000]);
  const otro = await c.recibir({ ...PENDIENTE, saldoConfirmado: 5000 });
  igual("con otro importe, tampoco", [otro.status, otro.codigo], [409, "SALDO_SIN_CONFIRMAR"]);
  const noBool = await c.recibir({ ...PENDIENTE, saldoConfirmado: true });
  igual("ni con un 'sí' sin importe", noBool.status, 409);
  igual("nada escrito: el pedido sigue por cargar", await estadoDe(c.pedidoId), "ENVIADO");
  igual("ni el stock", await stockDe(f), stockAntes);
  igual("ni la fila, ni la campanita", [(await filasDe(c.pedidoId)).length, (await campanitas(c.pedidoId)).length], [0, 0]);
  const cuentaAntes = await prisma.cuentaPorPagarProveedor.findUnique({ where: { pedidoProveedorId: c.pedidoId }, select: { total: true } });
  igual("la cuenta sigue con lo pagado desde la caja", Number(cuentaAntes.total), 10000);

  seccion("B · Confirmando ese saldo: recibe y queda registrado");
  const antes = Date.now();
  const si = await c.recibir({ ...PENDIENTE, saldoConfirmado: 6000 });
  igual("recibe", [si.status, si.ok, si.repetido], [200, true, false]);
  igual("la respuesta ya dice Pago parcial", si.pagoParcial, true);
  igual("el pedido queda RECIBIDO", await estadoDe(c.pedidoId), "RECIBIDO");
  ok("y el stock entró", (await stockDe(f)) === stockAntes + 1, `stock ${await stockDe(f)}`);
  const filas = await filasDe(c.pedidoId);
  igual("UNA fila de la deuda confirmada", filas.length, 1);
  const fila = filas[0];
  igual("con quién la confirmó", fila?.confirmadoPorId, f.compras.u.id);
  ok("y cuándo", fila && fila.confirmadoEn.getTime() >= antes - 1000 && fila.confirmadoEn.getTime() <= Date.now(), String(fila?.confirmadoEn));
  igual("y los tres números que vio", fila && [Number(fila.total), Number(fila.pagado), Number(fila.saldo)], [16000, 10000, 6000]);
  igual("del local que debe", fila?.localId, f.local.id);
  const notifs = await campanitas(c.pedidoId);
  igual("UNA campanita", notifs.length, 1);
  const cuenta = await prisma.cuentaPorPagarProveedor.findUnique({ where: { pedidoProveedorId: c.pedidoId }, select: { id: true } });
  igual("para Finanzas del local, con el texto y el link a la cuenta",
    notifs[0] && [notifs[0].alcance, notifs[0].localId, notifs[0].permisoRequerido, notifs[0].titulo, notifs[0].href],
    ["LOCAL", f.local.id, "finanzas.ver", `${marca}-Arcor: quedan $6.000,00 a deber`, `/modulos/finanzas/pagos-proveedores/${cuenta.id}`]);
  igual("'Pago parcial' en el detalle y en la lista", await pagoParcialEn(f, c.pedidoId), { detalle: true, lista: true });

  const otraVez = await c.recibir({ ...PENDIENTE, saldoConfirmado: 6000 });
  igual("el reintento contesta cómo quedó", [otraVez.status, otraVez.ok, otraVez.repetido], [200, true, true]);
  igual("y no repite la fila ni la campanita", [(await filasDe(c.pedidoId)).length, (await campanitas(c.pedidoId)).length], [1, 1]);

  seccion("C · Azul Chat levanta un evento por recepción");
  // El ERP no le habla a Chat: Chat pregunta. Con un margen de 60 s, se pide
  // "desde dentro de dos minutos", como lo haría la próxima vuelta de Chat.
  const autz = { localId: f.local.id, grupoId: f.grupo.id };
  const ahora = Date.now() + 2 * 60 * 1000;
  const r1 = await comprasSaldoEventos(autz, {}, { db: prisma, ahora });
  igual("responde", r1.ok, true);
  const delPedido = (r1.datos?.eventos || []).filter((e) => e.pedidoId === c.pedidoId);
  igual("UN evento de esta recepción", delPedido.length, 1);
  igual("con el texto pedido", delPedido[0]?.texto, `${marca}-Arcor: pedido $16.000,00 · pagado $10.000,00 · quedan $6.000,00 a deber`);
  const r2 = await comprasSaldoEventos(autz, { desde: r1.datos.siguiente }, { db: prisma, ahora });
  igual("con su cursor, la próxima vuelta no lo repite", (r2.datos?.eventos || []).filter((e) => e.pedidoId === c.pedidoId).length, 0);
  const visibleYa = await comprasSaldoEventos(autz, {}, { db: prisma, ahora: Date.now() });
  igual("dentro del margen todavía no sale (no se pierde: sale en la vuelta siguiente)", (visibleYa.datos?.eventos || []).filter((e) => e.pedidoId === c.pedidoId).length, 0);
  const ajeno = await comprasSaldoEventos({ localId: creado.locales[0], grupoId: f.grupo.id }, {}, { db: prisma, ahora });
  igual("otro local no lo ve", (ajeno.datos?.eventos || []).filter((e) => e.pedidoId === c.pedidoId).length, 0);

  seccion("D · Se paga el saldo → 'Pago parcial' se apaga");
  const pago = await leer(await rutaPagoFinanzas.POST(
    pedido(`${BASE}/finanzas/pagos-proveedores/${cuenta.id}/pagos`, c.quien, {
      cuerpo: { monto: "6000", medio: "TRANSFERENCIA", idempotencyKey: clave() },
    }),
    { params: Promise.resolve({ cuentaId: String(cuenta.id) }) }
  ));
  igual("Finanzas registra el pago del saldo", [pago.status, pago.ok], [200, true]);
  igual("ya no es 'Pago parcial'", await pagoParcialEn(f, c.pedidoId), { detalle: false, lista: false });
  igual("y la fila de quién confirmó se queda", (await filasDe(c.pedidoId)).length, 1);

  seccion("E · Con pago ahora en el cierre, cuenta lo pagado total");
  const e = await compraPorCargar(f, { pagado: 1000, cargado: 2000 });
  const parcial = { estado: "PARCIAL", totalAPagar: "2000", totalConfirmado: true, pago: { monto: "200", medio: "TRANSFERENCIA", localOrigenId: f.local.id } };
  const viejo = await e.recibir({ ...parcial, saldoConfirmado: 1000 });
  igual("el saldo de antes de pagar ahora no confirma", [viejo.status, viejo.codigo], [409, "SALDO_SIN_CONFIRMAR"]);
  igual("el aviso suma lo de la caja y lo de ahora", viejo.aviso && [viejo.aviso.pagado, viejo.aviso.saldo], [1200, 800]);
  const bien = await e.recibir({ ...parcial, saldoConfirmado: 800 });
  igual("con el saldo de $800, recibe", [bien.status, bien.ok, bien.pagoParcial], [200, true, true]);
  igual("una campanita", (await campanitas(e.pedidoId)).length, 1);

  seccion("F · Menor a lo pagado: sigue bloqueado");
  const m = await compraPorCargar(f, { pagado: 1000, cargado: 800 });
  const menor = await m.recibir({ estado: "PENDIENTE", totalAPagar: "800", totalConfirmado: true, saldoConfirmado: 0 });
  igual("409 por lo pagado de más, no por el aviso", [menor.status, menor.codigo === "SALDO_SIN_CONFIRMAR"], [409, false]);
  ok("dice que se pagó de más", /pag/i.test(menor.error || ""), menor.error);
  igual("y no se recibió nada", [await estadoDe(m.pedidoId), (await filasDe(m.pedidoId)).length, (await campanitas(m.pedidoId)).length], ["ENVIADO", 0, 0]);

  seccion("G · Pagado justo, no hay aviso");
  const sinPago = await compraPorCargar(f, { pagado: 500, cargado: 500 });
  const justo = await sinPago.recibir({ estado: "PENDIENTE", totalAPagar: "500", totalConfirmado: true });
  igual("pagado justo: recibe sin confirmar", [justo.status, justo.ok, justo.pagoParcial], [200, true, false]);
  igual("sin fila ni campanita", [(await filasDe(sinPago.pedidoId)).length, (await campanitas(sinPago.pedidoId)).length], [0, 0]);
}

let f;
try {
  f = await montar();
  await casos(f);
} catch (e) {
  fallas.push(`[excepción] ${e.stack || e.message}`);
  console.error(e);
} finally {
  await desmontar().catch((e) => console.error("desmontar:", e.message));
  await prisma.$disconnect();
}

// La primera línea es la que lee contrapruebasRevision.mjs para saber que corrió.
console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} en verde, ${fallas.length} en rojo`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
