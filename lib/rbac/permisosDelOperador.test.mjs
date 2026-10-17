// Candados de lib/rbac/permisosDelOperador.js: con un operador activo por PIN,
// la cuenta del local pierde el total del día y Finanzas, y nada más.
//
// El caso de origen (producción, 2026-10-17): con la operadora activa, el Panel
// móvil mostraba "Ventas del día $1.350.580 · 235 tickets" y el acceso a
// Finanzas. El operador no tiene rol: todo leía los permisos de la cuenta.
//
// Los fixtures de sesión salen de `getUsuarioSession` con cookies firmadas de
// verdad, no escritos a mano: es la forma real que reciben las rutas.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/rbac/permisosDelOperador.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.AUTH_SECRET ||= "candado-permisos-del-operador";

const { firmarToken, getUsuarioSession } = await import("../auth.js");
const { checkPerm, checkFueraDelOperador } = await import("../authorize.js");
const { construirMenuVisible } = await import("../menu/menuVisible.js");
const { getGrupoConfig } = await import("../empresa-config.js");
const { PERMISOS_FUERA_DEL_OPERADOR, PERMISO_VER_VENTAS_DEL_DIA, permisosEfectivos } = await import(
  "./permisosDelOperador.js"
);
const { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO, DUENO_LOCAL } = await import("./systemRoles.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// La cuenta del local: un dueño al que el admin le tildó Finanzas, como la de
// producción, que veía el acceso.
const PERMISOS_CUENTA = [...DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], "finanzas.ver"];

function req({ permisos = PERMISOS_CUENTA, conOperador }) {
  const cookies = [`erpazul_sesion=${firmarToken({ id: 7, rolId: 3, localId: 4, permisos })}`];
  if (conOperador) {
    cookies.push(
      `erpazul_operador_activo=${firmarToken({ operadorId: 11, nombre: "Samira", localId: 4, _tipo: "operador" })}`
    );
  }
  return { headers: new Headers({ cookie: cookies.join("; ") }) };
}

// ---------------------------------------------------------------------------
// La sesión del servidor
// ---------------------------------------------------------------------------

test("sin operador, la cuenta conserva el total del día y Finanzas", () => {
  const s = getUsuarioSession(req({ conOperador: false }));
  assert.equal(s.operadorActivo, false);
  assert.equal(checkPerm(s, PERMISO_VER_VENTAS_DEL_DIA).ok, true);
  assert.equal(checkPerm(s, "finanzas.ver").ok, true);
  assert.equal(checkFueraDelOperador(s).ok, true);
});

test("con operador activo, el total del día y Finanzas se niegan con 403", () => {
  const s = getUsuarioSession(req({ conOperador: true }));
  assert.equal(s.operadorActivo, true);
  for (const p of [PERMISO_VER_VENTAS_DEL_DIA, "finanzas.ver", "tesoreria.ver"]) {
    const r = checkPerm(s, p);
    assert.equal(r.ok, false, p);
    assert.equal(r.status, 403, p);
  }
  assert.equal(checkFueraDelOperador(s).status, 403);
  assert.equal(s.permisos.includes("finanzas.ver"), false, "session.permisos también viene sin Finanzas");
});

test("con operador activo, POS, Stock, Compras y Transferencias quedan como estaban", () => {
  const s = getUsuarioSession(req({ conOperador: true }));
  for (const p of ["pos.usar", "stock.ver", "stock.editar", "compras.ver", "compras.recibir", "transferencias.ver", "transferencias.crear"]) {
    assert.equal(checkPerm(s, p).ok, true, p);
  }
});

test("el comodín del Admin no salta la resta: con operador, Finanzas se niega igual", () => {
  const s = getUsuarioSession(req({ permisos: ["*"], conOperador: true }));
  assert.equal(s.esAdmin, true);
  assert.equal(checkPerm(s, "finanzas.ver").ok, false);
  assert.equal(checkPerm(s, PERMISO_VER_VENTAS_DEL_DIA).ok, false);
  assert.equal(checkPerm(s, "pos.usar").ok, true);
});

test("pedir varios con uno que sí es del operador alcanza con ése", () => {
  const s = getUsuarioSession(req({ conOperador: true }));
  assert.equal(checkPerm(s, ["finanzas.ver", "stock.ver"]).ok, true);
});

test("Compras conserva el pago al recibir: los permisos de registrar no se restan", () => {
  assert.equal(PERMISOS_FUERA_DEL_OPERADOR.includes("finanzas.pagos_proveedores.registrar"), false);
  assert.equal(PERMISOS_FUERA_DEL_OPERADOR.includes("finanzas.gastos.registrar"), false);
  assert.deepEqual(permisosEfectivos(["a", "finanzas.ver"], false), ["a", "finanzas.ver"]);
});

// ---------------------------------------------------------------------------
// El menú (lateral, hamburguesa, lanzador y accesos rápidos del Panel)
// ---------------------------------------------------------------------------

const tieneFinanzas = (menu) => menu.some((g) => g.key === "finanzas");
const perfil = (permisos, operadorActivo) => ({
  permisos: permisosEfectivos(permisos, operadorActivo),
  esAdmin: permisos.includes("*"),
  operadorActivo,
});

test("el menú muestra Finanzas a la cuenta y no al operador, Admin incluido", () => {
  assert.equal(tieneFinanzas(construirMenuVisible(perfil(PERMISOS_CUENTA, false), getGrupoConfig())), true);
  assert.equal(tieneFinanzas(construirMenuVisible(perfil(PERMISOS_CUENTA, true), getGrupoConfig())), false);
  assert.equal(tieneFinanzas(construirMenuVisible(perfil(["*"], true), getGrupoConfig())), false);
});

test("con operador, Finanzas no reaparece por Valor del Stock (stock.ver)", () => {
  const soloStock = ["stock.ver", "pos.usar"];
  assert.equal(tieneFinanzas(construirMenuVisible(perfil(soloStock, false), getGrupoConfig())), true);
  assert.equal(tieneFinanzas(construirMenuVisible(perfil(soloStock, true), getGrupoConfig())), false);
});

// ---------------------------------------------------------------------------
// Roles y rutas
// ---------------------------------------------------------------------------

test("ventas.ver_dia: ENCARGADO y DUEÑO_LOCAL sí, CAJERO no", () => {
  assert.equal(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes(PERMISO_VER_VENTAS_DEL_DIA), true);
  assert.equal(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes(PERMISO_VER_VENTAS_DEL_DIA), true);
  assert.equal(DEFAULT_PERMISOS_SISTEMA[CAJERO].includes(PERMISO_VER_VENTAS_DEL_DIA), false);
});

test("la ruta del total del día pide ventas.ver_dia", () => {
  const src = sinComentarios(leer("app/api/dashboard/resumen/route.js"));
  assert.match(src, /checkPerm\(session,\s*PERMISO_VER_VENTAS_DEL_DIA\)/);
});

test("todas las rutas de Valor del Stock niegan al operador", () => {
  const rutas = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app/api/stock_locales/diario/**/route.js"],
    { cwd: ROOT, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);
  assert.ok(rutas.length >= 5, `se esperaban al menos 5 rutas, hay ${rutas.length}`);
  for (const r of rutas) {
    assert.match(sinComentarios(leer(r)), /checkFueraDelOperador\(session\)/, r);
  }
});

test("/api/me devuelve los permisos con la resta del operador", () => {
  const src = sinComentarios(leer("app/api/me/route.js"));
  assert.match(src, /permisosEfectivos\(normalizarPermisos\(payload\.permisos\),\s*operadorActivo\)/);
  assert.match(src, /operadorActivo,/);
});
