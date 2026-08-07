// Harness de integración: PROPAGACIÓN DEL COSTO MAESTRO A CADA LOCAL POR SU MARGEN.
//
// El problema que cubre es de producción: subía el costo de un producto del
// depósito y los precios de venta de los locales se quedaban quietos, con lo cual
// el local pasaba a vender por debajo del costo sin ningún aviso.
//
// Verifica que, al cambiar el costo maestro:
//   · cada ubicación recalcula su precio con SU margen configurado;
//   · el margen del local tiene prioridad sobre el de la ficha;
//   · ninguna ubicación recibe el margen ni el precio de otra;
//   · se conserva el redondeo comercial a 100 de la ficha;
//   · sin margen configurado el precio no se pisa, pero el caso se reporta cuando
//     quedó por debajo del costo.
//
// Cubre los DOS caminos por los que se mueve el costo maestro: la edición de la
// ficha (HTTP) y el flujo de compras (actualizarCostoRealProducto), que es el que
// realmente se usa en producción.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-costo-propaga-margen.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";
import { actualizarCostoRealProducto } from "../lib/compras-proveedor/costoMaestro.js";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

function cookieFor(user) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null,
      esDuenoLocal: !!user.esDuenoLocal, esDeposito: !!user.esDeposito },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  return `erpazul_sesion=${token}`;
}
async function req(method, path, { cookie = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

const n = (v) => (v == null ? null : Number(v));
const base_ = (id) => prisma.productoBase.findUnique({ where: { id }, select: { precio_costo: true, precio_venta: true, margen: true } });
const loc_ = (baseId, localId) => prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { id: true, precio_costo: true, precio_venta: true, margen: true } });

async function foto(baseId, etiqueta) {
  const b = await base_(baseId);
  console.log(`   [${etiqueta}] base: costo=${n(b.precio_costo)} venta=${n(b.precio_venta)} margen=${n(b.margen)}`);
  for (const [nombre, id] of [["depo", S.depo], ["A", S.localA], ["B", S.localB]]) {
    const l = await loc_(baseId, id);
    if (l) console.log(`   [${etiqueta}] ${nombre}: costo=${n(l.precio_costo)} venta=${n(l.precio_venta)} margen=${n(l.margen)}`);
  }
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Costo-Margen" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });

  const mk = (nom, mail, rolId, localId) => prisma.usuario.create({ data: { nombre: nom, email: mail, passwordHash: hash, rolId, localId } });
  const duenoDepo = await mk("DuenoDepo", "dd@cm.test", rolDueno.id, depo.id);
  const duenoA = await mk("DuenoA", "da@cm.test", rolDueno.id, localA.id);

  // P1 — el caso del reporte: costo 10, sin redondeo a 100 (si no, 13 saltaría a 100).
  // Margen de ficha 20 %. Local A 30 %. Local B 50 %. El depósito hereda el de ficha.
  const p1 = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "P1 costo 10", unidad_medida: "unidad",
      factor_pack: 1, precio_costo: 10, precio_venta: 12, margen: 20, redondeo_100: false },
  });
  await prisma.productoLocal.create({ data: { localId: depo.id, baseId: p1.id, precio_costo: 10, precio_venta: 12, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: p1.id, precio_costo: 10, precio_venta: 13, margen: 30, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localB.id, baseId: p1.id, precio_costo: 10, precio_venta: 15, margen: 50, activo: true } });

  // P2 — con redondeo comercial a 100 activo.
  const p2 = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "P2 redondeo", unidad_medida: "unidad",
      factor_pack: 1, precio_costo: 1000, precio_venta: 1200, margen: 20, redondeo_100: true },
  });
  await prisma.productoLocal.create({ data: { localId: depo.id, baseId: p2.id, precio_costo: 1000, precio_venta: 1200, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: p2.id, precio_costo: 1000, precio_venta: 1300, margen: 30, activo: true } });

  // P3 — el caso realmente peligroso: NI el local NI la ficha tienen margen. Recién
  // ahí no hay regla automática y el precio no se puede recalcular. Con margen en la
  // ficha alcanza, porque es el fallback de los locales que no definieron el suyo.
  const p3 = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "P3 sin margen", unidad_medida: "unidad",
      factor_pack: 1, precio_costo: 10, precio_venta: 12, margen: null, redondeo_100: false },
  });
  await prisma.productoLocal.create({ data: { localId: depo.id, baseId: p3.id, precio_costo: 10, precio_venta: 12, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: p3.id, precio_costo: 10, precio_venta: 13, margen: null, activo: true } });

  Object.assign(S, {
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    duenoDepo: { ...duenoDepo, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true, esDeposito: true },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    p1: p1.id, p2: p2.id, p3: p3.id,
  });
}

async function run() {
  await truncateAll();
  await seed();

  console.log("\n══ CASO OBLIGATORIO: costo 10 → 20 por el flujo de compras ══");
  await foto(S.p1, "antes");
  const plDepoP1 = await loc_(S.p1, S.depo);
  const resultado = await actualizarCostoRealProducto(prisma, {
    productoLocalId: plDepoP1.id,
    costoMaestro: 20,
    operadoDesdeLocalId: S.depo,
    depositoLocalId: S.depo,
  });
  await foto(S.p1, "después");

  ok("ProductoBase.precio_costo = 20", n((await base_(S.p1)).precio_costo) === 20);
  ok("ProductoBase.precio_venta = 24 (margen de ficha 20 %)", n((await base_(S.p1)).precio_venta) === 24);
  ok("Local A recalculado con SU margen 30 % → 26", n((await loc_(S.p1, S.localA)).precio_venta) === 26);
  ok("Local B recalculado con SU margen 50 % → 30", n((await loc_(S.p1, S.localB)).precio_venta) === 30);
  ok("Depósito con el margen de la ficha 20 % → 24", n((await loc_(S.p1, S.depo)).precio_venta) === 24);
  ok("el costo llegó a todas las ubicaciones",
    n((await loc_(S.p1, S.localA)).precio_costo) === 20 && n((await loc_(S.p1, S.localB)).precio_costo) === 20);
  ok("ningún local recibió el margen de otro",
    n((await loc_(S.p1, S.localA)).margen) === 30 && n((await loc_(S.p1, S.localB)).margen) === 50);
  ok("ninguna ubicación quedó vendiendo por debajo del costo",
    n((await loc_(S.p1, S.localA)).precio_venta) > 20 && n((await loc_(S.p1, S.localB)).precio_venta) > 20);
  ok("la propagación informó 3 ubicaciones actualizadas", resultado?.actualizadas?.length === 3);

  console.log("\n══ El redondeo comercial a 100 se conserva ══");
  const plDepoP2 = await loc_(S.p2, S.depo);
  await actualizarCostoRealProducto(prisma, { productoLocalId: plDepoP2.id, costoMaestro: 2000, operadoDesdeLocalId: S.depo, depositoLocalId: S.depo });
  await foto(S.p2, "después");
  ok("Local A con margen 30 % sobre 2000 → 2600", n((await loc_(S.p2, S.localA)).precio_venta) === 2600);
  ok("Depósito con margen 20 % sobre 2000 → 2400", n((await loc_(S.p2, S.depo)).precio_venta) === 2400);

  console.log("\n══ Ni local ni ficha con margen: no se pisa el precio, pero se avisa ══");
  const plDepoP3 = await loc_(S.p3, S.depo);
  const r3 = await actualizarCostoRealProducto(prisma, { productoLocalId: plDepoP3.id, costoMaestro: 20, operadoDesdeLocalId: S.depo, depositoLocalId: S.depo });
  await foto(S.p3, "después");
  ok("el precio manual de A no se pisó (sigue 13)", n((await loc_(S.p3, S.localA)).precio_venta) === 13);
  ok("la propagación reporta a A sin margen y por debajo del costo",
    r3.sinMargen.some((x) => x.localId === S.localA && x.bajoCosto === true));

  console.log("\n══ Edición manual del dueño de local: no afecta a los demás ══");
  const antesB = n((await loc_(S.p1, S.localB)).precio_venta);
  const antesDepo = n((await loc_(S.p1, S.depo)).precio_venta);
  const it = (await req("GET", `/api/productos/obtener?id=${S.p1}&localId=${S.localA}`, { cookie: cookieFor(S.duenoA) })).json.item;
  const payload = {
    nombre: it.nombre, descripcion: it.descripcion, sku: it.sku,
    codigo_barra: it.codigoBarra, codigo_barra_secundario: it.codigoBarraSecundario,
    categoria_id: null, proveedor_id: null, proveedor2_id: null, proveedor3_id: null, area_fisica_id: null,
    unidad_medida: it.unidadMedida, factor_pack: it.factorPack,
    peso_kg: it.pesoKg, volumen_ml: it.volumenMl,
    precio_costo: it.precioCosto, precio_venta: 99, margen: 40,
    precio_sugerido: it.precioSugerido, iva_porcentaje: it.ivaPorcentaje,
    fecha_vencimiento: it.fechaVencimiento, redondeo_100: Boolean(it.redondeo100),
    activo: Boolean(it.activo), imagen_url: it.imagenUrl, es_combo: false,
    modalidad: it.modalidad, modo_pedido: it.modoPedido, modo_envio: it.modoEnvio, modo_stock: it.modoStock,
    modoCompraProveedor: it.modoCompraProveedor, pesoReferenciaKg: it.pesoReferenciaKg,
    pesoEsFijo: Boolean(it.pesoEsFijo), modoVentaDeposito: it.modoVentaDeposito,
    actualizaPromedioPorRecepcion: it.actualizaPromedioPorRecepcion,
  };
  const rEd = await req("PUT", `/api/productos/editar/${S.p1}?localId=${S.localA}`, { cookie: cookieFor(S.duenoA), body: payload });
  ok("el dueño de A guarda precio y margen a mano → 200", rEd.status === 200, JSON.stringify(rEd.json).slice(0, 160));
  await foto(S.p1, "tras edición manual de A");
  ok("A quedó con su precio manual 99", n((await loc_(S.p1, S.localA)).precio_venta) === 99);
  ok("A quedó con su margen manual 40", n((await loc_(S.p1, S.localA)).margen) === 40);
  ok("B intacto", n((await loc_(S.p1, S.localB)).precio_venta) === antesB);
  ok("depósito intacto", n((await loc_(S.p1, S.depo)).precio_venta) === antesDepo);
  ok("el costo maestro no se movió", n((await base_(S.p1)).precio_costo) === 20);

  console.log("\n══ El margen manual de A manda en la siguiente suba de costo ══");
  await actualizarCostoRealProducto(prisma, { productoLocalId: plDepoP1.id, costoMaestro: 50, operadoDesdeLocalId: S.depo, depositoLocalId: S.depo });
  await foto(S.p1, "tras costo 50");
  ok("A recalculado con su margen 40 % → 70", n((await loc_(S.p1, S.localA)).precio_venta) === 70);
  ok("B sigue con el suyo 50 % → 75", n((await loc_(S.p1, S.localB)).precio_venta) === 75);
}

run()
  .then(async () => { await prisma.$disconnect(); console.log(`\n== COSTO-PROPAGA-MARGEN: ${pass} pass / ${fail} fail ==`); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
