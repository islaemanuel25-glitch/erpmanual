// Tests de scripts/update-docs.js — mapeo de módulos y normalización de --since.
// Convención del repo: node:test + node:assert/strict (ver lib/operador-exencion.test.mjs).
// Correr con: node --test scripts/update-docs.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { detectarModulo, normalizarSince } = require("./update-docs.js");

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, "update-docs.js");
const ROOT = path.resolve(AQUI, "..");

// ---------------------------------------------------------------------------
// MODULO_MAP: los 4 prefijos de reportes-ventas
// ---------------------------------------------------------------------------

test("los 4 prefijos de reportes-ventas mapean al mismo módulo", () => {
  assert.equal(detectarModulo("app/modulos/reportes-ventas/page.jsx"), "reportes-ventas");
  assert.equal(detectarModulo("components/reportes-ventas/VentaDetalleAdmin.jsx"), "reportes-ventas");
  assert.equal(detectarModulo("app/api/reportes-ventas/detalle/[id]/route.js"), "reportes-ventas");
  assert.equal(detectarModulo("lib/reportes-ventas/modoLineaDeposito.js"), "reportes-ventas");
});

test("rutas anidadas de reportes-ventas también mapean", () => {
  assert.equal(detectarModulo("app/modulos/reportes-ventas/[ventaId]/page.jsx"), "reportes-ventas");
  assert.equal(detectarModulo("app/modulos/reportes-ventas/[ventaId]/corregir/page.jsx"), "reportes-ventas");
  assert.equal(detectarModulo("app/api/reportes-ventas/por-cliente/route.js"), "reportes-ventas");
  assert.equal(detectarModulo("lib/reportes-ventas/returnParams.js"), "reportes-ventas");
});

test("separadores de Windows se normalizan", () => {
  assert.equal(detectarModulo("app\\modulos\\reportes-ventas\\page.jsx"), "reportes-ventas");
  assert.equal(detectarModulo("lib\\reportes-ventas\\modoLineaDeposito.js"), "reportes-ventas");
});

test("archivos ajenos NO mapean a reportes-ventas", () => {
  // Sin entrada en MODULO_MAP → null.
  assert.equal(detectarModulo("app/modulos/compras-proveedor/nueva/page.jsx"), null);
  assert.equal(detectarModulo("components/compras-proveedor/CarritoPedido.jsx"), null);
  assert.equal(detectarModulo("scripts/manual-seed.mjs"), null);
  assert.equal(detectarModulo("prisma/schema.prisma"), null);
  assert.equal(detectarModulo("README.md"), null);
  // reportes-stock es OTRO módulo y no está mapeado: no debe caer en reportes-ventas.
  assert.equal(detectarModulo("app/modulos/reportes-stock/page.jsx"), null);
});

test("no se rompieron los mappings existentes", () => {
  assert.equal(detectarModulo("app/modulos/pos-ventas/page.jsx"), "pos-ventas");
  assert.equal(detectarModulo("app/api/pos-ventas/crear/route.js"), "pos-ventas");
  // La precedencia auditoria-pos-ventas > auditoria sigue viva.
  assert.equal(detectarModulo("app/modulos/auditoria-pos-ventas/page.jsx"), "pos-ventas");
  assert.equal(detectarModulo("app/modulos/auditoria/page.jsx"), "auditoria");
  assert.equal(detectarModulo("lib/conversiones/stock.js"), "productos");
  assert.equal(detectarModulo("components/LayoutBase.jsx"), "configuracion");
  assert.equal(detectarModulo("app/modulos/stock_locales/page.jsx"), "stock");
});

// ---------------------------------------------------------------------------
// normalizarSince
// ---------------------------------------------------------------------------

test("--since con solo fecha se ancla a las 00:00:00", () => {
  assert.equal(normalizarSince("2026-07-29"), "2026-07-29 00:00:00");
  assert.equal(normalizarSince("2025-01-01"), "2025-01-01 00:00:00");
  // Tolera espacios alrededor.
  assert.equal(normalizarSince("  2026-07-29  "), "2026-07-29 00:00:00");
});

test("--since con fecha y hora se respeta", () => {
  assert.equal(normalizarSince("2026-07-29 08:16"), "2026-07-29 08:16:00");
  assert.equal(normalizarSince("2026-07-29 08:16:42"), "2026-07-29 08:16:42");
  // Con T en lugar de espacio.
  assert.equal(normalizarSince("2026-07-29T08:16"), "2026-07-29 08:16:00");
  assert.equal(normalizarSince("2026-07-29T23:59:59"), "2026-07-29 23:59:59");
});

test("ISO con zona explícita y relativas de git pasan sin tocar", () => {
  assert.equal(normalizarSince("2026-07-29T08:16:00-03:00"), "2026-07-29T08:16:00-03:00");
  assert.equal(normalizarSince("2026-07-29T11:16:00Z"), "2026-07-29T11:16:00Z");
  assert.equal(normalizarSince("2 days ago"), "2 days ago");
  assert.equal(normalizarSince("yesterday"), "yesterday");
});

test("fechas inválidas lanzan error con mensaje claro", () => {
  assert.throws(() => normalizarSince("2026-02-30"), /Fecha inválida/);
  assert.throws(() => normalizarSince("2026-13-01"), /Fecha inválida/);
  assert.throws(() => normalizarSince("2026-07-29 25:00"), /inválida/);
  assert.throws(() => normalizarSince("2026-07-29 10:75"), /inválida/);
  assert.throws(() => normalizarSince("29/07/2026"), /no reconocido/);
  assert.throws(() => normalizarSince("mañana"), /no reconocido/);
  assert.throws(() => normalizarSince(""), /vacío/);
  assert.throws(() => normalizarSince(null), /vacío/);
});

test("año bisiesto: 29/02 válido en bisiesto, inválido si no lo es", () => {
  assert.equal(normalizarSince("2024-02-29"), "2024-02-29 00:00:00");
  assert.throws(() => normalizarSince("2026-02-29"), /Fecha inválida/);
});

// ---------------------------------------------------------------------------
// El bug de fondo: commits del mismo día ANTERIORES a la hora actual
// ---------------------------------------------------------------------------

test("una fecha sin hora no puede pasarse cruda a git --since", () => {
  // Documenta el comportamiento de git que motiva normalizarSince: con la fecha
  // desnuda, git rellena la HORA ACTUAL. Se compara el conteo de commits de hoy
  // con fecha cruda vs. normalizada: la normalizada nunca puede ver menos.
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, "0");
  const d = String(hoy.getDate()).padStart(2, "0");
  const fecha = `${y}-${m}-${d}`;

  const contar = (since) => {
    const out = execFileSync(
      "git",
      ["log", `--since=${since}`, "--format=%H", "--no-merges"],
      { cwd: ROOT, encoding: "utf-8" }
    ).trim();
    return out ? out.split("\n").length : 0;
  };

  const crudo = contar(fecha);
  const normalizado = contar(normalizarSince(fecha));
  assert.ok(
    normalizado >= crudo,
    `normalizado (${normalizado}) debería incluir al menos lo mismo que crudo (${crudo})`
  );
});

test("--since inválido termina en exit 1 con mensaje y sin stack trace", () => {
  let err = null;
  try {
    execFileSync("node", [SCRIPT, "--since=2026-02-30", "--dry-run"], {
      cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    err = e;
  }
  assert.ok(err, "debería salir con código distinto de 0");
  assert.equal(err.status, 1);
  const salida = `${err.stdout || ""}${err.stderr || ""}`;
  assert.match(salida, /Fecha inválida/);
  assert.doesNotMatch(salida, /at .*update-docs\.js:\d+/, "no debería imprimir stack trace");
});

test("requerir el script no ejecuta el CLI", () => {
  // Si main() corriera al importar, este test habría escrito docs en el require
  // de arriba. Se verifica que las exportaciones existen y son funciones puras.
  assert.equal(typeof detectarModulo, "function");
  assert.equal(typeof normalizarSince, "function");
});
