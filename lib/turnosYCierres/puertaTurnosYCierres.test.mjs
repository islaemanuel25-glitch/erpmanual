// CANDADO: "TURNOS Y CIERRES" Y "(ANTERIOR)" SOLO PARA EL DUEÑO Y EL ADMIN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/turnosYCierres/puertaTurnosYCierres.test.mjs
//
// Decisión de Emanuel (2026-10-24): las dos pantallas las ven DUEÑO_LOCAL y
// Admin, ningún otro rol ni un operador por PIN. Por permiso
// (`posventas.turnos.ver`), no por nombre de rol, y cerrado en los tres lugares:
//
//   A. el permiso existe, lo trae DUEÑO_LOCAL y no ENCARGADO ni CAJERO, y la
//      migración se lo da al dueño que ya existe;
//   B. se le resta al operador por PIN, Admin incluido;
//   C. el menú: los dos ítems se ven con el permiso y no sin él;
//   D. las pantallas: cada `page.jsx` de las dos pide la puerta;
//   E. las rutas: cada ruta del módulo nuevo y las dos que solo usa el viejo
//      la piden ANTES de leer nada.
//
// D y E se enumeran con `git ls-files --cached --others --exclude-standard`:
// una pantalla o ruta nueva sin la puerta, aunque no esté commiteada, da rojo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { construirMenuVisible } from "@/lib/menu/menuVisible";
import { getGrupoConfig } from "@/lib/empresa-config";
import { PERMISSION_REGISTRY } from "@/lib/rbac/registry";
import { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO, DUENO_LOCAL } from "@/lib/rbac/systemRoles";
import { permisosEfectivos } from "@/lib/rbac/permisosDelOperador";
import { PERMISO_VER_TURNOS_Y_CIERRES, puedeVerTurnosYCierres } from "@/lib/turnosYCierres/alcance";

const sinComentarios = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

const archivos = (...rutas) =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...rutas], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

const RUTA_NUEVA = "/modulos/turnos-y-cierres";
const RUTA_ANTERIOR = "/modulos/turnos";
const MIGRACION = "prisma/migrations/20261024120000_permiso_turnos_y_cierres/migration.sql";

const perfil = (permisos, extra = {}) => ({ id: 1, permisos, esAdmin: permisos.includes("*"), ...extra });
const hrefsDelMenu = (p) => construirMenuVisible(p, getGrupoConfig()).flatMap((g) => (g.items || []).map((i) => i.href));

test("A · el permiso existe, lo trae el dueño y no el encargado ni el cajero", () => {
  assert.equal(PERMISO_VER_TURNOS_Y_CIERRES, "posventas.turnos.ver");
  assert.ok(PERMISSION_REGISTRY.some((p) => p.code === PERMISO_VER_TURNOS_Y_CIERRES && !p.deprecated));
  assert.ok(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes(PERMISO_VER_TURNOS_Y_CIERRES));
  assert.ok(!DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes(PERMISO_VER_TURNOS_Y_CIERRES));
  assert.ok(!DEFAULT_PERMISOS_SISTEMA[CAJERO].includes(PERMISO_VER_TURNOS_Y_CIERRES));

  const sql = readFileSync(MIGRACION, "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /'\["posventas\.turnos\.ver"\]'::jsonb/);
  const roles = [...sql.matchAll(/"nombre"\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(roles, ["DUEÑO_LOCAL"], "la migración se lo da solo al dueño");
});

test("B · el operador por PIN no lo tiene, ni con el comodín del Admin", () => {
  const dueno = DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL];
  assert.ok(!permisosEfectivos(dueno, true).includes(PERMISO_VER_TURNOS_Y_CIERRES));
  assert.equal(puedeVerTurnosYCierres(perfil(permisosEfectivos(dueno, true), { operadorActivo: true })), false);
  assert.equal(puedeVerTurnosYCierres(perfil(["*"], { operadorActivo: true })), false);
});

test("C · menú y pantalla: dueño y Admin sí; encargado, cajero y operador no", () => {
  const casos = [
    ["Admin", perfil(["*"]), true],
    ["DUEÑO_LOCAL", perfil(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL]), true],
    ["ENCARGADO", perfil(DEFAULT_PERMISOS_SISTEMA[ENCARGADO]), false],
    ["CAJERO", perfil(DEFAULT_PERMISOS_SISTEMA[CAJERO]), false],
    // Un rol armado a mano con lo que antes abría el módulo nuevo.
    ["reportes y tesorería", perfil(["pos.usar", "reportes.ver", "tesoreria.ver", "turnos.ver_todos"]), false],
    ["Admin con operador", perfil(["*"], { operadorActivo: true }), false],
  ];
  for (const [quien, p, ve] of casos) {
    const hrefs = hrefsDelMenu(p);
    assert.equal(hrefs.includes(RUTA_NUEVA), ve, `${quien}: "Turnos y cierres" en el menú`);
    assert.equal(hrefs.includes(RUTA_ANTERIOR), ve, `${quien}: "Turnos y cierres (anterior)" en el menú`);
    assert.equal(puedeVerTurnosYCierres(p), ve, `${quien}: la pantalla`);
  }
});

test("D · cada pantalla de las dos pide la puerta", () => {
  const paginas = archivos("app/modulos/turnos-y-cierres", "app/modulos/turnos").filter((f) => f.endsWith("/page.jsx"));
  assert.ok(paginas.length >= 8, `se esperaban al menos 8 pantallas, hay ${paginas.length}`);
  for (const f of paginas) {
    const s = codigo(f);
    assert.match(s, /=\s*puedeVerTurnosYCierres\(perfil\)/, `${f}: no pide la puerta`);
    assert.match(s, /<SinPermisos\s*\/>/, `${f}: sin la puerta no muestra "Sin permisos"`);
  }
});

test("E · cada ruta pide la puerta antes de leer nada", () => {
  const directas = [
    "app/api/turnos-y-cierres/route.js",
    "app/api/turnos-y-cierres/movimientos/[id]/route.js",
    "lib/turnosYCierres/cajaDelModuloServer.js",
    // Las dos que solo usa "Turnos y cierres (anterior)".
    "app/api/pos-ventas/turnos/listar/route.js",
    "app/api/pos-ventas/caja-movimientos/listar/route.js",
  ];
  for (const f of directas) {
    const s = codigo(f);
    const puerta = s.search(/(checkPerm\(session|requirePerm\(req),\s*PERMISO_VER_TURNOS_Y_CIERRES\)/);
    assert.ok(puerta >= 0, `${f}: no pide la puerta`);
    const primeraLectura = s.search(/prisma\.\w+\.|resolveVistaOperativa\(|resolveLocalAndGrupo\(|leer\w+\(/);
    assert.ok(primeraLectura < 0 || puerta < primeraLectura, `${f}: lee antes de pedir la puerta`);
  }

  // Las demás rutas del módulo nuevo pasan por `cajaDelModulo`.
  const rutas = archivos("app/api/turnos-y-cierres").filter((f) => f.endsWith("/route.js"));
  for (const f of rutas.filter((r) => !directas.includes(r))) {
    const s = codigo(f);
    const llamada = s.search(/await cajaDelModulo\(/);
    assert.ok(llamada >= 0, `${f}: ni pide la puerta ni pasa por cajaDelModulo`);
    const primeraLectura = s.search(/prisma\.\w+\.|leer\w+\(/);
    assert.ok(primeraLectura < 0 || llamada < primeraLectura, `${f}: lee antes de cajaDelModulo`);
  }
});
