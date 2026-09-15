// EL CÓDIGO DE BARRAS ES ÚNICO POR UBICACIÓN — EJERCIDO CONTRA POSTGRES.
//
//   DATABASE_URL="postgresql://.../erpazul_cb_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3211" \
//   node scripts/integracion-codigo-barra-ubicacion.mjs
//
// ── POR QUÉ ESTO NO ES UN EXTRA ─────────────────────────────────────────
//
// Los candados de `validarCodigosBarra.test.mjs` prueban la DECISIÓN con un
// doble. No prueban dos cosas que en este repo ya rompieron producción:
//
//   1. que Prisma acepte el `where` que se le manda — un `select` que compilaba
//      y tenía sus candados en verde tiró abajo la pantalla de comprobantes;
//   2. que el ÍNDICE de la base deje entrar lo que la función deja entrar. Es el
//      centro de esta tanda: si el índice viejo siguiera puesto, el candado B1
//      diría que dos locales pueden repetir el código y Postgres lo rechazaría
//      igual, con un P2002 y un 500.
//
// Se ejercen los cinco casos del pedido, más el que prueba la migración.

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3211";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

let pass = 0, fail = 0;
const S = {};
const PERMS = [
  "pos.usar", "productos.ver", "productos.crear", "productos.editar",
  "productos.importar", "stock.ver",
];

function cookieFor(user) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  return `erpazul_sesion=${token}`;
}

async function req(method, path, { cookie = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

function ok(name, cond, detail = "") {
  if (cond) { console.log(`  ✔ ${name}`); pass++; }
  else { console.log(`  ✖ ${name} ${detail}`); fail++; }
}

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rol = await prisma.rol.create({ data: { nombre: "DUEÑO_LOCAL", permisos: PERMS, esSistema: true } });
  const g = await prisma.grupo.create({ data: { nombre: "G-UBIC" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const lA = await prisma.local.create({ data: { nombre: "Mini el 7", es_deposito: false } });
  const lB = await prisma.local.create({ data: { nombre: "Casiano casas", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: lA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: lB.id } });
  const mk = (nombre, email, localId) =>
    prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId: rol.id, localId } });

  Object.assign(S, {
    g: g.id, depo: depo.id, lA: lA.id, lB: lB.id,
    uDepo: { ...(await mk("UDepo", "d@ub.test", depo.id)), permisos: PERMS },
    uA: { ...(await mk("UA", "a@ub.test", lA.id)), permisos: PERMS },
    uB: { ...(await mk("UB", "b@ub.test", lB.id)), permisos: PERMS },
  });
}

const alta = (over = {}) => ({
  nombre: "Helado", unidad_medida: "unidad", factor_pack: 1,
  precio_costo: 100, precio_venta: 150, margen: 50, redondeo_100: false, activo: true,
  ...over,
});

const crear = (user, body) =>
  req("POST", `/api/productos/crear?localId=${user.localId}`, { cookie: cookieFor(user), body });

// ¿La caja de este local encuentra ESTE producto con este código?
async function escanear(user, q) {
  const r = await req(
    "GET", `/api/pos-ventas/buscar-producto?q=${encodeURIComponent(q)}&localId=${user.localId}`,
    { cookie: cookieFor(user) }
  );
  const items = Array.isArray(r.json?.items) ? r.json.items : [];
  return items.map((it) => ({ baseId: it.productoBaseId, nombre: it.nombre }));
}

const CODIGO = "7790000000001";

async function run() {
  await truncateAll();
  await seed();

  // ── 0 · LA MIGRACIÓN ESTÁ APLICADA ────────────────────────────────────
  //
  // Se pregunta por el índice, no por el comportamiento: si el viejo siguiera
  // puesto, todo lo de abajo fallaría con un P2002 y costaría entender por qué.
  const idx = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename='ProductoBase' AND indexdef ILIKE '%codigo_barra%' AND indexdef ILIKE '%UNIQUE%'`
  );
  const nombres = idx.map((r) => r.indexname);
  ok("el índice viejo por grupo NO está",
    !nombres.includes("ProductoBase_grupoId_codigo_barra_key"), JSON.stringify(nombres));
  ok("el índice nuevo por creador SÍ está",
    nombres.includes("ProductoBase_grupoId_creadoEnLocalId_codigo_barra_key"), JSON.stringify(nombres));

  // ── 1 · DOS LOCALES DISTINTOS PUEDEN REPETIR EL CÓDIGO ────────────────
  console.log("\n▸ 1 · el mismo helado en dos locales");
  const rA = await crear(S.uA, alta({ nombre: "Helado de Mini el 7", codigo_barra: CODIGO }));
  ok("Mini el 7 crea el helado", rA.status === 200 && rA.json?.ok, JSON.stringify(rA.json));
  const rB = await crear(S.uB, alta({ nombre: "Helado de Casiano", codigo_barra: CODIGO }));
  ok("Casiano crea el MISMO código y entra", rB.status === 200 && rB.json?.ok, JSON.stringify(rB.json));

  const baseA = rA.json?.item?.id;
  const baseB = rB.json?.item?.id;
  ok("son dos productos distintos", baseA && baseB && baseA !== baseB);

  // ── 2 · CADA CAJA ENCUENTRA EL SUYO, Y SOLO EL SUYO ───────────────────
  console.log("\n▸ 2 · el escaneo en cada caja");
  const enA = await escanear(S.uA, CODIGO);
  const enB = await escanear(S.uB, CODIGO);
  ok("la caja de Mini el 7 devuelve UN solo producto", enA.length === 1, JSON.stringify(enA));
  ok("y es el suyo", enA[0]?.baseId === baseA, JSON.stringify(enA));
  ok("la caja de Casiano devuelve UN solo producto", enB.length === 1, JSON.stringify(enB));
  ok("y es el suyo, no el del otro local", enB[0]?.baseId === baseB, JSON.stringify(enB));

  // ── 3 · EL DEPÓSITO NO PUEDE USAR UN CÓDIGO QUE UN LOCAL YA TIENE ─────
  console.log("\n▸ 3 · el depósito quiere ese código");
  const rD = await crear(S.uDepo, alta({ nombre: "Helado del depósito", codigo_barra: CODIGO }));
  ok("el depósito NO puede crearlo", rD.status === 400, `${rD.status} ${JSON.stringify(rD.json)}`);
  ok("y el rechazo NOMBRA EL LOCAL", /Mini el 7|Casiano/.test(rD.json?.error || ""), rD.json?.error);
  ok("y NOMBRA EL PRODUCTO", /Helado de/.test(rD.json?.error || ""), rD.json?.error);

  // ── 4 · UN LOCAL NO PUEDE USAR EL CÓDIGO DE UN PRODUCTO DE DEPÓSITO ───
  console.log("\n▸ 4 · el código del depósito choca en la caja del local");
  const DEP = "7790000000009";
  const rDep = await crear(S.uDepo, alta({ nombre: "Coca del depósito", codigo_barra: DEP }));
  ok("el depósito crea su producto", rDep.status === 200 && rDep.json?.ok, JSON.stringify(rDep.json));
  const rChoque = await crear(S.uA, alta({ nombre: "Coca trucha", codigo_barra: DEP }));
  ok("un local NO puede repetirlo", rChoque.status === 400, `${rChoque.status} ${JSON.stringify(rChoque.json)}`);
  ok("y el rechazo dice que es del depósito",
    /depósito/.test(rChoque.json?.error || ""), rChoque.json?.error);

  // ── 5 · SUBIR AL DEPÓSITO SE FRENA SI OTRO LOCAL TIENE EL CÓDIGO ──────
  console.log("\n▸ 5 · subir al depósito");
  const rSubir = await req("POST", `/api/productos/promover-a-deposito?localId=${S.lA}`, {
    cookie: cookieFor(S.uA), body: { baseId: baseA },
  });
  ok("NO se puede subir: Casiano tiene ese código",
    rSubir.status === 409, `${rSubir.status} ${JSON.stringify(rSubir.json)}`);
  ok("y dice qué local lo tiene",
    /Casiano/.test(rSubir.json?.error || ""), rSubir.json?.error);

  // Y NO TOCÓ NADA: el producto sigue siendo de Mini el 7.
  const sigue = await prisma.productoBase.findUnique({
    where: { id: baseA }, select: { creadoEnLocalId: true },
  });
  ok("la subida frenada no movió el producto", sigue?.creadoEnLocalId === S.lA, JSON.stringify(sigue));
  const materializado = await prisma.productoLocal.count({ where: { baseId: baseA } });
  ok("ni lo materializó en los otros locales", materializado === 1, `filas: ${materializado}`);

  // Con un código libre sí sube.
  const LIBRE = "7790000000077";
  const rLibre = await crear(S.uA, alta({ nombre: "Alfajor de Mini el 7", codigo_barra: LIBRE }));
  const baseLibre = rLibre.json?.item?.id;
  const rSube = await req("POST", `/api/productos/promover-a-deposito?localId=${S.lA}`, {
    cookie: cookieFor(S.uA), body: { baseId: baseLibre },
  });
  ok("con el código libre SÍ sube", rSube.status === 200 && rSube.json?.ok, JSON.stringify(rSube.json));
  const subido = await prisma.productoBase.findUnique({
    where: { id: baseLibre }, select: { creadoEnLocalId: true },
  });
  ok("y queda como producto del depósito", subido?.creadoEnLocalId === S.depo, JSON.stringify(subido));

  // ── 6 · EL IMPORT NO CONFUNDE EL PRODUCTO DE OTRO LOCAL CON "EXISTENTE"
  console.log("\n▸ 6 · la vista previa del import");
  const filas = [{
    codigo_barra: CODIGO, nombre: "Helado importado",
    precio_costo: "100", precio_venta: "150", unidad_medida: "unidad",
  }];
  const rPrev = await req("POST", `/api/productos/import/preview`, {
    cookie: cookieFor(S.uB),
    body: { modo: "crear_actualizar", productos: filas, localId: S.lB },
  });
  if (rPrev.status !== 200) {
    ok("la vista previa contestó", false, `${rPrev.status} ${JSON.stringify(rPrev.json)?.slice(0, 300)}`);
  } else {
    const item = (rPrev.json?.items || [])[0];
    // Para Casiano, ese código YA es suyo: tiene que verlo como actualización de
    // SU producto, no del de Mini el 7.
    ok("Casiano ve su propio producto como el existente",
      item?.productoBaseId === baseB, JSON.stringify(item)?.slice(0, 300));

    const rPrevD = await req("POST", `/api/productos/import/preview`, {
      cookie: cookieFor(S.uDepo),
      body: { modo: "crear_actualizar", productos: filas, localId: S.depo },
    });
    const itemD = (rPrevD.json?.items || [])[0];
    // Para el depósito ese código no existe: los dos que lo tienen son de locales
    // y no se ven desde acá. NO puede tomarlos como "el existente".
    ok("el depósito NO toma el producto de un local como existente",
      !itemD?.productoBaseId, JSON.stringify(itemD)?.slice(0, 300));
  }

  console.log(`\n${pass} en verde · ${fail} en rojo`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error("ABORT:", e);
  await prisma.$disconnect();
  process.exit(1);
});
