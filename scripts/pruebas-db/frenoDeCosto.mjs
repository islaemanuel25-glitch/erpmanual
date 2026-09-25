// PRUEBAS DE BASE DEL FRENO DE COSTO AL RECIBIR UNA COMPRA.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/frenoDeCosto.mjs
//
// ── EL DEFECTO QUE ESTO HABRÍA ATRAPADO ───────────────────────────────────
//
// El cierre de `recibir/[id]` tiene tres defensas sobre el costo —la escala de
// `costoLineaAMaestro`, el freno por la variación del proveedor y la
// frontera— y las tres leen `base.precio_costo`. El `select` de la base nunca
// lo trajo: comparaban contra cero y no frenaban nunca. Los candados eran
// funciones puras con los números pasados a mano, más uno que leía el fuente y
// encontraba el texto `base?.precio_costo`: afirmaban la lectura, no que el
// campo llegara. Y la prueba de Finanzas cerraba con el costo de la línea
// igual al del catálogo, así que nunca hubo una diferencia que frenar.
//
// Acá cada caso tiene un costo maestro REAL distinto de cero, cierra por el
// handler de verdad y mira qué quedó escrito: el catálogo, el stock, el estado
// del pedido, la cuenta por pagar y el pago.
//
// La aceptación se ejerce por `aceptar-precio`, el mismo camino que usa la hoja
// de Corregir, con un comprobante de la forma que esa ruta exige.
//
// NO se corre contra producción: `clientePrisma.mjs` en nivel ESCRITURA exige
// host local y NODE_ENV distinto de production, y aborta con código 2 si no.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
const rutaAceptar = await import("../../app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
const { PERMISO_REGISTRAR_PAGOS } = await import("../../lib/finanzas/pagosProveedores.js");
const { DECISION_DE_PRECIO } = await import("../../lib/compras-proveedor/decisionDePrecio.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS — el formato que lee `contrapruebasRevision.mjs`.
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

const SECRETO = process.env.AUTH_SECRET;
const PERMISOS = ["compras.ver", "compras.crear", "compras.recibir", PERMISO_REGISTRAR_PAGOS];

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

const marca = `ci-freno-${Date.now()}`;
const creado = { rolId: null, grupoId: null, locales: [], usuarios: [], proveedorId: null, bases: [], pedidoIds: [] };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const deposito = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  creado.locales.push(deposito.id);
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  const usuario = await prisma.usuario.create({
    data: { nombre: "CI Freno", email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: deposito.id },
  });
  creado.usuarios.push(usuario.id);
  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-proveedor` } });
  creado.proveedorId = proveedor.id;
  const sesion = jwt.sign(
    { id: usuario.id, nombre: "CI Freno", email: `${marca}@ci.local`, localId: deposito.id, permisos: PERMISOS },
    SECRETO,
    { expiresIn: "1h" }
  );
  return { grupo, deposito, proveedor, sesion };
}

async function desmontar() {
  if (creado.pedidoIds.length) {
    await prisma.pagoProveedor.deleteMany({ where: { cuenta: { pedidoProveedorId: { in: creado.pedidoIds } } } });
    await prisma.cuentaPorPagarProveedor.deleteMany({ where: { pedidoProveedorId: { in: creado.pedidoIds } } });
    await prisma.comprobanteLinea.deleteMany({ where: { comprobante: { pedidoId: { in: creado.pedidoIds } } } });
    await prisma.comprobanteProveedor.deleteMany({ where: { pedidoId: { in: creado.pedidoIds } } });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: creado.pedidoIds } } });
  }
  if (creado.bases.length) {
    await prisma.decisionDePrecioProveedor.deleteMany({ where: { productoBaseId: { in: creado.bases } } });
    const pls = await prisma.productoLocal.findMany({ where: { baseId: { in: creado.bases } }, select: { id: true } });
    const ids = pls.map((p) => p.id);
    if (ids.length) await prisma.stockLocal.deleteMany({ where: { productoId: { in: ids } } });
    await prisma.productoLocal.deleteMany({ where: { baseId: { in: creado.bases } } });
    await prisma.productoBase.deleteMany({ where: { id: { in: creado.bases } } });
  }
  if (creado.proveedorId) await prisma.proveedor.deleteMany({ where: { id: creado.proveedorId } });
  if (creado.usuarios.length) await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  if (creado.grupoId) await prisma.grupoDeposito.deleteMany({ where: { grupoId: creado.grupoId } });
  if (creado.locales.length) await prisma.local.deleteMany({ where: { id: { in: creado.locales } } });
  if (creado.grupoId) await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  if (creado.rolId) await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

// ═══════════════════════════════════════════════════════════════════════════
// AYUDAS
// ═══════════════════════════════════════════════════════════════════════════

const UNIDAD = { unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const PACK12 = { unidad_medida: "pack", factor_pack: 12, modoCompraProveedor: "BULTO" };
const PACK30 = { unidad_medida: "pack", factor_pack: 30, modoCompraProveedor: "BULTO" };
const PESO = { unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 0.5, modoVentaDeposito: "PESO" };
const PIEZA = { unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 0.7, modoVentaDeposito: "PIEZA" };

/**
 * Un producto con su costo maestro, y un pedido ENVIADO con una línea.
 * El producto es del proveedor —`proveedor_id`— como lo exige el motor de la
 * hoja de Corregir para vincular el renglón.
 */
async function pedidoCon(f, { nombre, base, catalogo, linea }) {
  const b = await prisma.productoBase.create({
    data: {
      grupoId: f.grupo.id,
      nombre: `${marca}-${nombre}`,
      precio_costo: catalogo,
      precio_venta: catalogo * 2,
      proveedor_id: f.proveedor.id,
      ...base,
    },
  });
  creado.bases.push(b.id);
  const pl = await prisma.productoLocal.create({
    data: { localId: f.deposito.id, baseId: b.id, precio_costo: catalogo, precio_venta: catalogo * 2 },
  });
  const p = await prisma.pedidoProveedor.create({
    data: {
      grupoId: f.grupo.id,
      depositoId: f.deposito.id,
      creadoEnLocalId: f.deposito.id,
      proveedorId: f.proveedor.id,
      estado: "ENVIADO",
      detalles: {
        create: [{ productoLocalId: pl.id, cantidad: linea.cantidad, unidad: linea.unidad, precioCosto: linea.precioCosto }],
      },
    },
    include: { detalles: { select: { id: true } } },
  });
  creado.pedidoIds.push(p.id);
  return { pedidoId: p.id, detId: p.detalles[0].id, baseId: b.id, plId: pl.id, cantidad: linea.cantidad };
}

/**
 * Cierra por el handler real. Por defecto como la pantalla: sin
 * `costosAceptados`, sin `fronteraCostoActiva`, con la deuda confirmada a mano
 * y un pago por transferencia, para que un rollback tenga también un pago que
 * no debe quedar.
 */
async function cerrar(f, p, extra = {}) {
  return leer(
    rutaRecibir.POST(
      conCuerpo(`http://ci/api/compras-proveedor/recibir/${p.pedidoId}`, f.sesion, {
        recibidos: { [p.detId]: p.cantidad },
        pagoAlProveedor: {
          estado: "PAGADA",
          totalAPagar: "1000",
          totalConfirmado: true,
          pago: { medio: "TRANSFERENCIA", localOrigenId: f.deposito.id },
        },
        ...(typeof extra === "function" ? extra(p.detId) : extra),
      }),
      { params: Promise.resolve({ id: String(p.pedidoId) }) }
    )
  );
}

/** Todo lo que un cierre escribe, para comparar antes y después. */
async function foto(f, p) {
  const [base, pedido, cuentas, pagos, stock] = await Promise.all([
    prisma.productoBase.findUnique({ where: { id: p.baseId }, select: { precio_costo: true } }),
    prisma.pedidoProveedor.findUnique({ where: { id: p.pedidoId }, select: { estado: true } }),
    prisma.cuentaPorPagarProveedor.count({ where: { pedidoProveedorId: p.pedidoId } }),
    prisma.pagoProveedor.count({ where: { cuenta: { pedidoProveedorId: p.pedidoId } } }),
    prisma.stockLocal.findUnique({
      where: { localId_productoId: { localId: f.deposito.id, productoId: p.plId } },
      select: { cantidad: true },
    }),
  ]);
  return {
    costo: Number(base.precio_costo),
    estado: pedido.estado,
    cuentas,
    pagos,
    stock: Number(stock?.cantidad ?? 0),
  };
}

/** K. Un 409 del freno no deja NADA: la misma foto de antes. */
async function frenaSinDejarNada(f, p, titulo, extra) {
  const antes = await foto(f, p);
  const r = await cerrar(f, p, extra);
  ok(`${titulo}: frena con 409`, r.status === 409, `${r.status} ${r.error || ""}`);
  ok(`${titulo}: el mensaje nombra el producto y dice qué hacer`, /Abrí Corregir/.test(r.error || ""), r.error);
  const despues = await foto(f, p);
  igual(`${titulo}: nada persiste (costo, ENVIADO, stock, sin cuenta, sin pago)`, despues, {
    ...antes,
    estado: "ENVIADO",
    cuentas: 0,
    pagos: 0,
  });
  return r;
}

/** Cierra bien, y devuelve lo que quedó. */
async function cierraYEscribe(f, p, titulo, costoEsperado, extra) {
  const antes = await foto(f, p);
  const r = await cerrar(f, p, extra);
  ok(`${titulo}: cierra`, r.status === 200 && r.ok, `${r.status} ${r.error || ""}`);
  const despues = await foto(f, p);
  igual(`${titulo}: el costo maestro queda en ${costoEsperado}`, despues.costo, costoEsperado);
  igual(`${titulo}: RECIBIDO, una cuenta y un pago`, [despues.estado, despues.cuentas, despues.pagos], ["RECIBIDO", 1, 1]);
  ok(`${titulo}: el stock se movió`, despues.stock > antes.stock, `${antes.stock} → ${despues.stock}`);
  return { r, antes, despues };
}

/**
 * El comprobante de un pedido, con un renglón vinculado a su línea, en la forma
 * que `aceptar-precio` exige: CARGADO, renglón con neto y subtotal impresos,
 * producto y línea del pedido resueltos. Sin total impreso, así la deuda del
 * cierre sigue siendo la que se confirma a mano.
 */
async function papelCon(f, p, { cantidad, netoUnitario }) {
  const c = await prisma.comprobanteProveedor.create({
    data: {
      grupoId: f.grupo.id,
      proveedorId: f.proveedor.id,
      pedidoId: p.pedidoId,
      localOperativoId: f.deposito.id,
      estado: "CARGADO",
      totalLeido: null,
    },
  });
  const l = await prisma.comprobanteLinea.create({
    data: {
      comprobanteId: c.id,
      orden: 1,
      textoCrudo: `${marca} renglón`,
      cantidad,
      netoUnitario,
      subtotalImpreso: Math.round(cantidad * netoUnitario * 100) / 100,
      productoLocalId: p.plId,
      pedidoDetalleId: p.detId,
    },
  });
  return l.id;
}

async function aceptarPrecio(f, p, lineaId) {
  return leer(
    rutaAceptar.POST(
      conCuerpo("http://ci/api/compras-proveedor/comprobantes/aceptar-precio", f.sesion, {
        lineaId,
        pedidoId: p.pedidoId,
        decision: DECISION_DE_PRECIO.ACEPTA_FACTURA,
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CASOS
// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  seccion("A. UNIDAD 1.000 → 30.000 sin aceptar");
  const a = await pedidoCon(f, { nombre: "A", base: UNIDAD, catalogo: 1000, linea: { cantidad: 2, unidad: "UNIDAD", precioCosto: 30000 } });
  await frenaSinDejarNada(f, a, "A");

  seccion("B. UNIDAD 1.000 → 1.150 sin aceptar (fuera del 10 % por defecto)");
  const b = await pedidoCon(f, { nombre: "B", base: UNIDAD, catalogo: 1000, linea: { cantidad: 2, unidad: "UNIDAD", precioCosto: 1150 } });
  await frenaSinDejarNada(f, b, "B");

  seccion("C. 1.000 → 1.150 aceptado por la hoja de Corregir (aceptar-precio real)");
  const c = await pedidoCon(f, { nombre: "C", base: UNIDAD, catalogo: 1000, linea: { cantidad: 2, unidad: "UNIDAD", precioCosto: 1000 } });
  // Neto que, con el IVA 21 % al pie de la receta por defecto, da 1.150 final:
  // 950,41 × 1,21 = 1.149,9961, que a centavo es 1.150,00.
  const renglonC = await papelCon(f, c, { cantidad: 2, netoUnitario: 950.41 });
  const aceptado = await aceptarPrecio(f, c, renglonC);
  ok("C: aceptar-precio contesta 200", aceptado.status === 200 && aceptado.ok, `${aceptado.status} ${aceptado.error || ""}`);
  const persistido = await prisma.comprobanteLinea.findUnique({ where: { id: renglonC }, select: { costoFinalUnitario: true } });
  const lineaC = await prisma.pedidoProveedorDetalle.findUnique({ where: { id: c.detId }, select: { precioCosto: true } });
  igual(
    "C: quedó persistida la aceptación de 1.150, en el renglón y en la línea",
    [Number(persistido.costoFinalUnitario), Number(lineaC.precioCosto)],
    [1150, 1150]
  );
  const cierreC = await cierraYEscribe(f, c, "C", 1150);
  igualStock("C: el stock sumó 2 una sola vez", cierreC.despues.stock - cierreC.antes.stock, 2);

  seccion("C2. La aceptación es de ESE costo, no de cualquiera");
  const c2 = await pedidoCon(f, { nombre: "C2", base: UNIDAD, catalogo: 1000, linea: { cantidad: 2, unidad: "UNIDAD", precioCosto: 1000 } });
  const renglonC2 = await papelCon(f, c2, { cantidad: 2, netoUnitario: 950.41 });
  const aceptadoC2 = await aceptarPrecio(f, c2, renglonC2);
  ok("C2: aceptar-precio contesta 200", aceptadoC2.status === 200 && aceptadoC2.ok, `${aceptadoC2.status} ${aceptadoC2.error || ""}`);
  await frenaSinDejarNada(f, c2, "C2 aceptado 1.150 pero el cierre trae 30.000", (id) => ({ costos: { [id]: 30000 } }));

  seccion("D. UNIDAD 1.000 → 1.050, dentro de la variación");
  const d = await pedidoCon(f, { nombre: "D", base: UNIDAD, catalogo: 1000, linea: { cantidad: 2, unidad: "UNIDAD", precioCosto: 1050 } });
  await cierraYEscribe(f, d, "D", 1050);

  seccion("E. PACK x12: las dos puntas por bulto");
  const e1 = await pedidoCon(f, { nombre: "E1", base: PACK12, catalogo: 12000, linea: { cantidad: 2, unidad: "BULTO", precioCosto: 12600 } });
  await cierraYEscribe(f, e1, "E bulto 12.000 → 12.600", 12600);
  const e2 = await pedidoCon(f, { nombre: "E2", base: PACK12, catalogo: 12000, linea: { cantidad: 2, unidad: "BULTO", precioCosto: 120000 } });
  await frenaSinDejarNada(f, e2, "E bulto 12.000 → 120.000");
  const e3 = await pedidoCon(f, { nombre: "E3", base: PACK12, catalogo: 12000, linea: { cantidad: 2, unidad: "BULTO", precioCosto: 1000 } });
  const r3 = await frenaSinDejarNada(f, e3, "E precio de UNIDAD puesto en la línea de BULTO");
  ok("E: y lo llama error de escala", /veces, justo lo que trae el bulto/.test(r3.error || ""), r3.error);

  seccion("F. Hamburguesa x30: línea por UNIDAD con el costo del bulto");
  // El 242: la línea está en escala UNIDAD y su costo ya es el del bulto de
  // 30. Con el costo maestro a la vista, la conversión no lo multiplica.
  const f1 = await pedidoCon(f, { nombre: "F1", base: PACK30, catalogo: 61703, linea: { cantidad: 90, unidad: "UNIDAD", precioCosto: 61703 } });
  await cierraYEscribe(f, f1, "F costo del bulto en línea UNIDAD", 61703, (id) => ({ fisicas: { [id]: 90 } }));
  // Y la línea por UNIDAD con el costo unitario de verdad sí se multiplica.
  const f2 = await pedidoCon(f, { nombre: "F2", base: PACK30, catalogo: 61703, linea: { cantidad: 90, unidad: "UNIDAD", precioCosto: 2100 } });
  await cierraYEscribe(f, f2, "F costo unitario en línea UNIDAD", 63000, (id) => ({ fisicas: { [id]: 90 } }));

  seccion("G. Fiambre por PESO: las dos puntas por kilo");
  const g1 = await pedidoCon(f, { nombre: "G1", base: PESO, catalogo: 5000, linea: { cantidad: 3, unidad: "UNIDAD", precioCosto: 5200 } });
  await cierraYEscribe(f, g1, "G 5.000/kg → 5.200/kg", 5200, (id) => ({ kgRecibidos: { [id]: 1.5 } }));
  const g2 = await pedidoCon(f, { nombre: "G2", base: PESO, catalogo: 5000, linea: { cantidad: 3, unidad: "UNIDAD", precioCosto: 150000 } });
  await frenaSinDejarNada(f, g2, "G 5.000/kg → 150.000/kg", (id) => ({ kgRecibidos: { [id]: 1.5 } }));

  seccion("H. Fiambre de PIEZA en el depósito: el costo sigue por kilo");
  const h1 = await pedidoCon(f, { nombre: "H1", base: PIEZA, catalogo: 5000, linea: { cantidad: 3, unidad: "UNIDAD", precioCosto: 5100 } });
  await cierraYEscribe(f, h1, "H 5.000/kg → 5.100/kg", 5100, (id) => ({ kgRecibidos: { [id]: 2.1 } }));
  const h2 = await pedidoCon(f, { nombre: "H2", base: PIEZA, catalogo: 5000, linea: { cantidad: 3, unidad: "UNIDAD", precioCosto: 50000 } });
  await frenaSinDejarNada(f, h2, "H 5.000/kg → 50.000/kg", (id) => ({ kgRecibidos: { [id]: 2.1 } }));

  seccion("I. Línea excluida: un salto grande no la frena y no se escribe");
  const i = await pedidoCon(f, { nombre: "I", base: UNIDAD, catalogo: 1000, linea: { cantidad: 2, unidad: "UNIDAD", precioCosto: 30000 } });
  await cierraYEscribe(f, i, "I", 1000, (id) => ({ costosExcluidos: [id] }));

  seccion("J. Reintento después del cierre aceptado");
  const antesJ = await foto(f, c);
  const j = await cerrar(f, c, (id) => ({ costos: { [id]: 30000 } }));
  ok("J: contesta 200 y repetido", j.status === 200 && j.repetido === true, `${j.status} ${j.error || ""}`);
  igual("J: ni stock, ni cuenta, ni pago, ni costo cambian", await foto(f, c), antesJ);
}

/** El stock en milésimas, como el resto del repo. */
function igualStock(t, o, e) {
  const a = Math.round(Number(o) * 1000);
  const b = Math.round(Number(e) * 1000);
  ok(t, a === b, `esperado ${e}, obtenido ${o}`);
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
