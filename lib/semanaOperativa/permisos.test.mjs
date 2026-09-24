// QUIÉN ENTRA A LA SEMANA OPERATIVA, Y QUIÉN LA CAMBIA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/permisos.test.mjs
//
// La semana es de la ubicación, no de Transferencias. Hasta esta corrección la
// pantalla "Corte de semana" arrastraba tres candados de la época en que el corte
// era un acuerdo de despacho: el grupo del menú, la guarda de la página y el GET
// de la ruta pedían `transferencias.ver`. Un usuario con
// `config_local.semana_operativa` y sin Transferencias no podía configurar nada.
//
// Los cuatro casos se afirman en los TRES lugares que deciden el acceso del lado
// del cliente y en el código de la ruta. Los mismos cuatro, contra los handlers
// reales y PostgreSQL, están en `scripts/pruebas-db/semanaOperativa.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menu/registry";
import { canAccessMenuItem } from "@/lib/menu/canAccess";
import {
  PERMISOS_PARA_VER_EL_CORTE,
  RUTA_CORTE_DE_SEMANA,
  puedeConfigurarElCorte,
  puedeVerElCorte,
} from "@/components/transferencias/corteDeSemana";
import { PERMISO_SEMANA_OPERATIVA } from "@/lib/semanaOperativa/semanaOperativa";

const SEMANA = PERMISO_SEMANA_OPERATIVA;
const VER = "transferencias.ver";

const CASOS = [
  { nombre: "semana sí, transferencias no", permisos: [SEMANA], entra: true, cambia: true, veTransferencias: false },
  { nombre: "semana no, transferencias sí", permisos: [VER], entra: true, cambia: false, veTransferencias: true },
  { nombre: "los dos", permisos: [SEMANA, VER], entra: true, cambia: true, veTransferencias: true },
  { nombre: "ninguno", permisos: [], entra: false, cambia: false, veTransferencias: false },
  // `transferencias.crear` solo ya no alcanza para cambiar, y tampoco abre la
  // pantalla: nunca la abrió sin `transferencias.ver`.
  { nombre: "solo transferencias.crear", permisos: ["transferencias.crear"], entra: false, cambia: false, veTransferencias: false },
];

const grupo = MENU_CONFIG.find((g) => g.href === "/modulos/transferencias");
const itemCorte = grupo?.items?.find((i) => i.href === RUTA_CORTE_DE_SEMANA);
const itemTransferencias = grupo?.items?.find((i) => i.href === "/modulos/transferencias");

// El gate comercial —módulo, multiSucursal y el `scope: "multiLocal"`, que pide
// multi-sucursal contratado— es otra pregunta con sus propios candados: acá se
// aísla el RBAC.
const soloRbac = (entrada) => ({
  ...entrada,
  requiredModule: undefined,
  requiredFeature: undefined,
  scope: undefined,
});
const ve = (permisos, entrada) =>
  canAccessMenuItem({ esAdmin: false, permisos }, null, soloRbac(entrada), []).visible;

const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("el grupo y los dos ítems existen en el menú real", () => {
  assert.ok(grupo, "no está el grupo Transferencias");
  assert.ok(itemCorte, "no está el ítem Corte de semana");
  assert.ok(itemTransferencias, "no está el ítem Transferencias");
});

for (const c of CASOS) {
  test(`${c.nombre}: entra ${c.entra ? "sí" : "no"}, cambia ${c.cambia ? "sí" : "no"}`, () => {
    // La pantalla.
    assert.equal(puedeVerElCorte(c.permisos), c.entra, "la guarda de la página");
    assert.equal(puedeConfigurarElCorte(c.permisos), c.cambia, "el botón Cambiar");

    // El menú que dibuja la app (`useMenu` → `canAccessMenuItem`): el grupo tiene
    // que abrirse para el que puede cambiar la semana, y el ítem aparecer.
    assert.equal(ve(c.permisos, grupo) && ve(c.permisos, itemCorte), c.cambia, "el acceso por el menú (canAccess)");
    // Y abrir el grupo no regala el ítem de Transferencias.
    assert.equal(ve(c.permisos, grupo) && ve(c.permisos, itemTransferencias), c.veTransferencias, "Transferencias por el menú");

    // El mismo menú por el otro filtro que existe (`buildVisibleMenu`).
    const menu = buildVisibleMenu(MENU_CONFIG, { permisos: c.permisos });
    const hrefs = menu.flatMap((g) => g.items.map((i) => i.href));
    assert.equal(hrefs.includes(RUTA_CORTE_DE_SEMANA), c.cambia, "Corte de semana en buildVisibleMenu");
    assert.equal(hrefs.includes("/modulos/transferencias"), c.veTransferencias, "Transferencias en buildVisibleMenu");
  });
}

test("el administrador entra y cambia por el comodín", () => {
  assert.equal(puedeVerElCorte(["*"]), true);
  assert.equal(puedeConfigurarElCorte(["*"]), true);
});

test("la ruta pide EXACTAMENTE los permisos con los que la pantalla se abre, y el PUT solo el de la semana", () => {
  const ruta = sinComentarios(readFileSync("app/api/transferencias/acuerdos/route.js", "utf8"));
  const get = ruta.slice(ruta.indexOf("export async function GET"), ruta.indexOf("export async function PUT"));
  const put = ruta.slice(ruta.indexOf("export async function PUT"));

  const m = get.match(/checkPerm\(session,\s*\[([^\]]*)\]\)/);
  assert.ok(m, "el GET dejó de pedir una lista de permisos");
  const pedidos = m[1]
    .split(",")
    .map((s) => s.trim())
    .map((s) => (s === "PERMISO_SEMANA_OPERATIVA" ? SEMANA : s.replace(/^["']|["']$/g, "")));
  assert.deepEqual([...pedidos].sort(), [...PERMISOS_PARA_VER_EL_CORTE].sort(), "el GET y la pantalla piden cosas distintas");

  assert.match(put, /checkPerm\(session,\s*PERMISO_SEMANA_OPERATIVA\)/);
  assert.doesNotMatch(put, /transferencias\.ver/, "el PUT volvió a depender de Transferencias");
});

test("el PUT solo escribe la ubicación que resuelve `resolveLocalAndGrupo`, como todo `config_local.*`", () => {
  // El mismo grupo no alcanza: la capacidad transversal era de
  // `transferencias.crear` y no se hereda. La contraprueba de base —sacar esta
  // comparación— pone rojos los tres pedidos cruzados de
  // `scripts/pruebas-db/semanaOperativa.mjs`.
  const ruta = sinComentarios(readFileSync("app/api/transferencias/acuerdos/route.js", "utf8"));
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  assert.match(put, /const scope = await resolveLocalAndGrupo\(req\);/, "el PUT dejó de resolver la ubicación como config_local");
  assert.match(put, /if \(localId !== scope\.localId\) \{/, "el PUT dejó de exigir que el local sea la ubicación en la que se opera");
  // Y la fila solo ofrece "Cambiar" donde el PUT va a aceptar.
  const pagina = sinComentarios(readFileSync("app/modulos/transferencias/corte-de-semana/page.jsx", "utf8"));
  assert.match(pagina, /puedeEditar=\{puedeEditar && r\.configurable === true\}/);
});

test("la página no volvió a exigir `transferencias.ver` por su cuenta", () => {
  const pagina = sinComentarios(readFileSync("app/modulos/transferencias/corte-de-semana/page.jsx", "utf8"));
  assert.match(pagina, /puedeVerElCorte\(permisos\)/);
  assert.doesNotMatch(pagina, /["']transferencias\.ver["']/);
});
