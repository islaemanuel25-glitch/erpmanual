// CANDADO: FINANZAS ES UN GRUPO DE HERRAMIENTAS, COMO STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/finanzasHerramientas.test.mjs
//
// Tocar Finanzas en Inicio abre el MISMO panel de herramientas que abre Stock
// —`AppLauncherTile` → `SubmenuPanel`— con sus herramientas: el Resumen
// financiero, Pagos a proveedores y, desde el 2026-09-29, Gastos. Antes Finanzas era un solo ítem, así que el
// lanzador entraba directo al resumen, y Pagos a proveedores vivía como una
// tarjeta ADENTRO del resumen: el menú del módulo mezclado con el contenido de
// una de sus pantallas.
//
// No hay una pieza propia de Finanzas: el lanzador abre el panel cuando el grupo
// tiene más de un ítem visible. Por eso se ejerce el MISMO menú que dibuja la
// app (`construirMenuVisible`, el de `useMenu`) con perfiles reales, y se lee la
// regla del lanzador en su fuente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { construirMenuVisible } from "@/lib/menu/menuVisible";
import { getGrupoConfig } from "@/lib/empresa-config";
import { MENU_CONFIG } from "@/lib/menu/registry";
import { gruposDelPanel, destinoDelGrupo } from "@/lib/dashboard/accesosRapidos";
import { RUTA_GASTOS, RUTA_PAGOS_PROVEEDORES, RUTA_PAGO_A_DEPOSITO, RUTA_TESORERIA } from "@/lib/finanzas/contextoFinanzas";

const perfil = (permisos) => ({ id: 1, permisos, esAdmin: permisos.includes("*") });
const menuDe = (permisos) => construirMenuVisible(perfil(permisos), getGrupoConfig());
const grupo = (menu, key) => menu.find((g) => g.key === key);

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

const RESUMEN = "/modulos/finanzas";
// Desde el 2026-09-29, tres: se sumó Gastos, al final, con su propia pantalla.
// Desde el 2026-09-30, cuatro: Stock Diario se mudó desde Stock, al final, y
// ese mismo día pasó a llamarse Valor del Stock al valorizar. La ruta no cambió.
const RUTA_STOCK_DIARIO = "/modulos/finanzas/stock-diario";
// Desde el 2026-10-01, cinco: se sumó Pago a depósito, después de Gastos, como
// lectura financiera de Transferencias. Se autoriza con `finanzas.ver`, igual
// que las otras de plata; la ruta es RUTA_PAGO_A_DEPOSITO.
// Desde el 2026-10-04, seis: Tesorería, después de Pago a depósito. Se autoriza
// con su propio permiso, `tesoreria.ver`, que ningún rol de sistema trae.
const HERRAMIENTAS_FINANZAS = [
  ["Resumen financiero", RESUMEN],
  ["Pagos a proveedores", RUTA_PAGOS_PROVEEDORES],
  ["Gastos", RUTA_GASTOS],
  ["Pago a depósito", RUTA_PAGO_A_DEPOSITO],
  ["Tesorería", RUTA_TESORERIA],
  ["Valor del Stock", RUTA_STOCK_DIARIO],
];
// Valor del Stock se autoriza con `stock.ver` y Tesorería con `tesoreria.ver`,
// no con `finanzas.ver`: con `finanzas.ver` solo, Finanzas muestra las otras cuatro.
const HERRAMIENTAS_SIN_STOCK = HERRAMIENTAS_FINANZAS.filter(([label]) => label !== "Valor del Stock" && label !== "Tesorería");
const HERRAMIENTAS_SIN_TESORERIA = HERRAMIENTAS_FINANZAS.filter(([label]) => label !== "Tesorería");
const PERMISO_DE_ITEM = { [RUTA_STOCK_DIARIO]: "stock.ver", [RUTA_TESORERIA]: "tesoreria.ver" };

// ── LA REGLA DEL LANZADOR: MÁS DE UN ÍTEM ABRE EL PANEL ────────────────────

test("el lanzador abre el panel de herramientas cuando el grupo tiene más de un ítem", () => {
  const tile = codigo("components/layout/AppLauncherTile.jsx");
  assert.match(tile, /const hasSubmenu = count > 1;/, "cambió la regla que decide si el lanzador abre el panel");
  assert.match(tile, /<SubmenuPanel\b/, "el lanzador dejó de abrir el panel de herramientas");
  assert.match(codigo("components/layout/AppLauncher.jsx"), /<AppLauncherTile\b/);
});

// ── FINANZAS ─────────────────────────────────────────────────────────────

test("Finanzas tiene seis herramientas: Resumen financiero, Pagos a proveedores, Gastos, Pago a depósito, Tesorería y Stock Diario, en ese orden", () => {
  const finanzas = MENU_CONFIG.find((g) => g.key === "finanzas");
  assert.equal(finanzas.label, "Finanzas");
  assert.deepEqual(finanzas.items.map((i) => [i.label, i.href]), HERRAMIENTAS_FINANZAS);
  assert.equal(RUTA_PAGOS_PROVEEDORES, "/modulos/finanzas/pagos-proveedores");
  // Las puertas son las páginas que ya existen: no se duplicó ninguna.
  assert.ok(existsSync("app/modulos/finanzas/page.jsx"));
  assert.ok(existsSync("app/modulos/finanzas/pagos-proveedores/page.jsx"));
  assert.equal(RUTA_GASTOS, "/modulos/finanzas/gastos");
  assert.ok(existsSync("app/modulos/finanzas/gastos/page.jsx"));
  assert.equal(RUTA_PAGO_A_DEPOSITO, "/modulos/finanzas/pago-a-deposito");
  assert.ok(existsSync("app/modulos/finanzas/pago-a-deposito/page.jsx"));
  assert.ok(existsSync("app/modulos/finanzas/stock-diario/page.jsx"));
  // Cada herramienta con su ícono del mismo sistema que las de Stock.
  for (const i of finanzas.items) assert.equal(typeof i.icon, "object", `${i.label} no tiene ícono`);
});

test("con `finanzas.ver`, Inicio ofrece Finanzas con sus herramientas: abre el panel y no entra directo", () => {
  for (const [permisos, esperadas] of [
    [["finanzas.ver"], HERRAMIENTAS_SIN_STOCK],
    [["finanzas.ver", "stock.ver"], HERRAMIENTAS_SIN_TESORERIA],
    [["*"], HERRAMIENTAS_FINANZAS],
  ]) {
    const menu = menuDe(permisos);
    const finanzas = grupo(gruposDelPanel(menu), "finanzas");
    assert.ok(finanzas, `Finanzas no aparece en el Panel con ${permisos}`);
    assert.equal(finanzas.label, "Finanzas");
    assert.deepEqual(finanzas.items.map((i) => [i.label, i.href]), esperadas, `${permisos}`);
    // Más de un ítem visible: es la condición exacta con que el lanzador abre el panel.
    assert.ok(finanzas.items.length > 1, "Finanzas volvió a entrar directo al resumen");
    // Quien no usa el lanzador —los accesos rápidos del móvil— sigue entrando por la
    // puerta del grupo, igual que Stock: el Resumen financiero.
    assert.equal(destinoDelGrupo(finanzas), RESUMEN);
  }
});

test("los permisos que ya existían se siguen respetando", () => {
  // Sin `finanzas.ver` ni `stock.ver`, Finanzas no aparece, ni con permisos de
  // otros módulos.
  for (const permisos of [[], ["productos.ver"], ["finanzas.pagos_proveedores.registrar"]]) {
    assert.equal(grupo(menuDe(permisos), "finanzas"), undefined, `Finanzas apareció con ${JSON.stringify(permisos)}`);
  }
  // Con solo `stock.ver` aparece desde el 2026-09-30, y con UNA herramienta:
  // Valor del Stock, que se autoriza como Stock. Ninguna de las de ventas,
  // pagos ni gastos.
  assert.deepEqual(
    grupo(menuDe(["stock.ver"]), "finanzas").items.map((i) => [i.label, i.href]),
    [["Valor del Stock", RUTA_STOCK_DIARIO]]
  );
  // El menú no es la defensa: las pantallas y las rutas siguen pidiendo lo mismo.
  assert.match(codigo("app/modulos/finanzas/page.jsx"), /permisos\.includes\("finanzas\.ver"\)/);
  assert.match(codigo("app/modulos/finanzas/pagos-proveedores/page.jsx"), /permisos\.includes\(PERMISO_VER_FINANZAS\)/);
  assert.match(codigo("app/api/finanzas/tablero/route.js"), /checkPerm\(session, "finanzas\.ver"\)/);
  assert.match(codigo("app/api/finanzas/pagos-proveedores/route.js"), /PERMISO_VER_FINANZAS/);
  // Y cada herramienta pide exactamente el permiso de su pantalla: las de plata
  // `finanzas.ver`, Stock Diario `stock.ver`, Tesorería `tesoreria.ver`.
  for (const i of MENU_CONFIG.find((g) => g.key === "finanzas").items) {
    assert.equal(i.permiso, PERMISO_DE_ITEM[i.href] || "finanzas.ver", i.label);
  }
  assert.ok(existsSync("app/modulos/finanzas/tesoreria/page.jsx"));
});

test("el Resumen financiero ya no tiene la tarjeta de Pagos a proveedores: empieza con su propio contenido", () => {
  const tablero = codigo("components/finanzas/TableroFinanzas.jsx");
  assert.doesNotMatch(tablero, /RUTA_PAGOS_PROVEEDORES|pagos-proveedores|SunmiNavCard|Pagos a proveedores/,
    "el resumen volvió a tener una entrada a Pagos a proveedores");
});

// ── LO QUE NO CAMBIA ──────────────────────────────────────────────────────

test("Stock vuelve a sus cuatro herramientas: Stock Diario ya no está ahí", () => {
  // Fueron cinco mientras Stock Diario vivió al lado de Stock Locales. Desde el
  // 2026-09-30 es de Finanzas, y en Stock no queda ninguna entrada a él —ni con
  // todos los permisos—. La puerta del grupo sigue siendo Stock Locales.
  const stock = grupo(gruposDelPanel(menuDe(["*"])), "stock");
  assert.deepEqual(stock.items.map((i) => [i.label, i.href]), [
    ["Stock Locales", "/modulos/stock_locales"],
    ["Productos", "/modulos/productos"],
    ["Ofertas", "/modulos/ofertas"],
    ["Categorías", "/modulos/categorias"],
  ]);
  assert.equal(destinoDelGrupo(stock), "/modulos/stock_locales");
});

test("los demás módulos de Inicio no cambian: mismos grupos, mismo orden", () => {
  assert.deepEqual(gruposDelPanel(menuDe(["*"])).map((g) => g.key), [
    "pos-ventas",
    "stock",
    "compras",
    "transferencias",
    "finanzas",
    "reportes",
    "administracion",
    "configuracion",
  ]);
});

test("el menú no trae colores ni clases escritas a mano para Finanzas", () => {
  const finanzas = MENU_CONFIG.find((g) => g.key === "finanzas");
  // El color es un token de tema, el mismo que tenía; los ítems no traen estilo propio.
  assert.equal(finanzas.color, "green");
  for (const i of finanzas.items) {
    for (const campo of ["color", "className", "style"]) assert.equal(i[campo], undefined, `${i.label}.${campo}`);
  }
});
