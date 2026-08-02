// Política de arqueos: vencimiento de la alerta, postergaciones y métricas del
// historial.
//
// Todo con reloj inyectado: el vencimiento se prueba sin esperar dos horas.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  estadoArqueo,
  proximaAlerta,
  baseDelIntervalo,
  normalizarConfig,
  vencimientoPostergacion,
  resumenHistorial,
  CONFIG_ARQUEO_DEFAULT,
  TIPO_PARCIAL,
  TIPO_FINAL,
} from "./arqueo.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const T = (iso) => new Date(iso);
const ACTIVO = { arqueoCajaActivo: true, intervaloArqueoMinutos: 120 };
const turnoAbierto = (apertura = "2026-08-02T11:00:00.000Z") => ({ apertura: T(apertura), cierre: null });

// ── 1. Apertura sin arqueos ─────────────────────────────────────────────────

test("1. apertura sin arqueos: la base del intervalo es la apertura", () => {
  const base = baseDelIntervalo({ apertura: T("2026-08-02T11:00:00Z"), ultimoArqueoEn: null });
  assert.equal(base.toISOString(), "2026-08-02T11:00:00.000Z");
});

test("1b. sin arqueos y dentro del intervalo: no vencido, con minutos restantes", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T12:00:00Z"),
    turno: turnoAbierto(),
    config: ACTIVO,
  });
  assert.equal(e.cajaAbierta, true);
  assert.equal(e.vencido, false);
  assert.equal(e.minutosRestantes, 60);
  assert.equal(e.minutosDemora, 0);
  assert.equal(e.puedePostergar, false);
});

// ── 2. Próxima alerta desde la apertura ─────────────────────────────────────

test("2. apertura 08:00 + 120 min → alerta 10:00", () => {
  const a = proximaAlerta({ apertura: T("2026-08-02T11:00:00Z"), intervaloMinutos: 120 });
  assert.equal(a.toISOString(), "2026-08-02T13:00:00.000Z");
});

// ── 3. Próxima alerta desde el último arqueo ────────────────────────────────

test("3. arqueo a las 10:13 → próxima alerta 12:13, no 12:00", () => {
  // El ejemplo exacto del pedido: la alerta NO se ancla a horarios fijos.
  const a = proximaAlerta({
    apertura: T("2026-08-02T11:00:00Z"),      // 08:00 ART
    ultimoArqueoEn: T("2026-08-02T13:13:00Z"), // 10:13 ART
    intervaloMinutos: 120,
  });
  assert.equal(a.toISOString(), "2026-08-02T15:13:00.000Z"); // 12:13 ART
});

test("3b. el último arqueo desplaza la base aunque sea muy posterior", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T15:00:00Z"),
    turno: turnoAbierto(),
    ultimoArqueoEn: T("2026-08-02T14:50:00Z"),
    config: ACTIVO,
  });
  assert.equal(e.vencido, false, "recién se arqueó: no puede estar vencido");
  assert.equal(e.minutosRestantes, 110);
});

// ── 4. Función desactivada ──────────────────────────────────────────────────

test("4. desactivada: sin alerta ni vencimiento, aunque haya pasado el intervalo", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-03T11:00:00Z"), // un día después
    turno: turnoAbierto(),
    config: { arqueoCajaActivo: false, intervaloArqueoMinutos: 120 },
  });
  assert.equal(e.activo, false);
  assert.equal(e.vencido, false);
  assert.equal(e.proximaAlerta, null);
  assert.equal(e.cajaAbierta, true, "la caja sigue abierta: el arqueo manual se puede hacer igual");
});

test("4b. el default de fábrica está DESACTIVADO", () => {
  assert.equal(CONFIG_ARQUEO_DEFAULT.arqueoCajaActivo, false);
  assert.equal(normalizarConfig({}).arqueoCajaActivo, false);
});

// ── 5. Caja cerrada ─────────────────────────────────────────────────────────

test("5. caja cerrada: nunca alerta", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-03T11:00:00Z"),
    turno: { apertura: T("2026-08-02T11:00:00Z"), cierre: T("2026-08-02T19:00:00Z") },
    config: ACTIVO,
  });
  assert.equal(e.cajaAbierta, false);
  assert.equal(e.vencido, false);
  assert.equal(e.proximaAlerta, null);
});

test("5b. sin turno tampoco alerta", () => {
  const e = estadoArqueo({ ahora: T("2026-08-02T11:00:00Z"), turno: null, config: ACTIVO });
  assert.equal(e.cajaAbierta, false);
  assert.equal(e.vencido, false);
});

// ── Vencimiento y demora ────────────────────────────────────────────────────

test("V1. pasado el intervalo queda vencido y cuenta la demora", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T13:25:00Z"), // 25 min después de la alerta
    turno: turnoAbierto(),
    config: ACTIVO,
  });
  assert.equal(e.vencido, true);
  assert.equal(e.minutosDemora, 25);
  assert.equal(e.minutosRestantes, 0);
  assert.equal(e.puedePostergar, true);
});

test("V2. justo en el instante del vencimiento ya cuenta como vencido", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T13:00:00Z"),
    turno: turnoAbierto(),
    config: ACTIVO,
  });
  assert.equal(e.vencido, true);
  assert.equal(e.minutosDemora, 0);
});

// ── 19-20. Postergaciones ───────────────────────────────────────────────────

test("19. una postergación vigente corre la alerta hacia adelante", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T13:05:00Z"),
    turno: turnoAbierto(),
    postergadoHasta: T("2026-08-02T13:15:00Z"),
    cantidadPostergaciones: 1,
    config: ACTIVO,
  });
  assert.equal(e.vencido, false, "durante la postergación no está vencido");
  assert.equal(e.minutosRestantes, 10);
  assert.equal(e.cantidadPostergaciones, 1);
});

test("19b. vencida la postergación, la alerta vuelve", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T13:20:00Z"),
    turno: turnoAbierto(),
    postergadoHasta: T("2026-08-02T13:15:00Z"),
    cantidadPostergaciones: 1,
    config: ACTIVO,
  });
  assert.equal(e.vencido, true);
  assert.equal(e.minutosDemora, 5, "la demora se cuenta desde la alerta efectiva");
});

test("19c. postergar NO puede adelantar un vencimiento futuro", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T12:00:00Z"),
    turno: turnoAbierto(),
    postergadoHasta: T("2026-08-02T12:10:00Z"), // anterior a la alerta programada
    config: ACTIVO,
  });
  assert.equal(e.proximaAlerta.toISOString(), "2026-08-02T13:00:00.000Z");
});

test("19d. la postergación se cuenta desde AHORA, no desde el vencimiento original", () => {
  // Si se contara desde el vencimiento, postergar 10 min una alerta vencida
  // hace 30 no correría nada.
  const v = vencimientoPostergacion({
    ahora: T("2026-08-02T13:30:00Z"),
    config: { postergacionCajeroMinutos: 10 },
  });
  assert.equal(v.toISOString(), "2026-08-02T13:40:00.000Z");
});

test("20. dentro de la tolerancia NO exige autorización", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T13:10:00Z"), // 10 min de demora
    turno: turnoAbierto(),
    config: { ...ACTIVO, toleranciaPostergacionMinutos: 15, requiereAutorizacionPostergacion: true },
  });
  assert.equal(e.minutosDemora, 10);
  assert.equal(e.requiereAutorizacion, false);
});

test("20b. superada la tolerancia SÍ exige autorización", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T13:20:00Z"), // 20 min > 15
    turno: turnoAbierto(),
    config: { ...ACTIVO, toleranciaPostergacionMinutos: 15, requiereAutorizacionPostergacion: true },
  });
  assert.equal(e.minutosDemora, 20);
  assert.equal(e.requiereAutorizacion, true);
});

test("20c. si el local no exige autorización, nunca la pide", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-02T16:00:00Z"), // 3 horas de demora
    turno: turnoAbierto(),
    config: { ...ACTIVO, toleranciaPostergacionMinutos: 15, requiereAutorizacionPostergacion: false },
  });
  assert.equal(e.vencido, true);
  assert.equal(e.requiereAutorizacion, false);
});

// ── 23. Regla horaria: el turno manda, no el calendario ─────────────────────

test("23. un turno que cruza la medianoche sigue contando desde su apertura", () => {
  // Apertura 22:00 ART del 02/08 = 01:00Z del 03/08. Un arqueo a las 00:30 ART
  // del 03/08 pertenece al MISMO turno: no hay corte de día contable.
  const e = estadoArqueo({
    ahora: T("2026-08-03T03:30:00Z"), // 00:30 ART del 03/08
    turno: { apertura: T("2026-08-03T01:00:00Z"), cierre: null }, // 22:00 ART del 02/08
    config: ACTIVO,
  });
  assert.equal(e.vencido, true, "pasaron 150 min desde la apertura");
  assert.equal(e.minutosDemora, 30);
});

test("23b. el último arqueo de la madrugada ancla la próxima alerta del mismo turno", () => {
  const a = proximaAlerta({
    apertura: T("2026-08-03T01:00:00Z"),
    ultimoArqueoEn: T("2026-08-03T05:00:00Z"), // 02:00 ART
    intervaloMinutos: 120,
  });
  assert.equal(a.toISOString(), "2026-08-03T07:00:00.000Z"); // 04:00 ART, mismo turno
});

test("23c. no hay ninguna referencia a hora de corte de día en la política", () => {
  const src = sinComentarios("lib/caja/arqueo.js");
  assert.ok(!/03:59|getHours|toDateString|toLocaleDate/.test(src),
    "la política no puede depender del calendario");
});

// ── Normalización defensiva ─────────────────────────────────────────────────

test("N1. valores inservibles caen al default en vez de romper", () => {
  const c = normalizarConfig({
    arqueoCajaActivo: true,
    intervaloArqueoMinutos: 0,
    toleranciaPostergacionMinutos: -5,
    postergacionCajeroMinutos: "x",
  });
  assert.equal(c.intervaloArqueoMinutos, 120);
  assert.equal(c.toleranciaPostergacionMinutos, 15);
  assert.equal(c.postergacionCajeroMinutos, 10);
});

test("N2. requiereAutorizacionPostergacion sólo es false si se pide explícitamente", () => {
  assert.equal(normalizarConfig({}).requiereAutorizacionPostergacion, true);
  assert.equal(normalizarConfig({ requiereAutorizacionPostergacion: false }).requiereAutorizacionPostergacion, false);
});

// ── 17. Varios arqueos en un turno / métricas del historial ─────────────────

test("17. el historial NO acumula diferencias: el mismo faltante no se cuenta dos veces", () => {
  // El ejemplo del pedido: cuatro cortes y un final.
  const arqueos = [
    { tipo: TIPO_PARCIAL, diferencia: 0 },
    { tipo: TIPO_PARCIAL, diferencia: -1000 },
    { tipo: TIPO_PARCIAL, diferencia: 0 },
    { tipo: TIPO_PARCIAL, diferencia: 500 },
    { tipo: TIPO_FINAL, diferencia: -500 },
  ];
  const r = resumenHistorial(arqueos);
  assert.equal(r.cantidad, 5);
  assert.equal(r.cantidadParciales, 4);
  assert.equal(r.tieneFinal, true);
  assert.equal(r.diferenciaFinal, -500);
  assert.equal(r.maximaDiferencia, -1000, "la mayor detectada, con su signo");
  assert.equal(r.cantidadConDiferencia, 3);
  // Lo que NO existe: una suma de todas las diferencias.
  assert.equal(r.diferenciaAcumulada, undefined);
  assert.equal(r.totalDiferencias, undefined);
});

test("17b. turno sin arqueos", () => {
  const r = resumenHistorial([]);
  assert.equal(r.cantidad, 0);
  assert.equal(r.tieneFinal, false);
  assert.equal(r.diferenciaFinal, null);
  assert.equal(r.cantidadConDiferencia, 0);
});

test("17c. ocho arqueos parciales sin final", () => {
  const arqueos = Array.from({ length: 8 }, (_, i) => ({ tipo: TIPO_PARCIAL, diferencia: i === 3 ? -250 : 0 }));
  const r = resumenHistorial(arqueos);
  assert.equal(r.cantidad, 8);
  assert.equal(r.tieneFinal, false);
  assert.equal(r.cantidadConDiferencia, 1);
  assert.equal(r.maximaDiferencia, -250);
});

test("17d. un centavo cuenta como diferencia", () => {
  const r = resumenHistorial([{ tipo: TIPO_PARCIAL, diferencia: 0.01 }]);
  assert.equal(r.cantidadConDiferencia, 1);
});

// ── Invariantes estructurales del backend ───────────────────────────────────

test("S1. el registro recalcula el esperado en el backend, no confía en el cliente", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/registrar/route.js");
  assert.ok(/calcularEsperadoDeTurno\(/.test(src), "no recalcula el esperado");
  assert.ok(
    !/body\.(efectivoEsperado|esperado|diferencia)/.test(src),
    "toma el esperado o la diferencia del body"
  );
  assert.ok(/\$transaction\(/.test(src), "no usa transacción");
});

test("S2. el estado NO expone el efectivo esperado (conteo ciego)", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/estado/route.js");
  assert.ok(!/efectivoEsperado/.test(src), "el endpoint de estado filtra el esperado");
  assert.ok(!/calcularEsperadoDeTurno/.test(src), "el estado no debe calcular el esperado");
});

test("S3. todas las rutas de arqueo validan sesión, permiso y local", () => {
  const compartido = sinComentarios("lib/caja/arqueoServer.js");
  assert.ok(/getUsuarioSession/.test(compartido));
  assert.ok(/checkPerm\(session,\s*"pos\.usar"\)/.test(compartido));
  assert.ok(/resolveScope/.test(compartido));
  // El aislamiento va en el WHERE, no en un if posterior.
  assert.ok(/where:\s*\{\s*id,\s*localId\s*\}/.test(compartido), "el turno no se acota por local en el WHERE");

  for (const rel of [
    "app/api/pos-ventas/arqueos/estado/route.js",
    "app/api/pos-ventas/arqueos/registrar/route.js",
    "app/api/pos-ventas/arqueos/postergar/route.js",
    "app/api/pos-ventas/arqueos/listar/route.js",
  ]) {
    assert.ok(/contextoArqueo\(/.test(sinComentarios(rel)), `${rel} no usa el contexto validado`);
  }
});

test("S4. registrar y postergar exigen la caja abierta", () => {
  for (const rel of [
    "app/api/pos-ventas/arqueos/registrar/route.js",
    "app/api/pos-ventas/arqueos/postergar/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(/exigirAbierto:\s*true/.test(src), `${rel} permite operar sobre turno cerrado`);
  }
});

test("S5. el cierre valida el local además del vendedor", () => {
  const src = sinComentarios("app/api/pos-ventas/turnos/cerrar/route.js");
  assert.ok(/resolveScope\(/.test(src), "el cierre no resuelve el alcance");
  assert.ok(/scope\.localId !== turno\.localId/.test(src), "el cierre no compara el local");
  assert.ok(/turno\.vendedorId !== session\.id/.test(src), "se perdió la validación de vendedor");
});

test("S6. el cierre crea el arqueo FINAL con el MISMO conteo, en transacción", () => {
  const src = sinComentarios("app/api/pos-ventas/turnos/cerrar/route.js");
  assert.ok(/\$transaction\(/.test(src));
  assert.ok(/tipo: "FINAL"/.test(src));
  assert.ok(/efectivoContado: Number\(montoRealEfectivo\)/.test(src), "el final no reutiliza el conteo del cierre");
  assert.ok(/idempotencyKey: `cierre-\$\{turnoId\}`/.test(src), "el final no es idempotente");
});

test("S7. ningún endpoint de arqueo escribe ventas, stock ni movimientos", () => {
  for (const rel of [
    "app/api/pos-ventas/arqueos/estado/route.js",
    "app/api/pos-ventas/arqueos/registrar/route.js",
    "app/api/pos-ventas/arqueos/postergar/route.js",
    "app/api/pos-ventas/arqueos/listar/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(!/prisma\.venta\.(create|update|delete)/.test(src), `${rel} escribe ventas`);
    assert.ok(!/cajaMovimiento\.(create|update|delete)/.test(src), `${rel} crea movimientos`);
    assert.ok(!/stockLocal|StockLocal/.test(src), `${rel} toca stock`);
    assert.ok(!/turno\.update|turno\.updateMany/.test(src), `${rel} modifica el turno`);
  }
});
