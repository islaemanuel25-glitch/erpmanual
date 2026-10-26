// LA VENTA DE DEPÓSITO Y SU TRANSFERENCIA, GRABADAS COMO SALEN DE LAS RUTAS.
//
//   DATABASE_URL=postgresql://…/erpazul_al node --import ./scripts/alias-loader.mjs scripts/pruebas-db/ticketTransferencia.mjs
//
// El ticket de una transferencia tiene que imprimir cada línea EXACTAMENTE como
// Posventa imprime la venta: un bulto como se vende un bulto, una unidad suelta
// como una unidad, el fiambre como el fiambre. Para poder afirmarlo hace falta
// el mismo hecho visto de los dos lados, y ninguno de los dos se puede escribir
// a mano sin inventar —la #521 lo mostró: el fixture "razonable" del candado no
// tenía la forma de un bulto despachado desde una venta, con la cantidad en
// unidades y el costo del bulto, y el papel salió "156 x $11.601,86 →
// $11.601,86"—.
//
// Acá se hace una venta REAL en un depósito a un cliente vinculado a un local,
// por `pos-ventas/crear`, que es la que crea la transferencia. De su respuesta
// sale lo que Posventa imprime (`breakdown.lineas`, igual que `pos-ventas/page`)
// y de `transferencias/detalle` lo que ve la pantalla de la transferencia. Las
// dos cosas se graban en `lib/transferencias/ticketTransferencia.fixture.json`,
// que es lo que leen los candados del ticket.
//
// Las líneas: una unidad, un bulto, un bulto más unidades sueltas del mismo
// producto —el depósito lo vende en dos líneas y la transferencia lo consolida
// en una—, un fiambre por kilo y un fiambre de pieza fija.
//
// Base descartable, creada y borrada acá (el Libro de Stock no deja borrar sus
// filas, así que no se siembra en la base de trabajo). Nivel ESCRITURA: host
// local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const principal = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { crearProductoVendible } = await import("./fixturePos.mjs");
const { turnoOperativoDeSesion } = await import("./fixtureTurnoOperativo.mjs");
// `lib/operador.js` arrastra el cliente de la app: se importa recién cuando
// DATABASE_URL ya apunta a la base descartable.
let firmarTokenOperador;
let OperadorCookie;

const NOMBRE = "erpazul_ticket_transferencia_prueba";
const SALIDA = "lib/transferencias/ticketTransferencia.fixture.json";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-ticket-transferencia-0123456789abcdef";
const SECRETO = process.env.AUTH_SECRET;
const PERMISOS = ["pos.usar", "transferencias.crear", "transferencias.ver"];

const sesionDe = (usuario, localId) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos: PERMISOS }, SECRETO, { expiresIn: "1h" });
const cookies = ({ sesion, operador = null }) =>
  [`erpazul_sesion=${sesion}`, operador ? `${OperadorCookie.nombre}=${operador}` : null].filter(Boolean).join("; ");
const pedido = (url, quien, cuerpo, metodo = "POST") => {
  const req = new Request(url, {
    method: metodo,
    headers: { cookie: cookies(quien), "content-type": "application/json" },
    ...(metodo === "GET" ? {} : { body: JSON.stringify(cuerpo ?? {}) }),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });

let c = null;
let codigo = 0;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  const urlPsql = (() => {
    const u = new URL(urlPrueba);
    u.search = "";
    return u.toString();
  })();
  aplicarMigraciones(urlPsql);
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra: un grupo con su depósito, un local y el cliente que los une ──
  const rol = await c.rol.create({ data: { nombre: "Depósito", permisos: PERMISOS } });
  const grupo = await c.grupo.create({ data: { nombre: "Ticket de transferencia" } });
  const depo = await c.local.create({ data: { nombre: "Depósito Central", es_deposito: true } });
  const mini = await c.local.create({ data: { nombre: "Mini Norte" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: depo.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: mini.id } });
  for (const l of [depo, mini]) {
    await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: true, allowNegativeStock: true } });
  }
  const cuenta = await c.usuario.create({
    data: { nombre: "Ana Depósito", email: "ana@ci.local", passwordHash: "x", rolId: rol.id, localId: depo.id },
  });
  const op = await c.operadorLocal.create({ data: { nombre: "Ana", pinHash: "x", localId: depo.id } });

  // Las cuatro formas de catálogo, con la configuración que tienen en la base.
  const producto = async (nombre, precioVenta, precioCosto, base) => {
    const p = await crearProductoVendible(c, { grupoId: grupo.id, localId: depo.id, nombre, precioVenta, precioCosto, stock: 1000 });
    if (base) await c.productoBase.update({ where: { id: p.baseId }, data: base });
    return p;
  };
  const unidad = await producto("CIF LIMA 300ml", 2500, 1832.67);
  const bulto = await producto("ELITE PAÑUELOS X6paq", 2400, 1600, { unidad_medida: "pack", factor_pack: 6 });
  const kilo = await producto("QUESO CREMOSO", 9800, 6500, { unidad_medida: "kg" });
  const pieza = await producto("SALAME MILAN PIEZA", 12000, 8000, {
    unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 1.5, modoCompraProveedor: "UNIDAD",
  });
  const cliente = await c.cliente.create({
    data: { grupoId: grupo.id, localId: depo.id, nombre: "Mini Norte", localVinculadoId: mini.id },
  });

  // El cliente de la app se construye al importarse: recién ahora.
  process.env.DATABASE_URL = urlPrueba;
  ({ firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js"));
  const quien = {
    sesion: sesionDe(cuenta, depo.id),
    operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: depo.id }),
  };
  const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
  const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");
  const rutaDetalle = await import("../../app/api/transferencias/detalle/route.js");
  const BASE = "http://ci/api";

  const turno = await leer(await rutaAbrir.POST(pedido(`${BASE}/pos-ventas/turnos/abrir`, quien, {
    montoInicial: 0, turnoOperativoId: await turnoOperativoDeSesion(c, quien),
  })));
  if (!turno.ok) throw new Error(`no abrió el turno: ${JSON.stringify(turno)}`);
  const turnoId = turno.turno?.id ?? turno.id;

  // El carrito como lo manda el POS del depósito (`itemCrearPayload`): el bulto
  // en NORMAL cuenta bultos al precio del bulto; el remanente cuenta unidades al
  // precio unitario.
  const linea = (p, nombre, precio, cantidad, precioCosto, modoVentaLinea = "NORMAL") => ({
    productoBaseId: p.baseId, nombre, precio, cantidad, precioCosto, modoVentaLinea,
    listaPrecioId: null, tipoPrecioAplicado: "PRECIO_VENTA", margenAplicado: null,
    esServicio: false, importeBaseServicio: null, subtotalFijado: null,
  });
  const items = [
    linea(unidad, "CIF LIMA 300ml", 2500, 3, 1832.67),
    linea(bulto, "ELITE PAÑUELOS X6paq", 2400, 4, 1600),
    linea(bulto, "ELITE PAÑUELOS X6paq", 400, 2, 266.67, "UNIDAD_REMANENTE"),
    linea(kilo, "QUESO CREMOSO", 9800, 0.235, 6500),
    linea(pieza, "SALAME MILAN PIEZA", 18000, 2, 12000),
  ];
  const total = items.reduce((a, i) => a + Math.round(i.precio * i.cantidad * 100), 0) / 100;
  const venta = await leer(await rutaCrearVenta.POST(pedido(`${BASE}/pos-ventas/crear`, quien, {
    clientTxnId: "ticket-transferencia-venta", localId: depo.id, turnoId, clienteId: cliente.id,
    formaPago: "EFECTIVO", items, pagos: [{ medio: "EFECTIVO", monto: total }],
  })));
  if (!venta.ok) throw new Error(`no registró la venta: ${JSON.stringify(venta)}`);

  const transferencia = await c.transferencia.findFirst({ where: { origenId: depo.id }, select: { id: true, ventaId: true } });
  if (!transferencia?.ventaId) throw new Error("la venta no creó su transferencia");

  const detalle = await leer(await rutaDetalle.GET(
    pedido(`${BASE}/transferencias/detalle?id=${transferencia.id}`, quien, null, "GET")
  ));
  if (!detalle.ok) throw new Error(`no leyó el detalle: ${JSON.stringify(detalle)}`);

  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync(SALIDA, `${JSON.stringify({
    tomadaSobre: commit,
    // Lo que `pos-ventas/crear` devolvió y Posventa imprime.
    venta: { numero: venta.numero, breakdown: venta.breakdown },
    // Lo que `transferencias/detalle` devolvió para la transferencia de esa venta.
    transferencia: detalle.item,
  }, null, 2)}\n`);
  console.log(`grabado ${SALIDA}: venta #${venta.numero}, transferencia #${transferencia.id}, ${detalle.item.items.length} líneas`);
} catch (e) {
  codigo = 1;
  console.error(e);
} finally {
  await c?.$disconnect().catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}
process.exit(codigo);
