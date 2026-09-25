// QUIÉN ENTRA A LA SEMANA OPERATIVA, POR DÓNDE, Y QUIÉN LA CAMBIA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/permisos.test.mjs
//
// Desde la tanda de la pantalla de Semana operativa (PR-2), la semana se configura
// en Configuración → Semana operativa, con `config_local.semana_operativa`, sobre
// la ubicación en la que se opera. La pantalla vieja de Transferencias redirige y
// el grupo Transferencias del menú ya no se abre con ese permiso.
//
// Los casos se afirman en los lugares que deciden el acceso del lado del cliente
// —el menú por sus dos filtros, la portada de Configuración y la guarda de la
// pantalla— y en el código de las rutas. Los mismos casos contra los handlers
// reales y PostgreSQL están en `scripts/pruebas-db/semanaOperativa.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menu/registry";
import { canAccessMenuItem } from "@/lib/menu/canAccess";
import { puedeVerConfigLocal, puedeVerSeccion } from "@/lib/config/acceso";
import { PERMISO_SEMANA_OPERATIVA } from "@/lib/semanaOperativa/semanaOperativa";
import {
  RUTA_SEMANA_OPERATIVA,
  RUTA_VIEJA_CORTE_DE_SEMANA,
  puedeConfigurarLaSemana,
} from "@/lib/semanaOperativa/rutas";

const SEMANA = PERMISO_SEMANA_OPERATIVA;
const VER = "transferencias.ver";

const CASOS = [
  { nombre: "semana sí, transferencias no", permisos: [SEMANA], semana: true, transferencias: false },
  { nombre: "semana no, transferencias sí", permisos: [VER], semana: false, transferencias: true },
  { nombre: "los dos", permisos: [SEMANA, VER], semana: true, transferencias: true },
  { nombre: "ninguno", permisos: [], semana: false, transferencias: false },
  { nombre: "solo transferencias.crear", permisos: ["transferencias.crear"], semana: false, transferencias: false },
];

const configuracion = MENU_CONFIG.find((g) => g.href === "/modulos/configuracion");
const itemSemana = configuracion?.items?.find((i) => i.href === RUTA_SEMANA_OPERATIVA);
const transferencias = MENU_CONFIG.find((g) => g.href === "/modulos/transferencias");
const itemTransferencias = transferencias?.items?.find((i) => i.href === "/modulos/transferencias");

// El gate comercial —módulo, multiSucursal y el `scope`— es otra pregunta con
// sus propios candados: acá se aísla el RBAC.
const soloRbac = (entrada) => ({
  ...entrada,
  requiredModule: undefined,
  requiredFeature: undefined,
  scope: undefined,
});
const ve = (permisos, entrada) =>
  canAccessMenuItem({ esAdmin: false, permisos }, null, soloRbac(entrada), []).visible;

const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

test("la sección vive en Configuración y ya no en Transferencias", () => {
  assert.ok(configuracion, "no está el grupo Configuración");
  assert.ok(itemSemana, "no está el ítem Semana operativa en Configuración");
  assert.equal(itemSemana.permiso, SEMANA);
  assert.ok(transferencias && itemTransferencias, "desapareció el grupo Transferencias");
  const hrefs = MENU_CONFIG.flatMap((g) => (g.items || []).map((i) => i.href));
  assert.ok(!hrefs.includes(RUTA_VIEJA_CORTE_DE_SEMANA), "el menú sigue ofreciendo la ruta vieja");
  assert.ok(
    !(transferencias.requiredAnyPerms || []).includes(SEMANA),
    "el permiso de la semana sigue abriendo el grupo Transferencias, que ya no tiene nada suyo"
  );
});

for (const c of CASOS) {
  test(`${c.nombre}: semana ${c.semana ? "sí" : "no"}, transferencias ${c.transferencias ? "sí" : "no"}`, () => {
    // La pantalla.
    assert.equal(puedeConfigurarLaSemana(c.permisos), c.semana, "la guarda de la pantalla");

    // El menú que dibuja la app (`useMenu` → `canAccessMenuItem`).
    assert.equal(ve(c.permisos, configuracion) && ve(c.permisos, itemSemana), c.semana, "Semana operativa por el menú");
    assert.equal(
      ve(c.permisos, transferencias) && ve(c.permisos, itemTransferencias),
      c.transferencias,
      "Transferencias por el menú"
    );

    // El otro filtro del menú (`buildVisibleMenu`).
    const menu = buildVisibleMenu(MENU_CONFIG, { permisos: c.permisos });
    const hrefs = menu.flatMap((g) => g.items.map((i) => i.href));
    assert.equal(hrefs.includes(RUTA_SEMANA_OPERATIVA), c.semana, "Semana operativa en buildVisibleMenu");

    // La portada de Configuración y su tarjeta.
    if (c.semana) assert.equal(puedeVerConfigLocal({ permisos: c.permisos }), true, "no llega a la portada");
    assert.equal(
      puedeVerSeccion({ permisos: c.permisos }, { permiso: SEMANA }),
      c.semana,
      "la tarjeta de la portada"
    );
  });
}

test("el administrador entra por el comodín, sin rol por nombre", () => {
  assert.equal(puedeConfigurarLaSemana(["*"]), true);
  const menu = buildVisibleMenu(MENU_CONFIG, { permisos: ["*"] });
  assert.ok(menu.flatMap((g) => g.items.map((i) => i.href)).includes(RUTA_SEMANA_OPERATIVA));
  for (const ruta of ["lib/semanaOperativa/rutas.js", "app/modulos/configuracion/semana-operativa/page.jsx"]) {
    assert.doesNotMatch(codigo(ruta), /ADMIN|ENCARGADO|DUE[ÑN]O_LOCAL/, `${ruta} decide por nombre de rol`);
  }
});

test("la portada y el menú abren Configuración con LA MISMA lista de permisos", () => {
  const registro = codigo("lib/menu/registry.js");
  assert.match(registro, /requiredAnyPerms: PERMISOS_CONFIG_LOCAL,/, "el grupo volvió a tener su propia copia");
  assert.ok(configuracion.requiredAnyPerms.includes(SEMANA));
});

test("la ruta de la ubicación pide el permiso en los TRES verbos, y nunca un localId del cuerpo", () => {
  const ruta = codigo("app/api/config/semana-operativa/route.js");
  for (const verbo of ["GET", "PUT", "DELETE"]) {
    const desde = ruta.indexOf(`export async function ${verbo}`);
    assert.ok(desde >= 0, `falta el ${verbo}`);
    const siguiente = ruta.indexOf("export async function", desde + 10);
    const cuerpo = ruta.slice(desde, siguiente < 0 ? ruta.length : siguiente);
    assert.match(cuerpo, /requirePerm\(req, PERMISO_SEMANA_OPERATIVA\)/, `el ${verbo} no pide el permiso`);
    assert.match(cuerpo, /resolveLocalAndGrupo\(req/, `el ${verbo} no resuelve la ubicación como config_local`);
    assert.doesNotMatch(cuerpo, /body\??\.localId/, `el ${verbo} acepta la ubicación del cuerpo`);
  }
});

test("la pantalla vieja SOLO redirige a la nueva", () => {
  const vieja = codigo("app/modulos/transferencias/corte-de-semana/page.jsx");
  assert.match(vieja, /redirect\(RUTA_SEMANA_OPERATIVA\)/);
  assert.doesNotMatch(vieja, /fetch\(|useState|SunmiButton/, "la pantalla vieja volvió a dibujar algo");
});

test("los atajos llevan a la pantalla nueva, y solo desde la ubicación propia", () => {
  const tablero = codigo("components/transferencias/TableroMovil.jsx");
  assert.match(tablero, /onConfigurarCorte=\{\(\) => router\.push\(RUTA_SEMANA_OPERATIVA\)\}/);
  // La entrada del depósito informa y no ofrece configurar a otro local.
  assert.doesNotMatch(tablero, /onConfigurar=\{/, "la entrada del depósito volvió a ofrecer configurar");
  // La cuenta de un local vista desde el depósito no ofrece el atajo.
  const local = codigo("app/modulos/transferencias/local/[localId]/page.jsx");
  assert.doesNotMatch(local, /onConfigurarCorte|puedeConfigurarCorte/, "desde el depósito se ofrece configurar un local");
  // Y nadie más nombra la ruta vieja: solo la redirección y la constante.
  for (const ruta of ["components/transferencias/TableroMovil.jsx", "lib/menu/registry.js", "app/modulos/configuracion/page.jsx"]) {
    assert.doesNotMatch(codigo(ruta), /corte-de-semana|RUTA_VIEJA_CORTE_DE_SEMANA/, `${ruta} apunta a la ruta vieja`);
  }
});

// ── «CORTE DE SEMANA» YA NO ES UN NOMBRE DE LA APP ───────────────────────
//
// Se enumera el repo ENTERO —lo trackeado y lo que todavía no se commiteó—, no
// una lista de archivos elegidos: el censo de arriba mira tres y el arnés móvil,
// que estaba en ninguno, siguió afirmando la pantalla vieja una tanda entera.
// Se mira el CÓDIGO sin comentarios: la historia de por qué se llamaba así
// puede quedar escrita en prosa.
const CODIGO_DE_LA_APP = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "components", "lib"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter((r) => /\.(js|jsx|mjs)$/.test(r) && !/\.test\.mjs$/.test(r) && existsSync(r));

// Los únicos que pueden nombrar lo viejo, cada uno con su motivo.
const PUEDEN_NOMBRAR_LO_VIEJO = new Map([
  ["lib/semanaOperativa/rutas.js", "define la constante de la ruta vieja"],
  ["app/modulos/transferencias/corte-de-semana/page.jsx", "es la ruta vieja, que solo redirige"],
  ["app/api/transferencias/acuerdos/route.js", "es el endpoint viejo, sin pantalla; sacarlo no entra en PR-2"],
]);

test("nadie fuera de la redirección nombra la ruta vieja ni dice «corte de semana»", () => {
  assert.ok(CODIGO_DE_LA_APP.length > 500, `la enumeración vino corta (${CODIGO_DE_LA_APP.length})`);
  const ofensores = [];
  for (const ruta of CODIGO_DE_LA_APP) {
    if (PUEDEN_NOMBRAR_LO_VIEJO.has(ruta)) continue;
    const texto = codigo(ruta);
    if (/corte-de-semana|RUTA_VIEJA_CORTE_DE_SEMANA/.test(texto)) ofensores.push(`${ruta}: la ruta vieja`);
    if (/corte de semana/i.test(texto)) ofensores.push(`${ruta}: «corte de semana» fuera de un comentario`);
  }
  assert.deepEqual(ofensores, []);
});

test("la API vieja sigue viva, pide lo mismo que en PR-1 y respeta el alcance", () => {
  const ruta = codigo("app/api/transferencias/acuerdos/route.js");
  const get = ruta.slice(ruta.indexOf("export async function GET"), ruta.indexOf("export async function PUT"));
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  assert.match(get, /checkPerm\(session, \["transferencias\.ver", PERMISO_SEMANA_OPERATIVA\]\)/);
  assert.match(put, /checkPerm\(session, PERMISO_SEMANA_OPERATIVA\)/);
  assert.match(put, /const scope = await resolveLocalAndGrupo\(req\);/);
  assert.match(put, /if \(localId !== scope\.localId\) \{/, "el PUT dejó de exigir la ubicación en la que se opera");
});
