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

import FilaStockDiario from "./FilaStockDiario.jsx";
import ResumenStockDiario from "./ResumenStockDiario.jsx";
import ResumenConImporte from "../periodo/ResumenConImporte.jsx";
import { PUNTO_CERO_PRODUCCION, estadoDelPeriodo, movidoDesdeAgregado, stockDeCadena } from "@/lib/stock/libro/stockDiario";
import { cadenaApi, periodoApi } from "@/lib/stock/libro/stockDiarioApi";
import { RUTA_STOCK_DIARIO } from "@/lib/stock/libro/rutasStockDiario";
import { MENU_CONFIG } from "@/lib/menu/registry";

const h = (el) => renderToStaticMarkup(el);
const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const HOY = "2026-10-05";
const codigo = (ruta) =>
  fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function respuesta(dia) {
  const periodo = estadoDelPeriodo({ desde: dia, hasta: dia, puntoCero: PC, hoy: HOY });
  return periodoApi({ periodo, puntoCero: PC, hoy: HOY }, { unidad: "DIA", fecha: dia });
}
function item(r, { antes, hasta, identidad = {} }) {
  const periodo = estadoDelPeriodo({ desde: r.periodo.desde, hasta: r.periodo.hasta, puntoCero: PC, hoy: HOY });
  const u = (x) => (x ? { tipo: x.tipo ?? "CAMBIO", cantidadPosterior: x.cantidad, cantidadAnterior: x.cantidad, enTransitoPosterior: x.enTransito ?? "0", enTransitoAnterior: x.enTransito ?? "0" } : null);
  return cadenaApi(
    stockDeCadena({
      localId: 1,
      productoLocalId: 9,
      periodo,
      ultimoAntes: periodo.aperturaConocida ? u(antes) : null,
      ultimoHasta: u(hasta),
      movido: movidoDesdeAgregado({}),
      identidad: { productoBaseId: 3, nombre: "Galletitas Terrabusi 170 g", unidadMedida: "unidad", fuente: "ACTUAL", productoEliminado: false, ...identidad },
    })
  );
}

// ── LA FILA ─────────────────────────────────────────────────────────────

test("la fila: nombre, Apertura → Ahora, y la variación en la presentación de Stock Locales", () => {
  const r = respuesta(HOY);
  const s = h(React.createElement(FilaStockDiario, { item: item(r, { antes: { cantidad: "18" }, hasta: { cantidad: "22" } }), respuesta: r }));
  assert.ok(s.includes(">Galletitas Terrabusi 170 g<"));
  assert.ok(s.includes(">Apertura 18 uds → Ahora 22 uds<"), s);
  assert.ok(s.includes(">+4 uds<"), s);
});

test("sin valor que explicar, la fila no es tocable: un 'Ver' sin detalle sería un botón roto", () => {
  const r = respuesta(HOY);
  const s = h(React.createElement(FilaStockDiario, { item: item(r, { antes: { cantidad: "18" }, hasta: { cantidad: "22" } }), respuesta: r }));
  assert.ok(!s.includes("Ver ›"), s);
  assert.ok(!/<button|<a /.test(s), "la fila no es tocable");
});

test("con su valor, la fila muestra la variación en pesos y se abre para ver el detalle, sin navegar", () => {
  const r = respuesta(HOY);
  const conValor = {
    ...item(r, { antes: { cantidad: "20" }, hasta: { cantidad: "20" } }),
    valor: { completo: true, faltante: null, stockNegativo: false, cantidadInicial: 20, cantidadFinal: 20, costoInicial: 1000, costoFinal: 1200, unidadFisica: "UNIDAD", anomaliasDeCosto: [], inicial: 20000, final: 24000, variacion: 4000, fisico: 0, revalorizacion: 4000 },
  };
  const s = h(React.createElement(FilaStockDiario, { item: conValor, respuesta: r }));
  assert.ok(s.includes(">+$4.000,00<"), s);
  assert.ok(s.includes("Ver ›") && /<button/.test(s), "la fila con detalle es tocable");
  assert.ok(!s.includes("data-detalle-valor"), "el detalle arranca cerrado");
  assert.doesNotMatch(codigo("components/stock_diario/FilaStockDiario.jsx"), /href=|router\.|fetch\(/, "abrir el detalle no navega ni pide nada");
});

test("PRODUCTO ELIMINADO dibujado: 'Ahora No existe', sin cifra a la derecha, nunca 'Ahora 0'", () => {
  const r = respuesta(HOY);
  const s = h(
    React.createElement(FilaStockDiario, {
      item: item(r, { antes: { cantidad: "5" }, hasta: { tipo: "BAJA", cantidad: "5" }, identidad: { productoEliminado: true } }),
      respuesta: r,
    })
  );
  assert.ok(s.includes(">Apertura 5 uds → Ahora No existe<"), s);
  assert.ok(s.includes(">Producto eliminado<"));
  assert.ok(!s.includes("Ahora 0") && !s.includes("−5") && !s.includes("−5"), s);
});

test("APERTURA DESCONOCIDA dibujada: 'No disponible', sin variación ni cero", () => {
  const r = respuesta(PC.dia);
  const s = h(React.createElement(FilaStockDiario, { item: item(r, { antes: { cantidad: "99" }, hasta: { cantidad: "18" } }), respuesta: r }));
  assert.ok(s.includes(">Apertura No disponible → Cierre 18 uds<"), s);
  assert.ok(s.includes("Sin variación: falta la apertura"));
  assert.ok(!s.includes("99") && !s.includes(">0<"), s);
});

// ── EL RESUMEN ──────────────────────────────────────────────────────────

test("el resumen: productos con movimientos y tres columnas de CONTEOS, con el aviso del día en curso", () => {
  const r = {
    ...respuesta(HOY),
    conteos: { conMovimientos: 214, conTransitoAlCierre: 12 },
    totales: { cantidad: { entradas: 931.5, salidas: 1203.25, movimientosDeEntrada: 38, movimientosDeSalida: 43 } },
  };
  const s = h(React.createElement(ResumenStockDiario, { respuesta: r }));
  assert.ok(s.includes(">Actividad de hoy<"));
  assert.ok(s.includes("214") && s.includes(">productos con movimientos<"));
  for (const t of [">Entradas<", ">38<", ">Salidas<", ">43<", ">En tránsito<", ">12<", ">productos<"]) assert.ok(s.includes(t), t);
  assert.ok(!s.includes("931") && !s.includes("1203"), "las cantidades sumadas no se muestran");
  assert.ok(s.includes("Día en curso · cada producto muestra Apertura → Ahora, no el cierre"));
  assert.ok(s.includes("sunmi-border-warning"), "el aviso enciende el borde");
});

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
  // cambió?", las transferencias de la categoría. El listado de movimientos por
  // categoría ya NO lo pide la pantalla: el detalle de cada operación es de su
  // módulo, y esa ruta queda para auditar.
  assert.deepEqual(rutas.sort(), ["stock_locales/diario/", "stock_locales/diario/transferencias"]);
  assert.match(fuente, /pedir\("resumen", consultaResumen\)/);
  assert.match(fuente, /pedir\("productos", consultaLista\)/);
  for (const r of ["resumen", "productos", "transferencias"]) assert.ok(fs.existsSync(`app/api/stock_locales/diario/${r}/route.js`), r);
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
