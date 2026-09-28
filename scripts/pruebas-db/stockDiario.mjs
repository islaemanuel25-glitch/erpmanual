// PRUEBA DE BASE DEL STOCK DIARIO.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/stockDiario.mjs
//
// Ejerce contra PostgreSQL las consultas de `lib/stock/libro/stockDiarioServer.js`,
// que ni el build ni los candados pueden ver:
//
//   A. el índice de la migración `20260928150000_stock_diario_indice` existe en la
//      base de DATABASE_URL con sus cuatro columnas, y la migración está aplicada;
//   B. los casos del día, uno por uno, con el valor esperado escrito: fuera de
//      historia, el punto cero parcial, el primer día completo, un día sin
//      movimientos, CAMBIO, varios CAMBIO, el mismo milisegundo, ALTA, BAJA,
//      borrar y recrear, cero existente, NO_EXISTE, tránsito, reinterpretación,
//      SIN_ORIGEN, producto eliminado, cadena sin StockLocal, períodos;
//   C. el día EN CURSO con el reloj REAL de PostgreSQL, sin inyectar "hoy";
//   D. TODAS las cadenas, TODOS los días y varios períodos contra un recálculo por
//      FUERZA BRUTA que no usa las consultas de la capa, y la identidad
//      apertura + cambios + aparece − desaparece = cierre, para cantidad y para
//      tránsito por separado;
//   E. el mismo resultado con otra zona horaria y otro DateStyle en la sesión de
//      PostgreSQL, y con otra zona horaria en Node (un proceso hijo con TZ);
//   F. la Semana Operativa solo agrupa: un cambio de corte futuro no mueve nada;
//   G. el volumen: EXPLAIN de la consulta de un local entero con el índice, y la
//      contraprueba sin él. Lo que se exige es la FORMA —un descenso por cadena—,
//      no los milisegundos;
//   H. que la página de movimientos, escrita (dia, instante, id), da EXACTAMENTE
//      el orden del contrato (instante, id): los bordes de la medianoche
//      argentina, el mismo instante con varios ids, páginas que cruzan el día, y
//      la contraprueba con una fila fuera de su día.
//
// ── CÓMO SE CONSIGUEN DÍAS DISTINTOS ───────────────────────────────────────
//
// El libro estampa el reloj del momento, así que una prueba que corre en un
// minuto escribe todo en el mismo día. Las escrituras se hacen DE VERDAD sobre
// StockLocal —el trigger decide el tipo, los saldos, la identidad congelada, la
// cadena y `stockLocalId`— y recién después, en una base descartable, se
// REUBICAN en el tiempo: se reescribe `instante` y `dia` de cada movimiento con
// el momento del guion, calculando el día con `libro_stock_dia`, la misma
// función que usa el trigger. El punto cero queda exactamente en el de
// producción. El verificador del libro corre al final sobre la base reubicada y
// tiene que dar verde: continuidad, orden y día coherente con el instante.
//
// La base de volumen, en cambio, tiene movimientos SINTÉTICOS insertados en
// masa: sirve para medir la forma del plan, no para afirmar nada del negocio.
//
// ── DÓNDE CORRE ────────────────────────────────────────────────────────────
//
// Las bases se crean al lado de la de DATABASE_URL, con el prefijo
// `erpazul_sd_prueba_`, aplicando los `migration.sql` del repo en orden con
// psql —el libro y el índice DESPUÉS de sembrar, para que el punto cero tenga
// filas—, y se borran al terminar pase lo que pase.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA, LECTURA } from "../lib/clientePrisma.mjs";

const MODO_HIJO = process.argv[2] === "--solo-calculo";

const path = await import("node:path");
const { spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");

const {
  PUNTO_CERO_PRODUCCION,
  ESTADO_DEL_DIA,
  EXISTENCIA,
  MOTIVO_DESCONOCIDA,
  EFECTO,
  FUENTE_IDENTIDAD,
  GRUPO_PRODUCTO_ELIMINADO,
  TEXTO_SIN_ORIGEN,
  UNIDAD_DE_PERIODO,
  agruparCadenas,
  claveDeCategoriaActual,
  diasDelRango,
} = await import("../../lib/stock/libro/stockDiario.js");
const server = await import("../../lib/stock/libro/stockDiarioServer.js");
const { Prisma } = await import("@prisma/client");
const porUnidad = await import("../../lib/stock/libro/stockDiarioPorUnidadServer.js");
const { sumarDias } = await import("../../lib/transferencias/periodoDePago.js");
const { programarSemanaOperativa } = await import("../../lib/semanaOperativa/semanaOperativaServer.js");
const { MIGRACION_LIBRO, MIGRACIONES, aplicarMigraciones, AR, uno, guion } = await import("./lib/libroEnElTiempo.mjs");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRACION_INDICE = "20260928150000_stock_diario_indice";
const INDICE = "MovimientoStock_localId_productoLocalId_dia_id_idx";
const PREFIJO = "erpazul_sd_prueba_";
const HOY = "2026-10-05"; // el "hoy" de la base reubicada; el reloj real se prueba en C
const FILAS_VOLUMEN = Number(process.env.STOCK_DIARIO_FILAS || 1_000_000);

// ════════════════════════════════════════════════════════════════════════════
// El cálculo que se compara entre zonas: todos los locales, todos los días
// ════════════════════════════════════════════════════════════════════════════

async function calcularTodo(db, { locales, dias, hoy }) {
  const r = {};
  for (const l of locales) {
    for (const d of dias) {
      const x = await server.stockDiarioDelLocal(db, { localId: l, dia: d, hoy });
      r[`${l}:${d}`] = { periodo: x.periodo, cadenas: x.cadenas, totales: x.totales };
      r[`${l}:${d}:mov`] = await server.movimientosDelDia(db, { localId: l, dia: d });
    }
  }
  return r;
}

if (MODO_HIJO) {
  // Un proceso aparte, con otra TZ de Node: calcula y devuelve JSON. Solo lee.
  const [, , , url, entrada] = process.argv;
  const c = await crearClientePrisma({ nivel: LECTURA, url });
  const args = JSON.parse(entrada);
  const r = await calcularTodo(c, args);
  await c.$disconnect();
  // Se sale cuando la escritura terminó: un `process.exit` inmediato corta el
  // pipe a mitad de un JSON largo.
  await new Promise((listo) => process.stdout.write(`JSON:${JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, r })}\n`, listo));
  process.exit(0);
}

const principal = await crearClientePrisma({ nivel: ESCRITURA });
const { declararOrigenDeStock } = await import("../../lib/stock/libro/libroStock.js");
const { verificarLibroStock, informeDelLibro } = await import("../../lib/stock/libro/verificador.js");

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
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);
const json = (x) => JSON.stringify(x);

async function rechaza(fn, codigo) {
  try {
    await fn();
    return false;
  } catch (err) {
    return err?.codigo === codigo;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Bases descartables
// ════════════════════════════════════════════════════════════════════════════

const URL_BASE = new URL(process.env.DATABASE_URL);
const urlDe = (base) => {
  const u = new URL(URL_BASE);
  u.pathname = `/${base}`;
  return u.toString();
};
const creadas = new Set();
const clientes = [];

async function crearBase(nombre) {
  if (!nombre.startsWith(PREFIJO)) throw new Error(`nombre de base de prueba inválido: ${nombre}`);
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${nombre}"`);
  creadas.add(nombre);
  return urlDe(nombre);
}

async function borrarBases() {
  for (const nombre of creadas) {
    if (!nombre.startsWith(PREFIJO)) continue;
    await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`).catch(() => {});
  }
}

async function clienteDe(url) {
  const c = await crearClientePrisma({ nivel: ESCRITURA, url });
  clientes.push(c);
  return c;
}

// ════════════════════════════════════════════════════════════════════════════
// La base del guion
// ════════════════════════════════════════════════════════════════════════════
//
// Aplicar migraciones, reubicar en el tiempo y leer una fila viven en
// `lib/libroEnElTiempo.mjs`, que comparte la prueba de la API.

/** Siembra una base SIN libro: locales, productos y el stock que el punto cero va a copiar. */
async function sembrarGuion(c) {
  const g = await uno(c, `INSERT INTO "Grupo" ("nombre","updatedAt") VALUES ('Grupo stock diario', now()) RETURNING "id"`);
  const cat = await uno(c, `INSERT INTO "Categoria" ("nombre","updatedAt") VALUES ('Bebidas', now()) RETURNING "id"`);
  const local = async (n) => (await uno(c, `INSERT INTO "Local" ("nombre","es_deposito","updatedAt") VALUES ('${n}', false, now()) RETURNING "id"`)).id;
  const L = { A: await local("Stock diario A"), B: await local("Stock diario B"), C: await local("Stock diario C") };

  const base = async (nombre, { categoria = null } = {}) =>
    (
      await uno(
        c,
        `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","precio_costo","precio_venta","categoria_id","updatedAt")
         VALUES (${g.id}, '${nombre}', 'SD-${nombre}', 'unidad', 1, 2, ${categoria ?? "NULL"}, now()) RETURNING "id"`
      )
    ).id;
  const enLocal = async (localId, baseId, stock = null, transito = 0) => {
    const pl = (await uno(c, `INSERT INTO "ProductoLocal" ("localId","baseId","updatedAt") VALUES (${localId}, ${baseId}, now()) RETURNING "id"`)).id;
    let sl = null;
    if (stock !== null) {
      sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","enTransito","updatedAt") VALUES (${localId}, ${pl}, ${stock}, ${transito}, now()) RETURNING "id"`)).id;
    }
    return { pl, sl, base: baseId };
  };

  const P = {};
  P.uno = await enLocal(L.A, await base("Uno", { categoria: cat.id }), 20);
  P.cero = await enLocal(L.A, await base("Cero", { categoria: cat.id }), 0);
  P.nace = await enLocal(L.A, await base("Nace"));
  P.muere = await enLocal(L.A, await base("Muere"), 5);
  P.renace = await enLocal(L.A, await base("Renace"), 9);
  P.transito = await enLocal(L.A, await base("Transito"), 3, 0);
  P.reinterpreta = await enLocal(L.A, await base("Reinterpreta"), 10);
  P.eliminado = await enLocal(L.A, await base("Eliminado", { categoria: cat.id }), 6);
  P.origen = await enLocal(L.A, await base("Origen"), 50);
  P.muchos = await enLocal(L.A, await base("Muchos"), 100);
  P.tarde = await enLocal(L.B, await base("Tarde"));
  // Los dos caminos atómicos que corrige `20260928180000_libro_stock_baja_atomica`:
  // una sola sentencia que borra el stock y su producto, y otra que re-vincula
  // la fila y borra el producto viejo.
  P.atomico = await enLocal(L.A, await base("Atomico"), 4, 1);
  P.revViejo = await enLocal(L.A, await base("RevViejo"), 3);
  P.revNuevo = await enLocal(L.A, await base("RevNuevo"));

  // Local C: treinta cadenas al azar, la mitad con stock al punto cero.
  const azar = [];
  for (let i = 0; i < 30; i++) {
    azar.push(await enLocal(L.C, await base(`Azar ${i}`), i % 2 === 0 ? (i * 1.25).toFixed(3) : null, i % 3 === 0 ? 1.5 : 0));
  }
  return { L, P, azar, categoria: cat.id };
}

/** Un generador determinista: la misma corrida siempre escribe lo mismo. */
function azarDeterminista(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ════════════════════════════════════════════════════════════════════════════
// La fuerza bruta: el libro entero en memoria, recorrido por `id`
// ════════════════════════════════════════════════════════════════════════════
//
// No usa ninguna consulta ni ninguna función de la capa: trae cada movimiento
// del local ordenado por `id`, que es el orden verdadero de cada cadena, y
// camina. Las cantidades en milésimas.

const mil = (t) => (t === null || t === undefined ? null : Math.round(Number(t) * 1000));

async function libroEnMemoria(c, localId) {
  const filas = await c.$queryRaw`
    SELECT "id", "tipo"::text AS "tipo", "productoLocalId",
           "cantidadAnterior"::text AS "ca", "cantidadPosterior"::text AS "cp",
           "enTransitoAnterior"::text AS "ta", "enTransitoPosterior"::text AS "tp",
           to_char("dia", 'YYYY-MM-DD') AS "dia", "origen"
    FROM "MovimientoStock" WHERE "localId" = ${localId} ORDER BY "id"`;
  const cadenas = new Map();
  for (const f of filas) {
    const p = Number(f.productoLocalId);
    if (!cadenas.has(p)) cadenas.set(p, []);
    cadenas.get(p).push(f);
  }
  return cadenas;
}

function brutoDeCadena(movs, { desde, hasta, puntoCeroDia }) {
  const desdeEf = desde < puntoCeroDia ? puntoCeroDia : desde;
  const parcial = desde <= puntoCeroDia;
  let antes = null;
  let fin = null;
  const del = [];
  for (const m of movs) {
    if (m.dia < desde) antes = m;
    if (m.dia <= hasta) fin = m;
    if (m.dia >= desdeEf && m.dia <= hasta) del.push(m);
  }
  const existe = (x) => !!x && x.tipo !== "BAJA";
  const r = {
    aperturaExiste: parcial ? null : existe(antes),
    apertura: parcial || !existe(antes) ? null : { c: mil(antes.cp), t: mil(antes.tp) },
    cierreExiste: existe(fin),
    cierre: existe(fin) ? { c: mil(fin.cp), t: mil(fin.tp) } : null,
    movimientos: del.length,
    sinClasificar: del.filter((m) => m.origen === "SIN_ORIGEN").length,
    c: { entradas: 0, salidas: 0, aparece: 0, desaparece: 0, partida: 0 },
    t: { entradas: 0, salidas: 0, aparece: 0, desaparece: 0, partida: 0 },
  };
  for (const m of del) {
    for (const [k, a, p] of [["c", "ca", "cp"], ["t", "ta", "tp"]]) {
      if (m.tipo === "CAMBIO") {
        const d = mil(m[p]) - mil(m[a]);
        if (d > 0) r[k].entradas += d;
        if (d < 0) r[k].salidas -= d;
      } else if (m.tipo === "ALTA") r[k].aparece += mil(m[p]);
      else if (m.tipo === "BAJA") r[k].desaparece += mil(m[a]);
      else if (m.tipo === "ESTADO_INICIAL") r[k].partida += mil(m[p]);
    }
  }
  r.incluida = (parcial ? false : existe(antes)) || del.length > 0;
  // La identidad, calculada acá por su cuenta.
  r.cuadra = {};
  for (const k of ["c", "t"]) {
    const inicio = parcial ? r[k].partida : r.apertura ? r.apertura[k] : 0;
    const final = r.cierre ? r.cierre[k] : 0;
    r.cuadra[k] = inicio + r[k].entradas - r[k].salidas + r[k].aparece - r[k].desaparece === final;
  }
  return r;
}

/** Compara lo que dijo la capa con la fuerza bruta. Devuelve las diferencias. */
function diferencias(resultado, cadenasBrutas, { desde, hasta, puntoCeroDia }) {
  const difs = [];
  const porCadena = new Map(resultado.cadenas.map((x) => [x.productoLocalId, x]));
  for (const [p, movs] of cadenasBrutas) {
    const b = brutoDeCadena(movs, { desde, hasta, puntoCeroDia });
    const x = porCadena.get(p);
    if (!b.incluida) {
      if (x) difs.push(`${p}: la capa la lista y no existió en el período`);
      continue;
    }
    if (!x) {
      difs.push(`${p}: existió y la capa no la lista`);
      continue;
    }
    const cmp = (nombre, a, e) => {
      if (a !== e) difs.push(`${p} ${nombre}: capa ${a} bruto ${e}`);
    };
    if (b.aperturaExiste === null) cmp("apertura", x.apertura.existencia, EXISTENCIA.DESCONOCIDA);
    else cmp("apertura", x.apertura.existencia, b.aperturaExiste ? EXISTENCIA.EXISTE : EXISTENCIA.NO_EXISTE);
    cmp("apertura.cantidad", mil(x.apertura.cantidad), b.apertura?.c ?? null);
    cmp("apertura.enTransito", mil(x.apertura.enTransito), b.apertura?.t ?? null);
    cmp("cierre", x.cierre.existencia, b.cierreExiste ? EXISTENCIA.EXISTE : EXISTENCIA.NO_EXISTE);
    cmp("cierre.cantidad", mil(x.cierre.cantidad), b.cierre?.c ?? null);
    cmp("cierre.enTransito", mil(x.cierre.enTransito), b.cierre?.t ?? null);
    cmp("movimientos", x.movimientos, b.movimientos);
    cmp("sinClasificar", x.sinClasificar, b.sinClasificar);
    for (const [k, clave] of [["c", "cantidad"], ["t", "enTransito"]]) {
      cmp(`${clave}.entradas`, mil(x[clave].entradas), b[k].entradas);
      cmp(`${clave}.salidas`, mil(x[clave].salidas), b[k].salidas);
      cmp(`${clave}.apareceCon`, mil(x[clave].apareceCon), b[k].aparece);
      cmp(`${clave}.desapareceCon`, mil(x[clave].desapareceCon), b[k].desaparece);
      cmp(`${clave}.puntoDePartida`, mil(x[clave].puntoDePartida), b[k].partida);
      if (!b.cuadra[k]) difs.push(`${p} ${clave}: la FUERZA BRUTA no cuadra`);
      if (!x.cuadra[clave]) difs.push(`${p} ${clave}: la capa dice que no cuadra`);
    }
  }
  return difs;
}

// ════════════════════════════════════════════════════════════════════════════
// Planes
// ════════════════════════════════════════════════════════════════════════════

function nodosDelPlan(plan, acc = []) {
  acc.push(plan);
  for (const h of plan.Plans || []) nodosDelPlan(h, acc);
  return acc;
}

async function explicar(c, sql) {
  const [fila] = await c.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
  const plan = fila["QUERY PLAN"][0];
  const nodos = nodosDelPlan(plan.Plan);
  const sobreLibro = nodos.filter((n) => n["Relation Name"] === "MovimientoStock");
  return {
    ms: plan["Execution Time"],
    nodos,
    sobreLibro,
    // Las filas que el plan sacó del libro, contando cada vuelta de cada nodo.
    filasLeidas: sobreLibro.reduce((s, n) => s + (n["Actual Rows"] || 0) * (n["Actual Loops"] || 1) + (n["Rows Removed by Filter"] || 0) * (n["Actual Loops"] || 1), 0),
    indices: [...new Set(sobreLibro.map((n) => n["Index Name"]).filter(Boolean))],
  };
}

// ════════════════════════════════════════════════════════════════════════════

try {
  // ══════════════════════════════════════════════════════════════════════════
  // A. LA MIGRACIÓN EN LA BASE DE DATABASE_URL
  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. La migración del índice, en la base construida por Prisma");
  {
    const [mig] = await principal.$queryRaw`
      SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS "aplicada"
      FROM "_prisma_migrations" WHERE migration_name = ${MIGRACION_INDICE}`;
    ok(`${MIGRACION_INDICE} aplicada`, mig.aplicada === 1, json(mig));
    const idx = await principal.$queryRaw`SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ${INDICE}`;
    ok(
      "el índice existe con (localId, productoLocalId, dia, id), en ese orden y sin predicado",
      idx.length === 1 && /ON public\."MovimientoStock" USING btree \("localId", "productoLocalId", dia, id\)$/.test(idx[0].indexdef),
      idx[0]?.indexdef
    );
    const otros = await principal.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename = 'MovimientoStock' ORDER BY indexname`;
    ok(
      "los índices anteriores siguen: (localId, productoLocalId, id) y (localId, dia)",
      ["MovimientoStock_localId_dia_idx", "MovimientoStock_localId_productoLocalId_id_idx", "MovimientoStock_pkey"].every((n) => otros.some((o) => o.indexname === n)),
      json(otros)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B. EL GUION
  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. Base del guion: migraciones, siembra, libro, escrituras reales");
  const urlGuion = await crearBase(`${PREFIJO}guion`);
  const antesDelLibro = aplicarMigraciones(urlGuion, { hasta: MIGRACION_LIBRO });
  const c = await clienteDe(urlGuion);
  const { L, P, azar, categoria } = await sembrarGuion(c);
  aplicarMigraciones(urlGuion, { solo: MIGRACIONES.filter((m) => m >= MIGRACION_LIBRO) });
  const [iniciales] = await c.$queryRaw`SELECT count(*)::int AS n FROM "MovimientoStock" WHERE "tipo" = 'ESTADO_INICIAL'`;
  const [filasStock] = await c.$queryRaw`SELECT count(*)::int AS n FROM "StockLocal"`;
  ok(`${antesDelLibro} migraciones, siembra, y el libro con un ESTADO_INICIAL por fila (${iniciales.n})`, iniciales.n === filasStock.n && iniciales.n > 0);

  const g = guion(c);
  await g.puntoCero(PUNTO_CERO_PRODUCCION.instanteArgentina);
  const sl = (x) => x.sl;
  const upd = (id, set) => c.$executeRawUnsafe(`UPDATE "StockLocal" SET ${set}, "updatedAt" = now() WHERE "id" = ${id}`);

  await g.paso("2026-09-27 22:00:00", () => upd(sl(P.uno), `"cantidad" = 18`));
  await g.paso("2026-09-28 08:00:00", () => upd(sl(P.muchos), `"cantidad" = 90`));
  await g.paso("2026-09-28 09:00:00", () => upd(sl(P.transito), `"enTransito" = 2.5`));
  await g.paso("2026-09-28 10:00:00", async () => {
    await upd(sl(P.uno), `"cantidad" = 15`);
    await upd(sl(P.muchos), `"cantidad" = 95`);
  });
  await g.paso("2026-09-28 12:00:00", async () => {
    P.nace.sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${L.A}, ${P.nace.pl}, 7, now()) RETURNING "id"`)).id;
  });
  await g.paso("2026-09-28 15:00:00", () => c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${sl(P.muere)}`));
  await g.paso("2026-09-28 16:00:00", () =>
    c.$transaction(async (tx) => {
      // Se borra como lo haría la app: primero el stock (así el trigger todavía
      // encuentra el producto para congelar su identidad), después el producto.
      await tx.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${sl(P.eliminado)}`);
      await tx.$executeRawUnsafe(`DELETE FROM "ProductoLocal" WHERE "id" = ${P.eliminado.pl}`);
      await tx.$executeRawUnsafe(`DELETE FROM "ProductoBase" WHERE "id" = ${P.eliminado.base}`);
    })
  );
  await g.paso("2026-09-28 17:00:00", () =>
    c.$executeRawUnsafe(
      `WITH s AS (DELETE FROM "StockLocal" WHERE "id" = ${sl(P.atomico)} RETURNING "id") DELETE FROM "ProductoLocal" WHERE "id" = ${P.atomico.pl}`
    )
  );
  await g.paso("2026-09-28 20:00:00", async () => {
    await upd(sl(P.transito), `"cantidad" = 5.5, "enTransito" = 0`);
    await upd(sl(P.muchos), `"cantidad" = 80`);
  });
  await g.paso("2026-09-29 11:00:00.000", () => c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${sl(P.renace)}`));
  const slViejoRenace = P.renace.sl;
  await g.paso("2026-09-29 11:00:00.500", async () => {
    P.renace.sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${L.A}, ${P.renace.pl}, 4, now()) RETURNING "id"`)).id;
  });
  await g.paso("2026-09-29 13:00:00", () =>
    c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "unidad_medida" = 'kg', "pesoReferenciaKg" = 2.5 WHERE "id" = ${P.reinterpreta.base}`)
  );
  await g.paso("2026-09-29 14:00:00", () =>
    c.$executeRawUnsafe(
      `WITH s AS (UPDATE "StockLocal" SET "productoId" = ${P.revNuevo.pl} WHERE "id" = ${sl(P.revViejo)} RETURNING 1) DELETE FROM "ProductoLocal" WHERE "id" = ${P.revViejo.pl}`
    )
  );
  await g.paso("2026-09-29 18:00:00", () => upd(sl(P.renace), `"cantidad" = 6`));
  const dosEnElMismoMs = await g.paso("2026-09-30 09:00:00.123", async () => {
    await upd(sl(P.uno), `"cantidad" = 12`);
    await upd(sl(P.uno), `"cantidad" = 13`);
  });
  await g.paso("2026-09-30 10:00:00", async () => {
    await c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: "VENTA", referencia: 123 });
      await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = 47 WHERE "id" = ${sl(P.origen)}`);
    });
    await upd(sl(P.origen), `"cantidad" = 45`);
  });
  await g.paso("2026-09-30 12:00:00", async () => {
    P.tarde.sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${L.B}, ${P.tarde.pl}, 8, now()) RETURNING "id"`)).id;
  });

  // Local C: operaciones al azar en momentos crecientes, del punto cero al 4/10.
  {
    const r = azarDeterminista(20260928);
    const inicio = Date.UTC(2026, 8, 27, 21, 30);
    const fin = Date.UTC(2026, 9, 4, 23, 59);
    const momentos = Array.from({ length: 160 }, () => inicio + Math.floor(r() * (fin - inicio))).sort((a, b) => a - b);
    // El momento se escribe como texto de reloj argentino SIN zona; se arma con
    // aritmética UTC sobre números que ya representan la hora argentina.
    const texto = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 23);
    for (const t of momentos) {
      const x = azar[Math.floor(r() * azar.length)];
      const cant = (Math.floor(r() * 60000) / 1000).toFixed(3);
      const tran = (Math.floor(r() * 4000) / 1000).toFixed(3);
      await g.paso(texto(t), async () => {
        if (x.sl === null) {
          x.sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","enTransito","updatedAt") VALUES (${L.C}, ${x.pl}, ${cant}, ${tran}, now()) RETURNING "id"`)).id;
          return;
        }
        const dado = r();
        if (dado < 0.12) {
          await c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${x.sl}`);
          x.sl = null;
        } else if (dado < 0.6) await upd(x.sl, `"cantidad" = ${cant}`);
        else if (dado < 0.8) await upd(x.sl, `"enTransito" = ${tran}`);
        else await upd(x.sl, `"cantidad" = ${cant}, "enTransito" = ${tran}`);
      });
    }
  }

  await g.reubicar();
  ok("dos CAMBIO en la misma cadena y el mismo paso: dos movimientos", dosEnElMismoMs === 2);
  {
    const v = await verificarLibroStock(c);
    ok("el verificador del libro, sobre la base reubicada: integridad VERDE", v.integridad.ok, informeDelLibro(v).split("\n").filter((l) => l.includes("✗")).join(" | "));
  }

  // ── Punto cero ────────────────────────────────────────────────────────────
  seccion("B.1 Punto cero y fuera de historia");
  const pc = await server.puntoCeroDelLibro(c);
  ok(
    `el punto cero leído del libro es el de producción: ${PUNTO_CERO_PRODUCCION.instanteUTC}, día ${PUNTO_CERO_PRODUCCION.dia}`,
    pc?.instante === PUNTO_CERO_PRODUCCION.instanteUTC && pc?.dia === PUNTO_CERO_PRODUCCION.dia && pc.conEstadoInicial,
    json(pc)
  );
  {
    const x = await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-26", hoy: HOY });
    ok("el 26/09 está FUERA_DE_HISTORIA y no lista nada", x.periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA && x.cadenas.length === 0);
    const y = await server.stockDiarioDeCadena(c, { localId: L.A, productoLocalId: P.uno.pl, dia: "2026-09-26", hoy: HOY });
    ok(
      "una cadena fuera de historia: apertura y cierre DESCONOCIDOS, sin números",
      y.cadena.apertura.existencia === EXISTENCIA.DESCONOCIDA && y.cadena.apertura.motivo === MOTIVO_DESCONOCIDA.FUERA_DE_HISTORIA &&
        y.cadena.cierre.existencia === EXISTENCIA.DESCONOCIDA && y.cadena.apertura.cantidad === null && y.cadena.cierre.cantidad === null && y.cadena.cantidad === null,
      json(y.cadena)
    );
    const z = await server.stockDelPeriodo(c, { localId: L.A, desde: "2026-01-01", hasta: "2026-09-26", hoy: HOY });
    ok("un período entero antes del punto cero también está fuera de historia", z.periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA && z.cadenas.length === 0);
  }

  seccion("B.2 El día parcial del punto cero: 27/09");
  {
    const x = await server.stockDiarioDeCadena(c, { localId: L.A, productoLocalId: P.uno.pl, dia: "2026-09-27", hoy: HOY });
    const k = x.cadena;
    ok("estado PARCIAL_PUNTO_CERO", x.periodo.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO && x.periodo.parcial);
    ok(
      "apertura DESCONOCIDA con motivo SIN_APERTURA_HISTORICA, sin número (no es cero)",
      k.apertura.existencia === EXISTENCIA.DESCONOCIDA && k.apertura.motivo === MOTIVO_DESCONOCIDA.SIN_APERTURA_HISTORICA && k.apertura.cantidad === null && k.apertura.enTransito === null,
      json(k.apertura)
    );
    ok(
      "el primer estado conocido es el ESTADO_INICIAL, como PUNTO_DE_PARTIDA con 20 y sin delta",
      x.movimientos[0]?.tipo === "ESTADO_INICIAL" && x.movimientos[0].efecto === EFECTO.PUNTO_DE_PARTIDA && x.movimientos[0].puntoDePartida.cantidad === 20 &&
        x.movimientos[0].cantidad.delta === null && x.movimientos[0].instante === PUNTO_CERO_PRODUCCION.instanteUTC,
      json(x.movimientos[0])
    );
    ok("el cierre es exacto: 18 (20 del punto de partida, −2 a las 22:00)", k.cierre.existencia === EXISTENCIA.EXISTE && k.cierre.cantidad === 18 && k.cantidad.puntoDePartida === 20 && k.cantidad.salidas === 2);
    ok("y cuadra desde el punto de partida, cantidad y tránsito", k.cuadra.cantidad && k.cuadra.enTransito);
    const l = await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-27", hoy: HOY });
    ok(
      "el local lista las once cadenas que el punto cero copió, y no el producto que nace el 28",
      l.cadenas.length === 11 && !l.cadenas.some((q) => q.productoLocalId === P.nace.pl) && l.cadenas.every((q) => q.apertura.existencia === EXISTENCIA.DESCONOCIDA),
      `${l.cadenas.length}`
    );
    ok("los totales de apertura del día parcial quedan en null, no en cero", l.totales.cantidad.apertura.total === null && l.totales.cantidad.apertura.desconocidas === 11);
  }

  seccion("B.3 El primer día completo: 28/09");
  const dia28 = await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-28", hoy: HOY });
  const de = (res, pl) => res.cadenas.find((q) => q.productoLocalId === pl);
  {
    ok("estado COMPLETO", dia28.periodo.estado === ESTADO_DEL_DIA.COMPLETO && !dia28.periodo.parcial && !dia28.periodo.enCurso);
    const uno28 = de(dia28, P.uno.pl);
    ok("CAMBIO: abre en 18 (el cierre del 27), baja 3, cierra en 15", uno28.apertura.cantidad === 18 && uno28.cantidad.salidas === 3 && uno28.cierre.cantidad === 15, json(uno28));
    const cero = de(dia28, P.cero.pl);
    ok(
      "cero EXISTENTE: se lista, abre y cierra EXISTE con 0, sin movimientos",
      cero && cero.apertura.existencia === EXISTENCIA.EXISTE && cero.apertura.cantidad === 0 && cero.cierre.existencia === EXISTENCIA.EXISTE && cero.cierre.cantidad === 0 && cero.movimientos === 0,
      json(cero)
    );
    const nace = de(dia28, P.nace.pl);
    ok(
      "ALTA: apertura NO_EXISTE sin número, aparece con 7, cierre EXISTE 7, sin delta inventado",
      nace.apertura.existencia === EXISTENCIA.NO_EXISTE && nace.apertura.cantidad === null && nace.cantidad.apareceCon === 7 && nace.cantidad.entradas === 0 &&
        nace.cierre.existencia === EXISTENCIA.EXISTE && nace.cierre.cantidad === 7,
      json(nace)
    );
    const muere = de(dia28, P.muere.pl);
    ok(
      "BAJA: apertura EXISTE 5, desaparece con 5, cierre NO_EXISTE sin número (no es cero)",
      muere.apertura.cantidad === 5 && muere.cantidad.desapareceCon === 5 && muere.cantidad.salidas === 0 && muere.cierre.existencia === EXISTENCIA.NO_EXISTE && muere.cierre.cantidad === null,
      json(muere)
    );
    const tr = de(dia28, P.transito.pl);
    ok(
      "tránsito separado: abre 3/0; el tránsito entra 2,5 y sale 2,5; la cantidad entra 2,5; cierra 5,5/0",
      tr.apertura.cantidad === 3 && tr.apertura.enTransito === 0 && tr.enTransito.entradas === 2.5 && tr.enTransito.salidas === 2.5 &&
        tr.cantidad.entradas === 2.5 && tr.cantidad.salidas === 0 && tr.cierre.cantidad === 5.5 && tr.cierre.enTransito === 0 && tr.cuadra.enTransito,
      json(tr)
    );
    const el = de(dia28, P.eliminado.pl);
    ok(
      "producto eliminado: la identidad es la congelada en la BAJA, sin categoría, y el día se lista",
      el && el.identidad.fuente === FUENTE_IDENTIDAD.CONGELADA_EN_BAJA && el.identidad.nombre === "Eliminado" && el.identidad.codigoBarra === "SD-Eliminado" &&
        el.identidad.productoEliminado && el.identidad.categoriaActualId === null && el.cantidad.desapareceCon === 6,
      json(el?.identidad)
    );
    const [sinFila] = await c.$queryRaw`SELECT count(*)::int AS n FROM "StockLocal" WHERE "productoId" = ${P.eliminado.pl}`;
    ok("esa cadena no tiene StockLocal hoy, y el 27 igual abre desde el libro", sinFila.n === 0 && de(await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-27", hoy: HOY }), P.eliminado.pl)?.cierre.cantidad === 6);
    const mu = de(dia28, P.muchos.pl);
    ok("varios CAMBIO: 100 → 90 → 95 → 80: entra 5, sale 25, tres movimientos", mu.apertura.cantidad === 100 && mu.cantidad.entradas === 5 && mu.cantidad.salidas === 25 && mu.cierre.cantidad === 80 && mu.movimientos === 3);
    ok("todas las cadenas del 28 cuadran, cantidad y tránsito", dia28.cadenas.every((q) => q.cuadra.cantidad && q.cuadra.enTransito));
    const at = de(dia28, P.atomico.pl);
    ok(
      "BAJA ATÓMICA (una sola sentencia borra el stock y el producto): abre 4/1, desaparece con 4/1, cierra NO_EXISTE, con la identidad congelada",
      at && at.apertura.cantidad === 4 && at.apertura.enTransito === 1 && at.cantidad.desapareceCon === 4 && at.enTransito.desapareceCon === 1 &&
        at.cierre.existencia === EXISTENCIA.NO_EXISTE && at.cierre.cantidad === null && at.identidad.fuente === FUENTE_IDENTIDAD.ACTUAL &&
        at.identidad.productoEliminado && at.cuadra.cantidad && at.cuadra.enTransito,
      json(at)
    );
    const movAt = await server.movimientosDelDia(c, { localId: L.A, dia: "2026-09-28", productoLocalId: P.atomico.pl });
    ok(
      "y su movimiento es un DESAPARECE con la identidad que la BAJA congeló",
      movAt.length === 1 && movAt[0].efecto === EFECTO.DESAPARECE && movAt[0].identidadCongelada?.nombre === "Atomico" && movAt[0].stockLocalId === P.atomico.sl,
      json(movAt)
    );
    const t = dia28.totales.cantidad;
    const m = (v) => Math.round(v * 1000);
    ok(
      "los totales del local cuadran con columnas propias de aparece y desaparece",
      m(t.apertura.total) + m(t.cambioNeto) + m(t.apareceCon) - m(t.desapareceCon) === m(t.cierre.total) && t.apertura.noExisten === 1 && t.cierre.noExisten === 3,
      json(t)
    );
    const grupos = agruparCadenas(dia28.cadenas, claveDeCategoriaActual);
    ok(
      "por categoría ACTUAL: el eliminado va a su propio grupo",
      grupos.find((x) => x.clave === categoria)?.cadenas.some((q) => q.productoLocalId === P.uno.pl) &&
        grupos.find((x) => x.clave === GRUPO_PRODUCTO_ELIMINADO)?.cadenas.map((q) => q.productoLocalId).join() === String(P.eliminado.pl)
    );
  }

  seccion("B.4 Un día sin movimientos, borrar y recrear, reinterpretación: 29/09");
  {
    const x = await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-29", hoy: HOY });
    const uno29 = de(x, P.uno.pl);
    ok(
      "sin movimientos: terminó el 28 en 15, el 29 abre 15 y cierra 15 (no 0)",
      uno29 && uno29.movimientos === 0 && uno29.apertura.cantidad === 15 && uno29.cierre.cantidad === 15,
      json(uno29)
    );
    ok("un producto borrado ANTES del día no se lista", !de(x, P.muere.pl) && !de(x, P.eliminado.pl));
    const r = de(x, P.renace.pl);
    ok(
      "borrar y recrear: abre 9, desaparece 9, aparece 4, entra 2, cierra 6",
      r.apertura.cantidad === 9 && r.cantidad.desapareceCon === 9 && r.cantidad.apareceCon === 4 && r.cantidad.entradas === 2 && r.cierre.cantidad === 6 && r.cuadra.cantidad,
      json(r)
    );
    ok(
      "la cadena es la misma (localId, productoLocalId) y el stockLocalId cambia",
      r.apertura.stockLocalId === slViejoRenace && r.cierre.stockLocalId === P.renace.sl && slViejoRenace !== P.renace.sl
    );
    const mov = await server.movimientosDelDia(c, { localId: L.A, dia: "2026-09-29", productoLocalId: P.renace.pl });
    ok(
      "sus movimientos en orden: DESAPARECE, APARECE, CAMBIO; con delta solo el CAMBIO",
      mov.map((m) => m.efecto).join() === [EFECTO.DESAPARECE, EFECTO.APARECE, EFECTO.CAMBIO].join() &&
        mov[0].cantidad.delta === null && mov[1].cantidad.delta === null && mov[2].cantidad.delta === 2 && mov[0].identidadCongelada?.nombre === "Renace",
      json(mov.map((m) => [m.efecto, m.cantidad]))
    );
    const rv = de(x, P.revViejo.pl);
    const rn = de(x, P.revNuevo.pl);
    ok(
      "RE-VINCULACIÓN ATÓMICA: la cadena vieja abre 3 y desaparece con 3; la nueva aparece con 3 en la misma fila",
      rv && rn && rv.apertura.cantidad === 3 && rv.cantidad.desapareceCon === 3 && rv.cierre.existencia === EXISTENCIA.NO_EXISTE &&
        rn.apertura.existencia === EXISTENCIA.NO_EXISTE && rn.cantidad.apareceCon === 3 && rn.cierre.cantidad === 3 &&
        rn.cierre.stockLocalId === rv.apertura.stockLocalId && rv.cuadra.cantidad && rn.cuadra.cantidad,
      json({ rv, rn })
    );
    const re = de(x, P.reinterpreta.pl);
    ok(
      "la reinterpretación marca el día y dice qué cambió, sin convertir el número",
      re.reinterpretada && re.reinterpretaciones.some((q) => q.campo === "unidad_medida" && q.valorAnterior === "unidad" && q.valorPosterior === "kg" && q.dia === "2026-09-29") &&
        re.apertura.cantidad === 10 && re.cierre.cantidad === 10,
      json(re.reinterpretaciones)
    );
    ok("el día anterior a la reinterpretación no queda marcado", !de(dia28, P.reinterpreta.pl).reinterpretada);
    const b = await server.stockDiarioDelLocal(c, { localId: L.B, dia: "2026-09-29", hoy: HOY });
    ok("un producto creado DESPUÉS del día no se lista", b.cadenas.length === 0);
    const tarde = await server.stockDiarioDeCadena(c, { localId: L.B, productoLocalId: P.tarde.pl, dia: "2026-09-29", hoy: HOY });
    ok(
      "y preguntado directo: NO_EXISTE al abrir y al cerrar, sin números",
      tarde.cadena.apertura.existencia === EXISTENCIA.NO_EXISTE && tarde.cadena.cierre.existencia === EXISTENCIA.NO_EXISTE && tarde.cadena.cierre.cantidad === null && !tarde.cadena.existio
    );
    const alCierre = await server.estadoDeCadenaAlCierre(c, { localId: L.A, productoLocalId: P.muere.pl, dia: "2026-09-29", hoy: HOY });
    ok("estadoDeCadenaAlCierre de una cadena borrada: NO_EXISTE", alCierre.existencia === EXISTENCIA.NO_EXISTE && alCierre.cantidad === null);
  }

  seccion("B.5 Mismo milisegundo y SIN_ORIGEN: 30/09");
  {
    const mov = await server.movimientosDelDia(c, { localId: L.A, dia: "2026-09-30", productoLocalId: P.uno.pl });
    ok(
      "dos CAMBIO con el MISMO instante: el orden lo da el id, 15 → 12 → 13",
      mov.length === 2 && mov[0].instante === mov[1].instante && mov[0].id < mov[1].id && mov[0].cantidad.posterior === 12 && mov[1].cantidad.posterior === 13,
      json(mov.map((m) => [m.id, m.instante, m.cantidad]))
    );
    const alCierre = await server.estadoDeCadenaAlCierre(c, { localId: L.A, productoLocalId: P.uno.pl, dia: "2026-09-30", hoy: HOY });
    ok("el cierre es el del id mayor: 13, no 12", alCierre.cantidad === 13 && alCierre.existencia === EXISTENCIA.EXISTE);
    const x = await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-30", hoy: HOY });
    const o = de(x, P.origen.pl);
    ok("SIN_ORIGEN se cuenta aparte y no toca el saldo: dos movimientos, uno sin clasificar, 50 → 45", o.movimientos === 2 && o.sinClasificar === 1 && o.cierre.cantidad === 45 && o.cuadra.cantidad);
    const movO = await server.movimientosDelDia(c, { localId: L.A, dia: "2026-09-30", productoLocalId: P.origen.pl });
    ok(
      `el declarado dice VENTA con su referencia; el otro se lee "${TEXTO_SIN_ORIGEN}"`,
      movO[0].origen === "VENTA" && movO[0].origenRef === "123" && !movO[0].sinClasificar && movO[1].sinClasificar && movO[1].origenLegible === TEXTO_SIN_ORIGEN
    );
    const todos = await server.movimientosDelDia(c, { localId: L.A, dia: "2026-09-30" });
    const ordenados = [...todos].sort((a, b) => (a.instante === b.instante ? a.id - b.id : a.instante < b.instante ? -1 : 1));
    ok("los movimientos de todo el local salen por (instante, id)", json(todos.map((m) => m.id)) === json(ordenados.map((m) => m.id)));
    const b = await server.stockDiarioDelLocal(c, { localId: L.B, dia: "2026-09-30", hoy: HOY });
    ok("el ALTA del 30 en el local B: aparece con 8", b.cadenas.length === 1 && b.cadenas[0].cantidad.apareceCon === 8 && b.cadenas[0].apertura.existencia === EXISTENCIA.NO_EXISTE);
    const enCurso = await server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-09-30", hoy: "2026-09-30" });
    ok("si hoy fuera el 30: EN_CURSO, con el cierre provisional", enCurso.periodo.estado === ESTADO_DEL_DIA.EN_CURSO && enCurso.cadenas.every((q) => q.cierre.provisional === true));
    ok("un día posterior a hoy se rechaza: DIA_FUTURO", await rechaza(() => server.stockDiarioDelLocal(c, { localId: L.A, dia: "2026-10-01", hoy: "2026-09-30" }), "DIA_FUTURO"));
    ok("un Date de JavaScript se rechaza: DIA_INVALIDO", await rechaza(() => server.stockDiarioDelLocal(c, { localId: L.A, dia: new Date() }), "DIA_INVALIDO"));
  }

  seccion("B.6 Períodos");
  {
    const p = await server.stockDelPeriodo(c, { localId: L.A, desde: "2026-09-27", hasta: "2026-09-30", hoy: HOY });
    const u = de(p, P.uno.pl);
    ok(
      "un período que incluye el 27 es PARCIAL: parte de 20, cierra 13, cuadra",
      p.periodo.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO && u.apertura.existencia === EXISTENCIA.DESCONOCIDA && u.cantidad.puntoDePartida === 20 && u.cierre.cantidad === 13 && u.cuadra.cantidad,
      json(u)
    );
    const q = await server.stockDelPeriodo(c, { localId: L.A, desde: "2026-09-28", hasta: "2026-09-30", hoy: HOY });
    const v = de(q, P.uno.pl);
    ok("del 28 al 30: COMPLETO, abre 18 y cierra 13", q.periodo.estado === ESTADO_DEL_DIA.COMPLETO && v.apertura.cantidad === 18 && v.cierre.cantidad === 13 && v.cuadra.cantidad);
    ok("en el período lista también los que murieron adentro, y no los que murieron antes", !!de(q, P.muere.pl) && !!de(q, P.eliminado.pl));
    const mes = await porUnidad.stockDeUnidad(c, { localId: L.A, unidad: UNIDAD_DE_PERIODO.MES, fecha: "2026-09-30", hoy: HOY });
    ok("el mes de septiembre: 1 al 30, PARCIAL, con historia desde el 27", mes.periodo.desde === "2026-09-01" && mes.periodo.hasta === "2026-09-30" && mes.periodo.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO && mes.periodo.desdeEfectivo === "2026-09-27");
    const anio = await porUnidad.stockDeUnidad(c, { localId: L.A, unidad: UNIDAD_DE_PERIODO.ANIO, fecha: "2026-09-30", hoy: HOY });
    ok("el año: recortado a hoy, sin inventar el futuro", anio.periodo.desde === "2026-01-01" && anio.periodo.hastaEfectivo === HOY && anio.periodo.recortadoAHoy);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // D. FUERZA BRUTA
  // ══════════════════════════════════════════════════════════════════════════
  seccion("D. Todas las cadenas, todos los días y varios períodos contra la fuerza bruta");
  const DIAS = diasDelRango("2026-09-27", HOY);
  {
    let comparados = 0;
    const difs = [];
    for (const localId of [L.A, L.B, L.C]) {
      const bruto = await libroEnMemoria(c, localId);
      const rangos = [
        ...DIAS.map((d) => [d, d]),
        ["2026-09-27", "2026-09-29"],
        ["2026-09-28", "2026-10-04"],
        ["2026-09-29", "2026-10-02"],
        ["2026-09-01", HOY],
        ["2026-10-03", HOY],
      ];
      for (const [desde, hasta] of rangos) {
        const r = await server.stockDelPeriodo(c, { localId, desde, hasta, hoy: HOY });
        comparados += r.cadenas.length;
        for (const d of diferencias(r, bruto, { desde, hasta, puntoCeroDia: PUNTO_CERO_PRODUCCION.dia })) difs.push(`local ${localId} ${desde}..${hasta} ${d}`);
      }
    }
    ok(`${comparados} cadena-períodos idénticos a la fuerza bruta, y todos cuadran`, difs.length === 0 && comparados > 500, difs.slice(0, 8).join(" | "));
    const [n] = await c.$queryRaw`SELECT count(*)::int AS n FROM "MovimientoStock"`;
    console.log(`     (libro del guion: ${n.n} movimientos; local C con 160 operaciones al azar)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // E. ZONAS HORARIAS
  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. El resultado no depende de la zona de la sesión ni de la de Node");
  {
    const args = { locales: [L.A, L.B, L.C], dias: diasDelRango("2026-09-26", HOY), hoy: HOY };
    const normal = json(await calcularTodo(c, args));
    const raro = json(
      await c.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`);
          await tx.$executeRawUnsafe(`SET LOCAL DateStyle = 'SQL, DMY'`);
          const [z] = await tx.$queryRaw`SELECT current_setting('TimeZone') AS "tz", now()::date::text AS "fecha"`;
          ok(`la sesión quedó en ${z.tz} con DateStyle SQL, DMY (una fecha se escribe "${z.fecha}")`, z.tz === "Pacific/Kiritimati" && z.fecha.includes("/"));
          return calcularTodo(tx, args);
        },
        { timeout: 120_000 }
      )
    );
    ok("sesión de PostgreSQL en UTC+14 y DMY: resultado idéntico", normal === raro);

    // La marca del alias loader NO se hereda: con ella puesta, el hijo creería
    // que ya está registrado y no resolvería `@/` (ver scripts/alias-loader.mjs).
    const { __ERPAZUL_ALIAS_LOADER__: _marca, ...entorno } = process.env;
    for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      const hijo = spawnSync(process.execPath, ["--import", "./scripts/alias-loader.mjs", fileURLToPath(import.meta.url), "--solo-calculo", urlGuion, json(args)], {
        cwd: RAIZ,
        env: { ...entorno, TZ: tz },
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      });
      const linea = (hijo.stdout || "").split("\n").find((l) => l.startsWith("JSON:"));
      const salida = linea ? JSON.parse(linea.slice(5)) : null;
      const error = (hijo.stderr || "").split("\n").find((l) => /Error|ABORTADO|Cannot/.test(l)) || "";
      ok(`Node con TZ=${tz}: resultado idéntico`, salida?.tz === tz && json(salida.r) === normal, error || `salida del hijo: ${(linea || "").slice(0, 200)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // F. SEMANA OPERATIVA
  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. La Semana Operativa solo agrupa días");
  {
    // Las vigencias se escriben por la puerta canónica, con sus reglas: la
    // primera carga rige desde siempre, y un cambio solo puede ser futuro.
    await c.$transaction((tx) => programarSemanaOperativa(tx, { localId: L.A, diaDeCorte: 1, hoy: HOY }));
    const antes = await porUnidad.stockDeUnidad(c, { localId: L.A, unidad: UNIDAD_DE_PERIODO.SEMANA, fecha: "2026-09-30", hoy: HOY });
    ok(
      "con corte lunes, la semana del 30/09 va del lunes 28 al domingo 4, configurada",
      antes.periodo.desde === "2026-09-28" && antes.periodo.hasta === "2026-10-04" && antes.semana.configurada && !antes.semana.transicion && antes.periodo.estado === ESTADO_DEL_DIA.COMPLETO,
      json(antes.semana)
    );
    const diariosAntes = json(await calcularTodo(c, { locales: [L.A], dias: DIAS, hoy: HOY }));
    // Un cambio de corte FUTURO: rige desde el lunes 12/10, con corte miércoles.
    const cambio = await c.$transaction((tx) => programarSemanaOperativa(tx, { localId: L.A, diaDeCorte: 3, desde: "2026-10-12", hoy: HOY }));
    ok("el cambio quedó programado para el 12/10, por la puerta canónica", cambio.desde === "2026-10-12", json(cambio));
    const despues = await porUnidad.stockDeUnidad(c, { localId: L.A, unidad: UNIDAD_DE_PERIODO.SEMANA, fecha: "2026-09-30", hoy: HOY });
    ok("el cambio de corte futuro no mueve la semana vieja ni su stock", json({ ...despues, semana: null }) === json({ ...antes, semana: null }) && json(despues.semana) === json(antes.semana));
    ok("ni ningún día: el Stock Diario no mira la semana", json(await calcularTodo(c, { locales: [L.A], dias: DIAS, hoy: HOY })) === diariosAntes);
    const sinConf = await porUnidad.stockDeUnidad(c, { localId: L.B, unidad: UNIDAD_DE_PERIODO.SEMANA, fecha: "2026-09-30", hoy: HOY });
    ok("una ubicación sin semana configurada usa el domingo y lo dice", sinConf.semana.sinConfigurar && sinConf.periodo.desde === "2026-09-27");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C. EL RELOJ REAL
  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. El día en curso con el reloj real de PostgreSQL");
  {
    const url = await crearBase(`${PREFIJO}reloj`);
    aplicarMigraciones(url, { hasta: MIGRACION_LIBRO });
    const r = await clienteDe(url);
    const s = await sembrarGuion(r);
    aplicarMigraciones(url, { solo: MIGRACIONES.filter((m) => m >= MIGRACION_LIBRO) });
    // El punto cero, dos días antes de hoy: así hoy es un día completo en curso.
    await r.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" DISABLE TRIGGER "MovimientoStock_inmutable"`);
    const HACE_DOS_DIAS = `(((("libro_stock_dia"("libro_stock_instante"()) - 2) + time '12:00') AT TIME ZONE 'America/Argentina/Cordoba') AT TIME ZONE 'UTC')::timestamp(3)`;
    await r.$executeRawUnsafe(`UPDATE "MovimientoStock" SET "instante" = ${HACE_DOS_DIAS}, "dia" = "libro_stock_dia"(${HACE_DOS_DIAS})`);
    await r.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" ENABLE TRIGGER "MovimientoStock_inmutable"`);
    await r.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = 17 WHERE "id" = ${s.P.uno.sl}`);

    const hoyReal = await server.hoyDelLibro(r);
    const [vivo] = await r.$queryRaw`SELECT to_char("dia", 'YYYY-MM-DD') AS "dia" FROM "MovimientoStock" ORDER BY "id" DESC LIMIT 1`;
    const [explicito] = await r.$queryRaw`SELECT to_char((now() AT TIME ZONE 'America/Argentina/Cordoba')::date, 'YYYY-MM-DD') AS "d"`;
    ok(`hoy según PostgreSQL (${hoyReal}) es el día del movimiento recién escrito y el de la zona explícita`, hoyReal === vivo.dia && hoyReal === explicito.d);
    ok("sin día no hay consulta: el día lo dice quien pregunta; hoy, la base", await rechaza(() => server.stockDiarioDelLocal(r, { localId: s.L.A }), "DIA_INVALIDO"));
    const y = await server.stockDiarioDelLocal(r, { localId: s.L.A, dia: hoyReal }).catch((e) => e);
    const u = y.cadenas?.find((q) => q.productoLocalId === s.P.uno.pl);
    ok(
      "sin inyectar hoy: EN_CURSO, apertura exacta 20, cierre PROVISIONAL 17",
      y.periodo?.estado === ESTADO_DEL_DIA.EN_CURSO && u?.apertura.cantidad === 20 && u?.cierre.cantidad === 17 && u?.cierre.provisional === true,
      json(y.periodo ?? String(y))
    );
    ok("el día siguiente, según el mismo reloj, es futuro", await rechaza(() => server.stockDiarioDelLocal(r, { localId: s.L.A, dia: sumarDias(hoyReal, 1) }), "DIA_FUTURO"));
    const ayer = await server.stockDiarioDelLocal(r, { localId: s.L.A, dia: sumarDias(hoyReal, -1) });
    ok("ayer, con el mismo reloj, está COMPLETO", ayer.periodo.estado === ESTADO_DEL_DIA.COMPLETO);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // H. EL ORDEN DE LA PÁGINA: (dia, instante, id) ES (instante, id)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // El contrato de la API ordena los movimientos del local por (instante, id); la
  // consulta los ordena por (dia, instante, id) para que PostgreSQL recorra el
  // índice (localId, dia). Son el mismo orden si y solo si, entre dos filas, un
  // instante menor nunca tiene un día mayor. Eso sale de dos hechos:
  //
  //   1. `dia` es la fecha argentina del `instante` en CADA fila: lo escribe el
  //      trigger con `libro_stock_dia`, el libro no admite UPDATE, y el
  //      verificador lo exige fila por fila;
  //   2. la fecha argentina no retrocede cuando el instante avanza.
  //
  // Con (1) y (2): si instante(a) < instante(b), dia(a) <= dia(b); si los días
  // difieren, los dos órdenes coinciden; si son iguales, decide (instante, id) en
  // los dos. Y a igual instante, igual día, y decide el id. Acá se prueban los dos
  // hechos, los bordes del día, las páginas, y la contraprueba: con UNA fila cuyo
  // día no es el de su instante, el orden se rompe.
  seccion("H. El orden de la página: (dia, instante, id) contra (instante, id)");
  {
    // (2), para la zona como la conoce ESTE PostgreSQL: de 1920 a 2040, cada 15
    // minutos, la fecha argentina nunca retrocede.
    const [zona] = await principal.$queryRaw`
      SELECT count(*)::int AS "retrocesos", (SELECT count(*)::int FROM generate_series(timestamptz '1920-01-01 00:00+00', timestamptz '2040-01-01 00:00+00', interval '15 minutes')) AS "puntos"
      FROM (
        SELECT (t AT TIME ZONE 'America/Argentina/Cordoba')::date AS d,
               lag((t AT TIME ZONE 'America/Argentina/Cordoba')::date) OVER (ORDER BY t) AS previo
        FROM generate_series(timestamptz '1920-01-01 00:00+00', timestamptz '2040-01-01 00:00+00', interval '15 minutes') t
      ) s WHERE d < previo`;
    ok(
      `la fecha argentina no retrocede nunca: ${zona.puntos.toLocaleString("es-AR")} instantes de 1920 a 2040, cada 15 minutos, ${zona.retrocesos} retrocesos`,
      zona.retrocesos === 0 && zona.puntos > 4_000_000
    );

    const url = await crearBase(`${PREFIJO}orden`);
    aplicarMigraciones(url, { hasta: MIGRACION_LIBRO });
    const o = await clienteDe(url);
    const { L, azar } = await sembrarGuion(o);
    aplicarMigraciones(url, { solo: MIGRACIONES.filter((m) => m >= MIGRACION_LIBRO) });
    // Siete cadenas de C con stock al punto cero: x[0]..x[6].
    const x = azar.filter((a) => a.sl !== null).slice(0, 7);
    const g = guion(o);
    await g.puntoCero(PUNTO_CERO_PRODUCCION.instanteArgentina);
    const upd = (a, v) => o.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = ${v} WHERE "id" = ${a.sl}`);
    const pasos = {};
    const paso = async (nombre, momento, fn) => {
      const antes = await uno(o, `SELECT coalesce(max("id"), 0)::int AS m FROM "MovimientoStock"`);
      await g.paso(momento, fn);
      const despues = await uno(o, `SELECT coalesce(max("id"), 0)::int AS m FROM "MovimientoStock"`);
      pasos[nombre] = { desde: antes.m + 1, hasta: despues.m };
    };
    await paso("ultimoMsUtcDel28", "2026-09-28 20:59:59.999", () => upd(x[0], 1));
    await paso("primeroUtcDel29", "2026-09-28 21:00:00.000", () => upd(x[1], 1));
    await paso("tresAlFinalDel28", "2026-09-28 23:59:59.999", async () => {
      await upd(x[0], 2);
      await upd(x[1], 2);
      await upd(x[2], 2);
    });
    await paso("medianoche29", "2026-09-29 00:00:00.000", () => upd(x[3], 1));
    await paso("medianoche29otra", "2026-09-29 00:00:00.000", () => upd(x[4], 1));
    // Ids MAYORES que los de medianoche y un instante ANTERIOR, del día anterior:
    // la concurrencia puede dejar el id y el instante en órdenes distintos.
    await paso("tardioDel28", "2026-09-28 23:59:59.998", () => upd(x[5], 1));
    await paso("unMsDespues", "2026-09-29 00:00:00.001", async () => {
      await upd(x[3], 2);
      await upd(x[5], 2);
    });
    await paso("finUtcDel29", "2026-09-29 02:59:59.999", () => upd(x[0], 3));
    await paso("primeroUtcDel30", "2026-09-29 21:00:00.000", () => upd(x[1], 3));
    await paso("cuatroMedianoche30", "2026-09-30 00:00:00.000", async () => {
      for (const a of x.slice(0, 4)) await upd(a, 9);
    });
    await paso("tardioDel29", "2026-09-29 23:59:59.999", () => upd(x[6], 1));
    await g.reubicar();

    const v = await verificarLibroStock(o);
    ok("el verificador del libro, con los bordes del día: integridad VERDE (1: cada día es el de su instante)", v.integridad.ok, informeDelLibro(v).split("\n").filter((l) => l.includes("✗")).join(" | "));

    const fila = (id) => uno(o, `SELECT to_char("dia", 'YYYY-MM-DD') AS "dia", to_char("instante", 'YYYY-MM-DD HH24:MI:SS.MS') AS "utc" FROM "MovimientoStock" WHERE "id" = ${id}`);
    const b1 = await fila(pasos.ultimoMsUtcDel28.desde);
    const b2 = await fila(pasos.primeroUtcDel29.desde);
    const b3 = await fila(pasos.medianoche29.desde);
    const b4 = await fila(pasos.tardioDel28.desde);
    ok("20:59:59.999 argentinas del 28: UTC del 28, día 28", b1.utc === "2026-09-28 23:59:59.999" && b1.dia === "2026-09-28", json(b1));
    ok("21:00 argentinas del 28: UTC ya del 29, día 28 (misma fecha UTC que la madrugada del 29, otro día argentino)", b2.utc === "2026-09-29 00:00:00.000" && b2.dia === "2026-09-28", json(b2));
    ok("00:00 argentinas del 29: UTC 03:00 del 29, día 29", b3.utc === "2026-09-29 03:00:00.000" && b3.dia === "2026-09-29", json(b3));
    ok("un id mayor con un instante anterior cae en el día anterior", pasos.tardioDel28.desde > pasos.medianoche29otra.hasta && b4.dia === "2026-09-28", json(b4));

    const DESDE = "2026-09-27";
    const HASTA = "2026-09-30";
    const HOY_O = "2026-10-05";
    const contrato = async (desde, hasta) =>
      (
        await o.$queryRawUnsafe(
          `SELECT "id" FROM "MovimientoStock" WHERE "localId" = ${L.C} AND "dia" BETWEEN '${desde}'::date AND '${hasta}'::date ORDER BY "instante", "id"`
        )
      ).map((f) => Number(f.id));
    const paginas = async (desde, hasta, pageSize, productoLocalId = null) => {
      const ids = [];
      const cortes = [];
      let total = null;
      for (let page = 1; ; page++) {
        const r = await server.movimientosDelPeriodo(o, { localId: L.C, desde, hasta, productoLocalId, page, pageSize, hoy: HOY_O });
        total = r.movimientos.total;
        if (r.movimientos.items.length === 0) break;
        ids.push(...r.movimientos.items.map((m) => m.id));
        cortes.push(new Set(r.movimientos.items.map((m) => m.dia)).size);
        if (page > 1000) break;
      }
      return { ids, total, cruzanDia: cortes.filter((n) => n > 1).length };
    };

    const esperado = await contrato(DESDE, HASTA);
    const [delMismoInstante] = await o.$queryRaw`
      SELECT max(n)::int AS n FROM (SELECT count(*) AS n FROM "MovimientoStock" WHERE "localId" = ${L.C} GROUP BY "instante") s`;
    ok(`${esperado.length} movimientos de C en el período, hasta ${delMismoInstante.n} en el mismo instante`, esperado.length > 25 && delMismoInstante.n >= 4);
    const difs = [];
    let cruces = 0;
    for (const tam of [1, 2, 3, 4, 5, 7, 11, 50, 200]) {
      const p = await paginas(DESDE, HASTA, tam);
      cruces += p.cruzanDia;
      if (json(p.ids) !== json(esperado)) difs.push(`pageSize ${tam}: ${p.ids.length} ids, distintos del contrato`);
      if (new Set(p.ids).size !== p.ids.length) difs.push(`pageSize ${tam}: repetidos`);
      if (p.total !== esperado.length) difs.push(`pageSize ${tam}: total ${p.total}`);
    }
    ok(
      "con 1, 2, 3, 4, 5, 7, 11, 50 y 200 por página, las páginas pegadas son EXACTAMENTE ORDER BY (instante, id): sin repetir ni saltear",
      difs.length === 0,
      difs.join(" | ")
    );
    ok(`y hay páginas que atraviesan el cambio de día argentino (${cruces})`, cruces > 5);
    const sinInstante = (
      await o.$queryRawUnsafe(`SELECT "id" FROM "MovimientoStock" WHERE "localId" = ${L.C} AND "dia" BETWEEN '${DESDE}' AND '${HASTA}' ORDER BY "dia", "id"`)
    ).map((f) => Number(f.id));
    ok("CONTRAPRUEBA: sin el instante —(dia, id)— el orden ya NO es el del contrato: los datos ejercen un id que no sigue al instante", json(sinInstante) !== json(esperado));

    const porDia = [];
    for (const d of ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]) {
      const p = await paginas(d, d, 2);
      if (json(p.ids) !== json(await contrato(d, d))) porDia.push(d);
    }
    ok("y lo mismo pidiendo un día solo, cada uno de los cuatro", porDia.length === 0, porDia.join(", "));

    const cadenaDifs = [];
    for (const a of x) {
      const p = await paginas(DESDE, HASTA, 2, a.pl);
      const c = (
        await o.$queryRawUnsafe(`SELECT "id" FROM "MovimientoStock" WHERE "localId" = ${L.C} AND "productoLocalId" = ${a.pl} AND "dia" BETWEEN '${DESDE}' AND '${HASTA}' ORDER BY "instante", "id"`)
      ).map((f) => Number(f.id));
      if (json(p.ids) !== json(c)) cadenaDifs.push(a.pl);
    }
    ok("las páginas de UNA cadena, en (dia, id), también son su (instante, id)", cadenaDifs.length === 0, cadenaDifs.join(", "));

    const invariante = () =>
      o.$queryRawUnsafe(`
        SELECT count(*)::int AS "n" FROM (
          SELECT "dia", lag("dia") OVER (PARTITION BY "localId" ORDER BY "instante", "id") AS "previo" FROM "MovimientoStock"
        ) s WHERE "dia" < "previo"`);
    ok("en todo el libro, ordenado por (instante, id), el día nunca retrocede", (await invariante())[0].n === 0);

    // ── LA CONTRAPRUEBA: una sola fila con un día que no es el de su instante ──
    await o.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" DISABLE TRIGGER "MovimientoStock_inmutable"`);
    await o.$executeRawUnsafe(`UPDATE "MovimientoStock" SET "dia" = '2026-09-29' WHERE "id" = ${pasos.tardioDel28.desde}`);
    const roto = await paginas(DESDE, HASTA, 3);
    const vRoto = await verificarLibroStock(o);
    const invRoto = (await invariante())[0].n;
    await o.$executeRawUnsafe(`UPDATE "MovimientoStock" SET "dia" = "libro_stock_dia"("instante") WHERE "id" = ${pasos.tardioDel28.desde}`);
    await o.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" ENABLE TRIGGER "MovimientoStock_inmutable"`);
    ok(
      "CONTRAPRUEBA: con UNA fila fuera de su día, las páginas ya no son (instante, id), y el verificador y el invariante lo ven",
      json(roto.ids) !== json(esperado) && !vRoto.integridad.ok && invRoto > 0,
      json({ igual: json(roto.ids) === json(esperado), verificador: vRoto.integridad.ok, invariante: invRoto })
    );
    ok("restaurada la fila, vuelven a coincidir", json((await paginas(DESDE, HASTA, 3)).ids) === json(esperado) && (await verificarLibroStock(o)).integridad.ok);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // G. VOLUMEN
  // ══════════════════════════════════════════════════════════════════════════
  seccion(`G. Volumen: ${FILAS_VOLUMEN.toLocaleString("es-AR")} movimientos sintéticos, EXPLAIN y contraprueba`);
  {
    const url = await crearBase(`${PREFIJO}volumen`);
    aplicarMigraciones(url);
    const v = await clienteDe(url);
    const CADENAS_POR_LOCAL = 2500;
    const LOCALES = 5;
    const inicio = Date.now();
    await v.$executeRawUnsafe(`
      INSERT INTO "MovimientoStock" ("stockLocalId","localId","productoLocalId","productoBaseId","tipo",
        "cantidadAnterior","cantidadPosterior","enTransitoAnterior","enTransitoPosterior","instante","dia","origen")
      SELECT p, ((p - 1) / ${CADENAS_POR_LOCAL}) + 1, p, p, 'ESTADO_INICIAL', NULL, 10, NULL, 0,
             timestamp '2026-09-28 00:19:13.587', date '2026-09-27', 'ACTIVACION_DEL_LIBRO'
      FROM generate_series(1, ${CADENAS_POR_LOCAL * LOCALES}) p`);
    // Popularidad sesgada: pocas cadenas concentran muchos movimientos, como en
    // un comercio. En orden de instante, así el id crece con el tiempo.
    await v.$executeRawUnsafe(`
      INSERT INTO "MovimientoStock" ("stockLocalId","localId","productoLocalId","productoBaseId","tipo",
        "cantidadAnterior","cantidadPosterior","enTransitoAnterior","enTransitoPosterior","instante","dia","origen")
      SELECT p, ((p - 1) / ${CADENAS_POR_LOCAL}) + 1, p, p, 'CAMBIO', 10, 9, 0, 0, i, "libro_stock_dia"(i), 'SIN_ORIGEN'
      FROM (
        SELECT 1 + floor(${CADENAS_POR_LOCAL * LOCALES} * power(random(), 3))::int AS p,
               (timestamp '2026-09-28 03:00' + random() * interval '365 days')::timestamp(3) AS i
        FROM generate_series(1, ${FILAS_VOLUMEN})
      ) s ORDER BY i`);
    await v.$executeRawUnsafe(`ANALYZE "MovimientoStock"`);
    console.log(`     (carga: ${((Date.now() - inicio) / 1000).toFixed(1)} s)`);

    const DIA = "2027-03-15";
    const sql = server.sqlStockDelLocal({ localId: 1, desde: DIA, hasta: DIA });
    const [del] = await v.$queryRaw`SELECT count(*)::int AS n FROM "MovimientoStock" WHERE "localId" = 1 AND "dia" = ${DIA}::date`;
    const [enLocal] = await v.$queryRaw`SELECT count(*)::int AS n FROM "MovimientoStock" WHERE "localId" = 1`;
    // Una lectura por cadena para enumerar, una para la apertura y una para el
    // cierre, más los movimientos del día. Con margen: el doble.
    const TOPE = 2 * (3 * CADENAS_POR_LOCAL + del.n);

    const con = await explicar(v, sql);
    const lateral = con.nodos.filter((n) => n["Index Name"] === INDICE && (n["Actual Loops"] || 0) >= CADENAS_POR_LOCAL);
    ok(
      `con el índice: la apertura y el cierre lo usan una vez por cadena (${lateral.length} nodos, ${lateral.map((n) => n["Actual Loops"]).join("/")} vueltas)`,
      lateral.length >= 2 && lateral.every((n) => n["Node Type"].startsWith("Index")),
      json(con.indices)
    );
    ok(
      `con el índice: lee ${con.filasLeidas.toLocaleString("es-AR")} filas del libro, de ${enLocal.n.toLocaleString("es-AR")} del local (tope ${TOPE.toLocaleString("es-AR")}) — ${con.ms.toFixed(1)} ms`,
      con.filasLeidas <= TOPE
    );

    const unaCadena = await v.$queryRaw`
      EXPLAIN (FORMAT JSON) SELECT "id" FROM "MovimientoStock" m
      WHERE m."localId" = 1 AND m."productoLocalId" = 1 AND m."dia" < ${DIA}::date ORDER BY m."dia" DESC, m."id" DESC LIMIT 1`;
    const nodos1 = nodosDelPlan(unaCadena[0]["QUERY PLAN"][0].Plan);
    ok("la apertura de UNA cadena es un Limit sobre un Index Scan Backward del índice nuevo", nodos1.some((n) => n["Index Name"] === INDICE && n["Scan Direction"] === "Backward"), json(nodos1.map((n) => n["Node Type"])));

    // ── La página de movimientos de la API, la MISMA consulta que corre ──────
    //
    // Un año entero del local, la página 21 de 50. Lo que se exige es que la
    // página lea sus días y no el año: hasta la fila 1.050, más el día en que
    // cae el corte. La contraprueba es la consulta escrita como dice el contrato
    // —(instante, id), sin el día adelante—: da el mismo orden y lee el año.
    {
      const ANIO = { desde: "2026-09-27", hasta: "2027-09-30" };
      const pagina = server.sqlMovimientosPagina({ localId: 1, ...ANIO, limite: 50, desplazamiento: 1000 });
      const [masDia] = await v.$queryRaw`
        SELECT max(n)::int AS n, sum(n)::int AS total FROM (
          SELECT count(*) AS n FROM "MovimientoStock" WHERE "localId" = 1 GROUP BY "dia") s`;
      const TOPE_PAGINA = 2 * (1050 + masDia.n);
      const p = await explicar(v, pagina);
      ok(
        `la página 21 de un año del local lee ${p.filasLeidas.toLocaleString("es-AR")} filas del libro, de ${masDia.total.toLocaleString("es-AR")} (tope ${TOPE_PAGINA.toLocaleString("es-AR")}) — ${p.ms.toFixed(1)} ms`,
        p.filasLeidas <= TOPE_PAGINA && p.nodos.some((n) => n["Node Type"] === "Incremental Sort"),
        json(p.nodos.map((n) => n["Node Type"]))
      );
      const ingenua = Prisma.sql`
        SELECT m."id" FROM "MovimientoStock" m
        WHERE m."localId" = 1 AND m."dia" BETWEEN ${ANIO.desde}::date AND ${ANIO.hasta}::date
        ORDER BY m."instante", m."id" LIMIT 50 OFFSET 1000`;
      const x = await explicar(v, ingenua);
      ok(`CONTRAPRUEBA: ordenada solo por (instante, id) lee ${x.filasLeidas.toLocaleString("es-AR")} filas (más que el tope)`, x.filasLeidas > TOPE_PAGINA);
      const ids = (filas) => filas.map((f) => Number(f.id)).join(",");
      ok("y las dos devuelven exactamente las mismas filas, en el mismo orden", ids(await v.$queryRaw`${pagina}`) === ids(await v.$queryRaw`${ingenua}`));

      const cadena = await explicar(v, server.sqlMovimientosPagina({ localId: 1, productoLocalId: 1, ...ANIO, limite: 50, desplazamiento: 0 }));
      ok(
        `la página de UNA cadena baja por el índice nuevo y lee ${cadena.filasLeidas} filas`,
        cadena.indices.includes(INDICE) && cadena.filasLeidas <= 50,
        json(cadena.indices)
      );
    }

    // Los resultados con y sin el índice tienen que ser IGUALES: el índice cambia
    // la velocidad, no la respuesta.
    const resultadoCon = json(await server.stockDiarioDelLocal(v, { localId: 1, dia: DIA, hoy: "2027-09-30" }));

    await v.$executeRawUnsafe(`DROP INDEX "${INDICE}"`);
    const sin = await explicar(v, sql);
    ok(
      `CONTRAPRUEBA sin el índice: lee ${sin.filasLeidas.toLocaleString("es-AR")} filas (más que el tope) — ${sin.ms.toFixed(1)} ms`,
      sin.filasLeidas > TOPE && !sin.indices.includes(INDICE),
      json(sin.indices)
    );
    ok("y la respuesta es la misma con y sin índice", json(await server.stockDiarioDelLocal(v, { localId: 1, dia: DIA, hoy: "2027-09-30" })) === resultadoCon);
  }
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err}`);
  console.error(err);
} finally {
  for (const x of clientes) await x.$disconnect().catch(() => {});
  await borrarBases();
  await principal.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  for (const f of fallas) console.log(`  ✗ ${f.split("\n")[0]}`);
  process.exit(1);
}
