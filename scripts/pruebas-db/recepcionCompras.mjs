// PRUEBAS DE BASE DE LO QUE UNA COMPRA SUMA AL STOCK AL RECIBIRLA.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/recepcionCompras.mjs
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
// Que `PedidoProveedorDetalle.stockIngresado` sea, fila por fila, EXACTAMENTE lo
// que la recepción sumó a `StockLocal.cantidad`, con la unidad de la rama que lo
// decidió — y que siga diciendo lo mismo después de que el producto cambie.
//
// Se ejerce el handler REAL de `recibir/[id]` contra Postgres y se mira el
// stock antes y después. Cada caso compara TRES cosas: el delta del stock, el
// número congelado y el número que se esperaba. Si el cierre volviera a
// calcular el congelado por su cuenta —`cantidadRecibida × factor_pack`—, el
// delta y el congelado dejarían de coincidir en los casos donde esa cuenta no
// es lo que entró: el pack con sueltas, los kilos, las piezas.
//
// Los datos se montan y se desmontan acá, sobre una base descartable. NO se
// corre contra producción: `clientePrisma.mjs` en nivel ESCRITURA exige host
// local y NODE_ENV distinto de production, y aborta con código 2 si no.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
const rutaCorreccion = await import("../../app/api/compras-proveedor/recepcion/correccion/route.js");
const { PERMISO_REGISTRAR_PAGOS } = await import("../../lib/finanzas/pagosProveedores.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS — el mismo formato que `recepcionTransferencias.mjs`, para que
// `contrapruebasRevision.mjs` lea las dos salidas igual.
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`); };

function ok(t, c, d = "falló") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d}`); console.log(`  ✗ ${t} — ${d}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

/** En milésimas enteras: la escala de `StockLocal.cantidad`. */
const milesimas = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 1000));
const igualStock = (t, o, e) => {
  const a = milesimas(o);
  const b = milesimas(e);
  ok(t, a === b, `esperado ${e}, obtenido ${o}`);
};

const SECRETO = process.env.AUTH_SECRET;
const PERMISOS = ["compras.ver", "compras.crear", "compras.recibir", PERMISO_REGISTRAR_PAGOS];
const token = (usuarioId, localId) =>
  jwt.sign(
    { id: usuarioId, nombre: "CI Compras", email: `compras-${usuarioId}@ci.local`, localId, permisos: PERMISOS },
    SECRETO,
    { expiresIn: "1h" }
  );

const conCuerpo = (url, sesion, cuerpo) =>
  new Request(url, {
    method: "POST",
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-compras-${Date.now()}`;
const creado = {
  rolId: null,
  grupoId: null,
  locales: [],
  usuarios: [],
  turnoId: null,
  proveedorId: null,
  bases: [],
  pedidoIds: [],
};

async function producto(f, nombre, datos) {
  const base = await prisma.productoBase.create({
    data: {
      grupoId: f.grupo.id,
      nombre: `${marca}-${nombre}`,
      precio_costo: 100,
      precio_venta: 150,
      ...datos,
    },
  });
  creado.bases.push(base.id);
  const pl = await prisma.productoLocal.create({
    data: { localId: f.deposito.id, baseId: base.id, precio_costo: 100, precio_venta: 150 },
  });
  return { base, pl };
}

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;

  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local` } });
  creado.locales.push(deposito.id, local.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });

  const usuario = async (nombre, localId) => {
    const u = await prisma.usuario.create({
      data: { nombre, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId },
    });
    creado.usuarios.push(u.id);
    return u;
  };
  const usuarioDeposito = await usuario("deposito", deposito.id);
  const usuarioLocal = await usuario("local", local.id);

  // Un turno abierto de OTRO local, para la falla del caso 12: el depósito
  // intenta pagar en efectivo con ese cajón, y Finanzas lo frena adentro de
  // la transacción, después de que el stock ya se sumó.
  const otroLocal = await prisma.local.create({ data: { nombre: `${marca}-otro` } });
  creado.locales.push(otroLocal.id);
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: otroLocal.id } });
  const turnoOtro = await prisma.turno.create({
    data: { localId: otroLocal.id, vendedorId: usuarioDeposito.id, montoInicial: 0, apertura: new Date() },
  });
  creado.turnoId = turnoOtro.id;

  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-proveedor` } });
  creado.proveedorId = proveedor.id;

  const f = { grupo, deposito, local, proveedor, turnoOtro };
  f.sesionDeposito = token(usuarioDeposito.id, deposito.id);
  f.sesionLocal = token(usuarioLocal.id, local.id);

  // Los modos que la recepción distingue, con los mismos campos que lee.
  f.pack = await producto(f, "pack-x12", { unidad_medida: "pack", factor_pack: 12, modoCompraProveedor: "BULTO" });
  f.unidad = await producto(f, "unidad", { unidad_medida: "unidad", modoCompraProveedor: "BULTO" });
  f.kg = await producto(f, "kg-por-bulto", { unidad_medida: "kg", modoCompraProveedor: "BULTO" });
  f.peso = await producto(f, "fiambre-peso", {
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 0.5,
    modoVentaDeposito: "PESO",
  });
  f.pieza = await producto(f, "fiambre-pieza", {
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 0.7,
    modoVentaDeposito: "PIEZA",
  });
  f.combo = await producto(f, "combo", { unidad_medida: "unidad", es_combo: true });
  return f;
}

async function desmontar() {
  if (creado.pedidoIds.length) {
    await prisma.cuentaPorPagarProveedor.deleteMany({ where: { pedidoProveedorId: { in: creado.pedidoIds } } });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: creado.pedidoIds } } });
  }
  if (creado.bases.length) {
    const pls = await prisma.productoLocal.findMany({ where: { baseId: { in: creado.bases } }, select: { id: true } });
    const ids = pls.map((p) => p.id);
    if (ids.length) await prisma.stockLocal.deleteMany({ where: { productoId: { in: ids } } });
    await prisma.productoLocal.deleteMany({ where: { baseId: { in: creado.bases } } });
    await prisma.productoBase.deleteMany({ where: { id: { in: creado.bases } } });
  }
  if (creado.proveedorId) await prisma.proveedor.deleteMany({ where: { id: creado.proveedorId } });
  if (creado.turnoId) {
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: creado.turnoId } });
    await prisma.turno.deleteMany({ where: { id: creado.turnoId } });
  }
  if (creado.usuarios.length) await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  if (creado.grupoId) {
    await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.grupoDeposito.deleteMany({ where: { grupoId: creado.grupoId } });
  }
  if (creado.locales.length) await prisma.local.deleteMany({ where: { id: { in: creado.locales } } });
  if (creado.grupoId) await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  if (creado.rolId) await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

// ═══════════════════════════════════════════════════════════════════════════
// AYUDAS
// ═══════════════════════════════════════════════════════════════════════════

/** Un pedido ENVIADO listo para recibir. `lineas`: [{ prod, cantidad, unidad, precioCosto }]. */
async function pedidoEnviado(f, { owner, lineas, estado = "ENVIADO" }) {
  const p = await prisma.pedidoProveedor.create({
    data: {
      grupoId: f.grupo.id,
      depositoId: f.deposito.id,
      creadoEnLocalId: owner,
      proveedorId: f.proveedor.id,
      estado,
      detalles: {
        create: lineas.map((l) => ({
          productoLocalId: l.prod.pl.id,
          cantidad: l.cantidad,
          unidad: l.unidad || "BULTO",
          precioCosto: l.precioCosto ?? null,
          ...(l.extra || {}),
        })),
      },
    },
    include: { detalles: { select: { id: true }, orderBy: { id: "asc" } } },
  });
  creado.pedidoIds.push(p.id);
  return { id: p.id, det: p.detalles.map((d) => d.id) };
}

/**
 * Cierra con el handler real. La deuda va confirmada a mano —no hay factura— y
 * los costos van excluidos salvo que el caso diga otra cosa: acá se prueba el
 * stock, y la frontera del costo tiene sus propios candados.
 */
async function recibir(sesion, pedido, cuerpo = {}) {
  return leer(
    rutaRecibir.POST(
      conCuerpo(`http://ci/api/compras-proveedor/recibir/${pedido.id}`, sesion, {
        costosExcluidos: pedido.det,
        pagoAlProveedor: { estado: "PENDIENTE", totalAPagar: "1000", totalConfirmado: true },
        ...cuerpo,
      }),
      { params: Promise.resolve({ id: String(pedido.id) }) }
    )
  );
}

async function stockDe(localId, baseId) {
  const pl = await prisma.productoLocal.findUnique({
    where: { localId_baseId: { localId, baseId } },
    select: { id: true },
  });
  if (!pl) return 0;
  const s = await prisma.stockLocal.findUnique({
    where: { localId_productoId: { localId, productoId: pl.id } },
    select: { cantidad: true },
  });
  return Number(s?.cantidad || 0);
}

async function congelado(detId) {
  const d = await prisma.pedidoProveedorDetalle.findUnique({
    where: { id: detId },
    select: { stockIngresado: true, stockIngresadoUnidad: true, cantidadRecibida: true },
  });
  return {
    stockIngresado: d?.stockIngresado == null ? null : Number(d.stockIngresado),
    unidad: d?.stockIngresadoUnidad ?? null,
    cantidadRecibida: d?.cantidadRecibida == null ? null : Number(d.cantidadRecibida),
  };
}

/**
 * Un caso de una línea: recibe y compara el delta del stock contra lo congelado
 * y contra lo esperado. Devuelve el pedido y lo congelado para lo que sigue.
 */
async function casoDeUnaLinea(f, { titulo, prod, owner, sesion, linea, cuerpo, esperado, unidad }) {
  const destino = owner;
  const antes = await stockDe(destino, prod.base.id);
  const pedido = await pedidoEnviado(f, { owner, lineas: [{ prod, ...linea }] });
  const detId = pedido.det[0];
  const r = await recibir(sesion, pedido, typeof cuerpo === "function" ? cuerpo(detId) : cuerpo);
  ok(`${titulo}: el cierre responde 200`, r.status === 200 && r.ok, `${r.status} ${r.error}`);
  const delta = (await stockDe(destino, prod.base.id)) - antes;
  const c = await congelado(detId);
  igualStock(`${titulo}: el stock sumó ${esperado}`, delta, esperado);
  igualStock(`${titulo}: stockIngresado es lo que sumó el stock`, c.stockIngresado, delta);
  igual(`${titulo}: la unidad es ${unidad}`, c.unidad, unidad);
  return { pedido, detId, congelado: c };
}

// ═══════════════════════════════════════════════════════════════════════════
// CASOS
// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  const D = f.deposito.id;
  const L = f.local.id;

  seccion("1. PACK x12 por bulto: 10 bultos entran como 120 unidades");
  const pack = await casoDeUnaLinea(f, {
    titulo: "PACK",
    prod: f.pack,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 10, unidad: "BULTO" },
    cuerpo: (id) => ({ recibidos: { [id]: 10 } }),
    esperado: 120,
    unidad: "UNIDAD",
  });
  igual("PACK: cantidadRecibida sigue en la escala de compra", pack.congelado.cantidadRecibida, 10);

  seccion("1b. PACK con sueltas: 6 bultos y 5 sueltas entran como 77");
  // El caso donde `cantidadRecibida × factor_pack` (72) NO es lo que entró.
  const sueltas = await casoDeUnaLinea(f, {
    titulo: "PACK con sueltas",
    prod: f.pack,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 6, unidad: "BULTO" },
    cuerpo: (id) => ({ recibidos: { [id]: 6 }, sueltas: { [id]: 5 }, fisicas: { [id]: 77 } }),
    esperado: 77,
    unidad: "UNIDAD",
  });

  seccion("3. UNIDAD simple: 15 entran como 15");
  await casoDeUnaLinea(f, {
    titulo: "UNIDAD",
    prod: f.unidad,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 15, unidad: "UNIDAD" },
    cuerpo: (id) => ({ recibidos: { [id]: 15 } }),
    esperado: 15,
    unidad: "UNIDAD",
  });

  seccion("4. KG por bulto, pesado: 8,350 kg entran como 8,350 KG");
  const kg = await casoDeUnaLinea(f, {
    titulo: "KG pesado",
    prod: f.kg,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 2, unidad: "BULTO" },
    cuerpo: (id) => ({ recibidos: { [id]: 2 }, kgRecibidos: { [id]: 8.35 } }),
    esperado: 8.35,
    unidad: "KG",
  });

  seccion("4b. KG por bulto SIN pesar: entra por la rama de unidades, y se dice");
  // No es lo deseable, pero es lo que la recepción hace hoy: se congela lo que
  // pasó. Esta tanda no cambia cuánto entra.
  await casoDeUnaLinea(f, {
    titulo: "KG sin pesar",
    prod: f.kg,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 2, unidad: "BULTO" },
    cuerpo: (id) => ({ recibidos: { [id]: 2 } }),
    esperado: 2,
    unidad: "UNIDAD",
  });

  seccion("5. Fiambre por PESO: 3 piezas de 2,100 kg entran como 2,100 KG");
  const peso = await casoDeUnaLinea(f, {
    titulo: "PESO",
    prod: f.peso,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 3, unidad: "UNIDAD" },
    cuerpo: (id) => ({ recibidos: { [id]: 3 }, kgRecibidos: { [id]: 2.1 } }),
    esperado: 2.1,
    unidad: "KG",
  });

  seccion("6. Fiambre de PIEZA fija en el depósito: 3 piezas entran como 3 PIEZA");
  const piezaDep = await casoDeUnaLinea(f, {
    titulo: "PIEZA en depósito",
    prod: f.pieza,
    owner: D,
    sesion: f.sesionDeposito,
    linea: { cantidad: 3, unidad: "UNIDAD" },
    cuerpo: (id) => ({ recibidos: { [id]: 3 }, kgRecibidos: { [id]: 2.1 } }),
    esperado: 3,
    unidad: "PIEZA",
  });

  seccion("7. El MISMO fiambre de pieza, comprado por un local: entra en KG");
  const piezaLocal = await casoDeUnaLinea(f, {
    titulo: "PIEZA en local",
    prod: f.pieza,
    owner: L,
    sesion: f.sesionLocal,
    linea: { cantidad: 3, unidad: "UNIDAD" },
    cuerpo: (id) => ({ recibidos: { [id]: 3 }, kgRecibidos: { [id]: 2.1 } }),
    esperado: 2.1,
    unidad: "KG",
  });
  ok(
    "el mismo producto congeló dos unidades distintas, porque entró distinto",
    piezaDep.congelado.unidad === "PIEZA" && piezaLocal.congelado.unidad === "KG"
  );

  seccion("8. Cero: declarado y no declarado");
  {
    const antes = await stockDe(D, f.pack.base.id);
    const p = await pedidoEnviado(f, {
      owner: D,
      lineas: [{ prod: f.pack, cantidad: 4 }, { prod: f.pack, cantidad: 2 }],
    });
    const [declarado, sinDeclarar] = p.det;
    const r = await recibir(f.sesionDeposito, p, { recibidos: { [declarado]: 0 } });
    ok("cero: el cierre responde 200", r.status === 200 && r.ok, `${r.status} ${r.error}`);
    igualStock("cero: el stock no se movió", (await stockDe(D, f.pack.base.id)) - antes, 0);
    const a = await congelado(declarado);
    const b = await congelado(sinDeclarar);
    igual("cero declarado: 0 UNIDAD y cantidadRecibida 0", a, { stockIngresado: 0, unidad: "UNIDAD", cantidadRecibida: 0 });
    igual("sin declarar: 0 UNIDAD, y cantidadRecibida sigue en null (nadie contó)", b, {
      stockIngresado: 0,
      unidad: "UNIDAD",
      cantidadRecibida: null,
    });
  }

  seccion("9. Combo: no mueve stock, y no se congela nada");
  {
    const p = await pedidoEnviado(f, {
      owner: D,
      lineas: [{ prod: f.combo, cantidad: 2 }, { prod: f.combo, cantidad: 1 }],
    });
    const [conCantidad, enCero] = p.det;
    const r = await recibir(f.sesionDeposito, p, { recibidos: { [conCantidad]: 2, [enCero]: 0 } });
    ok("combo: el cierre responde 200", r.status === 200 && r.ok, `${r.status} ${r.error}`);
    igualStock("combo: sin stock", await stockDe(D, f.combo.base.id), 0);
    const a = await congelado(conCantidad);
    const b = await congelado(enCero);
    igual("combo con cantidad: los dos en null", [a.stockIngresado, a.unidad], [null, null]);
    igual("combo en cero: los dos en null, no 0", [b.stockIngresado, b.unidad], [null, null]);
  }

  seccion("10. Reintento después de RECIBIDO: ni stock ni congelado");
  {
    const antes = await stockDe(D, f.pack.base.id);
    const r = await recibir(f.sesionDeposito, pack.pedido, {
      recibidos: { [pack.detId]: 99 },
      fisicas: { [pack.detId]: 999 },
    });
    ok("el reintento responde 200 y repetido", r.status === 200 && r.repetido === true, `${r.status} ${r.error}`);
    igualStock("el stock no se movió", await stockDe(D, f.pack.base.id), antes);
    igual("lo congelado sigue en 120 UNIDAD", (await congelado(pack.detId)).stockIngresado, 120);

    // La hoja de Corregir sobre un pedido ya recibido: la ruta frena, y un
    // cuerpo que traiga lo congelado no lo alcanza.
    const c = await leer(
      rutaCorreccion.POST(
        conCuerpo("http://ci/api/compras-proveedor/recepcion/correccion", f.sesionDeposito, {
          pedidoId: pack.pedido.id,
          pedidoDetalleId: pack.detId,
          cantidadRecibida: 1,
          unidadesFisicas: 1,
          stockIngresado: 1,
          stockIngresadoUnidad: "KG",
        })
      )
    );
    ok("corregir un pedido recibido → 409", c.status === 409, `${c.status} ${c.error}`);
    igual("y lo congelado no se movió", await congelado(pack.detId), {
      stockIngresado: 120,
      unidad: "UNIDAD",
      cantidadRecibida: 10,
    });
  }

  seccion("11. Dos cierres a la vez: se aplica uno solo");
  {
    const antes = await stockDe(D, f.pack.base.id);
    const p = await pedidoEnviado(f, { owner: D, lineas: [{ prod: f.pack, cantidad: 3 }] });
    const cuerpo = { recibidos: { [p.det[0]]: 3 } };
    const [a, b] = await Promise.all([recibir(f.sesionDeposito, p, cuerpo), recibir(f.sesionDeposito, p, cuerpo)]);
    ok("los dos responden 200", a.status === 200 && b.status === 200, `${a.status} ${a.error || ""} / ${b.status} ${b.error || ""}`);
    igual("uno solo cerró; el otro es repetido", [a.repetido, b.repetido].filter((x) => x === true).length, 1);
    igualStock("el stock sumó 36 una sola vez", (await stockDe(D, f.pack.base.id)) - antes, 36);
    igual("congelado único: 36 UNIDAD", await congelado(p.det[0]), { stockIngresado: 36, unidad: "UNIDAD", cantidadRecibida: 3 });
  }

  seccion("12. Una falla DESPUÉS de sumar el stock: no queda nada");
  {
    // El depósito cierra pagando en efectivo con el cajón de OTRO local.
    // `registrarPagoProveedor` lo frena adentro de la transacción, cuando las
    // dos líneas ya sumaron su stock, ya congelaron su número y el pedido ya
    // pasó a RECIBIDO. Tiene que volver atrás todo.
    const antesUnidad = await stockDe(D, f.unidad.base.id);
    const p = await pedidoEnviado(f, {
      owner: D,
      lineas: [
        { prod: f.unidad, cantidad: 4, unidad: "UNIDAD" },
        { prod: f.unidad, cantidad: 5, unidad: "UNIDAD" },
      ],
    });
    const r = await recibir(f.sesionDeposito, p, {
      recibidos: { [p.det[0]]: 4, [p.det[1]]: 5 },
      pagoAlProveedor: {
        estado: "PAGADA",
        totalAPagar: "1000",
        totalConfirmado: true,
        pago: { medio: "EFECTIVO", localOrigenId: D, turnoId: f.turnoOtro.id },
      },
    });
    ok("la falla se informa (403)", r.status === 403, `${r.status} ${r.error}`);
    igualStock("el stock no se movió", await stockDe(D, f.unidad.base.id), antesUnidad);
    const est = await prisma.pedidoProveedor.findUnique({ where: { id: p.id }, select: { estado: true } });
    igual("el pedido sigue ENVIADO", est.estado, "ENVIADO");
    igual("ninguna línea quedó congelada", await Promise.all(p.det.map(congelado)), [
      { stockIngresado: null, unidad: null, cantidadRecibida: null },
      { stockIngresado: null, unidad: null, cantidadRecibida: null },
    ]);
  }

  seccion("13. Una compra recibida ANTES de esto: su null no se reinterpreta");
  {
    // Así quedó toda compra recibida antes de la migración: cantidad contada y
    // nada congelado. Ni el cierre repetido ni la hoja de Corregir lo rellenan.
    const p = await pedidoEnviado(f, {
      owner: D,
      estado: "RECIBIDO",
      lineas: [{ prod: f.pack, cantidad: 10, extra: { cantidadRecibida: 10 } }],
    });
    const r = await recibir(f.sesionDeposito, p, { recibidos: { [p.det[0]]: 10 } });
    ok("el cierre sobre una compra vieja contesta repetido", r.status === 200 && r.repetido === true, `${r.status} ${r.error}`);
    const c = await leer(
      rutaCorreccion.POST(
        conCuerpo("http://ci/api/compras-proveedor/recepcion/correccion", f.sesionDeposito, {
          pedidoId: p.id,
          pedidoDetalleId: p.det[0],
          unidadesFisicas: 60,
        })
      )
    );
    ok("corregirla → 409", c.status === 409, `${c.status} ${c.error}`);
    igual("sigue en null, sin reconstruir con el factor de hoy", await congelado(p.det[0]), {
      stockIngresado: null,
      unidad: null,
      cantidadRecibida: 10,
    });
  }

  // Va AL FINAL a propósito: cambia los productos, y lo que venga después los
  // recibiría con el producto nuevo. Eso también se mira acá abajo.
  seccion("2. INDEPENDENCIA HISTÓRICA: el producto cambia y lo congelado no");
  {
    const casos = [pack, sueltas, kg, peso, piezaDep, piezaLocal];
    const antes = casos.map((c) => c.congelado);
    await prisma.productoBase.update({
      where: { id: f.pack.base.id },
      data: { factor_pack: 6, unidad_medida: "cajon" },
    });
    await prisma.productoBase.update({
      where: { id: f.kg.base.id },
      data: { unidad_medida: "unidad", factor_pack: 20 },
    });
    await prisma.productoBase.update({
      where: { id: f.peso.base.id },
      data: { pesoReferenciaKg: 3, pesoPromedioKg: 3, modoVentaDeposito: "PIEZA" },
    });
    await prisma.productoBase.update({
      where: { id: f.pieza.base.id },
      data: { modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: 1.9, pesoPromedioKg: 1.9 },
    });
    const despues = await Promise.all(casos.map((c) => congelado(c.detId)));
    igual("PACK: sigue 120 UNIDAD con el factor en 6", [despues[0].stockIngresado, despues[0].unidad], [120, "UNIDAD"]);
    igual(
      "y la reconstrucción con el producto de hoy daría 60, no 120",
      despues[0].cantidadRecibida * 6,
      60
    );
    igual("PACK con sueltas: sigue 77", despues[1].stockIngresado, 77);
    igual("KG: sigue 8,35 KG aunque el producto pase a unidad", [despues[2].stockIngresado, despues[2].unidad], [8.35, "KG"]);
    igual("PESO: sigue 2,1 KG aunque pase a PIEZA", [despues[3].stockIngresado, despues[3].unidad], [2.1, "KG"]);
    igual("PIEZA en depósito: sigue 3 PIEZA aunque pase a PESO", [despues[4].stockIngresado, despues[4].unidad], [3, "PIEZA"]);
    igual("PIEZA en local: sigue 2,1 KG", [despues[5].stockIngresado, despues[5].unidad], [2.1, "KG"]);
    igual("nada de lo congelado cambió", despues, antes);

    // Y la compra NUEVA del mismo pack entra con el factor de hoy: las dos
    // conviven, cada una con su hecho.
    const nueva = await casoDeUnaLinea(f, {
      titulo: "PACK después del cambio a x6",
      prod: f.pack,
      owner: D,
      sesion: f.sesionDeposito,
      linea: { cantidad: 10, unidad: "BULTO" },
      cuerpo: (id) => ({ recibidos: { [id]: 10 } }),
      esperado: 60,
      unidad: "UNIDAD",
    });
    igual(
      "la compra vieja sigue diciendo 120 al lado de la nueva que dice 60",
      [(await congelado(pack.detId)).stockIngresado, nueva.congelado.stockIngresado],
      [120, 60]
    );

    // El fiambre que era de pieza fija ahora es por peso: la compra nueva en el
    // depósito entra en KG, y la vieja sigue en PIEZA.
    const piezaAhoraPeso = await casoDeUnaLinea(f, {
      titulo: "fiambre que pasó a PESO, en depósito",
      prod: f.pieza,
      owner: D,
      sesion: f.sesionDeposito,
      linea: { cantidad: 3, unidad: "UNIDAD" },
      cuerpo: (id) => ({ recibidos: { [id]: 3 }, kgRecibidos: { [id]: 5.4 } }),
      esperado: 5.4,
      unidad: "KG",
    });
    igual(
      "dos compras del mismo producto en el depósito, dos unidades",
      [(await congelado(piezaDep.detId)).unidad, piezaAhoraPeso.congelado.unidad],
      ["PIEZA", "KG"]
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════

let codigo = 0;
try {
  if (!SECRETO) { console.error("ABORTADO: falta AUTH_SECRET."); process.exit(2); }
  console.log("Montando fixtures…");
  await correr(await montar());
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err?.message || err}`);
  console.error(err);
} finally {
  await desmontar().catch((e) => console.error("Limpieza incompleta:", e.message));
  await prisma.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  console.log("");
  for (const f of fallas) console.log(`  ✗ ${f}`);
  codigo = 1;
}
process.exit(codigo);
