// CANDADO: STOCK DIARIO VIVE EN FINANZAS, SE AUTORIZA COMO STOCK, Y NO ABRE PLATA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/stockDiarioEnFinanzas.test.mjs
//
// El 2026-09-30 la pantalla del Stock Diario dejó el grupo Stock y pasó a
// Finanzas. DÓNDE se muestra cambió; QUIÉN la puede leer, no: sigue siendo
// `stock.ver`, el de sus rutas de datos. Estar en Finanzas no la vuelve
// información financiera, y no pide `finanzas.ver`.
//
// Lo que se afirma, con las letras de la decisión:
//
//   A-E. con `stock.ver` y sin `finanzas.ver`: Finanzas aparece, con Stock
//        Diario, y SIN Resumen financiero, Pagos a proveedores ni Gastos;
//   F.   Stock Diario pide `stock.ver` y no `finanzas.ver`;
//   G.   CAJERO, sin `stock.ver`, no lo obtiene;
//   H.   las rutas de datos siguen pidiendo `stock.ver`, solo GET;
//   I.   nada de Finanzas escribe stock;
//   J.   la ruta vieja sigue redirigiendo;
//   K.   hay UNA pantalla.
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
import { gruposDelPanel, destinoDelGrupo } from "@/lib/dashboard/accesosRapidos";
import { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO, DUENO_LOCAL } from "@/lib/rbac/systemRoles";
import { RUTA_GASTOS, RUTA_PAGOS_PROVEEDORES, RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";
import { PERMISO_STOCK_DIARIO, RUTA_STOCK_DIARIO, RUTA_STOCK_DIARIO_ANTERIOR } from "@/lib/stock/libro/rutasStockDiario";

const sinComentarios = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

const perfil = (permisos) => ({ id: 1, permisos, esAdmin: permisos.includes("*") });
const menuDe = (permisos) => construirMenuVisible(perfil(permisos), getGrupoConfig());
const grupo = (menu, key) => menu.find((g) => g.key === key);
const hrefs = (g) => (g?.items || []).map((i) => i.href);
const tieneStockDiario = (g) => hrefs(g).includes(RUTA_STOCK_DIARIO);

const PAGINA = "app/modulos/finanzas/stock-diario/page.jsx";
const PAGINA_ANTERIOR = "app/modulos/stock_locales/diario/page.jsx";
const HERRAMIENTAS_DE_PLATA = [RUTA_FINANZAS, RUTA_PAGOS_PROVEEDORES, RUTA_GASTOS];

function archivosDeLaApp() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app", "components", "lib"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
}

// ── A-E · CON stock.ver Y SIN finanzas.ver ────────────────────────────────

for (const [quien, permisos] of [
  ["solo stock.ver", ["stock.ver"]],
  ["ENCARGADO", DEFAULT_PERMISOS_SISTEMA[ENCARGADO]],
  ["DUEÑO_LOCAL", DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL]],
]) {
  test(`A-E. ${quien}: Finanzas aparece con Stock Diario como única herramienta, sin nada de plata`, () => {
    assert.ok(!permisos.includes("finanzas.ver"), `${quien} tiene finanzas.ver: este caso ya no prueba lo que dice`);
    assert.ok(permisos.includes("stock.ver"));
    const finanzas = grupo(menuDe(permisos), "finanzas");
    assert.ok(finanzas, `A: Finanzas no aparece para ${quien}`);
    assert.deepEqual(hrefs(finanzas), [RUTA_STOCK_DIARIO], `B-E: ${quien} ve otra cosa que Stock Diario`);
    for (const plata of HERRAMIENTAS_DE_PLATA) {
      assert.ok(!hrefs(finanzas).includes(plata), `${quien} ve ${plata}`);
    }
  });
}

test("A. con solo stock.ver, entrar a Finanzas lleva a Stock Diario por las reglas que ya existían", () => {
  const finanzas = grupo(gruposDelPanel(menuDe(["stock.ver"])), "finanzas");
  // La puerta del grupo es el Resumen financiero, y no es visible: el destino
  // cae al primer ítem visible. Es `destinoDelGrupo` —Inicio— y la misma regla
  // escrita en `MobileNav`, no una lógica nueva.
  assert.equal(destinoDelGrupo(finanzas), RUTA_STOCK_DIARIO);
  const nav = codigo("components/layout/MobileNav.jsx");
  assert.match(nav, /grupo\.href && visibles\.some\(\(i\) => i\.href === grupo\.href\)\s*\?\s*grupo\.href\s*:\s*primer\.href/);
  // Un solo ítem visible: el lanzador entra directo, sin abrir el panel.
  assert.equal(finanzas.items.length, 1);
  assert.match(codigo("components/layout/AppLauncherTile.jsx"), /const hasSubmenu = count > 1;/);
});

test("C-E. las pantallas de plata siguen pidiendo finanzas.ver: el grupo visible no las abre", () => {
  assert.match(codigo("app/modulos/finanzas/page.jsx"), /permisos\.includes\("finanzas\.ver"\)/);
  assert.match(codigo("app/modulos/finanzas/pagos-proveedores/page.jsx"), /permisos\.includes\(PERMISO_VER_FINANZAS\)/);
  assert.match(codigo("app/modulos/finanzas/gastos/page.jsx"), /permisos\.includes\(PERMISO_VER_FINANZAS\)/);
  assert.match(codigo("app/api/finanzas/tablero/route.js"), /checkPerm\(session, "finanzas\.ver"\)/);
  assert.match(codigo("app/api/finanzas/pagos-proveedores/route.js"), /checkPerm\(session, PERMISO_VER_FINANZAS\)/);
  assert.match(codigo("app/api/finanzas/gastos/route.js"), /checkPerm\(session, PERMISO_VER_FINANZAS\)/);
  for (const i of MENU_CONFIG.find((g) => g.key === "finanzas").items) {
    if (i.href === RUTA_STOCK_DIARIO) continue;
    assert.equal(i.permiso, "finanzas.ver", `${i.label} dejó de pedir finanzas.ver`);
  }
});

// ── F · EL PERMISO DE STOCK DIARIO ──────────────────────────────────────────

test("F. Stock Diario pide stock.ver y NO finanzas.ver: en su ítem, en su pantalla y en su constante", () => {
  assert.equal(PERMISO_STOCK_DIARIO, "stock.ver");
  const diario = MENU_CONFIG.find((g) => g.key === "finanzas").items.find((i) => i.href === RUTA_STOCK_DIARIO);
  // El nombre visible desde que valoriza; la ruta y el permiso, los de siempre.
  assert.equal(diario.label, "Valor del Stock");
  assert.equal(diario.requiredFeature, "stockPorLocal", "la misma feature que Stock Locales, la que se perdió en la mudanza");
  assert.equal(diario.permiso, "stock.ver");
  assert.equal(diario.requiredAllPerms, undefined);
  assert.equal(diario.requiredAnyPerms, undefined);
  const pagina = codigo(PAGINA);
  assert.match(pagina, /!permisos\.includes\(PERMISO_STOCK_DIARIO\)/);
  assert.doesNotMatch(pagina, /finanzas\.ver|PERMISO_VER_FINANZAS/, "la pantalla volvió a pedir finanzas.ver");
});

test("F. con la feature stockPorLocal apagada, Valor del Stock se va con Stock Locales y no queda un Finanzas vacío", () => {
  const cfg = getGrupoConfig();
  const apagada = { ...cfg, features: { ...cfg.features, stockPorLocal: false }, featuresActivas: { ...cfg.featuresActivas, stockPorLocal: false } };
  const prendida = construirMenuVisible(perfil(["stock.ver"]), cfg);
  assert.ok(tieneStockDiario(grupo(prendida, "finanzas")), "con la feature prendida tiene que verse");
  const menu = construirMenuVisible(perfil(["stock.ver"]), apagada);
  assert.equal(grupo(menu, "finanzas"), undefined, "Finanzas quedó visible sin herramientas");
  assert.equal(grupo(menu, "stock"), undefined);
  // Con finanzas.ver, Finanzas sigue con sus herramientas de plata y sin ésta.
  const conFinanzas = construirMenuVisible(perfil(["stock.ver", "finanzas.ver"]), apagada);
  assert.ok(!tieneStockDiario(grupo(conFinanzas, "finanzas")));
});

test("F. el grupo Finanzas se ve con finanzas.ver O stock.ver, y con ninguno de los dos no", () => {
  const finanzas = MENU_CONFIG.find((g) => g.key === "finanzas");
  assert.deepEqual(finanzas.requiredAnyPerms, ["finanzas.ver", "stock.ver"]);
  for (const permisos of [[], ["productos.ver"], ["finanzas.pagos_proveedores.registrar"], ["pos.usar"]]) {
    assert.equal(grupo(menuDe(permisos), "finanzas"), undefined, `Finanzas apareció con ${JSON.stringify(permisos)}`);
  }
});

test("F. con finanzas.ver sin stock.ver: las herramientas de plata, sin Stock Diario", () => {
  const finanzas = grupo(menuDe(["finanzas.ver"]), "finanzas");
  assert.deepEqual(hrefs(finanzas), HERRAMIENTAS_DE_PLATA);
});

test("F. con los dos, y Admin: las cuatro", () => {
  for (const permisos of [["finanzas.ver", "stock.ver"], ["*"]]) {
    assert.deepEqual(hrefs(grupo(menuDe(permisos), "finanzas")), [...HERRAMIENTAS_DE_PLATA, RUTA_STOCK_DIARIO], `${permisos}`);
  }
});

// ── G · CAJERO ──────────────────────────────────────────────────────────────

test("G. CAJERO, sin stock.ver, no obtiene Stock Diario ni Finanzas", () => {
  const permisos = DEFAULT_PERMISOS_SISTEMA[CAJERO];
  assert.ok(!permisos.includes("stock.ver") && !permisos.includes("finanzas.ver"));
  const menu = menuDe(permisos);
  assert.equal(grupo(menu, "finanzas"), undefined);
  assert.ok(!menu.some((g) => tieneStockDiario(g)), "CAJERO ve Stock Diario en algún grupo");
});

test("G. ningún rol de sistema recibió finanzas.ver", () => {
  for (const rol of [CAJERO, ENCARGADO, DUENO_LOCAL]) {
    assert.ok(!DEFAULT_PERMISOS_SISTEMA[rol].includes("finanzas.ver"), rol);
  }
});

// ── H · LAS RUTAS DE DATOS ──────────────────────────────────────────────────

test("H. las rutas de datos son las mismas cuatro, en su lugar, solo GET y con stock.ver", () => {
  for (const r of ["resumen", "productos", "producto", "movimientos"]) {
    const ruta = `app/api/stock_locales/diario/${r}/route.js`;
    assert.ok(existsSync(ruta), `falta ${ruta}`);
    const fuente = codigo(ruta);
    assert.deepEqual([...fuente.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["GET"], `${r}: exporta otra cosa que GET`);
    assert.match(fuente, /checkPerm\(session, "stock\.ver"\)/, `${r}: cambió el permiso`);
    assert.doesNotMatch(fuente, /finanzas/, `${r}: empezó a pedir algo de Finanzas`);
  }
  assert.ok(!existsSync("app/api/finanzas/stock-diario"), "se duplicaron las rutas de datos bajo Finanzas");
});

// ── I · SOLO LECTURA ────────────────────────────────────────────────────────

test("I. nada de Finanzas escribe stock: ni sus páginas, ni sus rutas, ni la pantalla de Stock Diario", () => {
  const fuentes = archivosDeLaApp().filter(
    (f) => f.startsWith("app/modulos/finanzas/") || f.startsWith("app/api/finanzas/") || f.startsWith("components/stock_diario/")
  );
  fuentes.push(PAGINA_ANTERIOR);
  for (const f of fuentes) {
    const t = codigo(f);
    assert.doesNotMatch(t, /stockLocal\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/, `${f} escribe StockLocal`);
    assert.doesNotMatch(t, /stock_locales\/(ajustar|limites|nuevo|importar)/, `${f} llama a una ruta que escribe stock`);
  }
  for (const f of [PAGINA, PAGINA_ANTERIOR, ...fuentes.filter((x) => x.startsWith("components/stock_diario/"))]) {
    assert.doesNotMatch(codigo(f), /method:\s*["'`](POST|PUT|PATCH|DELETE)/i, `${f} escribe`);
  }
});

// ── J · LA RUTA VIEJA ───────────────────────────────────────────────────────

test("J. la ruta vieja redirige a la nueva, conservando local, período y búsqueda", async () => {
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

test("J. y Stock Diario no volvió al grupo Stock, con ningún permiso", () => {
  assert.equal(tieneStockDiario(MENU_CONFIG.find((g) => g.key === "stock")), false);
  for (const permisos of [["*"], ["stock.ver"], DEFAULT_PERMISOS_SISTEMA[ENCARGADO]]) {
    assert.equal(tieneStockDiario(grupo(menuDe(permisos), "stock")), false, `aparece en Stock con ${permisos}`);
  }
  const nombran = archivosDeLaApp().filter((f) => codigo(f).includes(RUTA_STOCK_DIARIO_ANTERIOR));
  assert.deepEqual(nombran, ["lib/stock/libro/rutasStockDiario.js"], "alguien enlaza a la ruta vieja");
});

// ── K · UNA SOLA PANTALLA ───────────────────────────────────────────────────

test("K. hay UNA pantalla de Stock Diario: ninguna otra página la dibuja", () => {
  const dibujan = archivosDeLaApp().filter((f) => f.startsWith("app/") && /<PantallaStockDiario\b/.test(codigo(f)));
  assert.deepEqual(dibujan, [PAGINA]);
  assert.doesNotMatch(codigo(PAGINA_ANTERIOR), /PantallaStockDiario|components\/stock_diario/, "la ruta vieja dibuja una copia");
  assert.match(codigo(PAGINA), /useTituloDePagina\(NOMBRE_VALOR_DEL_STOCK\)/, "el título no es el nombre visible");
  assert.doesNotMatch(codigo(PAGINA), /useTituloDePagina\("Stock Diario"\)/, "volvió el nombre viejo");
  assert.match(codigo(PAGINA), /href=\{RUTA_FINANZAS\}/, "Volver lleva a la puerta de Finanzas");
});
