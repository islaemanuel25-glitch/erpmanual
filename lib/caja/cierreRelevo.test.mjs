// Pruebas de la lógica PURA del cierre con relevo de operador.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cierreRelevo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  ESTADO_TURNO,
  ESTADO_CIERRE,
  ESTADO_CAMBIO,
  estadoDelTurno,
  turnoOperativo,
  WHERE_TURNO_OPERATIVO,
  claveIdempotenciaCierre,
  generarToken,
  tokenValido,
  vencimientoCierre,
  vencimientoReserva,
  cierreAtrasado,
  cierreConfirmable,
  reservaVencida,
  calcularCierreDesdeConteo,
  evaluarRecepcionCambio,
  evaluarAperturaSinCambio,
  RECEPCION,
  HORAS_VENCIMIENTO_CIERRE,
  MINUTOS_RESERVA_CAMBIO,
} from "@/lib/caja/cierreRelevo";

import {
  validarDesgloseServidor,
  validarCambioContraConteo,
  MAX_CANTIDAD_POR_FILA,
} from "@/lib/caja/desgloseServidor";

const T = (s) => new Date(s);

// ── LOS TRES ESTADOS DEL TURNO ─────────────────────────────────────────────
//
// Hasta esta etapa "cierre = null" alcanzaba para decir "la caja está viva". Ya
// no: un turno con el corte tomado sigue con `cierre` en null y NO opera.

test("1. un turno sin cierre ni corte está ABIERTO y opera", () => {
  const t = { cierre: null, cierreEnPreparacionEn: null, anuladoEn: null };
  assert.equal(estadoDelTurno(t), ESTADO_TURNO.ABIERTO);
  assert.equal(turnoOperativo(t), true);
});

test("2. un turno con corte tomado NO opera, aunque `cierre` siga en null", () => {
  const t = { cierre: null, cierreEnPreparacionEn: T("2026-08-04T15:00:00Z"), anuladoEn: null };
  assert.equal(estadoDelTurno(t), ESTADO_TURNO.CIERRE_EN_PREPARACION);
  assert.equal(turnoOperativo(t), false);
});

test("3. cerrado y anulado se distinguen: el anulado también tiene `cierre`", () => {
  assert.equal(
    estadoDelTurno({ cierre: T("2026-08-04T20:00:00Z"), anuladoEn: null }),
    ESTADO_TURNO.CERRADO
  );
  // El anulado se cerró para liberar el local, así que mirar `cierre` primero lo
  // clasificaría mal. Por eso `anuladoEn` se evalúa antes.
  assert.equal(
    estadoDelTurno({ cierre: T("2026-08-04T20:00:00Z"), anuladoEn: T("2026-08-04T20:00:00Z") }),
    ESTADO_TURNO.ANULADO
  );
});

test("4. la condición Prisma exige los DOS campos en null", () => {
  assert.deepEqual(WHERE_TURNO_OPERATIVO, { cierre: null, cierreEnPreparacionEn: null });
});

// ── VALIDACIÓN DE DENOMINACIONES EN EL SERVIDOR ────────────────────────────

test("5. el total lo calcula el servidor, no el cliente", () => {
  const r = validarDesgloseServidor({ 20000: 7, 10000: 1, monedas: 450 });
  assert.equal(r.valido, true);
  assert.equal(r.total, 150450);
});

test("6. una denominación que no existe se RECHAZA, no se ignora", () => {
  // Ignorarla convertiría un error de contrato en plata que desaparece del
  // conteo sin que nadie se entere.
  const r = validarDesgloseServidor({ 5000: 2 });
  assert.equal(r.valido, false);
  assert.match(r.error, /no existe/);
});

test("7. cantidades negativas, no enteras y no numéricas se rechazan", () => {
  assert.equal(validarDesgloseServidor({ 1000: -1 }).valido, false);
  assert.equal(validarDesgloseServidor({ 1000: 2.5 }).valido, false);
  assert.equal(validarDesgloseServidor({ 1000: "muchos" }).valido, false);
  assert.equal(validarDesgloseServidor({ 1000: Infinity }).valido, false);
});

test("8. las monedas SÍ admiten decimales: son un importe, no una cantidad", () => {
  const r = validarDesgloseServidor({ monedas: 350.5 });
  assert.equal(r.valido, true);
  assert.equal(r.total, 350.5);
  assert.equal(validarDesgloseServidor({ monedas: -1 }).valido, false);
});

test("9. un número absurdo se corta antes de reventar el DECIMAL(12,2)", () => {
  const r = validarDesgloseServidor({ 20000: MAX_CANTIDAD_POR_FILA + 1 });
  assert.equal(r.valido, false);
  assert.match(r.error, /demasiado grande/);
});

test("10. un array o un string no son un desglose", () => {
  assert.equal(validarDesgloseServidor([1, 2, 3]).valido, false);
  assert.equal(validarDesgloseServidor("30000").valido, false);
});

test("11. vacío es válido cuando se permite, y obligatorio cuando no", () => {
  assert.equal(validarDesgloseServidor(null).valido, true);
  assert.equal(validarDesgloseServidor({}).total, 0);
  assert.equal(validarDesgloseServidor({}, { permitirVacio: false }).valido, false);
  assert.equal(validarDesgloseServidor(null, { permitirVacio: false }).valido, false);
});

// ── EL CAMBIO NO PUEDE SUPERAR LO CONTADO ──────────────────────────────────

test("12. dejar 5 billetes de $10.000 habiendo contado 3 es imposible", () => {
  // Nótese que $50.000 de cambio contra $80.000 contados pasaría un chequeo por
  // TOTAL. El tope tiene que ser por denominación.
  const r = validarCambioContraConteo({
    desgloseContado: { 10000: 3, 20000: 1, 2000: 15 },
    desgloseCambio: { 10000: 5 },
  });
  assert.equal(r.valido, false);
  assert.match(r.error, /\$10\.000/);
});

test("13. las monedas también tienen tope, comparadas como importe", () => {
  const r = validarCambioContraConteo({
    desgloseContado: { monedas: 450 },
    desgloseCambio: { monedas: 900 },
  });
  assert.equal(r.valido, false);
});

test("14. dejar exactamente lo contado es válido: retiro cero", () => {
  const r = validarCambioContraConteo({
    desgloseContado: { 1000: 4 },
    desgloseCambio: { 1000: 4 },
  });
  assert.equal(r.valido, true);
});

// ── ARITMÉTICA DEL CIERRE ──────────────────────────────────────────────────

test("15. retiro final = contado − cambio, y la diferencia usa el esperado CONGELADO", () => {
  const r = calcularCierreDesdeConteo({
    totalContado: 150450,
    totalCambio: 30450,
    efectivoEsperadoCorte: 148000,
  });
  assert.equal(r.valido, true);
  assert.equal(r.retiroFinal, 120000);
  assert.equal(r.diferencia, 2450); // sobrante
});

test("16. un faltante da diferencia negativa", () => {
  const r = calcularCierreDesdeConteo({
    totalContado: 100000,
    totalCambio: 30000,
    efectivoEsperadoCorte: 105000,
  });
  assert.equal(r.diferencia, -5000);
  assert.equal(r.retiroFinal, 70000);
});

test("17. no puede quedar más cambio que lo contado", () => {
  const r = calcularCierreDesdeConteo({
    totalContado: 10000,
    totalCambio: 30000,
    efectivoEsperadoCorte: 10000,
  });
  assert.equal(r.valido, false);
});

test("18. los centavos no se pierden: la aritmética va en enteros", () => {
  const r = calcularCierreDesdeConteo({
    totalContado: 100.1,
    totalCambio: 0.2,
    efectivoEsperadoCorte: 100.3,
  });
  assert.equal(r.retiroFinal, 99.9);
  assert.equal(r.diferencia, -0.2);
});

// ── IDENTIDAD Y TOKEN ──────────────────────────────────────────────────────

test("19. la clave de idempotencia es la MISMA del cierre clásico", () => {
  // Los dos caminos compiten por la @@unique(turnoId, idempotencyKey) de
  // ArqueoCaja, así que un turno no puede terminar con dos arqueos FINALES.
  assert.equal(claveIdempotenciaCierre(188), "cierre-188");
});

test("20. el token es aleatorio, largo y seguro para una URL", () => {
  const a = generarToken(randomBytes);
  const b = generarToken(randomBytes);
  assert.notEqual(a, b);
  assert.ok(a.length >= 40, `token corto: ${a.length}`);
  assert.match(a, /^[A-Za-z0-9_-]+$/, "el token tiene que viajar en la URL sin escapar");
  assert.equal(tokenValido(a), true);
});

test("21. un token con forma inválida ni se busca en la base", () => {
  assert.equal(tokenValido(""), false);
  assert.equal(tokenValido("corto"), false);
  assert.equal(tokenValido("' OR 1=1 --"), false);
  assert.equal(tokenValido(null), false);
});

// ── VENCIMIENTOS: LA ASIMETRÍA ES DELIBERADA ───────────────────────────────

test("22. un cierre vencido sigue siendo confirmable", () => {
  // VENCIDO no libera nada: el corte sigue congelado y el turno sigue sin
  // operar. Si no fuera confirmable, el turno quedaría trabado para siempre.
  assert.equal(cierreConfirmable({ estado: ESTADO_CIERRE.PREPARANDO }), true);
  assert.equal(cierreConfirmable({ estado: ESTADO_CIERRE.VENCIDO }), true);
  assert.equal(cierreConfirmable({ estado: ESTADO_CIERRE.CANCELADO }), false);
  assert.equal(cierreConfirmable({ estado: ESTADO_CIERRE.CONFIRMADO }), false);
});

test("23. el atraso se informa; el estado confirmado ya no atrasa", () => {
  const venceEn = T("2026-08-04T12:00:00Z");
  assert.equal(
    cierreAtrasado({ estado: ESTADO_CIERRE.PREPARANDO, venceEn }, T("2026-08-04T13:00:00Z")),
    true
  );
  assert.equal(
    cierreAtrasado({ estado: ESTADO_CIERRE.PREPARANDO, venceEn }, T("2026-08-04T11:00:00Z")),
    false
  );
  assert.equal(
    cierreAtrasado({ estado: ESTADO_CIERRE.CONFIRMADO, venceEn }, T("2026-08-04T13:00:00Z")),
    false
  );
});

test("24. la reserva de un cambio SÍ vence de verdad", () => {
  // Y puede: el sobre sigue físicamente en el local, nadie lo abrió.
  const c = { estado: ESTADO_CAMBIO.RESERVADO, reservaVenceEn: T("2026-08-04T12:00:00Z") };
  assert.equal(reservaVencida(c, T("2026-08-04T12:30:00Z")), true);
  assert.equal(reservaVencida(c, T("2026-08-04T11:30:00Z")), false);
  // Un sobre ya recibido no "vence": es terminal.
  assert.equal(
    reservaVencida({ estado: ESTADO_CAMBIO.RECIBIDO, reservaVenceEn: T("2026-08-04T12:00:00Z") }, T("2026-08-05T00:00:00Z")),
    false
  );
});

test("25. los dos plazos son distintos y con la magnitud correcta", () => {
  const base = T("2026-08-04T10:00:00Z");
  assert.equal(HORAS_VENCIMIENTO_CIERRE, 12);
  assert.equal(vencimientoCierre(base).toISOString(), "2026-08-04T22:00:00.000Z");
  assert.ok(MINUTOS_RESERVA_CAMBIO <= 30, "la reserva tiene que ser corta");
  assert.equal(
    vencimientoReserva(base).getTime() - base.getTime(),
    MINUTOS_RESERVA_CAMBIO * 60 * 1000
  );
});

// ── RECEPCIÓN DEL CAMBIO ───────────────────────────────────────────────────

test("26. recepción coincidente: no pide motivo y el inicial es lo contado", () => {
  const r = evaluarRecepcionCambio({ totalEsperado: 30000, totalRecibido: 30000 });
  assert.equal(r.valido, true);
  assert.equal(r.clase, RECEPCION.COINCIDE);
  assert.equal(r.diferencia, 0);
  assert.equal(r.montoInicial, 30000);
});

test("27. faltante sin motivo se rechaza; con motivo entra y conserva el faltante", () => {
  const sin = evaluarRecepcionCambio({ totalEsperado: 30000, totalRecibido: 28000 });
  assert.equal(sin.valido, false);
  assert.equal(sin.clase, RECEPCION.FALTANTE);
  assert.match(sin.error, /Faltan/);

  const con = evaluarRecepcionCambio({
    totalEsperado: 30000,
    totalRecibido: 28000,
    motivo: "El sobre vino con dos billetes menos",
  });
  assert.equal(con.valido, true);
  assert.equal(con.diferencia, -2000);
  // EL MONTO INICIAL ES LO CONTADO, NO LO ESPERADO. Imponer lo esperado
  // escondería el faltante y lo haría reaparecer al cerrar, culpando al
  // cajero equivocado.
  assert.equal(con.montoInicial, 28000);
});

test("28. sobrante con motivo también entra, y el inicial vuelve a ser lo contado", () => {
  const r = evaluarRecepcionCambio({
    totalEsperado: 30000,
    totalRecibido: 31500,
    motivo: "Había $1.500 de más en el cajón",
  });
  assert.equal(r.valido, true);
  assert.equal(r.clase, RECEPCION.SOBRANTE);
  assert.equal(r.diferencia, 1500);
  assert.equal(r.montoInicial, 31500);
});

test("29. un motivo en blanco no cuenta como motivo", () => {
  const r = evaluarRecepcionCambio({ totalEsperado: 30000, totalRecibido: 29000, motivo: "   " });
  assert.equal(r.valido, false);
});

// ── APERTURA SIN CAMBIO ────────────────────────────────────────────────────

test("30. abrir sin cambio exige motivo y toma el total contado", () => {
  assert.equal(evaluarAperturaSinCambio({ totalContado: 20000 }).valido, false);
  const r = evaluarAperturaSinCambio({ totalContado: 20000, motivo: "Traje cambio propio" });
  assert.equal(r.valido, true);
  assert.equal(r.montoInicial, 20000);
  assert.equal(r.motivo, "Traje cambio propio");
});

// ── LOS CAMPOS VIEJOS DE FONDO NO SE TOCAN ─────────────────────────────────

test("31. ningún endpoint nuevo escribe la cadena de fondo desactivada", async () => {
  const { readFileSync } = await import("node:fs");
  const VIEJOS = [
    "fondoSugeridoApertura",
    "diferenciaFondoApertura",
    "fondoOrigenTurnoId",
    "fondoConsumidoEnTurnoId",
    "fondoRecibidoApertura",
  ];
  const NUEVOS = [
    "app/api/pos-ventas/cierres/iniciar/route.js",
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/cierres/[token]/cancelar/route.js",
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
    "app/api/pos-ventas/cambios-pendientes/reservar/route.js",
    "app/api/pos-ventas/cambios-pendientes/liberar/route.js",
  ];

  for (const archivo of NUEVOS) {
    const src = readFileSync(archivo, "utf8");
    // Se quitan comentarios: los archivos EXPLICAN por qué no escriben estos
    // campos, y esa explicación no debe hacer fallar la prueba.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const campo of VIEJOS) {
      assert.ok(
        !codigo.includes(campo),
        `${archivo} escribe ${campo}: la fuente de verdad del traspaso es CambioPendiente`
      );
    }
  }
});
