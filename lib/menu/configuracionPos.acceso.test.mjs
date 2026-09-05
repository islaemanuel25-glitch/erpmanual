// CANDADO: QUIÉN LLEGA A "CONFIGURACIÓN POS" DESDE EL MENÚ REAL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/configuracionPos.acceso.test.mjs
//
// ── POR QUÉ SOBRE EL REGISTRY DE VERDAD Y NO SOBRE ITEMS SINTÉTICOS ────────
//
// `canAccess.config.test.mjs` prueba la FUNCIÓN con items inventados, y está
// bien: aísla la lógica del gate. Pero un item sintético sigue pasando el día que
// alguien le cambia los permisos al item real, que es exactamente lo que pasó
// acá: la entrada estaba gateada solo por `config_local.pos`, así que un usuario
// con `config_local.medios_cobro` tenía API para administrar los medios de cobro
// y ningún camino para llegar a la pantalla. Un permiso sin camino es un permiso
// que no existe.
//
// Entonces esto lee la entrada de `MENU_CONFIG` tal como la consume la UI.

import { test } from "node:test";
import assert from "node:assert/strict";

import { MENU_CONFIG } from "./registry.js";
import { canAccessMenuItem } from "./canAccess.js";
import { PERMISOS_CONFIG_POS } from "@/lib/config/acceso.js";

const grupoConfiguracion = MENU_CONFIG.find((g) => g.href === "/modulos/configuracion");
const itemPos = grupoConfiguracion?.items?.find(
  (i) => i.href === "/modulos/configuracion/pos-ventas"
);

// El gate comercial (`requiredModule`) es otra pregunta y tiene sus propios
// candados: acá se aísla el RBAC, que es lo que estaba mal.
const soloRbac = (entrada) => ({ ...entrada, requiredModule: undefined });

const ve = (permisos, entrada) =>
  canAccessMenuItem({ esAdmin: false, permisos }, null, soloRbac(entrada), []).visible;

test("la entrada de Configuración POS existe en el menú real", () => {
  assert.ok(grupoConfiguracion, "no está el grupo Configuración");
  assert.ok(itemPos, "no está el item de /modulos/configuracion/pos-ventas");
});

test("está gateada por los DOS permisos, no por uno solo", () => {
  assert.deepEqual(itemPos.requiredAnyPerms, PERMISOS_CONFIG_POS);
});

test("y NO conserva además un `permiso` suelto, que anularía el arreglo", () => {
  // `canAccessMenuItem` evalúa las dos señales y las dos tienen que pasar. Dejar
  // `permiso: "config_local.pos"` al lado de `requiredAnyPerms` haría que el
  // arreglo se vea escrito y no funcione: quien solo tenga medios_cobro seguiría
  // sin ver nada.
  assert.equal(itemPos.permiso, undefined);
  assert.equal(itemPos.permission, undefined);
  assert.equal(itemPos.requiredPermission, undefined);
});

test("quien SOLO administra medios de cobro llega a Configuración POS", () => {
  assert.equal(ve(["config_local.medios_cobro"], itemPos), true);
});

test("quien SOLO configura reglas del POS también llega", () => {
  assert.equal(ve(["config_local.pos"], itemPos), true);
});

test("un cajero no llega", () => {
  assert.equal(ve(["pos.usar"], itemPos), false);
});

test("el GRUPO Configuración también se abre solo con medios_cobro", () => {
  // Sin esto, el item sería visible y el grupo que lo contiene no: la entrada
  // existiría y nadie la vería igual.
  assert.ok(grupoConfiguracion.requiredAnyPerms.includes("config_local.medios_cobro"));
  assert.equal(ve(["config_local.medios_cobro"], grupoConfiguracion), true);
});
