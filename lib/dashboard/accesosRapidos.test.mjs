// EL PANEL, EN CADA MODO DE MENÚ: SIN INICIO, CON CONFIGURACIÓN, OCHO COMO MUCHO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/dashboard/accesosRapidos.test.mjs
//
// La app tiene DOS superficies de Panel según el modo de menú: el lanzador
// (`AppLauncher`) y los accesos rápidos (`AccesosRapidos`). La primera versión
// de este candado fijaba la ruta del dashboard y probaba una sola: el Panel del
// lanzador siguió mostrando Inicio en producción con este archivo en verde.
//
// Por eso ahora se recorren los modos que HAY en `HOME_ROUTES`, se lee qué
// pieza dibuja la página de cada uno y se afirma sobre ésa. Un modo nuevo, o una
// página que cambie de pieza, pasa por acá sin que nadie tenga que acordarse.
// Se usa el MISMO menú que dibuja la app (`construirMenuVisible`, el de
// `useMenu`) y el perfil con la forma que arma `UserContext`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { construirMenuVisible } from "@/lib/menu/menuVisible";
import { getGrupoConfig } from "@/lib/empresa-config";
import { MENU_CONFIG } from "@/lib/menu/registry";
import { HOME_ROUTES, esRutaDeInicio, getDefaultRoute } from "@/lib/menu/homeRoutes";
import { MAX_ACCESOS, accesosDelPanel, destinoDelGrupo, gruposDelPanel } from "@/lib/dashboard/accesosRapidos";

// El perfil como lo arma `app/context/UserContext.jsx`: `esAdmin` sale de `*`.
const perfil = (permisos) => ({ id: 1, permisos, esAdmin: permisos.includes("*") });
const ADMIN = perfil(["*"]);

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

const menuDe = (p) => construirMenuVisible(p, getGrupoConfig());

const LANZADOR = "components/layout/AppLauncher.jsx";
const ACCESOS = "components/dashboard/AccesosRapidos.jsx";

/**
 * QUÉ PIEZA DIBUJA EL PANEL DE UNA RUTA DE INICIO, leído de su página: el
 * lanzador directo, o el dashboard móvil que monta los accesos rápidos. Lo que
 * cada pieza ofrece sale de la función que llama; que la llame lo afirma el
 * último candado.
 */
function superficieDe(ruta) {
  const pagina = `app${ruta}/page.jsx`;
  assert.ok(existsSync(pagina), `la ruta de Inicio ${ruta} no tiene página`);
  const fuente = codigo(pagina);
  if (/<AppLauncher\b/.test(fuente)) {
    assert.match(codigo(LANZADOR), /const menu = gruposDelPanel\(visibleMenu\);/, `${LANZADOR} no usa la regla del Panel`);
    return { pieza: LANZADOR, grupos: (m) => gruposDelPanel(m) };
  }
  if (/<DashboardMobile\b/.test(fuente)) {
    assert.match(codigo("components/dashboard/DashboardMobile.jsx"), /<AccesosRapidos\b/);
    assert.match(codigo(ACCESOS), /const accesos = accesosDelPanel\(menu\);/, `${ACCESOS} no usa la regla del Panel`);
    return { pieza: ACCESOS, grupos: (m) => accesosDelPanel(m) };
  }
  assert.fail(`${pagina} no dibuja ninguna de las dos superficies de Panel conocidas`);
}

const ESPERADO_ADMIN = [
  "pos-ventas",
  "stock",
  "compras",
  "transferencias",
  "finanzas",
  "reportes",
  "administracion",
  "configuracion",
];

test("los modos de HOME_ROUTES son los tres conocidos, con sus dos rutas", () => {
  assert.deepEqual(Object.keys(HOME_ROUTES).sort(), ["launcher", "sidebarLeft", "topbar"]);
  assert.equal(getDefaultRoute("launcher"), HOME_ROUTES.launcher);
  // El grupo Inicio apunta a una ruta de Inicio: si dejara de hacerlo, este
  // archivo ya no probaría lo que dice.
  const inicio = MENU_CONFIG.find((g) => g.key === "inicio");
  assert.ok(esRutaDeInicio(destinoDelGrupo(inicio)), "el grupo Inicio ya no lleva a una ruta de Inicio");
});

for (const [modo, ruta] of Object.entries(HOME_ROUTES)) {
  test(`${modo} → ${ruta}: el Panel no ofrece Inicio, sí Configuración, y como mucho ocho`, () => {
    assert.equal(getDefaultRoute(modo), ruta);
    const { pieza, grupos } = superficieDe(ruta);
    const claves = grupos(menuDe(ADMIN)).map((g) => g.key);
    assert.ok(!claves.includes("inicio"), `${pieza} ofrece Inicio: ${claves.join(", ")}`);
    assert.ok(claves.includes("configuracion"), `${pieza} dejó afuera Configuración: ${claves.join(", ")}`);
    assert.ok(claves.length <= MAX_ACCESOS);
    assert.deepEqual(claves, ESPERADO_ADMIN);
  });
}

test("las dos superficies ofrecen exactamente los mismos grupos", () => {
  const lanzador = gruposDelPanel(menuDe(ADMIN)).map((g) => g.key);
  const accesos = accesosDelPanel(menuDe(ADMIN)).map((a) => a.key);
  assert.deepEqual(lanzador, accesos);
});

test("el descarte del Inicio va ANTES del tope de ocho", () => {
  assert.equal(MAX_ACCESOS, 8);
  const muchos = Array.from({ length: 12 }, (_, i) => ({ key: `g${i}`, label: `G${i}`, items: [{ href: `/g${i}` }] }));
  assert.equal(gruposDelPanel(muchos).length, MAX_ACCESOS);
  // Un grupo que lleva a CADA ruta de Inicio, primero: los ocho que quedan son
  // los ocho siguientes, no siete.
  const inicios = [...new Set(Object.values(HOME_ROUTES))].map((r, i) => ({ key: `inicio${i}`, href: r, items: [{ href: r }] }));
  const claves = gruposDelPanel([...inicios, ...muchos]).map((g) => g.key);
  assert.deepEqual(claves, muchos.slice(0, MAX_ACCESOS).map((g) => g.key));
});

test("la navegación general conserva Inicio, y el botón de casa lleva al Inicio del modo", () => {
  assert.ok(MENU_CONFIG.some((g) => g.key === "inicio"), "Inicio salió del registry");
  assert.ok(menuDe(ADMIN).some((g) => g.key === "inicio"), "Inicio salió del menú visible");
  assert.match(codigo("hooks/useMenu.js"), /construirMenuVisible\(perfil, getGrupoConfig\(\)\)/);
  for (const ruta of [
    "hooks/useMenu.js",
    "lib/menu/menuVisible.js",
    "components/sidebar/SidebarPro.jsx",
    "components/layout/TopbarNav.jsx",
    "components/layout/MobileNav.jsx",
  ]) {
    assert.doesNotMatch(codigo(ruta), /gruposDelPanel|accesosDelPanel/, `${ruta} aplica la regla del Panel`);
  }
  assert.match(codigo("components/Header.jsx"), /const homeRoute = getDefaultRoute\(menuMode\);/);
});

test("para quien no es administrador, el Panel sigue los permisos", () => {
  assert.deepEqual(accesosDelPanel(menuDe(perfil(["config_local.apariencia"]))).map((a) => a.key), ["configuracion"]);
  assert.deepEqual(gruposDelPanel(menuDe(perfil(["pos.usar", "finanzas.ver"]))).map((g) => g.key), ["pos-ventas", "finanzas"]);
  for (const permisos of [["compras.ver"], ["reportes.ver", "config_local.stock"], []]) {
    const menu = menuDe(perfil(permisos)).map((g) => g.key);
    for (const g of gruposDelPanel(menuDe(perfil(permisos)))) {
      assert.ok(menu.includes(g.key), `${g.key} aparece sin estar en el menú de ${permisos.join("|")}`);
    }
  }
});

test("las dos piezas usan la regla común y ninguna recorta por su cuenta", () => {
  const lanzador = codigo(LANZADOR);
  assert.match(lanzador, /const menu = gruposDelPanel\(visibleMenu\);/);
  assert.doesNotMatch(lanzador, /\.slice\(|MAX_TILES/, "el lanzador volvió a recortar por su cuenta");
  const accesos = codigo(ACCESOS);
  assert.match(accesos, /const accesos = accesosDelPanel\(menu\);/);
  assert.doesNotMatch(accesos, /\.slice\(|usePathname/, "los accesos rápidos volvieron a una regla propia");
  // Y la regla no escribe ninguna ruta: las pide a la fuente.
  assert.doesNotMatch(codigo("lib/dashboard/accesosRapidos.js"), /"\/modulos\//, "la regla escribió una ruta a mano");
});
