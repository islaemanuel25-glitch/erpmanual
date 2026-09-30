// CANDADO: STOCK DIARIO SE MUDÓ DE STOCK A FINANZAS, Y NO QUEDÓ DUPLICADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/stockDiarioEnFinanzas.test.mjs
//
// El 2026-09-30 la pantalla del Stock Diario dejó el grupo Stock y pasó a
// Finanzas: es la base física de lo que después se va a valorizar. Lo que se
// afirma acá:
//
//   A. en Stock no queda ninguna entrada a Stock Diario;
//   B. en Finanzas sí, para quien tiene los dos permisos;
//   C. la ruta nueva es la canónica y dibuja la pantalla de siempre;
//   D. la ruta vieja solo redirige, con su dirección completa;
//   E. hay UNA pantalla, no dos;
//   F. las rutas de datos no cambiaron: las mismas cuatro, solo GET, stock.ver;
//   G. nada de la mudanza escribe stock;
//   H. los permisos son los decididos contra la matriz real de roles.
//
// Se ejerce el MISMO menú que dibuja la app (`construirMenuVisible`) con los
// permisos de los roles de sistema tal como los define `systemRoles.js`, no con
// listas escritas a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { construirMenuVisible } from "@/lib/menu/menuVisible";
import { getGrupoConfig } from "@/lib/empresa-config";
import { MENU_CONFIG } from "@/lib/menu/registry";
import { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO, DUENO_LOCAL } from "@/lib/rbac/systemRoles";
import {
  PERMISO_STOCK_DIARIO,
  PERMISOS_PANTALLA_STOCK_DIARIO,
  RUTA_STOCK_DIARIO,
  RUTA_STOCK_DIARIO_ANTERIOR,
} from "@/lib/stock/libro/rutasStockDiario";

const sinComentarios = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

const perfil = (permisos) => ({ id: 1, permisos, esAdmin: permisos.includes("*") });
const menuDe = (permisos) => construirMenuVisible(perfil(permisos), getGrupoConfig());
const grupo = (menu, key) => menu.find((g) => g.key === key);
const tieneStockDiario = (g) => Boolean(g?.items.some((i) => i.label === "Stock Diario" || i.href === RUTA_STOCK_DIARIO));

const PAGINA = "app/modulos/finanzas/stock-diario/page.jsx";
const PAGINA_ANTERIOR = "app/modulos/stock_locales/diario/page.jsx";

function archivosDeLaApp() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app", "components", "lib"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
}

// ── A · STOCK ───────────────────────────────────────────────────────────────

test("A. en Stock no queda ninguna entrada a Stock Diario, con ningún permiso", () => {
  assert.equal(tieneStockDiario(MENU_CONFIG.find((g) => g.key === "stock")), false, "sigue en la configuración de Stock");
  for (const permisos of [["*"], ["stock.ver"], ["stock.ver", "finanzas.ver"], DEFAULT_PERMISOS_SISTEMA[ENCARGADO]]) {
    assert.equal(tieneStockDiario(grupo(menuDe(permisos), "stock")), false, `aparece en Stock con ${permisos}`);
  }
});

test("A. nadie más enlaza a la ruta vieja: solo la constante y su redirección la nombran", () => {
  const nombran = archivosDeLaApp().filter((f) => codigo(f).includes(RUTA_STOCK_DIARIO_ANTERIOR));
  assert.deepEqual(nombran, ["lib/stock/libro/rutasStockDiario.js"]);
});

// ── B · FINANZAS ────────────────────────────────────────────────────────────

test("B. Stock Diario está en Finanzas, al final, con la ruta nueva", () => {
  const finanzas = MENU_CONFIG.find((g) => g.key === "finanzas");
  const diario = finanzas.items.at(-1);
  assert.equal(diario.label, "Stock Diario");
  assert.equal(diario.href, RUTA_STOCK_DIARIO);
  assert.equal(diario.requiredModule, "finanzas");
  assert.equal(typeof diario.icon, "object");
  for (const permisos of [["*"], ["finanzas.ver", "stock.ver"]]) {
    assert.equal(tieneStockDiario(grupo(menuDe(permisos), "finanzas")), true, `no aparece en Finanzas con ${permisos}`);
  }
});

// ── C y E · LA RUTA NUEVA, UNA SOLA PANTALLA ────────────────────────────────

test("C. la ruta canónica es de Finanzas y dibuja la pantalla de siempre", () => {
  assert.equal(RUTA_STOCK_DIARIO, "/modulos/finanzas/stock-diario");
  assert.ok(existsSync(PAGINA));
  const pagina = codigo(PAGINA);
  assert.match(pagina, /<PantallaStockDiario \/>/);
  assert.match(pagina, /useTituloDePagina\("Stock Diario"\)/, "no se renombró: sigue siendo Stock Diario");
  assert.match(pagina, /href=\{RUTA_FINANZAS\}/, "Volver lleva a la puerta de Finanzas");
});

test("E. hay UNA pantalla de Stock Diario: ninguna otra página la dibuja", () => {
  const dibujan = archivosDeLaApp().filter((f) => f.startsWith("app/") && /<PantallaStockDiario\b/.test(codigo(f)));
  assert.deepEqual(dibujan, [PAGINA]);
  assert.doesNotMatch(codigo(PAGINA_ANTERIOR), /PantallaStockDiario|components\/stock_diario/, "la ruta vieja dibuja una copia");
});

// ── D · LA RUTA VIEJA ───────────────────────────────────────────────────────

test("D. la ruta vieja redirige a la nueva, conservando local, período y búsqueda", async () => {
  const { default: Redirige } = await import("@/app/modulos/stock_locales/diario/page.jsx");
  const destino = async (searchParams) => {
    try {
      await Redirige({ searchParams: Promise.resolve(searchParams) });
    } catch (e) {
      // `redirect` de Next corta con un error cuyo `digest` lleva el destino.
      const partes = String(e?.digest || "").split(";");
      assert.equal(partes[0], "NEXT_REDIRECT", `no redirigió: ${e?.message}`);
      return partes.slice(2, -2).join(";");
    }
    assert.fail("no redirigió");
  };
  assert.equal(await destino({}), RUTA_STOCK_DIARIO);
  assert.equal(
    await destino({ unidad: "SEMANA", fecha: "2026-09-30", q: "coca cola" }),
    `${RUTA_STOCK_DIARIO}?unidad=SEMANA&fecha=2026-09-30&q=coca+cola`
  );
});

// ── F · LAS RUTAS DE DATOS ──────────────────────────────────────────────────

test("F. las rutas de datos son las mismas cuatro, en su lugar, solo GET y con stock.ver", () => {
  for (const r of ["resumen", "productos", "producto", "movimientos"]) {
    const ruta = `app/api/stock_locales/diario/${r}/route.js`;
    assert.ok(existsSync(ruta), `falta ${ruta}`);
    const fuente = codigo(ruta);
    assert.deepEqual([...fuente.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["GET"], `${r}: exporta otra cosa que GET`);
    assert.match(fuente, /checkPerm\(session, "stock\.ver"\)/, `${r}: cambió el permiso`);
  }
  assert.ok(!existsSync("app/api/finanzas/stock-diario"), "se duplicaron las rutas de datos bajo Finanzas");
});

// ── G · SOLO LECTURA ────────────────────────────────────────────────────────

test("G. ni la pantalla ni su página escriben: solo piden con GET", () => {
  const fuentes = [PAGINA, PAGINA_ANTERIOR, ...archivosDeLaApp().filter((f) => f.startsWith("components/stock_diario/"))];
  for (const f of fuentes) {
    const t = codigo(f);
    assert.doesNotMatch(t, /method:\s*["'`](POST|PUT|PATCH|DELETE)/i, `${f} escribe`);
    assert.doesNotMatch(t, /stock_locales\/(ajustar|limites|nuevo|importar)/, `${f} llama a una ruta que escribe stock`);
  }
});

// ── H · LOS PERMISOS ────────────────────────────────────────────────────────

test("H. la pantalla y su ítem piden finanzas.ver Y stock.ver; los datos, stock.ver como siempre", () => {
  assert.equal(PERMISO_STOCK_DIARIO, "stock.ver");
  assert.deepEqual([...PERMISOS_PANTALLA_STOCK_DIARIO], ["finanzas.ver", "stock.ver"]);
  assert.match(codigo(PAGINA), /PERMISOS_PANTALLA_STOCK_DIARIO\.every\(\(p\) => permisos\.includes\(p\)\)/);
  const diario = MENU_CONFIG.find((g) => g.key === "finanzas").items.find((i) => i.label === "Stock Diario");
  assert.equal(diario.permiso, "finanzas.ver");
  assert.deepEqual([...diario.requiredAllPerms], [...PERMISOS_PANTALLA_STOCK_DIARIO]);
});

test("H. contra la matriz real: con uno solo de los dos permisos no se ve; con los dos, sí", () => {
  assert.equal(tieneStockDiario(grupo(menuDe(["finanzas.ver"]), "finanzas")), false, "se ve sin stock.ver: la pantalla no podría cargar");
  assert.equal(grupo(menuDe(["stock.ver"]), "finanzas"), undefined, "Finanzas apareció sin finanzas.ver");
  assert.equal(tieneStockDiario(grupo(menuDe(["finanzas.ver", "stock.ver"]), "finanzas")), true);
});

test("H. los roles de sistema: ninguno por-local tiene finanzas.ver, así que lo ve Admin y quien lo tenga tildado", () => {
  // Es la consecuencia de la mudanza, escrita para que no sorprenda: ENCARGADO
  // y DUEÑO_LOCAL tienen stock.ver pero NO finanzas.ver —`systemRoles.js` lo
  // deja fuera a propósito—, así que dejan de ver Stock Diario hasta que un
  // administrador les tilde finanzas.ver. No se les agregó ningún permiso.
  for (const rol of [CAJERO, ENCARGADO, DUENO_LOCAL]) {
    assert.ok(!DEFAULT_PERMISOS_SISTEMA[rol].includes("finanzas.ver"), `${rol} tiene finanzas.ver: revisá esta decisión`);
    assert.equal(tieneStockDiario(grupo(menuDe(DEFAULT_PERMISOS_SISTEMA[rol]), "finanzas")), false, rol);
  }
  assert.ok(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("stock.ver"));
  assert.equal(tieneStockDiario(grupo(menuDe(["*"]), "finanzas")), true, "Admin");
});
