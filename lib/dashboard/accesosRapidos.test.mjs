// LOS ACCESOS RÁPIDOS DEL PANEL: SIN INICIO, CON CONFIGURACIÓN, OCHO COMO MUCHO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/dashboard/accesosRapidos.test.mjs
//
// Con los nueve grupos de un administrador, la tarjeta "Inicio" —que lleva al
// mismo Panel— ocupaba uno de los ocho lugares y Configuración quedaba afuera.
// Se afirma sobre el MISMO menú que dibuja la app (`construirMenuVisible`, el
// que llama `useMenu`) y con el perfil con la forma que arma `UserContext`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { construirMenuVisible } from "@/lib/menu/menuVisible";
import { getGrupoConfig } from "@/lib/empresa-config";
import { MENU_CONFIG } from "@/lib/menu/registry";
import { MAX_ACCESOS, accesosDelPanel } from "@/lib/dashboard/accesosRapidos";

// La ruta del Panel: la de `app/modulos/dashboard/page.jsx`, que es la única
// pantalla que dibuja los accesos rápidos.
const RUTA_DEL_PANEL = "/modulos/dashboard";

// El perfil como lo arma `app/context/UserContext.jsx`: `esAdmin` sale de `*`.
const perfil = (permisos) => ({ id: 1, permisos, esAdmin: permisos.includes("*") });
const ADMIN = perfil(["*"]);

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

const accesosDe = (p) => accesosDelPanel(construirMenuVisible(p, getGrupoConfig()), RUTA_DEL_PANEL);

test("la ruta del Panel es la del dashboard, y a ella lleva el grupo Inicio", () => {
  assert.ok(existsSync("app/modulos/dashboard/page.jsx"), "el Panel ya no vive en esta ruta");
  const inicio = MENU_CONFIG.find((g) => g.key === "inicio");
  assert.equal(inicio?.href, RUTA_DEL_PANEL, "Inicio dejó de llevar al Panel: este candado ya no prueba lo que dice");
});

test("Inicio no aparece entre los accesos rápidos del Panel", () => {
  const claves = accesosDe(ADMIN).map((a) => a.key);
  assert.ok(!claves.includes("inicio"), `apareció Inicio: ${claves.join(", ")}`);
  assert.ok(accesosDe(ADMIN).every((a) => a.href !== RUTA_DEL_PANEL), "hay un acceso a la misma pantalla");
});

test("un administrador con * ve Configuración, en el orden del menú", () => {
  const claves = accesosDe(ADMIN).map((a) => a.key);
  assert.ok(claves.includes("configuracion"), `Configuración quedó afuera: ${claves.join(", ")}`);
  assert.deepEqual(claves, [
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

test("como mucho ocho accesos, aunque haya más grupos", () => {
  assert.equal(MAX_ACCESOS, 8);
  assert.ok(accesosDe(ADMIN).length <= MAX_ACCESOS);
  const muchos = Array.from({ length: 12 }, (_, i) => ({ key: `g${i}`, label: `G${i}`, items: [{ href: `/g${i}` }] }));
  assert.equal(accesosDelPanel(muchos, RUTA_DEL_PANEL).length, MAX_ACCESOS);
  // El descarte es ANTES del tope: sacar el de la pantalla actual deja lugar.
  const conActual = [{ key: "aca", label: "Acá", href: RUTA_DEL_PANEL, items: [{ href: RUTA_DEL_PANEL }] }, ...muchos];
  const claves = accesosDelPanel(conActual, RUTA_DEL_PANEL).map((a) => a.key);
  assert.deepEqual(claves, muchos.slice(0, MAX_ACCESOS).map((g) => g.key));
});

test("la navegación general conserva Inicio: el menú visible lo sigue teniendo", () => {
  assert.ok(construirMenuVisible(ADMIN, getGrupoConfig()).some((g) => g.key === "inicio"), "Inicio salió del menú");
  // El hook usa el MISMO cálculo, y el descarte vive solo en el Panel.
  const hook = codigo("hooks/useMenu.js");
  assert.match(hook, /construirMenuVisible\(perfil, getGrupoConfig\(\)\)/);
  for (const ruta of [
    "hooks/useMenu.js",
    "lib/menu/menuVisible.js",
    "components/layout/AppLauncher.jsx",
    "components/sidebar/SidebarPro.jsx",
    "components/layout/TopbarNav.jsx",
    "components/layout/MobileNav.jsx",
  ]) {
    assert.doesNotMatch(codigo(ruta), /accesosDelPanel/, `${ruta} aplica la regla del Panel`);
  }
  // Y el Panel sí la aplica, con la ruta en la que se dibuja.
  const panel = codigo("components/dashboard/AccesosRapidos.jsx");
  assert.match(panel, /const rutaActual = usePathname\(\) \|\| "";/);
  assert.match(panel, /const accesos = accesosDelPanel\(menu, rutaActual\);/);
});

test("para quien no es administrador, los accesos siguen los permisos", () => {
  // Solo Configuración: ninguna otra tarjeta.
  assert.deepEqual(accesosDe(perfil(["config_local.apariencia"])).map((a) => a.key), ["configuracion"]);
  // Sin permisos de configuración, no hay tarjeta de Configuración.
  const ventas = accesosDe(perfil(["pos.usar", "finanzas.ver"])).map((a) => a.key);
  assert.deepEqual(ventas, ["pos-ventas", "finanzas"]);
  // Y ningún acceso sale de un grupo que el menú no le muestra.
  for (const permisos of [["compras.ver"], ["reportes.ver", "config_local.stock"], []]) {
    const menu = construirMenuVisible(perfil(permisos), getGrupoConfig()).map((g) => g.key);
    for (const a of accesosDe(perfil(permisos))) {
      assert.ok(menu.includes(a.key), `${a.key} aparece sin estar en el menú de ${permisos.join("|")}`);
    }
  }
});
