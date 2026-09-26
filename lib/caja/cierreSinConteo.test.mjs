// CERRAR SIN CONTEO: las reglas puras, las pantallas y la forma de la ruta.
//
// DATO DESCONOCIDO NO ES CERO. Cada prueba de acá defiende una forma de romper
// eso: dejar cerrar un corte que todavía no venció, fabricar un arqueo o un
// retiro, mostrar "$0" o "Caja correcta" donde nadie contó.
//
// Lo que la ruta ESCRIBE de verdad se ejerce contra Postgres en
// `scripts/pruebas-db/cierreCaja.mjs` (sección D).
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cierreSinConteo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  ESTADO_CIERRE,
  PERMISO_CERRAR_SIN_CONTEO,
  ACCION_CERRAR_SIN_CONTEO,
  TEXTO_SIN_CONTAR,
  TEXTO_DIFERENCIA_NO_DISPONIBLE,
  cierreCerrableSinConteo,
  cierreConfirmable,
  cierreCancelable,
  validarMotivoSinConteo,
  turnoSinConteo,
  motivoNoConfirmable,
} from "./cierreRelevo.js";
import { resultadoCierre, CAJA_SIN_CONTEO } from "./vistaTurno.js";
import { armarCircuito } from "./circuitoDinero.js";
import { PERMISSION_REGISTRY } from "../rbac/registry.js";
import { DEFAULT_PERMISOS_SISTEMA } from "../rbac/systemRoles.js";

const T = (s) => new Date(s);
const VENCE = T("2026-08-04T12:00:00Z");
const ANTES = T("2026-08-04T11:00:00Z");
const DESPUES = T("2026-08-04T13:00:00Z");

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── QUÉ CORTE SE PUEDE CERRAR SIN CONTEO ───────────────────────────────────

test("solo un corte vencido POR TIEMPO se cierra sin conteo", () => {
  // Vigente: el cajero puede estar contando. Su salida es confirmar.
  assert.equal(cierreCerrableSinConteo({ estado: "PREPARANDO", venceEn: VENCE }, ANTES), false);
  // Vencido por tiempo aunque la etiqueta todavía diga PREPARANDO: nadie abrió
  // la bandeja, y eso no puede decidir nada.
  assert.equal(cierreCerrableSinConteo({ estado: "PREPARANDO", venceEn: VENCE }, DESPUES), true);
  assert.equal(cierreCerrableSinConteo({ estado: "VENCIDO", venceEn: VENCE }, DESPUES), true);
});

test("confirmado, cancelado o ya resuelto no se cierran sin conteo", () => {
  for (const estado of ["CONFIRMADO", "CANCELADO", "CERRADO_SIN_CONTEO"]) {
    assert.equal(cierreCerrableSinConteo({ estado, venceEn: VENCE }, DESPUES), false, estado);
  }
});

test("un corte resuelto sin conteo ya no se confirma ni se cancela", () => {
  const c = { estado: ESTADO_CIERRE.CERRADO_SIN_CONTEO, venceEn: VENCE };
  assert.equal(cierreConfirmable(c), false);
  assert.equal(cierreCancelable(c, ANTES), false);
  // Y el rechazo lo dice: antes cualquier no-confirmable decía "fue cancelado".
  assert.match(motivoNoConfirmable(c), /sin conteo/);
  assert.match(motivoNoConfirmable({ estado: "CANCELADO" }), /cancelado/);
});

test("el motivo es obligatorio y se recorta", () => {
  assert.equal(validarMotivoSinConteo("").valido, false);
  assert.equal(validarMotivoSinConteo("   ").valido, false);
  assert.equal(validarMotivoSinConteo(null).valido, false);
  const ok = validarMotivoSinConteo("  el cajero se fue sin contar  ");
  assert.deepEqual(ok, { valido: true, motivo: "el cajero se fue sin contar" });
  assert.equal(validarMotivoSinConteo("x".repeat(600)).motivo.length, 500);
});

// ── EL PERMISO ─────────────────────────────────────────────────────────────

test("el permiso existe en el registro y no va a NINGÚN rol de sistema", () => {
  const entrada = PERMISSION_REGISTRY.find((p) => p.code === PERMISO_CERRAR_SIN_CONTEO);
  assert.ok(entrada, "el permiso no está en el registro");
  assert.equal(entrada.group, "pos");
  assert.equal(entrada.deprecated, false);
  for (const [rol, permisos] of Object.entries(DEFAULT_PERMISOS_SISTEMA)) {
    assert.equal(
      (permisos || []).includes(PERMISO_CERRAR_SIN_CONTEO),
      false,
      `el rol ${rol} recibe el permiso excepcional por defecto`
    );
  }
});

// ── LO QUE SE MUESTRA ──────────────────────────────────────────────────────

const CERRADO_SIN_CONTEO = {
  cierre: T("2026-08-05T10:00:00Z"),
  cierreEnPreparacionEn: T("2026-08-04T00:00:00Z"),
  anuladoEn: null,
  montoInicial: 10000,
  montoEsperadoEfectivo: 45000,
  montoRealEfectivo: null,
  diferenciaEfectivo: null,
  efectivoRetiradoCierre: null,
  fondoDejadoCierre: 2000,
};

test("un turno cerrado sin contado se reconoce; el que no trajo la columna, no", () => {
  assert.equal(turnoSinConteo(CERRADO_SIN_CONTEO), true);
  // Contado 0 ES un conteo.
  assert.equal(turnoSinConteo({ ...CERRADO_SIN_CONTEO, montoRealEfectivo: 0 }), false);
  // Abierto o en preparación todavía no se cerró: no es "sin contar".
  assert.equal(turnoSinConteo({ ...CERRADO_SIN_CONTEO, cierre: null }), false);
  // Anulado es otro estado y cada pantalla ya lo trata.
  assert.equal(turnoSinConteo({ ...CERRADO_SIN_CONTEO, anuladoEn: T("2026-08-05T10:00:00Z") }), false);
  // Sin la columna, no se sabe: no se afirma "sin contar".
  const { montoRealEfectivo, ...sinColumna } = CERRADO_SIN_CONTEO;
  assert.equal(turnoSinConteo(sinColumna), false);
});

test("el resultado de un cerrado sin contado NO es 'turno abierto' ni un cero", () => {
  const r = resultadoCierre({ esperado: 45000, contado: null, cerrado: true });
  assert.equal(r.estado, CAJA_SIN_CONTEO);
  assert.equal(r.cerrado, true);
  assert.equal(r.monto, null, "la diferencia desconocida no es 0");
  assert.doesNotMatch(r.titulo, /abierto|correcta|\$/i);
  // Sin el dato del turno, el contado vacío sigue siendo "todavía no se contó".
  assert.equal(resultadoCierre({ esperado: 45000, contado: null }).titulo, "Turno abierto");
});

test("el circuito no presenta como cierto lo que salió del local si no se contó", () => {
  const c = armarCircuito({
    turno: CERRADO_SIN_CONTEO,
    resumen: { totalEfectivo: 35000, movimientosManuales: { ingresos: 0, retiros: 0 }, totalRetirosCaja: 0 },
    corte: { corteEn: T("2026-08-04T00:00:00Z"), efectivoRetiradoEsperado: 43000, totalRetiroContado: null },
  });
  assert.equal(c.cierre.sinConteo, true);
  assert.equal(c.cierre.efectivoContado, null);
  assert.equal(c.cierre.diferencia, null);
  assert.equal(c.cierre.retiroFinal, null);
  assert.equal(c.totales.salioDelLocal, null, "sumaba los retiros sin el final y lo mostraba como total");
  assert.equal(c.historico, false, "el cierre sin conteo se leía como anterior al circuito");
});

test("los textos son los pedidos, y ninguno es un número", () => {
  assert.equal(TEXTO_SIN_CONTAR, "Sin contar");
  assert.equal(TEXTO_DIFERENCIA_NO_DISPONIBLE, "No disponible");
});

test("las pantallas que muestran el cierre dicen 'Sin contar', no $0 ni '-'", () => {
  for (const ruta of [
    "components/turnos/ResumenCierre.jsx",
    "components/turnos/CircuitoDelDinero.jsx",
    "components/finanzas/DetalleDeTurno.jsx",
    "app/modulos/turnos/page.jsx",
    "app/modulos/turnos/[id]/page.jsx",
    "app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx",
    "app/modulos/auditoria-pos-ventas/cajas/page.jsx",
  ]) {
    const src = sinComentarios(ruta);
    assert.match(src, /TEXTO_SIN_CONTAR|TEXTO_DIFERENCIA_NO_DISPONIBLE/, `${ruta} no distingue el cierre sin conteo`);
  }
  // El ticket Z imprimía "$-" para el contado y la diferencia.
  const z = sinComentarios("app/modulos/turnos/[id]/page.jsx");
  assert.equal(/\$\$\{fmt\(turno\.montoRealEfectivo\)\}/.test(z), false, "el ticket vuelve a imprimir $- como contado");
  assert.equal(/\$\$\{fmt\(turno\.diferenciaEfectivo\)\}/.test(z), false, "el ticket vuelve a imprimir $- como diferencia");
});

test("el resumen del turno trae el corte resuelto sin conteo", () => {
  const src = sinComentarios("app/api/pos-ventas/turnos/resumen/route.js");
  assert.match(src, /"CERRADO_SIN_CONTEO"/, "sin el corte, el circuito se lee como histórico y esconde todo");
});

// ── LA FORMA DE LA RUTA ────────────────────────────────────────────────────

const RUTA = "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js";

test("la ruta no fabrica arqueo, ni retiro, ni toca el sobre", () => {
  const src = sinComentarios(RUTA);
  for (const prohibido of [
    "arqueoCaja.create", "arqueoCaja.upsert", "cajaMovimiento.create",
    "cambioPendiente.update", "cambioPendiente.create", "cambioPendiente.delete",
    "cierrePreparacion.delete",
  ]) {
    assert.equal(src.includes(prohibido), false, `la ruta hace ${prohibido}`);
  }
  // Lo contado, la diferencia y el retiro van en NULL, no en cero ni en el esperado.
  assert.match(src, /montoRealEfectivo: null/);
  assert.match(src, /diferenciaEfectivo: null/);
  assert.match(src, /efectivoRetiradoCierre: null/);
  assert.equal(/montoRealEfectivo: fila\.efectivoEsperadoCorte/.test(src), false);
  assert.match(src, /montoEsperadoEfectivo: fila\.efectivoEsperadoCorte/);
});

test("la ruta exige permiso, motivo y vencimiento por tiempo, y bloquea como las otras", () => {
  const src = sinComentarios(RUTA);
  assert.match(src, /checkPerm\(session, PERMISO_CERRAR_SIN_CONTEO\)/);
  assert.match(src, /validarMotivoSinConteo\(body\?\.motivo\)/);
  assert.match(src, /cierreCerrableSinConteo\(fila, ahora\)/);
  // Mismo orden de locks que confirmar y cancelar: turno y después corte.
  assert.ok(src.indexOf("bloquearTurno(tx") < src.indexOf("bloquearCierre(tx"));
  assert.match(src, /OPCIONES_TX/);
  // La evidencia, con `tx`, en la misma transacción.
  assert.match(src, /tx\.auditoriaBitacora\.create/);
  assert.match(src, /accion: ACCION_CERRAR_SIN_CONTEO/);
  assert.equal(ACCION_CERRAR_SIN_CONTEO, "caja.cerrar_sin_conteo");
});

// ── LA MIGRACIÓN ES ADITIVA ────────────────────────────────────────────────

test("la migración solo agrega: sin UPDATE, DELETE, DROP ni backfill", () => {
  const carpeta = readdirSync("prisma/migrations").find((d) => d.endsWith("_cierre_sin_conteo"));
  assert.ok(carpeta, "falta la migración");
  const sql = readFileSync(`prisma/migrations/${carpeta}/migration.sql`, "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /ALTER TYPE "EstadoCierrePreparacion" ADD VALUE 'CERRADO_SIN_CONTEO'/);
  for (const prohibido of [/\bUPDATE\b/i, /\bDELETE\b/i, /\bDROP\b/i, /\bINSERT\b/i, /NOT NULL/i, /DEFAULT/i]) {
    assert.equal(prohibido.test(sql), false, `la migración tiene ${prohibido}`);
  }
});

test("el script viejo ya no cierra mandando el esperado como contado", () => {
  const src = readFileSync("scripts/cerrar-turno-vencido.mjs", "utf8");
  const bloqueo = src.indexOf("if (APLICAR) {");
  const cierre = src.indexOf('pedir("/api/pos-ventas/turnos/cerrar"');
  assert.ok(bloqueo > 0 && bloqueo < cierre, "--aplicar vuelve a llegar al cierre");
  assert.match(src.slice(bloqueo, cierre), /process\.exit\(2\)/);
});
