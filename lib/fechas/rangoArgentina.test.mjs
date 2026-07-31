// Tests de los límites de día calendario argentino.
//
// El defecto que corrigen: la UI manda días calendario (YYYY-MM-DD) tal como los
// ve el usuario, y el endpoint los convertía con `new Date(fecha + "T23:59:59")`,
// que se interpreta en la zona del PROCESO. Los contenedores corren en UTC, así
// que "hasta el 30/07" cortaba en 2026-07-30T23:59:59Z = 20:59:59 hora argentina
// y escondía todo lo hecho entre las 21:00 y la medianoche.
//
// Caso real: Transferencias 5 y 6 (ventas #853 y #854), enviadas a las 22:19 y
// 22:20 del 30/07 ART = 01:19 y 01:20 del 31/07 UTC, no aparecían filtrando por
// el 30/07.
//
// Correr con: node --test lib/fechas/rangoArgentina.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  inicioDiaArgentina,
  finDiaArgentina,
  getRangoArgentina,
  fechaArgentinaISO,
} from "./rangoArgentina.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const LISTAR = "app/api/transferencias/listar/route.js";

const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// Instantes reales de producción.
const TR5 = new Date("2026-07-31T01:19:24.720Z"); // 22:19 ART del 30/07
const TR6 = new Date("2026-07-31T01:20:29.795Z"); // 22:20 ART del 30/07
const TR3 = new Date("2026-07-30T21:51:46.492Z"); // 18:51 ART del 30/07
const TR4 = new Date("2026-07-30T21:54:59.107Z"); // 18:54 ART del 30/07

const dentro = (fecha, desde, hasta) => {
  const d = inicioDiaArgentina(desde);
  const h = finDiaArgentina(hasta);
  return (!d || fecha >= d) && (!h || fecha <= h);
};

// ── 1-3. Tope superior ───────────────────────────────────────────────────────

test("1. fechaHasta 2026-07-30 incluye 2026-07-31T01:19:24Z (Transferencia 5)", () => {
  assert.ok(TR5 <= finDiaArgentina("2026-07-30"));
});

test("2. fechaHasta 2026-07-30 incluye el último milisegundo: 2026-07-31T02:59:59.999Z", () => {
  const fin = finDiaArgentina("2026-07-30");
  assert.equal(fin.toISOString(), "2026-07-31T02:59:59.999Z");
  assert.ok(new Date("2026-07-31T02:59:59.999Z") <= fin);
});

test("3. fechaHasta 2026-07-30 excluye 2026-07-31T03:00:00.000Z (ya es 31 en Argentina)", () => {
  assert.ok(!(new Date("2026-07-31T03:00:00.000Z") <= finDiaArgentina("2026-07-30")));
});

// ── 4-5. Tope inferior ───────────────────────────────────────────────────────

test("4. fechaDesde 2026-07-30 incluye 2026-07-30T03:00:00.000Z", () => {
  const ini = inicioDiaArgentina("2026-07-30");
  assert.equal(ini.toISOString(), "2026-07-30T03:00:00.000Z");
  assert.ok(new Date("2026-07-30T03:00:00.000Z") >= ini);
});

test("5. fechaDesde 2026-07-30 excluye 2026-07-30T02:59:59.999Z (todavía es 29 en Argentina)", () => {
  assert.ok(!(new Date("2026-07-30T02:59:59.999Z") >= inicioDiaArgentina("2026-07-30")));
});

// ── 6. Día completo ──────────────────────────────────────────────────────────

test("6. un rango del mismo día cubre las 24 horas argentinas exactas", () => {
  const ini = inicioDiaArgentina("2026-07-30");
  const fin = finDiaArgentina("2026-07-30");
  assert.equal(fin - ini, 24 * 60 * 60 * 1000 - 1);
  // Los cuatro bordes del día en Argentina.
  for (const iso of [
    "2026-07-30T03:00:00.000Z", // 00:00 ART
    "2026-07-30T23:59:59.000Z", // 20:59 ART
    "2026-07-31T00:00:00.000Z", // 21:00 ART  ← la franja que se perdía
    "2026-07-31T02:59:59.999Z", // 23:59 ART
  ]) {
    assert.ok(dentro(new Date(iso), "2026-07-30", "2026-07-30"), `${iso} debería entrar`);
  }
});

// ── 7-9. Caso real de producción ─────────────────────────────────────────────

test("7. Transferencias 5 y 6 entran con el rango que usa la UI (30/06 → 30/07)", () => {
  assert.ok(dentro(TR5, "2026-06-30", "2026-07-30"), "Transferencia 5 debe aparecer");
  assert.ok(dentro(TR6, "2026-06-30", "2026-07-30"), "Transferencia 6 debe aparecer");
});

test("8. Transferencias 3 y 4 siguen entrando (no hay regresión)", () => {
  assert.ok(dentro(TR3, "2026-06-30", "2026-07-30"));
  assert.ok(dentro(TR4, "2026-06-30", "2026-07-30"));
});

test("9. algo del 31/07 hora argentina queda fuera del rango que termina el 30/07", () => {
  const elDiaSiguiente = new Date("2026-07-31T03:00:00.000Z"); // 00:00 ART del 31
  assert.ok(!dentro(elDiaSiguiente, "2026-06-30", "2026-07-30"));
  assert.ok(dentro(elDiaSiguiente, "2026-06-30", "2026-07-31"));
});

test("9b. REGRESIÓN: la fórmula vieja dejaba afuera las Transferencias 5 y 6", () => {
  // `new Date("2026-07-30T23:59:59")` en un proceso UTC.
  const topeViejo = new Date("2026-07-30T23:59:59.000Z");
  assert.ok(!(TR5 <= topeViejo), "así desaparecía la Transferencia 5");
  assert.ok(!(TR6 <= topeViejo), "así desaparecía la Transferencia 6");
  // Y con el tope nuevo entran.
  assert.ok(TR5 <= finDiaArgentina("2026-07-30"));
  assert.ok(TR6 <= finDiaArgentina("2026-07-30"));
});

// ── 10-11. Extremos ausentes ─────────────────────────────────────────────────

test("10. sin fechaHasta no se agrega límite superior", () => {
  for (const vacio of [null, undefined, ""]) {
    assert.equal(finDiaArgentina(vacio), null);
  }
});

test("11. sin fechaDesde no se agrega límite inferior", () => {
  for (const vacio of [null, undefined, ""]) {
    assert.equal(inicioDiaArgentina(vacio), null);
  }
});

test("11b. una fecha con formato inesperado se ignora en vez de romper la consulta", () => {
  for (const malo of ["ayer", "30/07/2026", "2026-7-3", "abc", "2026-13-99x"]) {
    assert.equal(inicioDiaArgentina(malo), null, `${malo} no debería producir un límite`);
    assert.equal(finDiaArgentina(malo), null);
  }
});

test("11c. acepta un ISO completo y toma solo el día", () => {
  assert.equal(
    finDiaArgentina("2026-07-30T15:22:00.000Z").toISOString(),
    "2026-07-31T02:59:59.999Z"
  );
});

// ── 12-14. El resto del endpoint no cambia ───────────────────────────────────

test("12. no se altera el scope origenId OR destinoId", () => {
  const src = leerSinComentarios(LISTAR);
  assert.ok(src.includes("origenId: vista.localId"));
  assert.ok(src.includes("destinoId: vista.localId"));
  assert.ok(src.includes("origenId: { in: vista.localIds }"));
  assert.ok(src.includes("destinoId: { in: vista.localIds }"));
});

test("13. no se altera el filtro por estado", () => {
  const src = leerSinComentarios(LISTAR);
  assert.ok(/if \(estado\) where\.estado = estado;/.test(src));
});

test("14. no se altera la paginación", () => {
  const src = leerSinComentarios(LISTAR);
  assert.ok(src.includes("skip: (page - 1) * PAGE_SIZE"));
  assert.ok(src.includes("take: PAGE_SIZE"));
});

test("14b. el endpoint ya no construye los límites a mano", () => {
  const src = leerSinComentarios(LISTAR);
  assert.ok(
    !/new Date\(fecha(Desde|Hasta)\s*\+/.test(src),
    "construir la fecha a mano la interpreta en la zona del proceso"
  );
  assert.ok(src.includes("inicioDiaArgentina") && src.includes("finDiaArgentina"));
});

// ── 15. Independencia del timezone del proceso ───────────────────────────────

test("15. el resultado no depende del timezone del proceso", () => {
  // El offset va explícito en el string, así que el valor absoluto es el mismo
  // corra donde corra. Se comprueba contra el instante UTC esperado.
  assert.equal(inicioDiaArgentina("2026-07-30").getTime(), Date.parse("2026-07-30T03:00:00.000Z"));
  assert.equal(finDiaArgentina("2026-07-30").getTime(), Date.parse("2026-07-31T02:59:59.999Z"));

  const src = fs.readFileSync(path.join(RAIZ, "lib/fechas/rangoArgentina.js"), "utf8");
  assert.ok(src.includes("-03:00"), "el offset debe ser explícito");
  assert.ok(!src.includes("process.env.TZ"), "no debe leer el TZ del proceso");
});

// ── Compatibilidad con lo que ya usaba el módulo ─────────────────────────────

test("16. getRangoArgentina sigue igual para sus cinco llamadores actuales", () => {
  const { fechaInicio, fechaFin } = getRangoArgentina("2026-07-30", "2026-07-30");
  assert.equal(fechaInicio.toISOString(), "2026-07-30T03:00:00.000Z");
  assert.equal(fechaFin.toISOString(), "2026-07-31T02:59:59.999Z");
  // Y conserva su default a "hoy" cuando falta un extremo (a diferencia de los
  // helpers nuevos, que devuelven null a propósito).
  const conFaltante = getRangoArgentina(null, null);
  assert.ok(conFaltante.fechaInicio instanceof Date);
  assert.ok(!isNaN(conFaltante.fechaInicio.getTime()));
});

test("16b. fechaArgentinaISO ubica el instante en el día argentino correcto", () => {
  assert.equal(fechaArgentinaISO(TR5), "2026-07-30", "01:19Z del 31 es todavía el 30 en Argentina");
  assert.equal(fechaArgentinaISO(new Date("2026-07-31T03:00:00.000Z")), "2026-07-31");
});
