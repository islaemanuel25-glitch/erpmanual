// PRUEBA DE BASE: STOCK ENCUENTRA POR EL CÓDIGO PROPIO DEL LOCAL, COMO LA CAJA.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/stockCodigoPropio.mjs
//
// El defecto: un producto del depósito al que un local le agregó un código propio
// (`ProductoLocal.codigo_barra_propio`). La caja lo leía —`pos-ventas/buscar-producto`
// mira el propio— y Stock, escaneado o tipeado, no lo encontraba: `stock_locales/listar`
// buscaba solo en los dos códigos globales de la base. Ahora las dos rutas resuelven
// el código con la misma pieza, `buscarProductoLocalPorCodigo`.
//
// Llama a los HANDLERS reales —el listado de Stock y el buscador del POS— con
// sesiones firmadas como las firma el login, contra PostgreSQL:
//
//   1. el código propio de Mini encuentra el producto del depósito en Mini, en
//      Stock y en la caja;
//   2. el mismo código en Casiano no encuentra nada, ni en Stock ni en la caja;
//   3. si en Casiano ese número es el código GLOBAL de otro producto, encuentra
//      ese otro; y en Mini, donde es propio de uno y global de otro, gana el propio;
//   4. el código secundario (el de la caja) lo encuentran Stock y el POS por igual;
//   5. la búsqueda de texto de siempre sigue igual.
//
// Lo escrito directo es SOLO catálogo —fichas, productos de cada ubicación y el
// código propio—, como lo deja Productos. El caso 3 no se puede dar de alta por la
// app (la validación de colisión lo frena al guardar el propio), pero sí aparecer
// si el global se carga después en otra ficha: por eso se escribe directo.
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const m = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(m);
  console.log(`  ✗ ${m}`);
}
const json = (x) => JSON.stringify(x);
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

const NOMBRE = "erpazul_stock_codigo_propio";
const urlDe = (nombre) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${nombre}`;
  u.search = "";
  return u.toString();
};
const urlPrueba = urlDe(NOMBRE);
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-stock-codigo-propio-0123456789abcdef";

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(urlPrueba);
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra: un depósito y dos locales del mismo grupo ──────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo uno" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const mini = await c.local.create({ data: { nombre: "Mini el 7" } });
  const casiano = await c.local.create({ data: { nombre: "Casiano" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const l of [mini, casiano]) await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
  for (const l of [deposito, mini, casiano]) await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });

  const PROPIO = "200000000077";
  const SECUNDARIO = "17790001000014";
  // Una ficha del DEPÓSITO (sin `creadoEnLocalId`), con su producto en las tres ubicaciones.
  const ficha = (nombre, codigo_barra, codigo_barra_secundario = null) =>
    c.productoBase.create({
      data: { grupoId: grupo.id, nombre, codigo_barra, codigo_barra_secundario, unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
    });
  const producto = (l, b, codigo_barra_propio = null) =>
    c.productoLocal.create({ data: { localId: l.id, baseId: b.id, activo: true, codigo_barra_propio, precio_costo: 600, precio_venta: 1000 } });
  const yerba = await ficha("Yerba Playadito 1 kg", "7790001000011", SECUNDARIO);
  const Y = { deposito: await producto(deposito, yerba), mini: await producto(mini, yerba, PROPIO), casiano: await producto(casiano, yerba) };
  const azucar = await ficha("Azúcar Ledesma 1 kg", "7790002000010");
  for (const l of [deposito, mini, casiano]) await producto(l, azucar);

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  const rutaListar = await import("../../app/api/stock_locales/listar/route.js");
  const rutaPos = await import("../../app/api/pos-ventas/buscar-producto/route.js");

  const permisos = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  ok("el ENCARGADO tiene stock.ver y pos.usar: es el rol real de las dos pantallas", permisos.includes("stock.ver") && permisos.includes("pos.usar"));
  const cookie = (l, id) =>
    `erpazul_sesion=${jwt.sign(
      { id, nombre: `CI ${id}`, email: `ci-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId: l.id, esDeposito: l.es_deposito === true },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
  const S = { mini: cookie(mini, 301), casiano: cookie(casiano, 302), deposito: cookie(deposito, 303) };
  const pedir = async (ruta, url, sesion) => {
    const req = new Request(url, { headers: { cookie: sesion } });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await ruta.GET(req);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const stock = async (sesion, q) => {
    const r = await pedir(rutaListar, `http://ci/api/stock_locales/listar?q=${encodeURIComponent(q)}`, sesion);
    return { status: r.status, ids: (r.items || []).map((i) => i.id), total: r.total, error: r.error };
  };
  const caja = async (sesion, l, q) => {
    const r = await pedir(rutaPos, `http://ci/api/pos-ventas/buscar-producto?q=${encodeURIComponent(q)}&localId=${l.id}`, sesion);
    return { status: r.status, ids: (r.items || []).map((i) => i.productoLocalId), error: r.error };
  };
  const solo = (r, id) => r.status === 200 && json(r.ids) === json([id]);

  seccion("1. El código propio de Mini, en Mini");
  {
    const s = await stock(S.mini, PROPIO);
    ok("Stock lo encuentra: el producto del depósito, y solo ése", solo(s, Y.mini.id) && s.total === 1, json(s));
    const p = await caja(S.mini, mini, PROPIO);
    ok("la caja lo encuentra: el mismo producto", solo(p, Y.mini.id), json(p));
  }

  seccion("2. El mismo código en Casiano no encuentra nada");
  {
    const s = await stock(S.casiano, PROPIO);
    ok("Stock: lista vacía", s.status === 200 && s.ids.length === 0 && s.total === 0, json(s));
    const p = await caja(S.casiano, casiano, PROPIO);
    ok("la caja: nada", p.status === 200 && p.ids.length === 0, json(p));
    const d = await stock(S.deposito, PROPIO);
    ok("y tampoco en el depósito", d.status === 200 && d.ids.length === 0, json(d));
  }

  seccion("3. Ese número como código GLOBAL de otro producto");
  {
    const otra = await ficha("Galletitas con el mismo número", PROPIO);
    const O = { mini: await producto(mini, otra), casiano: await producto(casiano, otra) };
    const sc = await stock(S.casiano, PROPIO);
    ok("en Casiano, Stock encuentra el del código global", solo(sc, O.casiano.id), json(sc));
    const pc = await caja(S.casiano, casiano, PROPIO);
    ok("en Casiano, la caja también", solo(pc, O.casiano.id), json(pc));
    const sm = await stock(S.mini, PROPIO);
    ok("en Mini, Stock da el del código propio: gana el del local", solo(sm, Y.mini.id) && sm.total === 1, json(sm));
    const pm = await caja(S.mini, mini, PROPIO);
    ok("en Mini, la caja también da el propio", solo(pm, Y.mini.id), json(pm));
  }

  seccion("4. El código secundario, el de la caja");
  for (const [nombre, l, id] of [["Mini", mini, Y.mini.id], ["Casiano", casiano, Y.casiano.id]]) {
    const s = await stock(S[nombre === "Mini" ? "mini" : "casiano"], SECUNDARIO);
    const p = await caja(S[nombre === "Mini" ? "mini" : "casiano"], l, SECUNDARIO);
    ok(`en ${nombre}: Stock y la caja encuentran el mismo producto`, solo(s, id) && solo(p, id), json({ s, p }));
  }

  seccion("5. La búsqueda de texto, como siempre");
  {
    const s = await stock(S.mini, "playadito");
    ok("por nombre: la yerba", solo(s, Y.mini.id), json(s));
    const parcial = await stock(S.casiano, "779000");
    ok("por parte de un código global: las dos fichas que lo contienen", parcial.status === 200 && parcial.ids.length === 2, json(parcial));
  }
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  if (c) await c.$disconnect().catch(() => {});
  try {
    const { default: prismaApp } = await import("../../lib/prisma.js");
    await prismaApp.$disconnect();
  } catch {
    // la app no llegó a construir su cliente
  }
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
