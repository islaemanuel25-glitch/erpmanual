// PRUEBA DE BASE DE LA API DEL STOCK DIARIO.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/stockDiarioApi.mjs
//
// Llama a los HANDLERS reales de `app/api/stock_locales/diario/` —resumen,
// productos, producto, movimientos— con sesiones firmadas como las firma el
// login, contra una base descartable con un libro de verdad. Ni los candados ni
// el build pueden ver esto: el alcance lo decide `resolveVistaOperativa` leyendo
// grupos en la base, y las consultas las valida PostgreSQL.
//
//   A. EL AISLAMIENTO: los diez casos del contrato —encargado, cajero, admin en
//      vista global con y sin ubicación, depósito, un `localId` manipulado, un
//      producto eliminado mirado desde otra ubicación—, en las cuatro rutas.
//   B. LOS ESTADOS DEL PERÍODO: fuera de historia, el punto cero parcial, el
//      primer día completo, el día en curso, un día sin movimientos.
//   C. LOS CASOS DE UNA CADENA: CAMBIO, ALTA, BAJA, borrar y recrear, cero
//      existente, tránsito, SIN_ORIGEN, reinterpretación, producto eliminado, el
//      mismo milisegundo, Decimal pasado a número y null.
//   D. LOS PERÍODOS: semana de Semana Operativa con su vigencia, mes, año, rango
//      propio y el recorte a hoy.
//   E. LA PAGINACIÓN Y LOS FILTROS: páginas estables, `q`, categoría, filtros.
//   F. LOS ERRORES: 400 con texto nuestro y sin nada de la base.
//   G. SOLO LECTURA: después de todas las llamadas, cada tabla tiene las mismas
//      filas que antes.
//
// ── CÓMO SE CONSIGUEN DÍAS DISTINTOS ───────────────────────────────────────
//
// Como en la prueba del motor (`lib/libroEnElTiempo.mjs`): escrituras de verdad
// sobre StockLocal y después reubicadas en el tiempo. Pero acá el "hoy" NO se
// inyecta —las rutas no lo aceptan—: es el de PostgreSQL, y el guion se arma
// hacia atrás desde ese día. El punto cero cae seis días antes de hoy y un
// último CAMBIO se escribe en vivo, hoy.
//
// ── DÓNDE CORRE ────────────────────────────────────────────────────────────
//
// Una base `erpazul_sda_prueba_api` al lado de la de DATABASE_URL, borrada al
// terminar pase lo que pase. El cliente de la app (`@/lib/prisma`) se construye
// recién después de apuntar DATABASE_URL a esa base: por eso las rutas se
// importan tarde.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const jwt = (await import("jsonwebtoken")).default;
const { MIGRACION_LIBRO, aplicarMigraciones, aplicarLibroEnAdelante, AR, uno, guion } = await import("./lib/libroEnElTiempo.mjs");
const { sumarDias, diaDeLaSemana } = await import("../../lib/transferencias/periodoDePago.js");
const { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");
const {
  ESTADO_DEL_DIA,
  EXISTENCIA,
  MOTIVO_DESCONOCIDA,
  FUENTE_IDENTIDAD,
  TEXTO_SIN_ORIGEN,
  UNIDAD_DE_PERIODO,
} = await import("../../lib/stock/libro/stockDiario.js");

const PREFIJO = "erpazul_sda_prueba_";
const principal = await crearClientePrisma({ nivel: ESCRITURA });

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

// ════════════════════════════════════════════════════════════════════════════
// La base descartable
// ════════════════════════════════════════════════════════════════════════════

const NOMBRE = `${PREFIJO}api`;
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();
let c = null;

async function crearBase() {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
}

/**
 * Siembra una base SIN libro. Dos grupos: el G1 con los locales A y B y el
 * depósito D; el G2 con el local X, que nadie del G1 tiene que poder ver.
 */
async function sembrar(c) {
  const grupo = async (n) => (await uno(c, `INSERT INTO "Grupo" ("nombre","updatedAt") VALUES ('${n}', now()) RETURNING "id"`)).id;
  const G = { uno: await grupo("API stock diario G1"), dos: await grupo("API stock diario G2") };
  const local = async (n, deposito = false) =>
    (await uno(c, `INSERT INTO "Local" ("nombre","es_deposito","updatedAt") VALUES ('${n}', ${deposito}, now()) RETURNING "id"`)).id;
  const L = { A: await local("API A"), B: await local("API B"), D: await local("API Depósito", true), X: await local("API X ajeno") };
  for (const [g, l] of [[G.uno, L.A], [G.uno, L.B], [G.dos, L.X]]) {
    await c.$executeRawUnsafe(`INSERT INTO "GrupoLocal" ("grupoId","localId","updatedAt") VALUES (${g}, ${l}, now())`);
  }
  await c.$executeRawUnsafe(`INSERT INTO "GrupoDeposito" ("grupoId","localId","updatedAt") VALUES (${G.uno}, ${L.D}, now())`);

  const cat = (await uno(c, `INSERT INTO "Categoria" ("nombre","updatedAt") VALUES ('API Bebidas', now()) RETURNING "id"`)).id;
  const base = async (grupoId, nombre, codigo, categoria = null) =>
    (
      await uno(
        c,
        `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","precio_costo","precio_venta","categoria_id","updatedAt")
         VALUES (${grupoId}, '${nombre}', '${codigo}', 'unidad', 1, 2, ${categoria ?? "NULL"}, now()) RETURNING "id"`
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
  P.uno = await enLocal(L.A, await base(G.uno, "Uno", "API-UNO", cat), 20);
  P.cero = await enLocal(L.A, await base(G.uno, "Cero", "API-CERO", cat), 0);
  P.nace = await enLocal(L.A, await base(G.uno, "Nace", "API-NACE"));
  P.muere = await enLocal(L.A, await base(G.uno, "Muere", "API-MUERE"), 5);
  P.renace = await enLocal(L.A, await base(G.uno, "Renace", "API-RENACE"), 9);
  P.transito = await enLocal(L.A, await base(G.uno, "Transito", "API-TRANSITO"), 3, 0);
  P.reinterpreta = await enLocal(L.A, await base(G.uno, "Reinterpreta", "API-REINT"), 10);
  P.eliminado = await enLocal(L.A, await base(G.uno, "Eliminado", "API-ELIM", cat), 6);
  P.origen = await enLocal(L.A, await base(G.uno, "Origen", "API-ORIGEN"), 50);
  P.gemelo = await enLocal(L.A, await base(G.uno, "Gemelo", "API-GEMELO"), 30);
  // Treinta con tilde en el nombre, para la búsqueda sin tildes y las páginas.
  P.relleno = [];
  for (let i = 1; i <= 30; i++) {
    P.relleno.push(await enLocal(L.A, await base(G.uno, `Azúcar ${String(i).padStart(2, "0")}`, `API-AZ-${i}`), i));
  }
  P.enB = await enLocal(L.B, await base(G.uno, "Solo en B", "API-B"), 11);
  P.enD = await enLocal(L.D, await base(G.uno, "Bulto del depósito", "API-D"), 100);
  P.enX = await enLocal(L.X, await base(G.dos, "Secreto de X", "API-X"), 3);
  return { G, L, P, cat };
}

// Las sesiones, con la forma EXACTA del payload de `app/api/login/route.js`.
const sesion = ({ id, localId, permisos, esDeposito = false }) =>
  jwt.sign(
    { id, nombre: `API ${id}`, email: `api-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  );

try {
  // ══════════════════════════════════════════════════════════════════════════
  seccion("Base: migraciones, siembra, libro, escrituras reales");
  // ══════════════════════════════════════════════════════════════════════════
  await crearBase();
  aplicarMigraciones(urlPrueba, { hasta: MIGRACION_LIBRO });
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });
  const { G, L, P, cat } = await sembrar(c);
  aplicarLibroEnAdelante(urlPrueba);

  // El cliente de la app se construye al importarse: recién ahora, contra la
  // base descartable. Todo lo que arrastra `@/lib/prisma` se importa después.
  process.env.DATABASE_URL = urlPrueba;
  const server = await import("../../lib/stock/libro/stockDiarioServer.js");
  const { declararOrigenDeStock } = await import("../../lib/stock/libro/libroStock.js");
  const { verificarLibroStock, informeDelLibro } = await import("../../lib/stock/libro/verificador.js");
  const { programarSemanaOperativa } = await import("../../lib/semanaOperativa/semanaOperativaServer.js");
  const rutas = {
    resumen: (await import("../../app/api/stock_locales/diario/resumen/route.js")).GET,
    productos: (await import("../../app/api/stock_locales/diario/productos/route.js")).GET,
    producto: (await import("../../app/api/stock_locales/diario/producto/route.js")).GET,
    movimientos: (await import("../../app/api/stock_locales/diario/movimientos/route.js")).GET,
    transferencias: (await import("../../app/api/stock_locales/diario/transferencias/route.js")).GET,
  };

  // Hoy según PostgreSQL, y el guion hacia atrás.
  const H = await server.hoyDelLibro(c);
  const D = (n) => sumarDias(H, n);
  const PC = D(-6);
  const g = guion(c);
  await g.puntoCero(`${PC} 21:19:13.587`);
  const upd = (id, set) => c.$executeRawUnsafe(`UPDATE "StockLocal" SET ${set}, "updatedAt" = now() WHERE "id" = ${id}`);

  await g.paso(`${PC} 22:00:00`, () => upd(P.uno.sl, `"cantidad" = 18`));
  await g.paso(`${D(-5)} 09:00:00`, () => upd(P.transito.sl, `"enTransito" = 2.5`));
  const mismoMs = await g.paso(`${D(-5)} 09:30:00.123`, async () => {
    await upd(P.gemelo.sl, `"cantidad" = 29`);
    await upd(P.gemelo.sl, `"cantidad" = 28`);
  });
  await g.paso(`${D(-5)} 10:00:00`, () => upd(P.uno.sl, `"cantidad" = 15`));
  await g.paso(`${D(-5)} 11:00:00`, async () => {
    await upd(P.enD.sl, `"cantidad" = 90`);
    await upd(P.enX.sl, `"cantidad" = 2`);
  });
  await g.paso(`${D(-5)} 12:00:00`, async () => {
    P.nace.sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${L.A}, ${P.nace.pl}, 7, now()) RETURNING "id"`)).id;
  });
  await g.paso(`${D(-5)} 15:00:00`, () => c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${P.muere.sl}`));
  await g.paso(`${D(-5)} 16:00:00`, () =>
    c.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${P.eliminado.sl}`);
      await tx.$executeRawUnsafe(`DELETE FROM "ProductoLocal" WHERE "id" = ${P.eliminado.pl}`);
      await tx.$executeRawUnsafe(`DELETE FROM "ProductoBase" WHERE "id" = ${P.eliminado.base}`);
    })
  );
  await g.paso(`${D(-5)} 20:00:00`, () => upd(P.transito.sl, `"cantidad" = 5.5, "enTransito" = 0`));
  await g.paso(`${D(-4)} 10:00:00`, () => upd(P.enB.sl, `"cantidad" = 12`));
  await g.paso(`${D(-4)} 11:00:00.000`, () => c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${P.renace.sl}`));
  await g.paso(`${D(-4)} 11:00:00.500`, async () => {
    P.renace.sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${L.A}, ${P.renace.pl}, 4, now()) RETURNING "id"`)).id;
  });
  await g.paso(`${D(-4)} 13:00:00`, () =>
    c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "unidad_medida" = 'kg', "pesoReferenciaKg" = 2.5 WHERE "id" = ${P.reinterpreta.base}`)
  );
  await g.paso(`${D(-3)} 10:00:00`, async () => {
    await c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: "VENTA", referencia: 123 });
      await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = 47 WHERE "id" = ${P.origen.sl}`);
    });
    await upd(P.origen.sl, `"cantidad" = 45`);
  });
  // Un tránsito que se abre y QUEDA abierto: el conteo de productos en tránsito
  // mira el final del período, y sin una cadena así sería cero siempre. Con
  // origen declarado, para no sumarle un "sin clasificar" al día del Origen.
  await g.paso(`${D(-3)} 12:00:00`, () =>
    c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: "VENTA", referencia: 124 });
      await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "enTransito" = 3, "updatedAt" = now() WHERE "id" = ${P.relleno[2].sl}`);
    })
  );
  // D(-2) y D(-1): ningún movimiento en A.
  await g.reubicar();
  // Y uno en vivo, con el reloj real: el día en curso.
  await upd(P.uno.sl, `"cantidad" = 13`);
  // Y un tránsito en vivo: al AHORA del día en curso hay dos productos en tránsito.
  await c.$transaction(async (tx) => {
    await declararOrigenDeStock(tx, { origen: "VENTA", referencia: 125 });
    await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "enTransito" = 4, "updatedAt" = now() WHERE "id" = ${P.relleno[1].sl}`);
  });

  await c.$transaction((tx) => programarSemanaOperativa(tx, { localId: L.A, diaDeCorte: 1, hoy: H }));

  ok("dos CAMBIO en el mismo paso: dos movimientos", mismoMs === 2);
  {
    const v = await verificarLibroStock(c);
    ok("el verificador del libro, sobre la base reubicada: integridad VERDE", v.integridad.ok, informeDelLibro(v).split("\n").filter((l) => l.includes("✗")).join(" | "));
    const pc = await server.puntoCeroDelLibro(c);
    ok(`el punto cero sale del libro: día ${PC}, seis antes de hoy (${H})`, pc?.dia === PC && pc.conEstadoInicial, json(pc));
  }

  // ── Cómo se llama a una ruta ──────────────────────────────────────────────
  const S = {
    encargadoA: sesion({ id: 101, localId: L.A, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] }),
    encargadoB: sesion({ id: 102, localId: L.B, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] }),
    cajeroA: sesion({ id: 103, localId: L.A, permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO] }),
    deposito: sesion({ id: 104, localId: L.D, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO], esDeposito: true }),
    admin: sesion({ id: 105, localId: null, permisos: ["*"] }),
  };
  const cookieAdminGlobal = (grupoId) =>
    `erpazul_sesion=${S.admin}; erpazul_grupo_activo=${grupoId}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ global: true }))}`;
  const llamar = async (ruta, params, cookie) => {
    const qs = new URLSearchParams(params).toString();
    const req = new Request(`http://ci.local/api/stock_locales/diario/${ruta}${qs ? `?${qs}` : ""}`, { headers: cookie ? { cookie } : {} });
    const r = await rutas[ruta](req);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const como = (s) => `erpazul_sesion=${s}`;
  const RUTAS = ["resumen", "productos", "producto", "movimientos", "transferencias"];
  // `producto` exige la cadena: se le pasa una de A en todas las llamadas de alcance.
  const conCadena = (ruta, params) => (ruta === "producto" ? { productoLocalId: P.uno.pl, ...params } : params);

  // Todo lo que sigue es lectura. La prueba: la huella de CADA tabla —el md5 de
  // todas sus filas CON su `xmin`— antes y después. El `xmin` es la transacción
  // que escribió esa versión de la fila: un UPDATE que deja los mismos valores
  // igual lo cambia. No se mide con ids de transacción sueltos: el autoanalyze
  // de una base recién sembrada escribe `pg_statistic` y los consume.
  const huella = async () =>
    (
      await c.$queryRaw`
        SELECT table_name AS "tabla",
               (xpath('/row/h/text()', query_to_xml(format(
                 'SELECT md5(coalesce(string_agg(t.xmin::text || %L || t::text, %L ORDER BY t::text), %L)) AS h FROM %I.%I t',
                 ':', ',', '', table_schema, table_name
               ), false, true, '')))[1]::text AS "h"
        FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    )
      .map((f) => `${f.tabla}:${f.h}`)
      .join("\n");
  const huellaAntes = await huella();

  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. Aislamiento: quién ve qué");
  // ══════════════════════════════════════════════════════════════════════════
  for (const ruta of RUTAS) {
    const r1 = await llamar(ruta, conCadena(ruta, {}), como(S.encargadoA));
    ok(`1 [${ruta}] el ENCARGADO con stock.ver ve su local: 200, local A`, r1.status === 200 && r1.local?.id === L.A, json({ s: r1.status, e: r1.error }));
    const r2 = await llamar(ruta, conCadena(ruta, { localId: L.B }), como(S.encargadoA));
    ok(`2 [${ruta}] el ENCARGADO pidiendo otro local: 403 "Local fuera de tu alcance."`, r2.status === 403 && r2.error === "Local fuera de tu alcance." && r2.local === undefined, json(r2));
    const r3 = await llamar(ruta, conCadena(ruta, {}), como(S.cajeroA));
    ok(`3 [${ruta}] el CAJERO sin stock.ver: 403, sin datos`, r3.status === 403 && /Sin permiso/.test(r3.error) && r3.local === undefined, json(r3));
    const r4 = await llamar(ruta, conCadena(ruta, {}), cookieAdminGlobal(G.uno));
    ok(`4 [${ruta}] admin en vista GLOBAL sin localId: 400, no suma locales`, r4.status === 400 && /falta localId/.test(r4.error) && r4.totales === undefined, json(r4));
    const r5 = await llamar(ruta, conCadena(ruta, { localId: L.A }), cookieAdminGlobal(G.uno));
    ok(`5 [${ruta}] admin GLOBAL con un local de su grupo: 200, ese local`, r5.status === 200 && r5.local?.id === L.A, json({ s: r5.status, e: r5.error }));
    const r6 = await llamar(ruta, conCadena(ruta, { localId: L.X }), cookieAdminGlobal(G.uno));
    ok(`6 [${ruta}] admin GLOBAL con un local de OTRO grupo: 403`, r6.status === 403 && r6.error === "Local fuera de tu alcance.", json(r6));
    const r7 = await llamar(ruta, ruta === "producto" ? { productoLocalId: P.enD.pl } : {}, como(S.deposito));
    ok(`7 [${ruta}] el depósito ve el suyo: 200, depósito D`, r7.status === 200 && r7.local?.id === L.D && r7.local.esDeposito === true, json({ s: r7.status, e: r7.error }));
    const r8 = await llamar(ruta, conCadena(ruta, { localId: L.A }), como(S.deposito));
    ok(`8 [${ruta}] el depósito pidiendo un local de su grupo: 403`, r8.status === 403 && r8.error === "Local fuera de tu alcance.", json(r8));
  }
  {
    // 9. Manipular la URL no agranda el alcance.
    const mismo = await llamar("resumen", { localId: L.A }, como(S.encargadoA));
    ok("9 pedir el PROPIO localId explícito da lo mismo que no pedirlo", mismo.status === 200 && mismo.local.id === L.A);
    const ajeno = await llamar("resumen", { localId: L.X }, como(S.encargadoA));
    ok("9 un localId de otro grupo: 403", ajeno.status === 403);
    const basura = await llamar("resumen", { localId: "1 OR 1=1" }, como(S.encargadoA));
    ok("9 un localId que no es número: 400, sin datos", basura.status === 400 && basura.local === undefined, json(basura));
    const falso = jwt.sign({ id: 999, localId: L.X, permisos: ["*"] }, "otro-secreto", { expiresIn: "1h" });
    const firmado = await llamar("resumen", {}, como(falso));
    ok("9 una sesión firmada con otro secreto: 401", firmado.status === 401, json(firmado));
    const sinSesion = await llamar("resumen", {}, null);
    ok("9 sin sesión: 401", sinSesion.status === 401);
    const sinGrupo = await llamar("resumen", { localId: L.A }, `erpazul_sesion=${S.admin}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ global: true }))}`);
    ok("9 admin en vista global SIN grupo activo: 409, pide contexto", sinGrupo.status === 409 && sinGrupo.needsContexto === true, json(sinGrupo));
    const otroGrupo = await llamar("resumen", { localId: L.A }, cookieAdminGlobal(G.dos));
    ok("9 admin con el grupo G2 activo no ve un local del G1: 403", otroGrupo.status === 403);
    // Una cadena de otra ubicación, pedida desde la propia: no se encuentra.
    const cadenaAjena = await llamar("producto", { productoLocalId: P.enX.pl, fecha: D(-5) }, como(S.encargadoA));
    ok(
      "9 una cadena de X pedida desde A: 200 vacío, sin nombre, sin código, sin movimientos",
      cadenaAjena.status === 200 && cadenaAjena.producto.nombre === null && cadenaAjena.producto.codigo === null && cadenaAjena.producto.existio === false &&
        cadenaAjena.movimientos.total === 0 && !JSON.stringify(cadenaAjena).includes("Secreto de X"),
      json(cadenaAjena.producto)
    );
    const movAjenos = await llamar("movimientos", { productoLocalId: P.enX.pl, desde: PC, hasta: H }, como(S.encargadoA));
    ok("9 los movimientos de esa cadena ajena, desde A: ninguno", movAjenos.status === 200 && movAjenos.movimientos.total === 0);
    const listaA = await llamar("productos", { desde: PC, hasta: H, pageSize: 200 }, como(S.encargadoA));
    ok(
      "9 el listado de A no trae nada de B, D ni X",
      listaA.status === 200 && !listaA.items.some((i) => [P.enB.pl, P.enD.pl, P.enX.pl].includes(i.productoLocalId)),
      `${listaA.total}`
    );
  }
  {
    // 10. El producto eliminado se consulta en su historia, y solo desde su local.
    const desdeA = await llamar("producto", { productoLocalId: P.eliminado.pl, fecha: D(-5) }, como(S.encargadoA));
    ok(
      "10 el eliminado, desde A: identidad congelada en la BAJA, productoEliminado, desaparece con 6",
      desdeA.status === 200 && desdeA.producto.fuente === FUENTE_IDENTIDAD.CONGELADA_EN_BAJA && desdeA.producto.nombre === "Eliminado" &&
        desdeA.producto.codigo === "API-ELIM" && desdeA.producto.productoEliminado === true && desdeA.producto.categoriaActualId === null &&
        desdeA.producto.cantidad.desapareceCon === 6,
      json(desdeA.producto)
    );
    const desdeB = await llamar("producto", { productoLocalId: P.eliminado.pl, fecha: D(-5) }, como(S.encargadoB));
    ok(
      "10 el mismo eliminado, desde B: nada, ni el nombre congelado",
      desdeB.status === 200 && desdeB.producto.nombre === null && desdeB.producto.existio === false &&
        !JSON.stringify(desdeB).includes('"Eliminado"') && !JSON.stringify(desdeB).includes("API-ELIM"),
      json(desdeB.producto)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. Los estados del período");
  // ══════════════════════════════════════════════════════════════════════════
  const resumenDe = (params) => llamar("resumen", params, como(S.encargadoA));
  const productosDe = (params) => llamar("productos", { pageSize: 200, ...params }, como(S.encargadoA));
  const item = (lista, p) => lista.items.find((i) => i.productoLocalId === p.pl);
  {
    const f = await resumenDe({ fecha: D(-7) });
    ok(
      "FUERA_DE_HISTORIA el día antes del punto cero: totales y conteos en null, no en cero",
      f.status === 200 && f.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA && f.totales === null && f.conteos === null && f.desdeEfectivo === null,
      json(f)
    );
    const fp = await productosDe({ fecha: D(-7) });
    const fm = await llamar("movimientos", { fecha: D(-7) }, como(S.encargadoA));
    ok("y fuera de historia no hay productos ni movimientos", fp.total === 0 && fp.items.length === 0 && fm.movimientos.total === 0);

    const p = await resumenDe({ fecha: PC });
    ok(
      "PARCIAL_PUNTO_CERO el día del punto cero: la apertura total es null con todas desconocidas",
      p.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO && p.parcial === true && p.totales.cantidad.apertura === null &&
        p.totales.cantidad.aperturaDetalle.desconocidas === p.conteos.productos && p.totales.enTransito.apertura === null && p.puntoCero.dia === PC,
      json({ e: p.estado, t: p.totales?.cantidad })
    );
    const pp = await productosDe({ fecha: PC });
    const u = item(pp, P.uno);
    ok(
      "y la apertura de una cadena: DESCONOCIDA con SIN_APERTURA_HISTORICA, cantidad null (no cero); cierra en 18",
      u.apertura.existencia === EXISTENCIA.DESCONOCIDA && u.apertura.motivo === MOTIVO_DESCONOCIDA.SIN_APERTURA_HISTORICA && u.apertura.cantidad === null &&
        u.apertura.enTransito === null && u.cierre.existencia === EXISTENCIA.EXISTE && u.cierre.cantidad === 18,
      json(u)
    );

    const k = await resumenDe({ fecha: D(-5) });
    ok(
      "COMPLETO el primer día después del punto cero, con totales de apertura conocidos",
      k.estado === ESTADO_DEL_DIA.COMPLETO && k.parcial === false && k.enCurso === false && typeof k.totales.cantidad.apertura === "number",
      json({ e: k.estado, a: k.totales?.cantidad.apertura })
    );

    const hoy = await resumenDe({});
    const hp = await productosDe({});
    const uh = item(hp, P.uno);
    ok(
      "sin fecha, hoy según PostgreSQL: EN_CURSO, y el CAMBIO en vivo cierra en 13, provisional",
      hoy.estado === ESTADO_DEL_DIA.EN_CURSO && hoy.enCurso === true && hoy.hoy === H && hoy.periodo.fecha === H &&
        uh.cierre.cantidad === 13 && uh.cierre.provisional === true && uh.apertura.cantidad === 15,
      json({ e: hoy.estado, h: hoy.hoy, u: uh?.cierre })
    );

    const sin = await resumenDe({ fecha: D(-2) });
    ok(
      "un día SIN movimientos: completo, los productos se listan, cero movimientos y el cierre igual a la apertura",
      sin.estado === ESTADO_DEL_DIA.COMPLETO && sin.conteos.productos > 0 && sin.conteos.conMovimientos === 0 && sin.totales.movimientos === 0 &&
        sin.totales.cantidad.apertura === sin.totales.cantidad.cierre && sin.totales.cantidad.cambioNeto === 0,
      json({ c: sin.conteos, t: sin.totales?.cantidad })
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B.bis Lo que pide la pantalla: movimientos de entrada y salida, productos en tránsito");
  // ══════════════════════════════════════════════════════════════════════════
  {
    // Contado en la base, aparte del motor: CAMBIO por la dirección, en A.
    const enLaBase = async (desde, hasta, col) =>
      (
        await c.$queryRawUnsafe(
          `SELECT count(*) FILTER (WHERE "${col}Posterior" > "${col}Anterior")::int AS "e", count(*) FILTER (WHERE "${col}Posterior" < "${col}Anterior")::int AS "s"
             FROM "MovimientoStock" WHERE "localId" = ${L.A} AND "tipo"::text = 'CAMBIO' AND "dia" BETWEEN '${desde}'::date AND '${hasta}'::date`
        )
      )[0];
    const listaDe = async (params) => (await productosDe(params)).items;
    const sumaDe = (items, lado, campo) => items.reduce((n, i) => n + (i[lado]?.[campo] ?? 0), 0);

    const d5 = await resumenDe({ fecha: D(-5) });
    const b5 = await enLaBase(D(-5), D(-5), "cantidad");
    const bt5 = await enLaBase(D(-5), D(-5), "enTransito");
    ok(
      "COMPLETO: 1 movimiento de entrada y 3 de salida de cantidad —conteos, no cantidades—, los mismos que cuenta la base",
      d5.totales.cantidad.movimientosDeEntrada === 1 && d5.totales.cantidad.movimientosDeSalida === 3 &&
        b5.e === 1 && b5.s === 3 && d5.totales.cantidad.entradas === 2.5,
      json({ t: d5.totales.cantidad, base: b5 })
    );
    ok(
      "y el tránsito se cuenta aparte: entró una vez y salió una vez",
      d5.totales.enTransito.movimientosDeEntrada === bt5.e && d5.totales.enTransito.movimientosDeSalida === bt5.s && bt5.e === 1 && bt5.s === 1,
      json({ t: d5.totales.enTransito, base: bt5 })
    );
    const items5 = await listaDe({ fecha: D(-5) });
    ok(
      "el resumen y el listado cuentan igual: la suma de las filas es el total",
      sumaDe(items5, "cantidad", "movimientosDeEntrada") === 1 && sumaDe(items5, "cantidad", "movimientosDeSalida") === 3,
      json(items5.map((i) => [i.productoLocalId, i.cantidad?.movimientosDeEntrada, i.cantidad?.movimientosDeSalida]))
    );
    const det = await llamar("producto", { productoLocalId: P.gemelo.pl, fecha: D(-5) }, como(S.encargadoA));
    ok("y el detalle de una cadena cuenta igual que su fila: Gemelo, dos salidas", det.producto.cantidad.movimientosDeSalida === 2 && item({ items: items5 }, P.gemelo).cantidad.movimientosDeSalida === 2);
    ok(
      "movió tránsito y lo cerró en cero: NO es un producto en tránsito",
      d5.conteos.conTransitoAlCierre === 0,
      json(d5.conteos)
    );

    const d3 = await resumenDe({ fecha: D(-3) });
    ok(
      "el sin clasificar no se inventa entrada ni salida: el día del Origen tiene 2 salidas (una VENTA, una sin origen) y 1 sin clasificar",
      d3.totales.cantidad.movimientosDeEntrada === 0 && d3.totales.cantidad.movimientosDeSalida === 2 && d3.totales.movimientosSinClasificar === 1,
      json({ t: d3.totales.cantidad, s: d3.totales.movimientosSinClasificar })
    );
    ok("COMPLETO: el tránsito que se abrió ese día y quedó abierto cuenta al cierre", d3.conteos.conTransitoAlCierre === 1, json(d3.conteos));
    const d2 = await resumenDe({ fecha: D(-2) });
    ok("un día sin movimientos que TERMINA con tránsito lo cuenta: es el estado al final, no lo que se movió", d2.conteos.conTransitoAlCierre === 1 && d2.totales.movimientos === 0, json(d2.conteos));

    const ahora = await resumenDe({});
    ok(
      "EN_CURSO: los productos en tránsito AHORA son dos, y la salida en vivo se cuenta",
      ahora.estado === ESTADO_DEL_DIA.EN_CURSO && ahora.conteos.conTransitoAlCierre === 2 && ahora.totales.cantidad.movimientosDeSalida >= 1,
      json({ c: ahora.conteos, t: ahora.totales.cantidad })
    );
    const itemsAhora = await listaDe({});
    ok(
      "y son los mismos que el listado muestra con tránsito en su 'Ahora'",
      itemsAhora.filter((i) => i.cierre.existencia === EXISTENCIA.EXISTE && i.cierre.enTransito > 0).length === 2,
      json(itemsAhora.filter((i) => i.cierre.enTransito > 0).map((i) => i.nombre))
    );

    const parcial = await resumenDe({ fecha: PC });
    ok(
      "PARCIAL: el cierre se conoce, así que los conteos también; la apertura sigue siendo null",
      parcial.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO && parcial.conteos.conTransitoAlCierre === 0 &&
        typeof parcial.totales.cantidad.movimientosDeEntrada === "number" && parcial.totales.cantidad.apertura === null,
      json({ c: parcial.conteos, t: parcial.totales.cantidad })
    );
    const fuera = await resumenDe({ fecha: D(-7) });
    ok("FUERA_DE_HISTORIA: ni conteos ni totales, null y no cero", fuera.conteos === null && fuera.totales === null, json(fuera));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. Los casos de una cadena, por la API");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const dia = await productosDe({ fecha: D(-5) });
    const u = item(dia, P.uno);
    ok("CAMBIO: abre en 18, sale 3, cierra en 15, y cuadra", u.apertura.cantidad === 18 && u.cantidad.salidas === 3 && u.cierre.cantidad === 15 && u.cuadra.cantidad, json(u));
    const n = item(dia, P.nace);
    ok(
      "ALTA: apertura NO_EXISTE con cantidad null, aparece con 7, cierra EXISTE 7",
      n.apertura.existencia === EXISTENCIA.NO_EXISTE && n.apertura.cantidad === null && n.cantidad.apareceCon === 7 && n.cierre.cantidad === 7,
      json(n)
    );
    const m = item(dia, P.muere);
    ok(
      "BAJA: abre 5, desaparece con 5, cierre NO_EXISTE con null (no cero)",
      m.apertura.cantidad === 5 && m.cantidad.desapareceCon === 5 && m.cierre.existencia === EXISTENCIA.NO_EXISTE && m.cierre.cantidad === null,
      json(m)
    );
    const z = item(dia, P.cero);
    ok("cantidad 0 EXISTENTE: se lista, abre y cierra EXISTE con 0 (un número, no null)", z && z.apertura.cantidad === 0 && z.cierre.existencia === EXISTENCIA.EXISTE && z.cierre.cantidad === 0, json(z));
    const t = item(dia, P.transito);
    ok(
      "tránsito separado de la cantidad: el tránsito entra 2,5 y sale 2,5; la cantidad entra 2,5; cierra 5,5 / 0",
      t.enTransito.entradas === 2.5 && t.enTransito.salidas === 2.5 && t.cantidad.entradas === 2.5 && t.cierre.cantidad === 5.5 && t.cierre.enTransito === 0 && t.cuadra.enTransito,
      json(t)
    );
    ok(
      "Decimal → número de JS, y lo que no se sabe → null",
      typeof t.cierre.cantidad === "number" && typeof t.cierre.enTransito === "number" && n.apertura.enTransito === null,
      json(t.cierre)
    );
    const res = await resumenDe({ fecha: D(-5) });
    ok("el resumen separa cantidad y tránsito", res.totales.enTransito.entradas === 2.5 && res.totales.cantidad.apareceCon === 7 && res.totales.cantidad.desapareceCon === 11);

    const r = await productosDe({ fecha: D(-4) });
    const rn = item(r, P.renace);
    ok("borrar y recrear el mismo día: una sola cadena, desaparece con 9, aparece con 4, cierra en 4", rn.cantidad.desapareceCon === 9 && rn.cantidad.apareceCon === 4 && rn.cierre.cantidad === 4, json(rn));

    const det = await llamar("producto", { productoLocalId: P.reinterpreta.pl, fecha: D(-4) }, como(S.encargadoA));
    ok(
      "reinterpretación: el detalle las trae una por una (campo, anterior, nuevo, día), sin convertir la cantidad",
      det.producto.reinterpretada === true && det.producto.reinterpretaciones.some((x) => x.valorAnterior === "unidad" && x.valorNuevo === "kg" && x.dia === D(-4) && x.campo) &&
        det.producto.cierre.cantidad === 10,
      json(det.producto.reinterpretaciones)
    );
    const resR = await resumenDe({ fecha: D(-4) });
    ok("y el resumen solo las cuenta", resR.conteos.reinterpretados >= 1 && resR.reinterpretaciones === undefined && JSON.stringify(resR).indexOf("valorNuevo") === -1);
    const lr = item(r, P.reinterpreta);
    ok("en el listado, cuántas y no cuáles", typeof lr.reinterpretaciones === "number" && lr.reinterpretaciones >= 1);

    const o = await llamar("movimientos", { productoLocalId: P.origen.pl, fecha: D(-3) }, como(S.encargadoA));
    const [venta, sinOrigen] = o.movimientos.items;
    ok(
      "SIN_ORIGEN se muestra como \"sin clasificar\" y no cambia ningún número",
      o.movimientos.total === 2 && venta.origen === "VENTA" && venta.sinClasificar === false && sinOrigen.sinClasificar === true &&
        sinOrigen.clasificacion === TEXTO_SIN_ORIGEN && sinOrigen.cantidad.delta === -2,
      json(o.movimientos.items)
    );
    const oc = item(await productosDe({ fecha: D(-3) }), P.origen);
    const resO = await resumenDe({ fecha: D(-3) });
    ok(
      "y se cuenta: la cadena tiene 1 sin clasificar, el resumen también, y la cadena igual cuadra 50 → 45",
      oc.sinClasificar === 1 && resO.conteos.sinClasificar === 1 && resO.totales.movimientosSinClasificar === 1 && oc.cuadra.cantidad && oc.cierre.cantidad === 45,
      json({ oc: oc.sinClasificar, r: resO.conteos })
    );

    const gm = await llamar("movimientos", { productoLocalId: P.gemelo.pl, fecha: D(-5) }, como(S.encargadoA));
    const [a1, a2] = gm.movimientos.items;
    ok(
      "el mismo milisegundo: los dos movimientos, en orden de id, 30 → 29 → 28",
      gm.movimientos.total === 2 && a1.instante === a2.instante && a1.id < a2.id && a1.cantidad.posterior === 29 && a2.cantidad.posterior === 28,
      json(gm.movimientos.items.map((x) => [x.id, x.instante, x.cantidad]))
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("D. Los períodos");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const F = D(-5);
    const lunes = sumarDias(F, -((diaDeLaSemana(F) + 6) % 7));
    const s = await resumenDe({ unidad: "SEMANA", fecha: F });
    ok(
      `SEMANA con la vigencia de Semana Operativa (corte lunes): ${lunes} a ${sumarDias(lunes, 6)}, configurada`,
      s.status === 200 && s.periodo.unidad === UNIDAD_DE_PERIODO.SEMANA && s.periodo.desde === lunes && s.periodo.hasta === sumarDias(lunes, 6) && s.periodo.semana?.configurada === true,
      json(s.periodo)
    );
    const domingo = sumarDias(F, -diaDeLaSemana(F));
    const sb = await llamar("resumen", { unidad: "semana", fecha: F }, como(S.encargadoB));
    ok(
      "una ubicación sin semana configurada usa el domingo y lo dice (y la unidad no distingue mayúsculas)",
      sb.status === 200 && sb.periodo.desde === domingo && sb.periodo.semana?.sinConfigurar === true,
      json(sb.periodo)
    );

    const esperado = (desde, hasta) => {
      const hastaEf = hasta < H ? hasta : H;
      if (desde <= PC) return ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO;
      return hastaEf === H ? ESTADO_DEL_DIA.EN_CURSO : ESTADO_DEL_DIA.COMPLETO;
    };
    const mes = await resumenDe({ unidad: "MES", fecha: F });
    const primero = `${F.slice(0, 8)}01`;
    ok(
      `MES calendario desde ${primero}, con el estado que corresponde y el recorte a hoy si el mes no terminó`,
      mes.periodo.desde === primero && mes.periodo.hasta.slice(0, 7) === F.slice(0, 7) && mes.estado === esperado(mes.periodo.desde, mes.periodo.hasta) &&
        mes.recortadoAHoy === mes.periodo.hasta > H && mes.hastaEfectivo === (mes.periodo.hasta > H ? H : mes.periodo.hasta),
      json(mes)
    );
    const anio = await resumenDe({ unidad: "ANIO", fecha: F });
    ok(
      "ANIO calendario: del 1/1 al 31/12, parcial (empieza antes del punto cero) y recortado a hoy",
      anio.periodo.desde === `${F.slice(0, 4)}-01-01` && anio.periodo.hasta === `${F.slice(0, 4)}-12-31` && anio.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO &&
        anio.desdeEfectivo === PC && (anio.periodo.hasta > H ? anio.recortadoAHoy && anio.hastaEfectivo === H : true),
      json({ e: anio.estado, d: anio.desdeEfectivo, h: anio.hastaEfectivo })
    );
    const rango = await resumenDe({ desde: D(-5), hasta: D(-3) });
    const ur = item(await productosDe({ desde: D(-5), hasta: D(-3) }), P.uno);
    ok(
      "rango propio: unidad RANGO, completo, y la cadena abre el primer día y cierra el último",
      rango.periodo.unidad === UNIDAD_DE_PERIODO.RANGO && rango.estado === ESTADO_DEL_DIA.COMPLETO && ur.apertura.cantidad === 18 && ur.cierre.cantidad === 15,
      json({ p: rango.periodo, u: ur?.cierre })
    );
    const recorte = await resumenDe({ desde: D(-1), hasta: D(10) });
    ok(
      "un rango que pasa de hoy se recorta: recortadoAHoy, hastaEfectivo = hoy, en curso",
      recorte.recortadoAHoy === true && recorte.hastaEfectivo === H && recorte.enCurso === true && recorte.periodo.hasta === D(10),
      json(recorte)
    );
    const futuro = await resumenDe({ fecha: D(1) });
    ok("un día que todavía no llegó: 400 DIA_FUTURO", futuro.status === 400 && futuro.codigo === "DIA_FUTURO", json(futuro));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. Paginación y filtros");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const todo = await productosDe({ fecha: D(-5) });
    const paginas = [];
    for (let page = 1; page <= todo.total; page++) {
      const x = await productosDe({ fecha: D(-5), page, pageSize: 7 });
      if (x.items.length === 0) break;
      paginas.push(...x.items.map((i) => i.productoLocalId));
      if (page === 1) ok(`productos: página de 7 sobre ${todo.total}, totalPages ${x.totalPages}`, x.total === todo.total && x.totalPages === Math.ceil(todo.total / 7) && x.pageSize === 7);
    }
    ok(
      "las páginas de productos, pegadas, son el listado entero: sin repetir ni saltear",
      json(paginas) === json(todo.items.map((i) => i.productoLocalId)) && new Set(paginas).size === paginas.length,
      `${paginas.length} de ${todo.total}`
    );
    const fuera = await productosDe({ fecha: D(-5), page: 999, pageSize: 7 });
    ok("una página después de la última: vacía, con el total", fuera.status === 200 && fuera.items.length === 0 && fuera.total === todo.total);

    const q = await productosDe({ fecha: D(-5), q: "azucar" });
    const qM = await productosDe({ fecha: D(-5), q: "AZÚCAR 0" });
    ok("q sin tildes ni mayúsculas: \"azucar\" encuentra los 30 \"Azúcar\"", q.total === 30 && q.items.every((i) => i.nombre.startsWith("Azúcar")), `${q.total}`);
    ok("q con tilde y mayúsculas: \"AZÚCAR 0\" encuentra los nueve del 01 al 09", qM.total === 9, `${qM.total}`);
    const qc = await productosDe({ fecha: D(-5), q: "api-gemelo" });
    ok("q también busca en el código", qc.total === 1 && qc.items[0].productoLocalId === P.gemelo.pl);

    const cat1 = await productosDe({ fecha: D(-5), categoriaId: cat });
    ok(
      "categoría ACTUAL: Uno y Cero; el eliminado ya no tiene categoría y no entra",
      json(cat1.items.map((i) => i.productoLocalId).sort((a, b) => a - b)) === json([P.uno.pl, P.cero.pl].sort((a, b) => a - b)),
      json(cat1.items.map((i) => i.nombre))
    );

    const ids = async (filtro, fecha = D(-5)) => new Set((await productosDe({ fecha, filtro })).items.map((i) => i.productoLocalId));
    const conMov = await ids("con_movimientos");
    ok(
      "filtro con_movimientos: los que cambiaron, no el cero ni el relleno quieto",
      [P.uno, P.nace, P.muere, P.transito, P.eliminado, P.gemelo].every((p) => conMov.has(p.pl)) && !conMov.has(P.cero.pl) && !conMov.has(P.relleno[0].pl),
      json([...conMov])
    );
    ok("filtro aparecen: solo Nace", json([...(await ids("aparecen"))]) === json([P.nace.pl]));
    ok("filtro desaparecen: Muere y Eliminado", json([...(await ids("desaparecen"))].sort((a, b) => a - b)) === json([P.muere.pl, P.eliminado.pl].sort((a, b) => a - b)));
    ok("filtro reinterpretados: Reinterpreta, el día que pasó", (await ids("reinterpretados", D(-4))).has(P.reinterpreta.pl));
    ok("filtro sin_clasificar: Origen, el día que pasó", json([...(await ids("sin_clasificar", D(-3)))]) === json([P.origen.pl]));

    const movs = await llamar("movimientos", { desde: PC, hasta: H, pageSize: 200 }, como(S.encargadoA));
    const orden = movs.movimientos.items.every((m, i, a) => i === 0 || a[i - 1].instante < m.instante || (a[i - 1].instante === m.instante && a[i - 1].id < m.id));
    ok(`movimientos del local ordenados por (instante, id): ${movs.movimientos.total}`, orden && movs.movimientos.total === movs.movimientos.items.length && movs.movimientos.total > 40);
    const juntadas = [];
    for (let page = 1; page <= movs.movimientos.total; page++) {
      const x = await llamar("movimientos", { desde: PC, hasta: H, page, pageSize: 6 }, como(S.encargadoA));
      if (x.movimientos.items.length === 0) break;
      juntadas.push(...x.movimientos.items.map((m) => m.id));
    }
    ok("y paginados de a 6 en la base, pegados, dan la misma lista", json(juntadas) === json(movs.movimientos.items.map((m) => m.id)), `${juntadas.length}`);

    const cad = await llamar("producto", { productoLocalId: P.uno.pl, desde: PC, hasta: H, pageSize: 2 }, como(S.encargadoA));
    ok(
      "el detalle de una cadena pagina sus movimientos y dice cuántos son: 4 en 2 páginas, sin límite callado",
      cad.movimientos.total === 4 && cad.movimientos.totalPages === 2 && cad.movimientos.items.length === 2 && cad.producto.movimientos === cad.movimientos.total,
      json({ t: cad.movimientos.total, m: cad.producto.movimientos })
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. Los errores de la pregunta: 400, con texto nuestro");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const casos = [
      ["resumen", { fecha: "2026-13-01" }, "DIA_INVALIDO"],
      ["resumen", { fecha: "ayer" }, "DIA_INVALIDO"],
      ["resumen", { unidad: "HORA" }, "UNIDAD_INVALIDA"],
      ["resumen", { desde: D(-1), hasta: D(-3) }, "RANGO_INVALIDO"],
      ["resumen", { desde: D(-3) }, "DIA_INVALIDO"],
      ["resumen", { unidad: "MES", desde: D(-3), hasta: D(-1) }, "PERIODO_INVALIDO"],
      ["productos", { page: "0" }, "PAGINA_INVALIDA"],
      ["productos", { pageSize: "1000" }, "PAGINA_INVALIDA"],
      ["productos", { filtro: "todo" }, "FILTRO_INVALIDO"],
      ["productos", { categoriaId: "-1" }, "ID_INVALIDO"],
      ["producto", {}, "ID_INVALIDO"],
      ["movimientos", { productoLocalId: "x" }, "ID_INVALIDO"],
    ];
    for (const [ruta, params, codigo] of casos) {
      const r = await llamar(ruta, params, como(S.encargadoA));
      const texto = JSON.stringify(r);
      ok(
        `[${ruta}] ${json(params)} → 400 ${codigo}, sin SQL ni nada de la base`,
        r.status === 400 && r.codigo === codigo && r.ok === false && !/SELECT|prisma|postgres|127\.0\.0\.1|erpazul_|\/home\//i.test(texto),
        texto
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("G. Solo lectura");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const despues = await huella();
    const tablas = huellaAntes.split("\n").length;
    const distintas = huellaAntes.split("\n").filter((l, i) => l !== despues.split("\n")[i]);
    ok(`después de todas las llamadas, las ${tablas} tablas tienen exactamente las mismas filas: la API no escribió nada`, tablas > 50 && distintas.length === 0, distintas.join(" | "));
  }
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err}`);
  console.error(err);
} finally {
  if (c) await c.$disconnect().catch(() => {});
  const app = globalThis.prisma;
  if (app) await app.$disconnect().catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  for (const f of fallas) console.log(`  ✗ ${f.split("\n")[0]}`);
  process.exit(1);
}
