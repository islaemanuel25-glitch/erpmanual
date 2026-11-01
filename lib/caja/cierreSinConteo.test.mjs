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
  motivoNoConfirmable,
} from "./cierreRelevo.js";
import { resultadoCierre, CAJA_SIN_CONTEO } from "./vistaTurno.js";
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

// El candado de `turnoSinConteo` se fue el 2026-11-01 con la función, cuyos
// lectores eran las pantallas viejas de turnos y la auditoría de cajas.

test("el resultado de un cerrado sin contado NO es 'turno abierto' ni un cero", () => {
  const r = resultadoCierre({ esperado: 45000, contado: null, cerrado: true });
  assert.equal(r.estado, CAJA_SIN_CONTEO);
  assert.equal(r.cerrado, true);
  assert.equal(r.monto, null, "la diferencia desconocida no es 0");
  assert.doesNotMatch(r.titulo, /abierto|correcta|\$/i);
  // Sin el dato del turno, el contado vacío sigue siendo "todavía no se contó".
  assert.equal(resultadoCierre({ esperado: 45000, contado: null }).titulo, "Turno abierto");
});

test("los textos son los pedidos, y ninguno es un número", () => {
  assert.equal(TEXTO_SIN_CONTAR, "Sin contar");
  assert.equal(TEXTO_DIFERENCIA_NO_DISPONIBLE, "No disponible");
});

test("las pantallas que muestran el cierre dicen 'Sin contar', no $0 ni '-'", () => {
  // Las pantallas viejas —la lista y la ficha de turnos, las de Cajas y Turnos
  // de la auditoría y la ficha del turno en Finanzas— se borraron el
  // 2026-11-01. Lo que muestra el cierre HOY es el módulo "Turnos y cierres"
  // (sus textos salen de `pantallaTurnosYCierres.js`) y el ticket Z.
  for (const ruta of [
    "lib/turnosYCierres/pantallaTurnosYCierres.js",
    // El ticket Z se mudó de la ficha del turno viejo a su propio módulo cuando
    // "Turnos y cierres" empezó a reimprimirlo. El candado mira donde vive el
    // papel HOY; mirando una página quedaría verde sin mirar nada.
    "components/turnos/imprimirZReport.js",
  ]) {
    const src = sinComentarios(ruta);
    assert.match(src, /TEXTO_SIN_CONTAR|TEXTO_DIFERENCIA_NO_DISPONIBLE/, `${ruta} no distingue el cierre sin conteo`);
  }
  // Y la pantalla que lo imprime usa ESE módulo, no una copia propia.
  for (const ruta of ["app/modulos/turnos-y-cierres/cajas/[id]/z/page.jsx"]) {
    const src = sinComentarios(ruta);
    assert.match(src, /from "@\/components\/turnos\/imprimirZReport"/, `${ruta} no imprime el Z compartido`);
    assert.doesNotMatch(src, /function imprimirZReport\(/, `${ruta} tiene su propia copia del Z`);
  }
  // El ticket Z imprimía "$-" para el contado y la diferencia.
  const z = sinComentarios("components/turnos/imprimirZReport.js");
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
