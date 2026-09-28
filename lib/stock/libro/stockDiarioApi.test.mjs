// CANDADO: LA API DEL STOCK DIARIO LEE, Y SOLO LO QUE LE TOCA A QUIEN PREGUNTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/stockDiarioApi.test.mjs
//
// Lo que afirma:
//
//   1. Lo que se lee de la URL: el período, la página, los filtros, los ids; cada
//      pedido malo es un ErrorStockDiario con su código, que la ruta devuelve 400.
//   2. Qué ubicación se mira (`localDeLaVista`): la propia y ninguna otra; en la
//      vista global, una del grupo activo y nunca la suma.
//   3. Filtrar, contar, ordenar y paginar productos con UNA sola definición de
//      cada filtro, y en un orden estable entre páginas.
//   4. Un error de la base no sale crudo: ni SQL, ni host, ni nombre de la base.
//   5. Las cuatro rutas: solo GET, `stock.ver` exigido a la vista, el armado
//      delegado, sin "Error interno", sin reloj de Node; y `stockDiarioRutas.js`
//      no escribe, no inyecta `hoy` y resuelve el alcance antes de consultar.
//   6. Sin N+1: el listado de un local manda las MISMAS consultas con una cadena
//      que con cuarenta.
//   7. La prueba de base que llama a los handlers reales corre en CI.
//
// Lo que ninguno de estos puede ver —que `resolveVistaOperativa` lea bien los
// grupos, que las consultas corran, que nada se escriba— lo prueba
// `scripts/pruebas-db/stockDiarioApi.mjs` contra PostgreSQL.
//
// Todo lo que lee código lo lee SIN COMENTARIOS (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

import { ErrorStockDiario, PAGINA, UNIDAD_DE_PERIODO } from "./stockDiario.js";
import {
  ERROR_FUERA_DE_ALCANCE,
  FILTRO_PRODUCTOS,
  coincideTexto,
  conteosDeCadenas,
  leerFiltroProductos,
  leerId,
  leerPagina,
  leerPedidoDePeriodo,
  localDeLaVista,
  paginaDeProductos,
  pasaFiltro,
  respuestaDeError,
  saldoApi,
} from "./stockDiarioApi.js";
import * as server from "./stockDiarioServer.js";
import { SIN_ORIGEN } from "./libroStock.js";

const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const fuente = (f) => sinComentariosJs(readFileSync(f, "utf8"));
const sp = (o) => new URLSearchParams(o);

function codigoDe(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ErrorStockDiario, `lanzó ${err?.name}: ${err?.message}`);
    return err.codigo;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. La URL
// ════════════════════════════════════════════════════════════════════════════

test("el período: DIA por defecto y sin fecha (la pone la base), la unidad sin distinguir mayúsculas", () => {
  assert.deepEqual(leerPedidoDePeriodo(sp({})), { unidad: UNIDAD_DE_PERIODO.DIA, fecha: null, desde: null, hasta: null });
  assert.deepEqual(leerPedidoDePeriodo(sp({ unidad: "semana", fecha: "2026-09-30" })), { unidad: "SEMANA", fecha: "2026-09-30", desde: null, hasta: null });
  for (const u of ["DIA", "SEMANA", "MES", "ANIO"]) assert.equal(leerPedidoDePeriodo(sp({ unidad: u })).unidad, u);
  assert.deepEqual(leerPedidoDePeriodo(sp({ desde: "2026-09-28", hasta: "2026-09-30" })), { unidad: UNIDAD_DE_PERIODO.RANGO, fecha: null, desde: "2026-09-28", hasta: "2026-09-30" });
});

test("el período mal pedido es un error con código, nunca un default callado", () => {
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ unidad: "HORA" }))), "UNIDAD_INVALIDA");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ unidad: "RANGO" }))), "UNIDAD_INVALIDA", "RANGO se pide con desde y hasta, no como unidad");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ fecha: "2026-02-30" }))), "DIA_INVALIDO");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ fecha: "30/09/2026" }))), "DIA_INVALIDO");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ desde: "2026-09-28" }))), "DIA_INVALIDO", "un rango sin hasta");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ desde: "2026-09-30", hasta: "2026-09-28" }))), "RANGO_INVALIDO");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ unidad: "MES", desde: "2026-09-28", hasta: "2026-09-30" }))), "PERIODO_INVALIDO");
  assert.equal(codigoDe(() => leerPedidoDePeriodo(sp({ fecha: "2026-09-28", desde: "2026-09-28", hasta: "2026-09-30" }))), "PERIODO_INVALIDO");
});

test("la página: 1 y el default del motor; fuera de rango es error, no se recorta", () => {
  assert.deepEqual(leerPagina(sp({})), { page: 1, pageSize: PAGINA.DEFECTO });
  assert.deepEqual(leerPagina(sp({ page: "3", pageSize: String(PAGINA.MAXIMO) })), { page: 3, pageSize: PAGINA.MAXIMO });
  for (const p of [{ page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "x" }, { pageSize: "0" }, { pageSize: String(PAGINA.MAXIMO + 1) }]) {
    assert.equal(codigoDe(() => leerPagina(sp(p))), "PAGINA_INVALIDA", JSON.stringify(p));
  }
});

test("los ids y los filtros", () => {
  assert.equal(leerId(sp({}), "productoLocalId"), null);
  assert.equal(codigoDe(() => leerId(sp({}), "productoLocalId", { obligatorio: true })), "ID_INVALIDO");
  for (const v of ["0", "-3", "2.5", "7 OR 1=1", "abc"]) assert.equal(codigoDe(() => leerId(sp({ x: v }), "x")), "ID_INVALIDO", v);
  assert.equal(leerId(sp({ x: "12" }), "x"), 12);
  assert.deepEqual(leerFiltroProductos(sp({})), { filtro: FILTRO_PRODUCTOS.TODOS, q: null, categoriaId: null });
  assert.deepEqual(leerFiltroProductos(sp({ filtro: "aparecen", q: "  pan ", categoriaId: "4" })), { filtro: "aparecen", q: "pan", categoriaId: 4 });
  assert.equal(leerFiltroProductos(sp({ q: "   " })).q, null);
  assert.equal(codigoDe(() => leerFiltroProductos(sp({ filtro: "todo" }))), "FILTRO_INVALIDO");
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Qué ubicación se mira
// ════════════════════════════════════════════════════════════════════════════

test("vista LOCAL: la propia, con o sin localId; otra es 403, no se ignora en silencio", () => {
  const vista = { modo: "LOCAL", localId: 5 };
  assert.deepEqual(localDeLaVista(vista, null), { localId: 5 });
  assert.deepEqual(localDeLaVista(vista, "5"), { localId: 5 });
  assert.deepEqual(localDeLaVista(vista, "6"), { status: 403, error: ERROR_FUERA_DE_ALCANCE });
  assert.equal(localDeLaVista(vista, "5 OR 1=1").status, 400);
});

test("vista GLOBAL: localId obligatorio y del grupo activo; nunca la suma de los locales", () => {
  const vista = { modo: "GLOBAL", localIds: [1, 2, 3] };
  const sin = localDeLaVista(vista, null);
  assert.equal(sin.status, 400);
  assert.match(sin.error, /falta localId/);
  assert.deepEqual(localDeLaVista(vista, "2"), { localId: 2 });
  assert.deepEqual(localDeLaVista(vista, "9"), { status: 403, error: ERROR_FUERA_DE_ALCANCE });
  assert.deepEqual(localDeLaVista({ modo: "GLOBAL", localIds: [] }, "1"), { status: 403, error: ERROR_FUERA_DE_ALCANCE });
});

test("una vista que no es LOCAL ni GLOBAL no ve nada", () => {
  assert.equal(localDeLaVista({}, "1").status, 403);
  assert.equal(localDeLaVista({ modo: "OTRO", localId: 1, localIds: [1] }, "1").status, 403);
});

test("el texto del 403 es el mismo que devuelve resolveVistaOperativa", () => {
  assert.ok(fuente("lib/grupos.js").includes(`"${ERROR_FUERA_DE_ALCANCE}"`));
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Filtros, conteos, orden y páginas
// ════════════════════════════════════════════════════════════════════════════

const cadena = (productoLocalId, nombre, x = {}) => ({
  productoLocalId,
  identidad: nombre === null ? null : { nombre, codigoBarra: `C-${productoLocalId}`, categoriaActualId: x.categoria ?? null },
  porTipo: { ESTADO_INICIAL: 0, ALTA: 0, CAMBIO: 0, BAJA: 0, ...x.porTipo },
  sinClasificar: x.sinClasificar ?? 0,
  reinterpretada: x.reinterpretada ?? false,
});

test("con_movimientos no cuenta el punto de partida: el ESTADO_INICIAL no es algo que le pasó al producto", () => {
  assert.equal(pasaFiltro(cadena(1, "a", { porTipo: { ESTADO_INICIAL: 1 } }), FILTRO_PRODUCTOS.CON_MOVIMIENTOS), false);
  for (const t of ["ALTA", "CAMBIO", "BAJA"]) assert.equal(pasaFiltro(cadena(1, "a", { porTipo: { [t]: 1 } }), FILTRO_PRODUCTOS.CON_MOVIMIENTOS), true, t);
});

test("los conteos del resumen usan los mismos predicados que los filtros", () => {
  const cadenas = [
    cadena(1, "a", { porTipo: { ALTA: 1 } }),
    cadena(2, "b", { porTipo: { BAJA: 1 }, sinClasificar: 1 }),
    cadena(3, "c", { reinterpretada: true }),
    cadena(4, "d", { porTipo: { CAMBIO: 2 }, sinClasificar: 2 }),
    cadena(5, "e"),
  ];
  const conteos = conteosDeCadenas(cadenas);
  assert.deepEqual(conteos, { productos: 5, conMovimientos: 3, aparecen: 1, desaparecen: 1, reinterpretados: 1, sinClasificar: 2 });
  const porFiltro = (f) => paginaDeProductos(cadenas, { filtro: f, q: null, categoriaId: null }, { page: 1, pageSize: 50 }).total;
  assert.equal(porFiltro(FILTRO_PRODUCTOS.CON_MOVIMIENTOS), conteos.conMovimientos);
  assert.equal(porFiltro(FILTRO_PRODUCTOS.APARECEN), conteos.aparecen);
  assert.equal(porFiltro(FILTRO_PRODUCTOS.DESAPARECEN), conteos.desaparecen);
  assert.equal(porFiltro(FILTRO_PRODUCTOS.REINTERPRETADOS), conteos.reinterpretados);
  assert.equal(porFiltro(FILTRO_PRODUCTOS.SIN_CLASIFICAR), conteos.sinClasificar);
  assert.equal(porFiltro(FILTRO_PRODUCTOS.TODOS), conteos.productos);
});

test("la búsqueda no distingue tildes ni mayúsculas, y mira el nombre y el código", () => {
  const id = { nombre: "Azúcar Ñandú", codigoBarra: "779-01" };
  assert.ok(coincideTexto(id, "azucar"));
  assert.ok(coincideTexto(id, "AZÚCAR ñandu"));
  assert.ok(coincideTexto(id, "779"));
  assert.ok(!coincideTexto(id, "yerba"));
  assert.ok(!coincideTexto(null, "a"));
  assert.ok(coincideTexto(null, null));
});

test("el orden es estable: por nombre, a igual nombre por id, y sin nombre al final; las páginas pegadas son el total", () => {
  const cadenas = [cadena(9, "Pan"), cadena(3, null), cadena(4, "pan"), cadena(2, "Arroz"), cadena(7, "Ñoquis"), cadena(1, "Pan")];
  const todo = paginaDeProductos(cadenas, { filtro: "todos", q: null, categoriaId: null }, { page: 1, pageSize: 50 });
  assert.deepEqual(todo.items.map((c) => c.productoLocalId), [2, 7, 1, 4, 9, 3]);
  const pegadas = [1, 2, 3].flatMap((page) => paginaDeProductos(cadenas, { filtro: "todos", q: null, categoriaId: null }, { page, pageSize: 2 }).items.map((c) => c.productoLocalId));
  assert.deepEqual(pegadas, [2, 7, 1, 4, 9, 3]);
  const p = paginaDeProductos(cadenas, { filtro: "todos", q: null, categoriaId: null }, { page: 9, pageSize: 4 });
  assert.deepEqual([p.total, p.totalPages, p.items.length], [6, 2, 0]);
  const vacio = paginaDeProductos([], { filtro: "todos", q: null, categoriaId: null }, { page: 1, pageSize: 4 });
  assert.deepEqual([vacio.total, vacio.totalPages], [0, 1]);
});

test("la categoría que se filtra es la ACTUAL", () => {
  const cadenas = [cadena(1, "a", { categoria: 4 }), cadena(2, "b", { categoria: 5 }), cadena(3, null)];
  const r = paginaDeProductos(cadenas, { filtro: "todos", q: null, categoriaId: 4 }, { page: 1, pageSize: 50 });
  assert.deepEqual(r.items.map((c) => c.productoLocalId), [1]);
});

test("un saldo que no EXISTE viaja sin números, aunque el motor trajera alguno", () => {
  assert.deepEqual(saldoApi({ existencia: "NO_EXISTE", motivo: null, cantidad: 0, enTransito: 0 }), {
    existencia: "NO_EXISTE",
    motivo: null,
    cantidad: null,
    enTransito: null,
    provisional: false,
  });
  assert.equal(saldoApi({ existencia: "DESCONOCIDA", motivo: "SIN_APERTURA_HISTORICA", cantidad: 0 }).cantidad, null);
  assert.equal(saldoApi({ existencia: "EXISTE", cantidad: 0, enTransito: 0 }).cantidad, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Errores
// ════════════════════════════════════════════════════════════════════════════

test("un error de la pregunta es 400 con su código y el texto nuestro", () => {
  const r = respuestaDeError(new ErrorStockDiario("DIA_FUTURO", "El 2099-01-01 todavía no llegó."));
  assert.deepEqual(r, { status: 400, body: { ok: false, error: "El 2099-01-01 todavía no llegó.", codigo: "DIA_FUTURO" } });
});

test("un error de la base es 500 y NO lleva su mensaje: ni SQL, ni host, ni base, ni rutas", () => {
  const crudo = Object.assign(new Error(`Invalid \`prisma.$queryRaw()\` invocation: Raw query failed. Code: \`42P01\`. Message: \`relation "MovimientoStock" does not exist\` SELECT * FROM x — Can't reach database server at 10.0.0.5:5432 erpazul_prod /app/lib/stock`), { code: "P2010" });
  const r = respuestaDeError(crudo);
  assert.equal(r.status, 500);
  assert.equal(r.body.codigo, "P2010");
  assert.match(r.body.error, /No se pudo armar el Stock Diario: falló la consulta a la base \(P2010\)\./);
  assert.doesNotMatch(JSON.stringify(r.body), /SELECT|prisma|MovimientoStock|10\.0\.0\.5|5432|erpazul_prod|\/app\/|42P01/);
  const otro = respuestaDeError(new TypeError("Cannot read properties of undefined (reading 'x') at /app/lib/y.js:3"));
  assert.deepEqual(otro, { status: 500, body: { ok: false, error: "No se pudo armar el Stock Diario: falló el servidor al calcularlo.", codigo: null } });
  assert.equal(respuestaDeError(Object.assign(new Error("x"), { code: "ECONNREFUSED" })).body.codigo, null, "solo los códigos de Prisma viajan");
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Las rutas
// ════════════════════════════════════════════════════════════════════════════

function archivos(...patrones) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...patrones], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const RUTAS = {
  resumen: "responderResumen",
  productos: "responderProductos",
  producto: "responderProducto",
  movimientos: "responderMovimientos",
};

test("son exactamente las cuatro rutas del contrato", () => {
  assert.deepEqual(archivos("app/api/stock_locales/diario/*").sort(), Object.keys(RUTAS).map((r) => `app/api/stock_locales/diario/${r}/route.js`).sort());
});

for (const [ruta, responder] of Object.entries(RUTAS)) {
  test(`[${ruta}] solo GET, exige sesión y stock.ver ANTES de delegar, y delega en ${responder}`, () => {
    const t = fuente(`app/api/stock_locales/diario/${ruta}/route.js`);
    const exportados = [...t.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    assert.deepEqual(exportados, ["GET"]);
    const sesion = t.indexOf("getUsuarioSession(req)");
    const permiso = t.indexOf('checkPerm(session, "stock.ver")');
    const delega = t.indexOf(`return ${responder}(req)`);
    assert.ok(sesion > 0 && permiso > sesion && delega > permiso, "el orden es sesión → permiso → armado");
    assert.match(t, /if \(!perm\.ok\) return NextResponse\.json\(\{ ok: false, error: perm\.error \}, \{ status: perm\.status \}\);/);
    assert.match(t, /from "@\/lib\/stock\/libro\/stockDiarioRutas"/);
    assert.doesNotMatch(t, /Error interno/);
    assert.doesNotMatch(t, /\bDate\b|prisma/);
  });
}

test("el armado no escribe, no inyecta hoy, y resuelve el alcance antes de consultar", () => {
  const t = fuente("lib/stock/libro/stockDiarioRutas.js");
  assert.doesNotMatch(t, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction/);
  assert.doesNotMatch(t, /\bhoy\s*:/);
  assert.doesNotMatch(t, /Error interno/);
  const alcance = t.indexOf("await resolveVistaOperativa(req)");
  const elegido = t.indexOf("localDeLaVista(vista,");
  const lectura = t.indexOf("leerPedidoDePeriodo(sp)");
  assert.ok(alcance > 0 && elegido > alcance && lectura > elegido, "primero quién mira, después qué pregunta");
  for (const motor of ["stockDelPeriodo(prisma", "detalleDeCadena(prisma", "movimientosDelPeriodo(prisma"]) {
    assert.match(t, new RegExp(`${motor.replace("(", "\\(")}, \\{ localId: local\\.id,`), `${motor} no recibe el local del alcance`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Sin N+1
// ════════════════════════════════════════════════════════════════════════════

function clienteQueCuenta(cadenas) {
  const consultas = [];
  const fila = (p) => ({
    id: p, localId: 1, productoLocalId: p, productoBaseId: 100 + p, stockLocalId: p, tipo: "CAMBIO",
    instante: "2026-09-28T13:00:00.000Z", dia: "2026-09-28", origen: SIN_ORIGEN, origenRef: null,
    cantidadAnterior: "1.000", cantidadPosterior: "2.000", enTransitoAnterior: "0.000", enTransitoPosterior: "0.000",
  });
  const responder = (sql) => {
    if (sql.includes('"libro_stock_dia"("libro_stock_instante"())')) return [{ hoy: "2026-10-05" }];
    if (/FROM "MovimientoStock" m ORDER BY m\."id" LIMIT 1/.test(sql)) return [{ instante: "2026-09-28T00:19:13.587Z", dia: "2026-09-27", tipo: "ESTADO_INICIAL" }];
    if (sql.includes("WITH RECURSIVE cadenas")) {
      return Array.from({ length: cadenas }, (_, i) => ({ productoLocalId: i + 1, ultimoAntes: fila(i + 1), ultimoHasta: fila(i + 1), movido: null }));
    }
    return [];
  };
  return {
    consultas,
    $queryRaw(partes, ...valores) {
      consultas.push(Prisma.sql(partes, ...valores).sql);
      return Promise.resolve(responder(consultas.at(-1)));
    },
    $executeRaw() {
      return Promise.resolve(0);
    },
  };
}

test("el listado de un local manda las mismas consultas con 1 cadena que con 40: no hay una por producto", async () => {
  const uno = clienteQueCuenta(1);
  const cuarenta = clienteQueCuenta(40);
  const r1 = await server.stockDelPeriodo(uno, { localId: 1, desde: "2026-09-28", hasta: "2026-09-30" });
  const r40 = await server.stockDelPeriodo(cuarenta, { localId: 1, desde: "2026-09-28", hasta: "2026-09-30" });
  assert.equal(r1.cadenas.length, 1);
  assert.equal(r40.cadenas.length, 40, "el cliente falso no llegó a armar las cuarenta: el candado no estaría mirando nada");
  assert.equal(cuarenta.consultas.length, uno.consultas.length);
  assert.ok(uno.consultas.length <= 8, `${uno.consultas.length} consultas para un listado`);
});

// ════════════════════════════════════════════════════════════════════════════
// 7. CI
// ════════════════════════════════════════════════════════════════════════════

test("la prueba de base de la API corre en CI", () => {
  const ci = readFileSync(".github/workflows/verificacion.yml", "utf8");
  assert.match(ci, /run: node --import \.\/scripts\/alias-loader\.mjs scripts\/pruebas-db\/stockDiarioApi\.mjs/);
  assert.deepEqual(archivos("scripts/pruebas-db/stockDiarioApi.mjs"), ["scripts/pruebas-db/stockDiarioApi.mjs"]);
  const prueba = readFileSync("scripts/pruebas-db/stockDiarioApi.mjs", "utf8");
  for (const r of Object.keys(RUTAS)) assert.ok(prueba.includes(`app/api/stock_locales/diario/${r}/route.js`), `la prueba de base no llama a ${r}`);
});
