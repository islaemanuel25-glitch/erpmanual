import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const page = source("app/modulos/productos/page.jsx");
const filters = source("components/productos/FiltrosProductos.jsx");
const columns = source("components/productos/ColumnManager.jsx");
const carousel = source("components/productos/CarruselControles.jsx");
const checkbox = source("components/sunmi/SunmiCheckbox.jsx");

test("desktop: los filtros avanzados quedan visibles sin Más filtros", () => {
  assert.doesNotMatch(filters, /Más filtros/);
  assert.match(filters, /Categoría/);
  assert.match(filters, /Proveedor/);
  assert.match(filters, /Área física/);
  assert.match(filters, /SunmiCampoBusquedaVoz/);
});

test("desktop: importar, exportar y columnas son acciones superiores", () => {
  assert.match(page, /abrirArchivo\("importar"\)/);
  assert.match(page, /abrirArchivo\("exportar"\)/);
  assert.match(page, /<Upload /);
  assert.match(page, /<Download /);
  assert.match(page, /Listado de productos/);
});

test("columnas: usa el checkbox Sunmi, filas completas y restauración", () => {
  assert.match(columns, /SunmiCheckbox/);
  assert.match(columns, /Restablecer columnas/);
  assert.match(columns, /Settings2/);
  assert.doesNotMatch(columns, /style=\{\{/);
  assert.doesNotMatch(columns, /type="checkbox"/);
  assert.match(checkbox, /type="checkbox"/);
});

test("carga: el listado termina antes de consultar controles", () => {
  assert.match(page, /if \(loading \|\| yaSalio\(/);
  assert.match(page, /requestIdleCallback/);
  assert.match(carousel, /animate-pulse/);
  assert.match(carousel, /md:grid-cols-4/);
});

test("los componentes nuevos no agregan colores literales", () => {
  for (const [name, value] of [
    ["FiltrosProductos", filters],
    ["ColumnManager", columns],
    ["SunmiCheckbox", checkbox],
  ]) {
    assert.deepEqual(value.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], name);
    assert.deepEqual(value.match(/rgba?\([^)]*\)/g) || [], [], name);
  }
});
