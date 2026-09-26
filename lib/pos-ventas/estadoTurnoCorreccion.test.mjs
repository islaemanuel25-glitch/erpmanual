// LA CORRECCIÓN COMPLETA SOLO CORRE CON EL TURNO ORIGINAL ABIERTO.
//
// "Abierto" es el estado canónico del turno —`estadoDelTurno`—, no
// `cierre == null`. Hasta el 2026-09-26 esta regla miraba solo `cierre`, y un
// turno con el corte de cierre tomado todavía no lo tiene: la corrección entraba,
// movía stock y reescribía `VentaPago` de una venta que el corte ya había contado
// en su esperado congelado.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/estadoTurnoCorreccion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  estadoTurnoCorreccion,
  mensajeBloqueoTurno,
  COD_TURNO_CERRADO,
  COD_TURNO_EN_CIERRE,
  MSG_TURNO_CERRADO,
  MSG_TURNO_EN_CIERRE,
} from "./correccionCompletaServer.js";

const T = (s) => new Date(s);
const venta = (turno) => ({ turnoId: 7, turno });

test("ABIERTO permite", () => {
  const r = estadoTurnoCorreccion(venta({ id: 7, cierre: null, cierreEnPreparacionEn: null, anuladoEn: null }));
  assert.deepEqual(r, { turnoAbierto: true, turnoId: 7, motivoBloqueo: null });
});

test("CIERRE_EN_PREPARACION rechaza, con su propio código", () => {
  const r = estadoTurnoCorreccion(
    venta({ id: 7, cierre: null, cierreEnPreparacionEn: T("2026-09-26T15:00:00Z"), anuladoEn: null })
  );
  assert.equal(r.turnoAbierto, false, "un turno con el corte tomado se dejaba corregir");
  assert.equal(r.motivoBloqueo, COD_TURNO_EN_CIERRE);
});

test("CERRADO sigue rechazando", () => {
  const r = estadoTurnoCorreccion(
    venta({ id: 7, cierre: T("2026-09-26T20:00:00Z"), cierreEnPreparacionEn: null, anuladoEn: null })
  );
  assert.equal(r.turnoAbierto, false);
  assert.equal(r.motivoBloqueo, COD_TURNO_CERRADO);
});

test("CERRADO por el relevo —con las dos marcas— sigue rechazando como cerrado", () => {
  // La confirmación del relevo pone `cierre` sin limpiar `cierreEnPreparacionEn`.
  const r = estadoTurnoCorreccion(
    venta({
      id: 7,
      cierre: T("2026-09-26T20:00:00Z"),
      cierreEnPreparacionEn: T("2026-09-26T19:00:00Z"),
      anuladoEn: null,
    })
  );
  assert.equal(r.turnoAbierto, false);
  assert.equal(r.motivoBloqueo, COD_TURNO_CERRADO);
});

test("ANULADO sigue rechazando", () => {
  const r = estadoTurnoCorreccion(
    venta({ id: 7, cierre: T("2026-09-26T20:00:00Z"), cierreEnPreparacionEn: null, anuladoEn: T("2026-09-26T20:00:00Z") })
  );
  assert.equal(r.turnoAbierto, false);
  assert.equal(r.motivoBloqueo, COD_TURNO_CERRADO);
});

test("sin turno o sin poder leerlo sigue fallando cerrado", () => {
  assert.equal(estadoTurnoCorreccion({ turnoId: null, turno: null }).motivoBloqueo, "sin_turno_original");
  assert.equal(estadoTurnoCorreccion({ turnoId: 7, turno: null }).motivoBloqueo, "turno_no_verificable");
});

test("cada código de turno tiene su mensaje, y los otros no", () => {
  assert.equal(mensajeBloqueoTurno(COD_TURNO_CERRADO), MSG_TURNO_CERRADO);
  assert.equal(mensajeBloqueoTurno(COD_TURNO_EN_CIERRE), MSG_TURNO_EN_CIERRE);
  assert.equal(mensajeBloqueoTurno("turno_no_verificable"), null);
});

// ── LA FORMA DEL DATO ES LA DEL DATO REAL ─────────────────────────────────
//
// Las pruebas de arriba pasan un turno con las tres columnas. Si la consulta que
// alimenta la regla no las trae, `cierreEnPreparacionEn` llega `undefined` y el
// turno con corte se lee ABIERTO: verde acá, defecto en la pantalla.

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("las dos consultas que alimentan la regla traen las columnas del estado", () => {
  const SELECT = /turno: \{ select: \{ (id: true, )?cierre: true, cierreEnPreparacionEn: true, anuladoEn: true \} \}/;
  assert.match(sinComentarios("lib/pos-ventas/correccionCompletaServer.js"), SELECT);
  assert.match(sinComentarios("app/api/reportes-ventas/detalle/[id]/route.js"), SELECT);
});

test("el botón del detalle usa la MISMA regla que la corrección al guardar", () => {
  const src = sinComentarios("app/api/reportes-ventas/detalle/[id]/route.js");
  assert.match(src, /estadoTurnoCorreccion\(venta\)/);
  assert.equal(/venta\.turno\.cierre == null/.test(src), false, "volvió la copia de la regla que solo mira `cierre`");
});

test("ninguna ruta de corrección decide 'abierto' mirando solo `cierre`", () => {
  for (const ruta of [
    "lib/pos-ventas/correccionCompletaServer.js",
    "app/api/pos-ventas/venta/[id]/corregir/route.js",
    "app/api/pos-ventas/venta/[id]/editar/route.js",
    "app/api/pos-ventas/venta/[id]/revisar/route.js",
  ]) {
    assert.equal(/turno\.cierre == null/.test(sinComentarios(ruta)), false, `${ruta} decide por \`cierre\` solo`);
  }
});
