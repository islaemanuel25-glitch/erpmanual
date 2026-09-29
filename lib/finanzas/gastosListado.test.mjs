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

import {
  CATEGORIAS_INICIALES,
  ERROR_CATEGORIA_FILTRO,
  ERROR_RANGO_INVERTIDO,
  leerFiltrosDeGastos,
  whereDeGastos,
} from "@/lib/finanzas/gastos";
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

// ── EL WHERE ────────────────────────────────────────────────────────────

test("el where nunca queda sin ubicación ni sin grupo", () => {
  assert.throws(() => whereDeGastos({ grupoId: 1, localIds: [], filtros: filtros() }));
  assert.throws(() => whereDeGastos({ grupoId: 1, filtros: filtros() }));
  assert.throws(() => whereDeGastos({ grupoId: null, localIds: [3], filtros: filtros() }));
  const w = whereDeGastos({ grupoId: 1, localIds: [3, 4], filtros: filtros({ estado: "TODAS" }) });
  assert.deepEqual(w, { grupoId: 1, localId: { in: [3, 4] } });
});

test("el estado se resuelve con los ids saldados: Pagadas los incluye, Pendientes los excluye, Todas no mira", () => {
  const saldados = [7, 9];
  const w = (estado) => whereDeGastos({ grupoId: 1, localIds: [3], filtros: filtros({ estado }), idsSaldados: saldados }).id;
  assert.deepEqual(w("PAGADAS"), { in: saldados });
  assert.deepEqual(w("PENDIENTES"), { notIn: saldados });
  assert.equal(w("TODAS"), undefined);
  // Sin ningún saldado, Pagadas no trae nada y Pendientes trae todo.
  assert.deepEqual(whereDeGastos({ grupoId: 1, localIds: [3], filtros: filtros({ estado: "PAGADAS" }) }).id, { in: [] });
});

test("las fechas son DÍAS: el 30 se compara con la medianoche UTC del 30, sin zona horaria", () => {
  const w = whereDeGastos({ grupoId: 1, localIds: [3], filtros: filtros({ estado: "TODAS", fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" }) });
  assert.equal(w.fecha.gte.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(w.fecha.lte.toISOString(), "2026-09-30T00:00:00.000Z");
});

test("la búsqueda mira concepto, beneficiario y comprobante, sin distinguir mayúsculas", () => {
  const w = whereDeGastos({ grupoId: 1, localIds: [3], filtros: filtros({ estado: "TODAS", q: "luz" }) });
  assert.deepEqual(w.OR, [
    { concepto: { contains: "luz", mode: "insensitive" } },
    { beneficiario: { contains: "luz", mode: "insensitive" } },
    { comprobanteNumero: { contains: "luz", mode: "insensitive" } },
  ]);
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
  const servidor = sinComentarios(readFileSync("lib/finanzas/gastosServer.js", "utf8"));
  assert.match(servidor, /db\.gasto\.findMany\(\{ where, orderBy: \[\{ fecha: "desc" \}, \{ id: "desc" \}\], skip, take/);
});
