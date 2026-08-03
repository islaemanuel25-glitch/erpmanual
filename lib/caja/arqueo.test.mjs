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

// ══════════════════════════════════════════════════════════════════════════
// arqueoCajaActivo gobierna TODO el sistema de arqueos parciales, no solo la
// alerta. Antes el flag apagaba el aviso pero el botón seguía disponible y la
// API aceptaba registrar parciales: por eso aparecieron tres arqueos de prueba
// en un local que nunca activó la función.
// ══════════════════════════════════════════════════════════════════════════

// ── 1-3. Visibilidad según la configuración ─────────────────────────────────

test("C1. configuración NULL → función inactiva", () => {
  // Una fila de ConfiguracionLocal sin el campo (o sin fila) llega como null.
  const c = normalizarConfig({ arqueoCajaActivo: null });
  assert.equal(c.arqueoCajaActivo, false);
  const e = estadoArqueo({ ahora: T("2026-08-03T11:00:00Z"), turno: turnoAbierto(), config: c });
  assert.equal(e.activo, false);
  assert.equal(e.vencido, false);
});

test("C2. configuración false → función inactiva", () => {
  const e = estadoArqueo({
    ahora: T("2026-08-03T11:00:00Z"),
    turno: turnoAbierto(),
    config: { arqueoCajaActivo: false, intervaloArqueoMinutos: 5 },
  });
  assert.equal(e.activo, false);
  assert.equal(e.vencido, false);
});

test("C3. configuración true → función activa", () => {
  const e = estadoArqueo({ ahora: T("2026-08-02T12:00:00Z"), turno: turnoAbierto(), config: ACTIVO });
  assert.equal(e.activo, true);
  assert.equal(e.cajaAbierta, true);
});

// ── 4-5, 9. Barreras de backend ─────────────────────────────────────────────

test("C4. registrar PARCIAL valida la config en el SERVIDOR y responde 409", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/registrar/route.js");
  assert.ok(/configArqueoDeLocal\(localId\)/.test(src), "no relee la config del servidor");
  assert.ok(/!config\.arqueoCajaActivo/.test(src), "no corta cuando está desactivada");
  assert.ok(/status:\s*409/.test(src), "no responde 409");
  assert.ok(/funcionInactiva:\s*true/.test(src), "no marca el motivo");
});

test("C5. postergar aplica la MISMA validación", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/postergar/route.js");
  assert.ok(/configArqueoDeLocal\(localId\)/.test(src));
  assert.ok(/!config\.arqueoCajaActivo/.test(src), "no corta cuando está desactivada");
  assert.ok(/status:\s*409/.test(src));
});

test("C9. la barrera está ANTES de escribir: no depende del frontend", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/registrar/route.js");
  const corte = src.indexOf("!config.arqueoCajaActivo");
  const escritura = src.indexOf("$transaction");
  assert.ok(corte > -1 && escritura > -1, "faltan las piezas");
  assert.ok(corte < escritura, "la validación tiene que estar antes de la transacción");
  // Y no se acepta ninguna señal del cliente para saltearla.
  assert.ok(!/body\.(arqueoCajaActivo|activo|forzar|omitirConfig)/.test(src));
});

// ── 6, 10. El arqueo FINAL no depende del flag ──────────────────────────────

test("C6. el cierre crea el FINAL sin consultar arqueoCajaActivo", () => {
  const src = sinComentarios("app/api/pos-ventas/turnos/cerrar/route.js");
  assert.ok(/tipo: "FINAL"/.test(src), "el cierre ya no crea el arqueo final");
  assert.ok(
    !/arqueoCajaActivo/.test(src),
    "el cierre quedó condicionado a la configuración: el registro contable no debe depender del flag"
  );
  assert.ok(!/configArqueoDeLocal/.test(src), "el cierre lee la config de arqueos");
});

test("C10. no hay regresión del cierre: sigue en transacción y es idempotente", () => {
  const src = sinComentarios("app/api/pos-ventas/turnos/cerrar/route.js");
  assert.ok(/\$transaction\(/.test(src));
  assert.ok(/idempotencyKey: `cierre-\$\{turnoId\}`/.test(src));
  assert.ok(/efectivoContado: Number\(montoRealEfectivo\)/.test(src));
  assert.ok(/calcularEfectivoEsperado\(/.test(src));
});

test("C10b. la ruta pública NO puede fabricar un arqueo FINAL", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/registrar/route.js");
  // El tipo es una constante, no viene del body.
  assert.ok(/tipo: TIPO_PARCIAL/.test(src), "el tipo no está fijado a PARCIAL");
  assert.ok(!/body\.tipo|const \{[^}]*\btipo\b[^}]*\} = body/.test(src), "el tipo se lee del cliente");
  assert.ok(!/"FINAL"/.test(src), "la ruta pública menciona FINAL");
});

// ── 7-8. Activar / desactivar durante un turno abierto ──────────────────────

test("C7. activar durante un turno abierto: la función pasa a activa sin reabrir caja", () => {
  const turno = turnoAbierto();
  const apagado = estadoArqueo({ ahora: T("2026-08-02T13:30:00Z"), turno, config: { arqueoCajaActivo: false, intervaloArqueoMinutos: 120 } });
  assert.equal(apagado.activo, false);

  // Mismo turno, misma hora: solo cambió la configuración del local.
  const encendido = estadoArqueo({ ahora: T("2026-08-02T13:30:00Z"), turno, config: ACTIVO });
  assert.equal(encendido.activo, true);
  assert.equal(encendido.vencido, true, "el intervalo se cuenta desde la apertura ya existente");
});

test("C8. desactivar durante un turno abierto: se apaga sin tocar el turno", () => {
  const turno = turnoAbierto();
  const encendido = estadoArqueo({ ahora: T("2026-08-02T13:30:00Z"), turno, config: ACTIVO });
  assert.equal(encendido.vencido, true);

  const apagado = estadoArqueo({ ahora: T("2026-08-02T13:30:00Z"), turno, config: { ...ACTIVO, arqueoCajaActivo: false } });
  assert.equal(apagado.activo, false);
  assert.equal(apagado.vencido, false);
  assert.equal(apagado.cajaAbierta, true, "el turno sigue abierto: solo se apagó el arqueo");
});

// ── Frontend: sin parpadeo y sin polling de más ─────────────────────────────

test("C11. el POS solo dibuja con `visible`, que exige respuesta del backend", () => {
  const hook = sinComentarios("hooks/useArqueoEstado.js");
  assert.ok(/const visible = resuelto && estado\.activo === true/.test(hook),
    "`visible` no exige backend resuelto + función activa");

  const pos = sinComentarios("app/modulos/pos-ventas/page.jsx");
  // Las tres superficies del POS: botón, franja y modal.
  const usos = pos.match(/arqueo\.visible/g) || [];
  assert.ok(usos.length >= 3, `esperaba botón, franja y modal gateados; hay ${usos.length}`);
  assert.ok(/turnoActual && arqueo\.visible && \(\s*<AvisoArqueo/.test(pos), "la franja no está gateada");
  // El modal pasó a ser el de RETIRO: el arqueo puro dejó de montarse en el POS.
  // El invariante que protege esta prueba no cambió —la superficie sigue gateada
  // por `arqueo.visible`, para que no parpadee mientras el backend responde—,
  // solo cambió qué componente ocupa ese lugar.
  assert.ok(/mostrarRetiro && turnoActual && arqueo\.visible && \(\s*<ModalRetiroDinero/.test(pos), "el modal no está gateado");
});

test("C11b. el POS ya NO monta el modal de arqueo puro", () => {
  // Dejar los dos caminos accesibles a la vez es justamente lo que permitía
  // contar por un lado y descontar por otro. El endpoint sigue existiendo por
  // compatibilidad técnica, pero el POS no lo ofrece.
  const pos = sinComentarios("app/modulos/pos-ventas/page.jsx");
  assert.ok(!/<ModalArqueoCaja/.test(pos), "el POS todavía monta ModalArqueoCaja");
  assert.ok(!/ModalArqueoCaja/.test(pos), "el POS todavía importa ModalArqueoCaja");
  assert.ok(/Retirar recaudación/.test(pos), "falta el botón de retirar recaudación");
});

test("C12. con la función apagada no se instala el intervalo de polling", () => {
  const hook = sinComentarios("hooks/useArqueoEstado.js");
  assert.ok(/estado\.activo\s*\?\s*setInterval/.test(hook), "el intervalo no está condicionado");
  // Pero los listeners siguen, para que activar la config se note sin recargar.
  assert.ok(/addEventListener\("visibilitychange"/.test(hook));
  assert.ok(/addEventListener\("focus"/.test(hook));
});

test("C13. el endpoint de estado informa explícitamente que está desactivada", () => {
  const src = sinComentarios("app/api/pos-ventas/arqueos/estado/route.js");
  assert.ok(/!config\.arqueoCajaActivo/.test(src), "no corta temprano");
  assert.ok(/motivo:\s*"funcion-desactivada"/.test(src), "no informa el motivo");
  assert.ok(/activo:\s*false/.test(src));
  // Y sigue sin filtrar el esperado: el conteo es ciego.
  assert.ok(!/efectivoEsperado/.test(src));
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
