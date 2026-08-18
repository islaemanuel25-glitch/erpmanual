// Tests del sanitizador de errores de combos (mensajeErrorCombo).
// Runner: `node --test lib/combos/errores.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { errCombo, mensajeErrorCombo } from "./errores.js";

test("error de negocio 4xx: se muestra el mensaje específico tal cual", () => {
  const r = mensajeErrorCombo(errCombo("El precio de venta debe ser mayor a 0.", 400), {
    accion: "crear el combo",
  });
  assert.equal(r.status, 400);
  assert.equal(r.mensaje, "El precio de venta debe ser mayor a 0.");
});

test("P2021 (tabla inexistente): 503 y mensaje accionable, sin filtrar detalle técnico", () => {
  const e = new Error(
    // La ruta va genérica: lo que este candado ejerce es que el detalle técnico
    // NO se filtre al usuario, y para eso da igual de qué máquina venga. Escribir
    // una ruta real sólo publicaba el nombre de usuario del sistema.
    "Invalid `prisma.comboComponente.createMany()` invocation in /app/.../route.js:28"
  );
  e.code = "P2021";
  const r = mensajeErrorCombo(e, { accion: "crear el combo" });
  assert.equal(r.status, 503);
  assert.equal(
    r.mensaje,
    "No se pudo crear el combo. La funcionalidad de combos todavía no está habilitada en esta base de datos."
  );
  // No debe filtrar ruta local, "prisma." ni "invocation".
  assert.doesNotMatch(r.mensaje, /prisma\.|invocation|C:\\|C:\//i);
});

test("P2022 (columna inexistente) también cae en 'no habilitada'", () => {
  const e = new Error("column does not exist"); e.code = "P2022";
  const r = mensajeErrorCombo(e, { accion: "guardar el combo" });
  assert.equal(r.status, 503);
  assert.match(r.mensaje, /todavía no está habilitada/);
});

test("error técnico genérico: 500 y mensaje limpio, sin stack ni chunks", () => {
  const e = new Error("boom en /_next/static/chunks/app-xyz.js\n    at foo (bar.js:1:2)");
  const r = mensajeErrorCombo(e, { accion: "crear el combo" });
  assert.equal(r.status, 500);
  assert.equal(r.mensaje, "No se pudo crear el combo. Ocurrió un error interno.");
  assert.doesNotMatch(r.mensaje, /chunks|_next|\.js|at /);
});

test("error sin status ni code: 500 genérico", () => {
  const r = mensajeErrorCombo({}, { accion: "calcular la disponibilidad" });
  assert.equal(r.status, 500);
  assert.equal(r.mensaje, "No se pudo calcular la disponibilidad. Ocurrió un error interno.");
});
