// CANDADO: STOCK DIARIO MÓVIL, LO QUE DIBUJA.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_diario/stockDiarioMobile.test.mjs
//
// Qué se le pide a la API y qué dice cada renglón está en
// `lib/stock/libro/stockDiarioPantalla.test.mjs`; lo que la API cuenta, en
// `scripts/pruebas-db/stockDiarioApi.mjs`. Acá se renderizan las piezas de
// verdad. Todo lo que lee código lo lee SIN COMENTARIOS (regla 5).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ResumenConImporte from "../periodo/ResumenConImporte.jsx";
import { RUTA_STOCK_DIARIO } from "@/lib/stock/libro/rutasStockDiario";
import { MENU_CONFIG } from "@/lib/menu/registry";

const h = (el) => renderToStaticMarkup(el);
const codigo = (ruta) =>
  fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("ResumenConImporte sin `detalle` dibuja lo mismo que antes: ninguna divisoria nueva", () => {
  const props = { rotulo: "Para cobrar", importe: "$1", subtitulo: "Semana" };
  const sin = h(React.createElement(ResumenConImporte, props));
  assert.ok(!sin.includes("sunmi-divider"), sin);
  const con = h(React.createElement(ResumenConImporte, { ...props, detalle: React.createElement("div", null, "x") }));
  assert.equal((con.match(/sunmi-divider/g) || []).length, 1);
});

// ── LA PANTALLA ─────────────────────────────────────────────────────────

const PANTALLA = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "components/stock_diario", "app/modulos/finanzas/stock-diario"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter((f) => f.endsWith(".jsx"));

test("la pantalla solo consume las rutas del Stock Diario que ya existen", () => {
  const fuente = PANTALLA.map(codigo).join("\n");
  const rutas = [...new Set([...fuente.matchAll(/`\/api\/([^`?$]+)/g)].map((m) => m[1]))];
  // Solo rutas del diario: el prefijo que arma `pedir(...)` y, desde "¿Por qué
  // cambió?", las transferencias de la categoría. Desde el 2026-10-01 la
  // pantalla pide SOLO el resumen: no lista productos ni movimientos.
  assert.deepEqual(rutas.sort(), ["stock_locales/diario/", "stock_locales/diario/transferencias"]);
  assert.deepEqual([...fuente.matchAll(/pedir\("(\w+)"/g)].map((m) => m[1]), ["resumen"]);
  // La API de la lista NO se borró: la pantalla dejó de usarla, nada más.
  for (const r of ["resumen", "productos", "producto", "movimientos", "transferencias"]) assert.ok(fs.existsSync(`app/api/stock_locales/diario/${r}/route.js`), r);
});

test("la pantalla NO muestra productos: ni buscador, ni lista, ni paginador, ni evolución en filas", () => {
  const fuente = PANTALLA.map(codigo).join("\n");
  for (const pieza of ["SunmiCampoBusquedaVoz", "SunmiPaginador", "FilaStockDiario", "ResumenStockDiario", "ResumenValorDelStock", "FilaConImporte"]) {
    assert.doesNotMatch(fuente, new RegExp(`\\b${pieza}\\b`), `${pieza} volvió a la pantalla`);
  }
  assert.doesNotMatch(fuente, /titulo="(Productos|Evolución)"/);
  for (const borrada of ["FilaStockDiario", "ResumenStockDiario", "ResumenValorDelStock"]) {
    assert.ok(!fs.existsSync(`components/stock_diario/${borrada}.jsx`), `${borrada} quedó sin consumidores y tenía que borrarse`);
  }
});

test("el orden del tablero: capital, causas y atención, después del período", () => {
  const p = codigo("components/stock_diario/PantallaStockDiario.jsx");
  const pos = (s) => p.indexOf(s);
  const orden = ["<ChipsDePeriodo", "<NavegadorDePeriodo", "<CapitalEnMercaderia", "<PorQueCambio", "<AtencionDelValor"].map(pos);
  assert.ok(orden.every((x) => x > 0), orden.join());
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, "el orden cambió");
});

test("la página está en Finanzas pero pide stock.ver, y el menú la pone en Finanzas y NO en Stock", () => {
  // Se mudó el 2026-09-30. La ubicación no cambió quién la puede leer: pide
  // `stock.ver`, como sus rutas de datos, y no `finanzas.ver`.
  const pagina = codigo("app/modulos/finanzas/stock-diario/page.jsx");
  assert.match(pagina, /!permisos\.includes\(PERMISO_STOCK_DIARIO\)/);
  assert.doesNotMatch(pagina, /finanzas\.ver|PERMISO_VER_FINANZAS/);
  assert.match(pagina, /<SunmiBackButton href=\{RUTA_FINANZAS\} \/>/, "Volver tiene que llevar a la puerta de Finanzas");
  const stock = MENU_CONFIG.find((g) => g.key === "stock");
  assert.ok(stock.items.some((i) => i.label === "Stock Locales"), "Stock Locales sigue en Stock");
  assert.ok(!stock.items.some((i) => i.label === "Stock Diario" || i.label === "Valor del Stock" || i.href === RUTA_STOCK_DIARIO), "volvió a Stock");
  const finanzas = MENU_CONFIG.find((g) => g.key === "finanzas");
  const diario = finanzas.items.find((i) => i.label === "Valor del Stock");
  assert.equal(diario.href, RUTA_STOCK_DIARIO);
  assert.equal(diario.permiso, "stock.ver");
  assert.ok(fs.existsSync("app/modulos/finanzas/stock-diario/page.jsx"));
});

test("la pantalla no escribe colores ni medidas mágicas", () => {
  assert.ok(PANTALLA.length >= 4, `la enumeración trajo ${PANTALLA.length} piezas`);
  for (const f of PANTALLA) {
    const fuente = codigo(f);
    assert.doesNotMatch(fuente, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(|style=\{\{/, f);
    assert.doesNotMatch(fuente, /\b(text|bg|border)-(red|amber|green|slate|cyan|blue|yellow|orange|gray|zinc)-\d{2,3}\b/, f);
    assert.doesNotMatch(fuente, /\b[a-z-]+-\[[^\]]+\]/, `${f} tiene una medida entre corchetes`);
  }
});
