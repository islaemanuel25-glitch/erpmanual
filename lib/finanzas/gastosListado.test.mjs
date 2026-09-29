// CANDADO: EL LISTADO DE GASTOS —FILTROS, `where` Y PÁGINA—.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/gastosListado.test.mjs
//
// Lo que las rutas hacen contra PostgreSQL —el alcance, el estado resuelto en la
// base, la página, los errores HTTP— lo ejerce `scripts/pruebas-db/gastosApi.mjs`.
// Acá va lo que se afirma sin base: que un filtro mal escrito se rechaza en vez
// de ignorarse, que el `where` nunca queda sin ubicación, y que las fechas son
// días sin zona horaria.
//
// Todo lo que lee código lo lee SIN COMENTARIOS (regla 5 de CLAUDE.md).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Prisma } from "@prisma/client";

import {
  CATEGORIAS_INICIALES,
  ERROR_CATEGORIA_FILTRO,
  ERROR_RANGO_INVERTIDO,
  leerFiltrosDeGastos,
} from "@/lib/finanzas/gastos";
import { SQL_GASTO_SALDADO, condicionesDeGastos, listarGastos } from "@/lib/finanzas/gastosServer";
import { ERROR_FECHA_INVALIDA, FILTRO_CUENTAS } from "@/lib/finanzas/pagosProveedores";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "@/lib/turnos/filtrosListado";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const de = (o = {}) => (k) => (k in o ? o[k] : null);
const filtros = (o) => leerFiltrosDeGastos(de(o)).filtros;

// ── LOS FILTROS ─────────────────────────────────────────────────────────

test("sin nada: Pendientes, primera página del tamaño de siempre, sin filtros", () => {
  const f = filtros();
  assert.equal(f.estado, FILTRO_CUENTAS.PENDIENTES);
  assert.deepEqual([f.page, f.pageSize, f.skip, f.take], [1, PAGE_SIZE_DEFAULT, 0, PAGE_SIZE_DEFAULT]);
  assert.deepEqual([f.categoriaId, f.fechaDesde, f.fechaHasta, f.q], [null, null, null, null]);
});

test("las pestañas son las de Pagos a proveedores, y la página tiene tope", () => {
  assert.equal(filtros({ estado: "PAGADAS" }).estado, FILTRO_CUENTAS.PAGADAS);
  assert.equal(filtros({ estado: "TODAS" }).estado, FILTRO_CUENTAS.TODAS);
  const f = filtros({ page: "3", pageSize: "10000" });
  assert.deepEqual([f.page, f.pageSize, f.skip], [3, PAGE_SIZE_MAX, 2 * PAGE_SIZE_MAX]);
});

test("un filtro mal escrito se rechaza, no se ignora", () => {
  assert.equal(leerFiltrosDeGastos(de({ categoriaId: "abc" })).error, ERROR_CATEGORIA_FILTRO);
  assert.equal(leerFiltrosDeGastos(de({ categoriaId: "-2" })).error, ERROR_CATEGORIA_FILTRO);
  assert.equal(leerFiltrosDeGastos(de({ fechaDesde: "30/09/2026" })).error, ERROR_FECHA_INVALIDA);
  assert.equal(leerFiltrosDeGastos(de({ fechaHasta: "2026-02-30" })).error, ERROR_FECHA_INVALIDA);
  assert.equal(leerFiltrosDeGastos(de({ fechaDesde: "2026-10-05", fechaHasta: "2026-10-01" })).error, ERROR_RANGO_INVERTIDO);
  assert.ok(leerFiltrosDeGastos(de({ q: "x".repeat(500) })).error);
});

test("la búsqueda se recorta, y vacía no filtra", () => {
  assert.equal(filtros({ q: "  luz  " }).q, "luz");
  assert.equal(filtros({ q: "   " }).q, null);
});

// ── LAS CONDICIONES, EN SQL ─────────────────────────────────────────────

const condiciones = (o, extra = {}) => condicionesDeGastos({ grupoId: 1, localIds: [3, 4], filtros: filtros(o), ...extra });
const SUMA = /COALESCE\(\(SELECT SUM\(p\."monto"\) FROM "PagoGasto" p WHERE p\."gastoId" = g\."id"\), 0\)/;

test("las condiciones nunca quedan sin ubicación ni sin grupo", () => {
  assert.throws(() => condicionesDeGastos({ grupoId: 1, localIds: [], filtros: filtros() }));
  assert.throws(() => condicionesDeGastos({ grupoId: 1, filtros: filtros() }));
  assert.throws(() => condicionesDeGastos({ grupoId: null, localIds: [3], filtros: filtros() }));
  const c = condiciones({ estado: "TODAS" });
  assert.equal(c.text, `g."grupoId" = $1 AND g."localId" = ANY($2::int[])`);
  assert.deepEqual(c.values, [1, [3, 4]]);
});

test("el estado es una condición del WHERE: Pagadas pide saldado, Pendientes lo niega, Todas no mira", () => {
  const pagadas = condiciones({ estado: "PAGADAS" }).text;
  const pendientes = condiciones({ estado: "PENDIENTES" }).text;
  assert.match(pagadas, new RegExp(`AND g\\."total" <= ${SUMA.source}$`));
  assert.match(pendientes, new RegExp(`AND NOT \\(g\\."total" <= ${SUMA.source}\\)$`));
  assert.doesNotMatch(condiciones({ estado: "TODAS" }).text, SUMA);
  // Y es UNA sola definición: la de Pendientes es la de Pagadas, negada.
  assert.equal(SQL_GASTO_SALDADO.text, pagadas.split(" AND ").slice(2).join(" AND "));
  // Ningún filtro de estado agrega valores: no hay una lista de ids adentro.
  for (const e of ["PAGADAS", "PENDIENTES", "TODAS"]) assert.deepEqual(condiciones({ estado: e }).values, [1, [3, 4]], e);
});

test("las fechas son DÍAS: viajan como AAAA-MM-DD y se castean a date, sin zona horaria", () => {
  const c = condiciones({ estado: "TODAS", fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" });
  assert.match(c.text, /g\."fecha" >= \$3::date AND g\."fecha" <= \$4::date$/);
  assert.deepEqual(c.values.slice(2), ["2026-09-01", "2026-09-30"]);
});

test("la búsqueda mira concepto, beneficiario y comprobante, sin distinguir mayúsculas y sin comodines del texto", () => {
  const c = condiciones({ estado: "TODAS", q: "50%_off" });
  assert.match(c.text, /\(g\."concepto" ILIKE \$3 ESCAPE '\\' OR g\."beneficiario" ILIKE \$4 ESCAPE '\\' OR g\."comprobanteNumero" ILIKE \$5 ESCAPE '\\'\)$/);
  assert.deepEqual(c.values.slice(2), ["%50\\%\\_off%", "%50\\%\\_off%", "%50\\%\\_off%"]);
});

// ── EL LISTADO NO MATERIALIZA LOS SALDADOS ──────────────────────────────
//
// Con una base de mentira que anota cada consulta: el listado tiene que contar
// y paginar en SQL con el estado adentro, y lo único que puede pasar de una
// consulta a otra son los ids de LA PÁGINA. El patrón de antes —pedir primero
// los ids saldados y meterlos en un IN / NOT IN— consulta `gasto.count` y hace
// crecer una lista con cada gasto pagado; acá eso rompe.

function baseAnotada({ total = 7, pagina = [11, 12, 13] } = {}) {
  const crudas = [];
  const findMany = [];
  const db = {
    async $queryRaw(partes, ...valores) {
      const consulta = Prisma.sql(partes, ...valores);
      crudas.push(consulta);
      return /count\(\*\)/.test(consulta.text) ? [{ total }] : pagina.map((id) => ({ id }));
    },
    gasto: {
      async findMany(args) {
        findMany.push(args);
        // Desordenadas a propósito: el orden lo tiene que reponer el listado.
        return [...args.where.id.in].reverse().map((id) => ({ id, total: "100.00", pagos: [], fecha: new Date("2026-09-30T00:00:00Z") }));
      },
    },
  };
  return { crudas, findMany, db: new Proxy(db, { get: (t, k) => (k in t ? t[k] : assert.fail(`el listado usó db.${String(k)}`)) }) };
}

test("el listado cuenta y pagina en SQL con el estado adentro, y solo trae las filas de la página", async () => {
  for (const estado of ["PENDIENTES", "PAGADAS", "TODAS"]) {
    const { crudas, findMany, db } = baseAnotada();
    const f = filtros({ estado, pageSize: "3", page: "2" });
    const r = await listarGastos(db, { grupoId: 1, localIds: [3, 4], filtros: f });
    assert.equal(crudas.length, 2, `${estado}: dos consultas crudas, el total y la página`);
    const [conteo, pagina] = [crudas.find((q) => /count\(\*\)/.test(q.text)), crudas.find((q) => /LIMIT/.test(q.text))];
    assert.ok(conteo && pagina, estado);
    assert.equal(SUMA.test(conteo.text), estado !== "TODAS", `${estado}: el total cuenta con el estado`);
    assert.equal(SUMA.test(pagina.text), estado !== "TODAS", `${estado}: la página filtra con el estado`);
    assert.match(pagina.text, /ORDER BY g\."fecha" DESC, g\."id" DESC LIMIT \$\d+ OFFSET \$\d+$/);
    assert.deepEqual(pagina.values.slice(-2), [3, 3], `${estado}: LIMIT pageSize OFFSET (page-1)*pageSize`);
    // Ningún valor de ninguna consulta es una lista, salvo las ubicaciones.
    for (const q of crudas) for (const v of q.values) if (Array.isArray(v)) assert.deepEqual(v, [3, 4], estado);
    assert.deepEqual(findMany, [{ where: { id: { in: [11, 12, 13] } }, select: findMany[0].select }], `${estado}: una sola lectura, por los ids de la página`);
    assert.deepEqual(r.gastos.map((g) => g.id), [11, 12, 13], `${estado}: en el orden de la página`);
    assert.deepEqual(r.paginacion, { page: 2, pageSize: 3, total: 7, totalPaginas: 3 }, estado);
  }
});

test("una página vacía no lee filas, y el total sigue siendo el de la consulta", async () => {
  const { crudas, findMany, db } = baseAnotada({ total: 4, pagina: [] });
  const r = await listarGastos(db, { grupoId: 1, localIds: [3], filtros: filtros({ page: "9", pageSize: "2" }) });
  assert.equal(crudas.length, 2);
  assert.equal(findMany.length, 0);
  assert.deepEqual(r, { gastos: [], paginacion: { page: 9, pageSize: 2, total: 4, totalPaginas: 2 } });
});

// ── LAS RUTAS ───────────────────────────────────────────────────────────

test("las categorías salen de la base: ninguna ruta de gastos las escribe a mano", () => {
  for (const ruta of ["app/api/finanzas/gastos/categorias/route.js", "app/api/finanzas/gastos/route.js"]) {
    const fuente = sinComentarios(readFileSync(ruta, "utf8"));
    for (const nombre of CATEGORIAS_INICIALES) assert.ok(!fuente.includes(`"${nombre}"`), `${ruta} escribe "${nombre}"`);
    assert.doesNotMatch(fuente, /CATEGORIAS_INICIALES/, ruta);
  }
  assert.match(sinComentarios(readFileSync("app/api/finanzas/gastos/categorias/route.js", "utf8")), /categoriasDeGasto\(prisma\)/);
});

test("el listado se pagina en la base: la ruta no recorta ni filtra la lista en memoria", () => {
  const fuente = sinComentarios(readFileSync("app/api/finanzas/gastos/route.js", "utf8"));
  assert.match(fuente, /listarGastos\(prisma,/);
  assert.doesNotMatch(fuente, /gastos\.(filter|slice)\(/);
});
