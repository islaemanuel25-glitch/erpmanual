// TERMINAR UNA OFERTA NO TOCA PRECIO, COSTO NI STOCK.
//
//   DATABASE_URL="postgresql://.../erpazul_migration_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3211" \
//   SEED_DESTRUCTIVO=erpazul_migration_test \
//   node scripts/integracion-terminar-oferta.mjs
//
// ── POR QUÉ ESTO NO SE PRUEBA LEYENDO LA RUTA ───────────────────────────
//
// Porque lo que hay que afirmar es que NO PASÓ NADA en tres tablas, y "no pasó
// nada" no se lee: se mide antes y después. La ruta hoy escribe `finalizadaEn`,
// levanta las marcas de revisión y registra el evento; mañana alguien puede
// agregarle un "y de paso devolvé el precio", que es exactamente lo que este
// candado existe para atrapar.
//
// El botón nuevo de la lista del celular dispara esta ruta con un toque. Antes
// había que entrar al detalle; ahora está a un dedo de distancia en una lista de
// tarjetas, así que el costo de un error subió y la prueba tiene que estar.

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3211";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

let pass = 0, fail = 0;
const PERMS = ["ofertas.ver", "ofertas.crear", "ofertas.editar", "ofertas.finalizar", "pos.usar"];

function ok(nombre, cond, detalle = "") {
  if (cond) { console.log(`  ✔ ${nombre}`); pass++; }
  else { console.log(`  ✖ ${nombre} ${detalle}`); fail++; }
}

function cookieFor(u) {
  return `erpazul_sesion=${jwt.sign(
    { id: u.id, rolId: u.rolId, permisos: PERMS, localId: u.localId },
    AUTH_SECRET,
    { expiresIn: "8h" }
  )}`;
}

async function req(method, path, { cookie, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

/** La foto de lo que NO se tiene que mover. */
async function foto(productoLocalId) {
  const pl = await prisma.productoLocal.findUnique({
    where: { id: productoLocalId },
    select: { precio_venta: true, precio_costo: true, activo: true, baseId: true },
  });
  const base = await prisma.productoBase.findUnique({
    where: { id: pl.baseId },
    select: { precio_venta: true, precio_costo: true, activo: true },
  });
  const stock = await prisma.stockLocal.findFirst({
    where: { productoId: productoLocalId },
    select: { cantidad: true, stockMin: true, stockMax: true },
  });
  return JSON.stringify({ pl, base, stock });
}

async function run() {
  await truncateAll();

  const hash = await bcrypt.hash("secret123", 8);
  const rol = await prisma.rol.create({ data: { nombre: "DUEÑO", permisos: PERMS, esSistema: true } });
  const g = await prisma.grupo.create({ data: { nombre: "G-OF" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: "Mini el 7", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  const user = await prisma.usuario.create({
    data: { nombre: "U", email: "u@of.test", passwordHash: hash, rolId: rol.id, localId: local.id },
  });
  const cookie = cookieFor(user);

  const base = await prisma.productoBase.create({
    data: {
      grupoId: g.id, creadoEnLocalId: depo.id, nombre: "QUILMES CERVEZA 1L",
      unidad_medida: "unidad", factor_pack: 1, codigo_barra: "779OF0001",
      precio_costo: 2800, precio_venta: 3700, margen: 32, redondeo_100: false,
    },
  });
  const pl = await prisma.productoLocal.create({
    data: { localId: local.id, baseId: base.id, precio_venta: 3700, precio_costo: 2800, activo: true },
  });
  await prisma.stockLocal.create({
    data: { localId: local.id, productoId: pl.id, cantidad: 24, stockMin: 6, stockMax: 60 },
  });

  const ahora = new Date();
  const oferta = await prisma.oferta.create({
    data: {
      grupoId: g.id, localId: local.id, nombre: "QUILMES CERVEZA 1L",
      condicionPago: "CUALQUIER_MEDIO",
      inicioEn: new Date(ahora.getTime() - 3600_000),
      finEn: new Date(ahora.getTime() + 3 * 24 * 3600_000),
      publicadaEn: ahora, creadoPorId: user.id,
      lineas: {
        create: [{
          productoLocalId: pl.id, productoBaseId: base.id,
          precioOferta: 3300, precioNormalReferencia: 3700, costoReferencia: 2800,
          // Una marca de revisión puesta: al archivar se tiene que levantar, y
          // eso SÍ es un cambio esperado. Sin ejercerlo, el candado no
          // distinguiría "no tocó nada" de "no hizo nada".
          revisionPendienteDesde: ahora, costoAlDetectar: 2900,
        }],
      },
    },
  });

  // ── 1 · LA LISTA TRAE LO QUE LA TARJETA MUESTRA ───────────────────────
  console.log("\n▸ 1 · el listado");
  const lista = await req("GET", "/api/ofertas/listar", { cookie });
  ok("el listado contesta", lista.status === 200 && lista.json?.ok, JSON.stringify(lista.json)?.slice(0, 200));
  const item = (lista.json?.items || [])[0];
  ok("trae el producto", item?.producto === "QUILMES CERVEZA 1L", JSON.stringify(item));
  ok("trae el precio de oferta", Number(item?.precioOferta) === 3300, JSON.stringify(item?.precioOferta));
  ok("trae el precio normal congelado", Number(item?.precioNormal) === 3700, JSON.stringify(item?.precioNormal));
  ok("dice si es solo efectivo", item?.soloEfectivo === false, JSON.stringify(item?.soloEfectivo));

  // ── 2 · TERMINAR NO TOCA PRECIO, COSTO NI STOCK ───────────────────────
  console.log("\n▸ 2 · terminar ahora");
  const antes = await foto(pl.id);
  const fin = await req("POST", `/api/ofertas/${oferta.id}/finalizar`, { cookie, body: {} });
  ok("la ruta finaliza", fin.status === 200 && fin.json?.ok, JSON.stringify(fin.json)?.slice(0, 200));

  const despues = await foto(pl.id);
  ok(
    "NO se movieron precio, costo ni stock",
    antes === despues,
    `\n      antes:   ${antes}\n      después: ${despues}`
  );

  const ofDespues = await prisma.oferta.findUnique({
    where: { id: oferta.id },
    select: { finalizadaEn: true, finalizadaPorId: true },
  });
  ok("quedó finalizada, con autor", !!ofDespues?.finalizadaEn && ofDespues.finalizadaPorId === user.id,
    JSON.stringify(ofDespues));

  const linea = await prisma.ofertaLinea.findFirst({
    where: { ofertaId: oferta.id },
    select: { revisionPendienteDesde: true, precioOferta: true },
  });
  ok("se levantó la marca de revisión", linea?.revisionPendienteDesde === null, JSON.stringify(linea));
  ok("y el precio de la oferta NO se borró: queda el histórico",
    Number(linea?.precioOferta) === 3300, JSON.stringify(linea?.precioOferta));

  // ── 3 · YA NO APARECE EN CURSO, Y SÍ EN TERMINADAS ────────────────────
  console.log("\n▸ 3 · las dos solapas");
  const enCurso = await req("GET", "/api/ofertas/listar", { cookie });
  ok("«En curso» queda vacía", (enCurso.json?.items || []).length === 0, JSON.stringify(enCurso.json?.items));
  const terminadas = await req("GET", "/api/ofertas/listar?archivadas=1", { cookie });
  ok("«Terminadas» la muestra", (terminadas.json?.items || []).length === 1, JSON.stringify(terminadas.json?.items)?.slice(0, 200));
  ok("y con su precio, para poder consultarla",
    Number((terminadas.json?.items || [])[0]?.precioOferta) === 3300,
    JSON.stringify((terminadas.json?.items || [])[0]?.precioOferta));

  // ── 4 · NO SE PUEDE TERMINAR DOS VECES ────────────────────────────────
  const otraVez = await req("POST", `/api/ofertas/${oferta.id}/finalizar`, { cookie, body: {} });
  ok("terminar dos veces da 409", otraVez.status === 409, `${otraVez.status} ${JSON.stringify(otraVez.json)}`);

  // ── 5 · SIN PERMISO NO SE TERMINA ─────────────────────────────────────
  const rolSin = await prisma.rol.create({
    data: { nombre: "SIN_FINALIZAR", permisos: ["ofertas.ver"], esSistema: false },
  });
  const uSin = await prisma.usuario.create({
    data: { nombre: "USin", email: "s@of.test", passwordHash: hash, rolId: rolSin.id, localId: local.id },
  });
  const cookieSin = `erpazul_sesion=${jwt.sign(
    { id: uSin.id, rolId: rolSin.id, permisos: ["ofertas.ver"], localId: local.id },
    AUTH_SECRET, { expiresIn: "8h" }
  )}`;
  const sinPerm = await req("POST", `/api/ofertas/${oferta.id}/finalizar`, { cookie: cookieSin, body: {} });
  ok("sin `ofertas.finalizar` el servidor rechaza",
    sinPerm.status === 401 || sinPerm.status === 403,
    `${sinPerm.status} ${JSON.stringify(sinPerm.json)}`);

  console.log(`\n${pass} en verde · ${fail} en rojo`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error("ABORT:", e);
  await prisma.$disconnect();
  process.exit(1);
});
