// PRUEBA DE BASE: LOS SEIS FILTROS DE "ESTADO DEL STOCK" EN STOCK LOCALES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/stockLocalesFiltros.mjs
//
// Desde el 2026-10-29 Stock Locales dibuja sus filtros con la pieza del Control
// de stock y suma "En negativo" y "Stock alto", contados y filtrados con la
// misma cuenta del control (`lib/stock/stockAlto.js`). Llama a los HANDLERS
// reales —el resumen, el listado y, para cargar los máximos, la ruta del
// Control de stock que es la única que los configura— con sesiones firmadas
// como las firma el login, contra PostgreSQL:
//
//   1. los cuatro números de siempre —Bajo mínimo, Sin stock, Límites sin
//      ajustar, Sobre máximo— dan lo mismo que antes y su lista coincide;
//   2. un negativo entra en En negativo, con su número;
//   3. uno arriba del máximo de su categoría entra en Stock alto, con el máximo
//      para la tarjeta; uno igual al máximo no entra;
//   4. el máximo de un local no se aplica en otro.
//
// Lo escrito directo es catálogo, stock y límites, como lo dejan Productos,
// una recepción y Límites. Los máximos van por su ruta.
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

const NOMBRE = "erpazul_stock_locales_filtros";
const urlDe = (nombre) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${nombre}`;
  u.search = "";
  return u.toString();
};
const urlPrueba = urlDe(NOMBRE);
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-stock-locales-filtros-0123456789abcdef";

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
  const fiambres = await c.categoria.create({ data: { nombre: "Fiambres" } });

  // Una ficha del depósito y su producto en un local, con su fila de stock y,
  // si se pide, límites configurados (como los deja Límites).
  const ficha = (nombre, codigo_barra, unidad_medida = "unidad", extra = {}) =>
    c.productoBase.create({
      data: { grupoId: grupo.id, nombre, codigo_barra, unidad_medida, precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true, ...extra },
    });
  const enLocal = async (l, b, stock, limites = null) => {
    const pl = await c.productoLocal.create({ data: { localId: l.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
    if (stock !== null) {
      await c.stockLocal.create({
        data: {
          localId: l.id,
          productoId: pl.id,
          cantidad: stock,
          ...(limites ? { stockMin: limites.min, stockMax: limites.max, limitesConfiguradosAt: new Date() } : {}),
        },
      });
    }
    return pl.id;
  };
  const bBajo = await ficha("Bajo mínimo", "7790000000101");
  const bSinStock = await ficha("Sin stock", "7790000000102");
  const bSobre = await ficha("Sobre máximo", "7790000000103");
  const bNegativo = await ficha("Negativo", "7790000000104");
  const bSinFila = await ficha("Sin fila", "7790000000105");
  const bJamonAlto = await ficha("Jamón alto", "7790000000106", "kg", { categoria_id: fiambres.id });
  const bJamonJusto = await ficha("Jamón justo", "7790000000107", "kg", { categoria_id: fiambres.id });
  const M = {
    bajo: await enLocal(mini, bBajo, 5, { min: 10, max: 20 }),
    sinStock: await enLocal(mini, bSinStock, 0),
    sobre: await enLocal(mini, bSobre, 30, { min: 1, max: 20 }),
    negativo: await enLocal(mini, bNegativo, -4),
    sinFila: await enLocal(mini, bSinFila, null),
    jamonAlto: await enLocal(mini, bJamonAlto, 20),
    jamonJusto: await enLocal(mini, bJamonJusto, 15),
  };
  const C = {
    negativo: await enLocal(casiano, bNegativo, 3),
    jamonAlto: await enLocal(casiano, bJamonAlto, 20),
    jamonJusto: await enLocal(casiano, bJamonJusto, 15),
  };

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  const rutaResumen = await import("../../app/api/stock_locales/resumen/route.js");
  const rutaListar = await import("../../app/api/stock_locales/listar/route.js");

  const permisos = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  const cookie = (l, id, p = permisos) =>
    `erpazul_sesion=${jwt.sign(
      { id, nombre: `CI ${id}`, email: `ci-${id}@ci.local`, rolId: null, rolNombre: null, permisos: p, esDuenoLocal: false, localId: l.id, esDeposito: l.es_deposito === true },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
  const S = { mini: cookie(mini, 301), casiano: cookie(casiano, 302) };
  const pedir = async (ruta, url, sesion, metodo = "GET", body = undefined) => {
    const req = new Request(url, {
      method: metodo,
      headers: { cookie: sesion, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await ruta[metodo](req);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const resumen = (s) => pedir(rutaResumen, "http://ci/api/stock_locales/resumen", s);
  const lista = async (s, estado) => {
    const r = await pedir(rutaListar, `http://ci/api/stock_locales/listar?estado=${estado}`, s);
    return { status: r.status, ids: (r.items || []).map((i) => i.id).sort((a, b) => a - b), total: r.total, items: r.items || [], error: r.error };
  };
  const ordenados = (xs) => [...xs].sort((a, b) => a - b);

  seccion("1. Los cuatro números de siempre no cambian");
  {
    const r = await resumen(S.mini);
    const n = Object.fromEntries((r.estados || []).map((e) => [e.id, e.cantidad]));
    // Los números que da la versión anterior sobre esta misma siembra (corrida
    // con el código de antes del 2026-10-29: 1, 2, 5 y 1).
    ok(
      "Bajo mínimo 1, Sin stock 2, Sin límites 5, Sobre máximo 1, en el orden del diseño",
      r.status === 200 &&
        json(r.estados?.map((e) => e.id)) === json(["bajo-minimo", "sin-stock", "limites-sin-ajustar", "sobre-maximo"]) &&
        json(n) === json({ "bajo-minimo": 1, "sin-stock": 2, "limites-sin-ajustar": 5, "sobre-maximo": 1 }),
      json(r)
    );
    const esperado = {
      "bajo-minimo": [M.bajo],
      "sin-stock": [M.sinStock, M.sinFila],
      "limites-sin-ajustar": [M.sinStock, M.negativo, M.sinFila, M.jamonAlto, M.jamonJusto],
      "sobre-maximo": [M.sobre],
    };
    for (const [estado, ids] of Object.entries(esperado)) {
      const l = await lista(S.mini, estado);
      ok(`${estado}: la lista son los mismos productos que cuenta el número`, json(l.ids) === json(ordenados(ids)) && l.total === n[estado], json(l));
    }
  }

  seccion("2. En negativo");
  {
    const r = await resumen(S.mini);
    const l = await lista(S.mini, "en-negativo");
    ok("un negativo entra: el de −4, y el número dice 1", r.enNegativo === 1 && json(l.ids) === json([M.negativo]) && l.total === 1, json({ n: r.enNegativo, l }));
    const enCasiano = await lista(S.casiano, "en-negativo");
    const rc = await resumen(S.casiano);
    ok("en Casiano, el mismo producto con 3 no está en negativo", rc.enNegativo === 0 && enCasiano.ids.length === 0, json({ n: rc.enNegativo, l: enCasiano }));
  }

  seccion("3. Stock alto, con los máximos cargados desde el Control de stock");
  {
    const rutaMaximos = await import("../../app/api/stock_locales/control/maximos/route.js");
    // La cuenta sin PIN que gestiona el control: la única que configura máximos.
    const puestos = await pedir(rutaMaximos, "http://ci/api/stock_locales/control/maximos", cookie(mini, 401, ["*"]), "PUT", {
      maximos: [{ categoriaId: fiambres.id, maximo: "15" }],
    });
    ok("el máximo de Fiambres en el Mini, 15 kg, por la ruta del control", puestos.status === 200, json(puestos));
    const r = await resumen(S.mini);
    const l = await lista(S.mini, "stock-alto");
    ok("arriba del máximo entra: el jamón con 20, y el número dice 1", r.stockAlto === 1 && json(l.ids) === json([M.jamonAlto]) && l.total === 1, json({ n: r.stockAlto, l: l.ids }));
    ok("igual al máximo no entra: el jamón con 15", !l.ids.includes(M.jamonJusto));
    ok("la tarjeta trae el máximo de su categoría: 15 kg", json(l.items[0]?.stockAlto) === json({ maximo: 15, unidad: "kg" }), json(l.items[0]?.stockAlto));
    const otra = await lista(S.mini, "sin-stock");
    ok("en otro filtro las tarjetas no traen máximo", otra.items.every((i) => i.stockAlto === undefined), json(otra.items.map((i) => i.stockAlto)));

    const rc = await resumen(S.casiano);
    const lc = await lista(S.casiano, "stock-alto");
    ok("el máximo del Mini no se aplica en Casiano: el mismo jamón con 20 no entra", rc.stockAlto === 0 && lc.ids.length === 0 && !lc.ids.includes(C.jamonAlto), json({ n: rc.stockAlto, l: lc.ids }));

    const despues = await resumen(S.mini);
    const n = Object.fromEntries((despues.estados || []).map((e) => [e.id, e.cantidad]));
    ok("y con máximos cargados los cuatro de siempre siguen igual", json(n) === json({ "bajo-minimo": 1, "sin-stock": 2, "limites-sin-ajustar": 5, "sobre-maximo": 1 }), json(n));
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
