// CORRECCIÓN HISTÓRICA DE CAJA: el plan puro, el manifiesto, las rutas y el registro.
//
// Lo que el motor hace contra la base —ensayo con rollback, aplicación,
// idempotencia, fallo a mitad— se ejerce contra Postgres en
// `scripts/pruebas-db/correccionCaja.mjs`.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/correcciones/plan.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PERMISO_CORREGIR_HISTORICO,
  ACCION_CORRECCION_HISTORICA,
  ESTADO_MANIFIESTO,
  TIPO_CORRECCION,
  EXCLUSIONES,
  CAMPOS_CORREGIBLES,
  validarManifiesto,
  armarPlan,
  invariantes,
  huellaDelPlan,
  listaDelAlcance,
  esperadoConOtroFondo,
  mismoValor,
} from "./plan.js";
import { MANIFIESTOS, buscarManifiesto } from "./manifiestos.js";
import { PERMISSION_REGISTRY } from "../../rbac/registry.js";
import { DEFAULT_PERMISOS_SISTEMA } from "../../rbac/systemRoles.js";
import { calcularEfectivoEsperado } from "../efectivoEsperado.js";

/** El fuente sin comentarios: un candado que busca código no puede encontrar prosa. */
const codigo = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── Un alcance como lo arma el motor: el incidente de un corte con cambio ×1000 ──

const CERRADO = "2026-09-20T12:00:00.000Z";
function alcanceDeCorte() {
  return {
    Turno: {
      10: {
        id: 10, localId: 1, cierre: CERRADO, cierreEnPreparacionEn: CERRADO, anuladoEn: null,
        montoInicial: 50000, montoEsperadoEfectivo: 50000, montoRealEfectivo: 23027000, diferenciaEfectivo: 22977000,
        efectivoRetiradoCierre: 27000, fondoDejadoCierre: 23000000, retiroCierreMovimientoId: 70,
      },
    },
    CierrePreparacion: {
      20: {
        id: 20, turnoId: 10, estado: "CONFIRMADO", efectivoEsperadoCorte: 50000,
        desgloseCambio: { 1000: 23000 }, totalCambio: 23000000, efectivoRetiradoEsperado: -22950000,
        desgloseRetiroContado: { 1000: 27 }, totalRetiroContado: 27000,
        desgloseContado: { 1000: 23027 }, totalContado: 23027000, retiroFinal: 27000, diferencia: 22977000, arqueoFinalId: 50,
      },
    },
    RetiroPreparacion: {},
    CambioPendiente: {
      30: {
        id: 30, estado: "DISPONIBLE", cierrePreparacionId: 20, turnoOrigenId: 10, turnoDestinoId: null,
        total: 23000000, desglose: { 1000: 23000 }, totalRecibido: null, desgloseRecibido: null, diferencia: null,
      },
    },
    ArqueoCaja: {
      50: { id: 50, turnoId: 10, tipo: "FINAL", efectivoEsperado: 50000, efectivoContado: 23027000, diferencia: 22977000, efectivoRetirado: 27000, fondoDejado: 23000000 },
    },
    CajaMovimiento: { 70: { id: 70, turnoId: 10, tipo: "RETIRO", monto: 27000 } },
  };
}

const MANIFIESTO_CORTE = {
  codigo: "T-CORTE",
  estado: ESTADO_MANIFIESTO.PROPUESTO,
  motivo: "prueba",
  evidencia: "prueba",
  correcciones: [
    { tipo: TIPO_CORRECCION.CORTE, cierrePreparacionId: 20, antes: { desgloseCambio: { 1000: 23000 } }, despues: { desgloseCambio: { 1000: 23 } } },
  ],
};

const cambio = (plan, entidad, id, campo) => plan.cambios.find((c) => c.entidad === entidad && c.id === id && c.campo === campo);

// ── El plan ────────────────────────────────────────────────────────────────

test("el plan de un cambio ×1000 corrige la fuente y TODAS sus copias", () => {
  const plan = armarPlan(alcanceDeCorte(), MANIFIESTO_CORTE);
  assert.deepEqual(plan.errores, []);
  assert.equal(cambio(plan, "CierrePreparacion", 20, "totalCambio").despues, 23000);
  assert.equal(cambio(plan, "CierrePreparacion", 20, "efectivoRetiradoEsperado").despues, 27000);
  assert.equal(cambio(plan, "CierrePreparacion", 20, "diferencia").despues, 0);
  assert.equal(cambio(plan, "CierrePreparacion", 20, "totalContado").despues, 50000);
  assert.deepEqual(cambio(plan, "CierrePreparacion", 20, "desgloseContado").despues, { 1000: 50 });
  assert.equal(cambio(plan, "Turno", 10, "montoRealEfectivo").despues, 50000);
  assert.equal(cambio(plan, "Turno", 10, "diferenciaEfectivo").despues, 0);
  assert.equal(cambio(plan, "Turno", 10, "fondoDejadoCierre").despues, 23000);
  assert.equal(cambio(plan, "ArqueoCaja", 50, "fondoDejado").despues, 23000);
  assert.equal(cambio(plan, "CambioPendiente", 30, "total").despues, 23000);
  assert.deepEqual(cambio(plan, "CambioPendiente", 30, "desglose").despues, { 1000: 23 });
  // El retiro contado no cambió: el movimiento de cierre queda igual.
  assert.equal(cambio(plan, "CajaMovimiento", 70, "monto"), undefined);
  assert.ok(plan.sinCambio.includes("CajaMovimiento#70"));
  assert.ok(invariantes(plan.estado, plan.tocadas).every((i) => i.ok));
});

test("el desglose ANTES queda en el plan tal cual estaba", () => {
  const plan = armarPlan(alcanceDeCorte(), MANIFIESTO_CORTE);
  assert.deepEqual(cambio(plan, "CierrePreparacion", 20, "desgloseCambio").antes, { 1000: 23000 });
  assert.deepEqual(cambio(plan, "CambioPendiente", 30, "desglose").antes, { 1000: 23000 });
});

test("un retiro contado ×1000 corrige también el movimiento de cierre", () => {
  const alcance = alcanceDeCorte();
  const corte = alcance.CierrePreparacion[20];
  Object.assign(corte, {
    desgloseCambio: { 1000: 23 }, totalCambio: 23000, efectivoRetiradoEsperado: 27000,
    desgloseRetiroContado: { 1000: 27000 }, totalRetiroContado: 27000000, totalContado: 27023000, retiroFinal: 27000000, diferencia: 26973000,
  });
  alcance.CajaMovimiento[70].monto = 27000000;
  const m = {
    ...MANIFIESTO_CORTE,
    correcciones: [{ tipo: "CORTE", cierrePreparacionId: 20, antes: { desgloseRetiroContado: { 1000: 27000 } }, despues: { desgloseRetiroContado: { 1000: 27 } } }],
  };
  const plan = armarPlan(alcance, m);
  assert.deepEqual(plan.errores, []);
  assert.deepEqual([cambio(plan, "CajaMovimiento", 70, "monto").antes, cambio(plan, "CajaMovimiento", 70, "monto").despues], [27000000, 27000]);
});

test("un valor anterior que no coincide no arma plan", () => {
  const m = { ...MANIFIESTO_CORTE, correcciones: [{ ...MANIFIESTO_CORTE.correcciones[0], antes: { desgloseCambio: { 1000: 1 } } }] };
  const plan = armarPlan(alcanceDeCorte(), m);
  assert.match(plan.errores.join(" "), /no tiene el desgloseCambio que declara el manifiesto/);
  assert.deepEqual(plan.cambios, []);
});

test("vencido, en preparación, sin conteo o turno abierto: no se corrige", () => {
  for (const estado of ["VENCIDO", "PREPARANDO", "CERRADO_SIN_CONTEO"]) {
    const a = alcanceDeCorte();
    a.CierrePreparacion[20].estado = estado;
    assert.notDeepEqual(armarPlan(a, MANIFIESTO_CORTE).errores, [], estado);
  }
  const abierto = alcanceDeCorte();
  abierto.Turno[10].cierre = null;
  abierto.Turno[10].cierreEnPreparacionEn = null;
  assert.match(armarPlan(abierto, MANIFIESTO_CORTE).errores.join(" "), /no está cerrado/);
});

test("el turno 277 y el corte 85 (venta KG 9152) están excluidos aunque alguien los agregue", () => {
  assert.deepEqual(EXCLUSIONES.map((e) => `${e.entidad}#${e.id}`), ["Turno#277", "CierrePreparacion#85"]);
  const a = alcanceDeCorte();
  a.Turno[277] = { ...a.Turno[10], id: 277 };
  assert.match(armarPlan(a, MANIFIESTO_CORTE).errores.join(" "), /Turno #277 está excluido/);
});

test("no crea ni borra un movimiento: si haría falta, el plan da error", () => {
  const a = alcanceDeCorte();
  // Un retiro que queda en $0: habría que borrar el movimiento.
  a.CierrePreparacion[20].desgloseRetiroContado = { 1000: 27000 };
  a.CierrePreparacion[20].totalRetiroContado = 27000000;
  const m = { ...MANIFIESTO_CORTE, correcciones: [{ tipo: "CORTE", cierrePreparacionId: 20, antes: { desgloseRetiroContado: { 1000: 27000 } }, despues: { desgloseRetiroContado: {} } }] };
  assert.match(armarPlan(a, m).errores.join(" "), /habría que borrar el movimiento/);
});

test("un corte del orden anterior no se corrige todavía", () => {
  const a = alcanceDeCorte();
  a.CierrePreparacion[20].efectivoRetiradoEsperado = null;
  assert.match(armarPlan(a, MANIFIESTO_CORTE).errores.join(" "), /orden anterior/);
});

// ── La huella ───────────────────────────────────────────────────────────────

test("la huella cambia con cualquier valor antes, después o con el alcance", () => {
  const plan = armarPlan(alcanceDeCorte(), MANIFIESTO_CORTE);
  const base = { codigo: "T-CORTE", correcciones: MANIFIESTO_CORTE.correcciones, alcance: listaDelAlcance(alcanceDeCorte()), cambios: plan.cambios };
  const h = huellaDelPlan(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(huellaDelPlan(base), h, "la huella es determinista");
  const otroAntes = plan.cambios.map((c, i) => (i === 0 ? { ...c, antes: 1 } : c));
  assert.notEqual(huellaDelPlan({ ...base, cambios: otroAntes }), h);
  assert.notEqual(huellaDelPlan({ ...base, alcance: [...base.alcance, "ArqueoCaja#99"] }), h);
  assert.notEqual(huellaDelPlan({ ...base, codigo: "OTRO" }), h);
});

// ── Las funciones canónicas ─────────────────────────────────────────────────

test("el esperado con otro fondo sale de calcularEfectivoEsperado, no de una fórmula propia", () => {
  assert.equal(esperadoConOtroFondo(22979000, 23000000, 23000), 2000);
  assert.equal(
    esperadoConOtroFondo(12345.67, 100, 250.5),
    calcularEfectivoEsperado({ montoInicial: 250.5 }).efectivoEsperado - 100 + 12345.67
  );
});

test("plan.js calcula lo derivado SOLO con las funciones del circuito", () => {
  const s = codigo("lib/caja/correcciones/plan.js");
  for (const f of ["calcularRetiroEsperado", "calcularCierreDesdeRetiro", "calcularRetiroDesdeConteo", "calcularDiferencia", "calcularEfectivoEsperado", "unirDesgloses", "validarDesgloseServidor"]) {
    assert.match(s, new RegExp(`${f}\\(`), `no usa ${f}`);
  }
  // Ninguna cuenta de caja escrita a mano sobre los campos derivados.
  assert.doesNotMatch(s, /efectivoEsperadoCorte\s*-\s*|totalRetiroContado\s*\+\s*|montoRealEfectivo\s*-\s*/);
});

test("el plan solo puede escribir campos corregibles", () => {
  assert.deepEqual(Object.keys(CAMPOS_CORREGIBLES).sort(), ["ArqueoCaja", "CajaMovimiento", "CambioPendiente", "CierrePreparacion", "RetiroPreparacion", "Turno"]);
  for (const campos of Object.values(CAMPOS_CORREGIBLES)) {
    for (const prohibido of ["estado", "id", "turnoId", "cierre", "venceEn", "localId"]) assert.equal(campos.includes(prohibido), false);
  }
});

test("mismoValor compara importes al centavo y desgloses por contenido", () => {
  assert.equal(mismoValor(0.1 + 0.2, 0.3), true);
  assert.equal(mismoValor({ 1000: 23, 100: 1 }, { 100: 1, 1000: 23 }), true);
  assert.equal(mismoValor({ 1000: 23 }, { 1000: 23000 }), false);
  assert.equal(mismoValor(null, 0), false);
});

// ── El manifiesto ───────────────────────────────────────────────────────────

test("un manifiesto válido pasa", () => {
  assert.deepEqual(validarManifiesto(MANIFIESTO_CORTE), { valido: true, errores: [] });
});

test("sin valor anterior, con un tipo desconocido o una venta: no pasa", () => {
  const sinAntes = { ...MANIFIESTO_CORTE, correcciones: [{ tipo: "CORTE", cierrePreparacionId: 20, despues: { desgloseCambio: {} } }] };
  assert.match(validarManifiesto(sinAntes).errores.join(" "), /no declara el valor anterior/);
  const venta = { ...MANIFIESTO_CORTE, correcciones: [{ tipo: "VENTA", ventaId: 9152, antes: {}, despues: {} }] };
  assert.match(validarManifiesto(venta).errores.join(" "), /tipo que esta herramienta no maneja/);
  const campoAjeno = { ...MANIFIESTO_CORTE, correcciones: [{ tipo: "CORTE", cierrePreparacionId: 20, antes: { diferencia: 1 }, despues: { diferencia: 0 } }] };
  assert.match(validarManifiesto(campoAjeno).errores.join(" "), /no puede corregir diferencia/);
});

test("un AUTORIZADO necesita la huella exacta y quién autorizó", () => {
  const sinHuella = { ...MANIFIESTO_CORTE, estado: "AUTORIZADO" };
  assert.equal(validarManifiesto(sinHuella).valido, false);
  const completo = { ...sinHuella, autorizacion: { hash: "a".repeat(64), autorizadoPorUsuarioId: 1 } };
  assert.equal(validarManifiesto(completo).valido, true);
});

// ── El registro del repo ────────────────────────────────────────────────────

test("el registro del repo nace vacío: ningún incidente real entra en este PR", () => {
  assert.deepEqual(MANIFIESTOS, []);
  assert.equal(buscarManifiesto("I4"), null);
});

test("I3, I7 e I12 no pueden estar en el registro, ni siquiera propuestos", () => {
  for (const c of ["I3", "I7", "I12"]) assert.equal(buscarManifiesto(c), null, c);
});

test("todo manifiesto del registro es válido", () => {
  for (const m of MANIFIESTOS) assert.deepEqual(validarManifiesto(m).errores, [], m.codigo);
});

// ── Permiso y rutas ─────────────────────────────────────────────────────────

test("el permiso existe en el registro y no va a NINGÚN rol de sistema", () => {
  const entrada = PERMISSION_REGISTRY.find((p) => p.code === PERMISO_CORREGIR_HISTORICO);
  assert.ok(entrada, "el permiso no está en el registro");
  assert.equal(entrada.deprecated, false);
  for (const [rol, permisos] of Object.entries(DEFAULT_PERMISOS_SISTEMA)) {
    assert.equal((permisos || []).includes(PERMISO_CORREGIR_HISTORICO), false, `el rol ${rol} lo recibe por defecto`);
  }
  assert.equal(ACCION_CORRECCION_HISTORICA, "caja.correccion_historica");
});

test("las tres rutas exigen el permiso antes de hacer nada", () => {
  for (const f of ["app/api/caja/correcciones/route.js", "app/api/caja/correcciones/ensayo/route.js", "app/api/caja/correcciones/aplicar/route.js"]) {
    const s = codigo(f);
    const perm = s.indexOf("requirePerm(req, PERMISO_CORREGIR_HISTORICO)");
    assert.ok(perm > 0, `${f} no pide el permiso`);
    const primeraLectura = Math.min(...["prisma.", "req.json", "ejecutarCorreccion("].map((x) => (s.indexOf(x) === -1 ? Infinity : s.indexOf(x))));
    assert.ok(perm < primeraLectura, `${f} hace algo antes de pedir el permiso`);
  }
});

test("la ruta del ensayo nunca aplica; la de aplicar exige AUTORIZADO y la confirmación escrita", () => {
  const ensayo = codigo("app/api/caja/correcciones/ensayo/route.js");
  assert.match(ensayo, /modo: "ensayo"/);
  assert.doesNotMatch(ensayo, /modo: "aplicar"/);
  const aplicar = codigo("app/api/caja/correcciones/aplicar/route.js");
  assert.match(aplicar, /manifiesto\.estado !== ESTADO_MANIFIESTO\.AUTORIZADO/);
  assert.match(aplicar, /body\?\.confirmacion/);
  assert.match(aplicar, /modo: "aplicar"/);
});

test("el motor escribe la corrección y la bitácora con el MISMO tx, y el ensayo deshace", () => {
  const s = codigo("lib/caja/correcciones/motor.js");
  assert.match(s, /tx\.correccionCaja\.create\(/);
  assert.match(s, /tx\.auditoriaBitacora\.create\(/);
  assert.doesNotMatch(s, /prisma\.auditoriaBitacora/);
  assert.match(s, /if \(!aplicar\) throw new Deshacer/);
  // El ensayo pasa por la escritura antes de deshacer.
  assert.ok(s.indexOf("await escribir(tx, plan.cambios") < s.indexOf("if (!aplicar) throw new Deshacer"));
});
