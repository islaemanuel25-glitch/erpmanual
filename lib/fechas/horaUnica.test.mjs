// EL TRINQUETE DE LA HORA: la lista de los que todavía formatean por su cuenta
// SOLO PUEDE ACHICARSE.
//
// ── POR QUÉ UN CONTADOR Y NO UNA PROHIBICIÓN ────────────────────────────────
//
// Son 84 archivos los que formatean fechas en el frontend y migrarlos todos de
// una es una tanda que nadie va a poder revisar. Una prohibición seca dejaría la
// suite en rojo desde el primer minuto y terminaría apagada.
//
// Entonces se hace como el trinquete de hardcodeo: la lista de los que faltan
// está escrita acá, el candado exige que ninguno NUEVO se sume, y cada tanda que
// migra uno lo borra de la lista. El número solo puede bajar.
//
// ── QUÉ DEFIENDE ────────────────────────────────────────────────────────────
//
// Todo el stack corre en UTC y Argentina es UTC−3, así que un `toLocale*` sin
// `timeZone` muestra la hora DEL DISPOSITIVO. Medido con la venta 7726 —guardada
// 14:16:40— el ticket mostraba 14:16 en una Sunmi en UTC y el detalle mostraba
// 11:16. La misma venta, dos horas distintas, y ninguna de las dos pantallas
// avisando de nada.
//
// Y sin `hour12: false` el ICU devuelve "11:16 a. m." — o, en el ticket PDF, un
// "02:16:40" sin sufijo que no se distingue de las dos de la mañana.
//
// Las dos cosas viven en `lib/fechas/formatearFechaHora.js` y en ningún otro
// lado.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { fechaHoraAR, fechaAR, horaAR, diaSemanaAR, fechaHoraSegundosAR } from "./formatearFechaHora.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// ── LA LISTA DE LOS QUE FALTAN ──────────────────────────────────────────────
//
// Medida el 2026-08-19, después de migrar el ticket —PDF y térmico—, la
// auditoría, los turnos y el detalle de la venta, que son los que tienen
// consecuencia afuera: el ticket es el único papel que sale de la empresa.
//
// PARA MIGRAR UNO: se cambia el `toLocale*` por el helper y se BORRA de esta
// lista. El candado de abajo comprueba que el archivo ya no formatea por su
// cuenta, así que no se puede borrar de la lista sin haberlo migrado.
//
// ── LA LISTA QUEDÓ EN CERO EL 2026-08-19 ────────────────────────────────────
//
// Los 36 archivos están migrados. Desde acá el trinquete deja de ser un
// contador que baja y pasa a ser una PROHIBICIÓN: cualquier archivo nuevo que
// formatee hora por su cuenta pone la suite en rojo el mismo día.
//
// Se deja el mecanismo en pie —lista vacía, no candado borrado— porque el día
// que alguien tenga un motivo real para formatear afuera del helper, la forma
// correcta de hacerlo es escribirlo acá con su porqué, no aflojar el candado.
//
// ── EL AGUJERO CONOCIDO DE ESTE CANDADO ─────────────────────────────────────
//
// El filtro de abajo saca de la cuenta a todo archivo que MENCIONE
// `formatearFechaHora`. Es a nivel archivo, no a nivel línea: uno que importe el
// helper para una fecha y siga formateando otra a mano sale limpio igual. Es la
// misma coarseness que tiene el trinquete de hardcodeo y se acepta por el mismo
// motivo —un candado por línea necesitaría parsear JSX—, pero está escrito acá
// para que nadie lo descubra creyendo que el candado afirma más de lo que
// afirma.
//
// Hay un caso REAL que usa esa puerta, y a propósito:
// `lib/compras-proveedor/comprobante/lector/cuota.js` importa `TZ_AR` y conserva
// su propio `Intl`, porque convierte entre DOS husos —la cuota se corta en
// California— y el de destino es un parámetro. El porqué está escrito ahí.
const PENDIENTES = [];

/** Los archivos que hoy formatean hora/día sin pasar por el helper. */
function formateanPorSuCuenta() {
  // `git grep` recorre el repo entero, incluido lo que un `readdirSync` de un
  // nivel se perdería. `-l` da rutas, una por línea.
  //
  // `--untracked` NO es un adorno, y lo encontró la contraprueba del 2026-08-19:
  // sin él, `git grep` mira solo lo que está en el índice, así que un archivo
  // recién escrito y todavía sin `git add` era INVISIBLE para el candado. La
  // suite daba verde y el archivo entraba igual. Es el mismo defecto que ya
  // tenía el conteo de la suite en el procedimiento de despliegue —`git ls-files`
  // a secas no lista lo nuevo—, y acá era peor: el candado existe justamente para
  // atajar lo NUEVO.
  const salida = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-E", "toLocaleTimeString|timeStyle|hour: *\"2-digit\"|weekday:", "--", "app", "components", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return salida
    .split("\n")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"))
    .filter((f) => !f.startsWith("lib/fechas/"))
    .filter((f) => {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      return !src.includes("formatearFechaHora");
    });
}

test("NINGÚN ARCHIVO NUEVO formatea la hora por su cuenta", () => {
  const actuales = formateanPorSuCuenta();
  const nuevos = actuales.filter((f) => !PENDIENTES.includes(f));
  assert.deepEqual(
    nuevos,
    [],
    `estos archivos formatean hora sin el helper y no están en la lista:\n  ${nuevos.join("\n  ")}\n` +
      `Usá lib/fechas/formatearFechaHora.js. Sin la zona, la hora sale la del dispositivo; ` +
      `sin hour12:false, sale con "a. m.".`
  );
});

test("y la lista SOLO PUEDE ACHICARSE", () => {
  const actuales = formateanPorSuCuenta();
  assert.ok(
    actuales.length <= PENDIENTES.length,
    `la lista creció: ${actuales.length} archivos formatean por su cuenta y la lista declara ${PENDIENTES.length}`
  );
});

test("y no se puede borrar de la lista sin haber migrado", () => {
  // El par del anterior. Sin esto, la forma barata de poner el candado en verde
  // sería vaciar la lista, que es exactamente lo contrario de migrar.
  const actuales = formateanPorSuCuenta();
  const declaradosQueYaNoFormatean = PENDIENTES.filter((f) => !actuales.includes(f));
  assert.deepEqual(
    declaradosQueYaNoFormatean,
    [],
    `estos están en la lista pero YA no formatean por su cuenta: borralos de PENDIENTES\n  ${declaradosQueYaNoFormatean.join("\n  ")}`
  );
});

// ── EL HELPER, EJERCIDO ─────────────────────────────────────────────────────

test("la misma venta da la MISMA hora, esté el dispositivo donde esté", () => {
  // Éste es el candado que defiende lo del incidente. La venta 7726 se guardó
  // 14:16:40 y en Argentina son las 11:16. Antes el ticket mostraba una hora y
  // el detalle otra según la zona del aparato.
  const venta = new Date("2026-08-19T14:16:40.600Z");
  assert.equal(fechaHoraAR(venta), "19/08/2026 11:16");
  assert.equal(fechaHoraSegundosAR(venta), "19/08/2026 11:16:40");
  assert.equal(horaAR(venta), "11:16");
  assert.equal(fechaAR(venta), "19/08/2026");
});

test("SIEMPRE en 24 horas: nunca 'a. m.' ni 'p. m.'", () => {
  // Una de la tarde es el caso que lo delata: en 12 horas sería "01:00".
  const tarde = new Date("2026-08-19T16:00:00Z"); // 13:00 en Argentina
  assert.equal(horaAR(tarde), "13:00");
  assert.doesNotMatch(fechaHoraAR(tarde), /a\.\s?m\.|p\.\s?m\./i);
  assert.doesNotMatch(fechaHoraSegundosAR(tarde), /a\.\s?m\.|p\.\s?m\./i);
});

test("el DÍA también se corrige, no solo la hora", () => {
  // Una venta de las 22:00 en Argentina es del día SIGUIENTE en UTC. Sin la zona,
  // el listado la muestra en el día equivocado y el cierre del turno no cierra.
  const noche = new Date("2026-08-20T01:30:00Z"); // 22:30 del 19 en Argentina
  assert.equal(fechaAR(noche), "19/08/2026");
  assert.equal(horaAR(noche), "22:30");
  assert.match(diaSemanaAR(noche), /mi[ée]rcoles/i);
});

test("un valor vacío o inválido no inventa una fecha", () => {
  assert.equal(fechaHoraAR(null), "—");
  assert.equal(fechaHoraAR(undefined), "—");
  assert.equal(fechaHoraAR(""), "—");
  assert.equal(fechaHoraAR("cualquier cosa"), "—");
  assert.equal(horaAR(null, { vacio: "-" }), "-");
});
