// Candados del registro de lectores y de la fecha del papel.
//
// Acá estaban también los de la receta estructurada que iba del proveedor al
// lector —alícuota, interno, percepciones—. Se borraron con ella en la segunda
// parte de la lectura interpretada (#165): el lector lee con la explicación del
// tipo de papel, y ninguna regla de formato decide el costo.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fechaLeidaONull } from "./recetaDelProveedor.js";
import { elegirLector, lectoresRegistrados } from "./index.js";

// ── El registro se llena solo al importar el índice ────────────────────────

test("IMPORTAR EL ÍNDICE ALCANZA: el registro no queda vacío", () => {
  // La trampa que este archivo existe para evitar: si una ruta importara
  // `elegirLector` de contrato.js, el registro estaría VACÍO —nadie habría
  // importado gemini.js— y el módulo diría "no hay ningún lector configurado"
  // con la configuración perfectamente puesta.
  assert.ok(lectoresRegistrados().includes("gemini"), lectoresRegistrados().join(","));
  assert.equal(elegirLector({ nombre: "gemini", env: { GEMINI_API_KEY: "x" } }).ok, true);
});

// ── La fecha del papel ─────────────────────────────────────────────────────

test("una fecha ilegible queda en null, NUNCA en hoy", () => {
  // Un fallback a "hoy" sería peor que un null: la fecha del comprobante decide
  // en qué período cae la compra.
  for (const v of ["", null, undefined, "no se lee", "31/31/2026", "abc"]) {
    assert.equal(fechaLeidaONull(v), null, String(v));
  }
});

test("UNA FECHA ABSURDA TAMBIÉN SE RECHAZA", () => {
  // 1900 o 2999 salen de un dígito mal leído en el año, y entrarían sin que
  // nada las mirara: son fechas válidas para `new Date`.
  assert.equal(fechaLeidaONull("1900-08-10"), null);
  assert.equal(fechaLeidaONull("2999-08-10"), null);
  assert.equal(fechaLeidaONull("0202-08-10"), null);
});

test("una fecha buena pasa", () => {
  const d = fechaLeidaONull("2026-08-10");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString().slice(0, 10), "2026-08-10");
});
