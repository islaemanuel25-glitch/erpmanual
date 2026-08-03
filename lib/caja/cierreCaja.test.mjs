// lib/caja/cierreCaja.test.mjs
//
// Reglas del cierre y la apertura de caja. Los casos 21 a 24 son turnos REALES de
// producción del 02/08/2026 en Casiano casas, que fueron los que originaron el
// rediseño.
//
//   node --test lib/caja/cierreCaja.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sugerirRepartoCierre,
  validarRepartoCierre,
  detectarFondoOmitido,
  evaluarRecepcionFondo,
  validarApertura,
  motivoRetiroCierre,
  claveRetiroCierre,
} from "./cierreCaja.js";
import { calcularEfectivoEsperado, calcularDiferencia, clasificarDiferencia } from "./efectivoEsperado.js";

// Venta con un solo tender, tal como la lee el cierre.
const vta = (medio, monto) => ({ pagos: [{ medio, monto }] });

// ---------------------------------------------------------------------------
// 1 · Fondo inicial incluido → caja cuadrada
// ---------------------------------------------------------------------------
test("1 · contando el fondo inicial la caja cuadra", () => {
  const c = calcularEfectivoEsperado({
    montoInicial: 10000,
    ventas: [vta("EFECTIVO", 5000), vta("EFECTIVO", 4400)],
  });
  assert.equal(c.efectivoEsperado, 19400);
  const dif = calcularDiferencia(19400, c.efectivoEsperado);
  assert.equal(dif, 0);
  assert.equal(clasificarDiferencia(dif), "CORRECTO");
  assert.equal(detectarFondoOmitido({ contado: 19400, montoInicial: 10000, ventasEfectivo: 9400 }).omitido, false);
});

// ---------------------------------------------------------------------------
// 2 · Fondo inicial omitido → se detecta
// ---------------------------------------------------------------------------
test("2 · contar solo lo vendido se detecta como fondo omitido", () => {
  const d = detectarFondoOmitido({
    contado: 9400, montoInicial: 10000, ventasEfectivo: 9400, efectivoEsperado: 19400,
  });
  assert.equal(d.omitido, true);
  assert.equal(d.fondoInicial, 10000);
  assert.equal(d.mensaje, "Parece que contaste solo lo vendido. Falta incluir el fondo inicial de $10000.");
});

// ---------------------------------------------------------------------------
// 3 · La advertencia aparece antes de cerrar, y solo cuando corresponde
// ---------------------------------------------------------------------------
test("3 · la advertencia NO se dispara si además contó mal", () => {
  // Se olvidó el fondo Y contó $50 de menos: la igualdad exacta no se cumple y el
  // mensaje sería falso, así que no se muestra.
  const d = detectarFondoOmitido({
    contado: 9350, montoInicial: 10000, ventasEfectivo: 9400, efectivoEsperado: 19400,
  });
  assert.equal(d.omitido, false);
  assert.equal(d.mensaje, null);
});

test("3b · sin fondo inicial nunca hay nada que olvidar", () => {
  assert.equal(detectarFondoOmitido({ contado: 5000, montoInicial: 0, ventasEfectivo: 5000 }).omitido, false);
});

test("3c · con ingresos y retiros la detección sigue siendo exacta", () => {
  // esperado = 10000 + 50000 + 3000 − 8000 = 55000 ; movimiento = 45000
  const d = detectarFondoOmitido({
    contado: 45000, montoInicial: 10000, ventasEfectivo: 50000, ingresos: 3000, retiros: 8000,
  });
  assert.equal(d.omitido, true);
  assert.equal(d.esperadoSiIncluye, 55000);
});

// ---------------------------------------------------------------------------
// 4 · Cierre correcto
// ---------------------------------------------------------------------------
test("4 · cierre correcto: sin diferencia y con reparto que cierra", () => {
  const r = validarRepartoCierre({ contado: 19400, retirado: 9400, fondoDejado: 10000 });
  assert.equal(r.valido, true);
  assert.equal(r.error, null);
  assert.equal(r.retirado + r.fondoDejado, 19400);
});

// ---------------------------------------------------------------------------
// 5 y 6 · Faltante y sobrante reales
// ---------------------------------------------------------------------------
test("5 · faltante real", () => {
  const c = calcularEfectivoEsperado({ montoInicial: 10000, ventas: [vta("EFECTIVO", 50000)] });
  const dif = calcularDiferencia(58000, c.efectivoEsperado);
  assert.equal(dif, -2000);
  assert.equal(clasificarDiferencia(dif), "FALTANTE");
  // No es el patrón del fondo omitido: es plata que falta de verdad.
  assert.equal(detectarFondoOmitido({ contado: 58000, montoInicial: 10000, ventasEfectivo: 50000 }).omitido, false);
});

test("6 · sobrante real", () => {
  const c = calcularEfectivoEsperado({ montoInicial: 10000, ventas: [vta("EFECTIVO", 50000)] });
  const dif = calcularDiferencia(62500, c.efectivoEsperado);
  assert.equal(dif, 2500);
  assert.equal(clasificarDiferencia(dif), "SOBRANTE");
});

// ---------------------------------------------------------------------------
// 7 · retirado + fondo = contado
// ---------------------------------------------------------------------------
test("7 · el reparto tiene que dar exactamente el contado", () => {
  assert.equal(validarRepartoCierre({ contado: 321500, retirado: 311500, fondoDejado: 10000 }).valido, true);
  // Con centavos, sin arrastre de floats.
  assert.equal(validarRepartoCierre({ contado: 100.1, retirado: 33.37, fondoDejado: 66.73 }).valido, true);

  const mal = validarRepartoCierre({ contado: 321500, retirado: 311500, fondoDejado: 9000 });
  assert.equal(mal.valido, false);
  assert.match(mal.error, /exactamente el efectivo contado/);
});

test("7b · sugerencia automática: deja el fondo de apertura y retira el resto", () => {
  assert.deepEqual(sugerirRepartoCierre({ contado: 321500, montoInicial: 10000 }), { fondoDejado: 10000, retirado: 311500 });
  // Si contó menos que el fondo, se deja todo lo que hay y no se retira nada.
  assert.deepEqual(sugerirRepartoCierre({ contado: 4000, montoInicial: 10000 }), { fondoDejado: 4000, retirado: 0 });
  assert.deepEqual(sugerirRepartoCierre({ contado: 0, montoInicial: 10000 }), { fondoDejado: 0, retirado: 0 });
});

// ---------------------------------------------------------------------------
// 8 y 9 · Retiro inválido y fondo negativo
// ---------------------------------------------------------------------------
test("8 · retiro inválido rechazado", () => {
  assert.equal(validarRepartoCierre({ contado: 1000, retirado: -100, fondoDejado: 1100 }).valido, false);
  assert.equal(validarRepartoCierre({ contado: 1000, retirado: "abc", fondoDejado: 0 }).valido, false);
  assert.equal(validarRepartoCierre({ contado: 1000, retirado: null, fondoDejado: 1000 }).valido, false);
  assert.equal(validarRepartoCierre({ contado: 1000, retirado: Infinity, fondoDejado: 0 }).valido, false);
  assert.equal(validarRepartoCierre({ contado: 1000, retirado: 2000, fondoDejado: 0 }).valido, false);
});

test("9 · fondo negativo rechazado", () => {
  const r = validarRepartoCierre({ contado: 1000, retirado: 1200, fondoDejado: -200 });
  assert.equal(r.valido, false);
  assert.match(r.error, /no puede ser negativo/);
});

// ---------------------------------------------------------------------------
// 13, 14, 15 · Fondo entre turnos
// ---------------------------------------------------------------------------
test("13 · el fondo sugerido en la apertura es lo que dejó el cierre anterior", () => {
  const ev = evaluarRecepcionFondo({ sugerido: 10000, recibido: 10000 });
  assert.equal(ev.coincide, true);
  assert.equal(ev.diferencia, 0);
  assert.equal(ev.montoInicial, 10000);
  assert.equal(ev.requiereObservacion, false);
});

test("14 · fondo recibido distinto: exige observación y manda lo recibido", () => {
  const ev = evaluarRecepcionFondo({ sugerido: 10000, recibido: 9500 });
  assert.equal(ev.coincide, false);
  assert.equal(ev.diferencia, -500);
  assert.equal(ev.montoInicial, 9500, "el turno arranca con lo REAL, no con lo sugerido");
  assert.match(ev.mensaje, /500 menos/);

  assert.equal(validarApertura({ sugerido: 10000, recibido: 9500 }).valido, false);
  const ok = validarApertura({ sugerido: 10000, recibido: 9500, observacion: "faltaban 500 en el sobre" });
  assert.equal(ok.valido, true);
  assert.equal(ok.montoInicial, 9500);
  assert.equal(ok.diferencia, -500);
});

test("14b · recibir de más también exige explicación", () => {
  const ev = evaluarRecepcionFondo({ sugerido: 10000, recibido: 12000 });
  assert.equal(ev.diferencia, 2000);
  assert.match(ev.mensaje, /2000 más/);
  assert.equal(validarApertura({ sugerido: 10000, recibido: 12000 }).valido, false);
});

test("14c · apertura sin fondo previo (primer turno del local)", () => {
  const v = validarApertura({ sugerido: 0, recibido: 0 });
  assert.equal(v.valido, true);
  assert.equal(v.montoInicial, 0);
  // Arrancar con plata sin que el cierre anterior la haya dejado también se explica.
  assert.equal(validarApertura({ sugerido: 0, recibido: 5000 }).valido, false);
});

test("15 · apertura inválida: montos no numéricos o negativos", () => {
  assert.equal(validarApertura({ sugerido: 0, recibido: -1 }).valido, false);
  assert.equal(validarApertura({ sugerido: 0, recibido: "" }).valido, false);
  assert.equal(validarApertura({ sugerido: 0, recibido: null }).valido, false);
  assert.equal(validarApertura({ sugerido: 0, recibido: "x" }).valido, false);
});

// ---------------------------------------------------------------------------
// 18 y 19 · Medios de pago
// ---------------------------------------------------------------------------
test("18 · pago mixto: al cajón entra solo la parte en efectivo", () => {
  const mixta = { pagos: [{ medio: "EFECTIVO", monto: 3000 }, { medio: "MERCADOPAGO", monto: 7000 }] };
  const c = calcularEfectivoEsperado({ montoInicial: 10000, ventas: [mixta] });
  assert.equal(c.ventasEfectivo, 3000);
  assert.equal(c.ventasDigital, 7000);
  assert.equal(c.efectivoEsperado, 13000, "los 7000 de MP no están en el cajón");
});

test("19 · débito, crédito, MP y fiado quedan fuera del efectivo", () => {
  const c = calcularEfectivoEsperado({
    montoInicial: 10000,
    ventas: [vta("EFECTIVO", 5000), vta("DEBITO", 4000), vta("CREDITO", 3000), vta("MERCADOPAGO", 2000), vta("FIADO", 1000)],
  });
  assert.equal(c.ventasEfectivo, 5000);
  assert.equal(c.ventasDigital, 9000);
  assert.equal(c.ventasFiado, 1000);
  assert.equal(c.efectivoEsperado, 15000);
});

test("19b · ingresos suman y retiros restan del efectivo esperado", () => {
  const c = calcularEfectivoEsperado({
    montoInicial: 10000,
    ventas: [vta("EFECTIVO", 50000)],
    movimientos: [{ tipo: "INGRESO", monto: 3000 }, { tipo: "RETIRO", monto: 20000 }],
  });
  assert.equal(c.ingresos, 3000);
  assert.equal(c.retiros, 20000);
  assert.equal(c.efectivoEsperado, 43000);
});

// ---------------------------------------------------------------------------
// 10, 11, 12 · Idempotencia del retiro y del arqueo FINAL
// ---------------------------------------------------------------------------
test("10 y 11 · la clave del retiro de cierre es fija por turno", () => {
  assert.equal(claveRetiroCierre(170), "retiro-cierre-170");
  assert.equal(claveRetiroCierre(170), claveRetiroCierre(170), "reintentar no genera otra clave");
  assert.notEqual(claveRetiroCierre(170), claveRetiroCierre(171));
});

test("12 · el retiro de cierre NO cambia el esperado del propio cierre", () => {
  // El esperado se calcula con los movimientos que existían ANTES del cierre. El
  // retiro se crea después del arqueo FINAL, así que no puede retroalimentarlo.
  const movimientosPrevios = [{ tipo: "RETIRO", monto: 20000 }];
  const antes = calcularEfectivoEsperado({ montoInicial: 10000, ventas: [vta("EFECTIVO", 50000)], movimientos: movimientosPrevios });
  assert.equal(antes.efectivoEsperado, 40000);

  // Si el retiro de cierre se contara, el esperado bajaría a 0 y el arqueo FINAL
  // mostraría un sobrante inventado de 40000.
  const conRetiroDeCierre = calcularEfectivoEsperado({
    montoInicial: 10000, ventas: [vta("EFECTIVO", 50000)],
    movimientos: [...movimientosPrevios, { tipo: "RETIRO", monto: 40000 }],
  });
  assert.equal(conRetiroDeCierre.efectivoEsperado, 0);
  assert.notEqual(antes.efectivoEsperado, conRetiroDeCierre.efectivoEsperado);
});

test("motivo del retiro de cierre, con y sin destino", () => {
  assert.equal(motivoRetiroCierre({ turnoId: 170 }), "Retiro de cierre del turno #170");
  assert.equal(motivoRetiroCierre({ turnoId: 170, destino: "Caja fuerte" }), "Retiro de cierre del turno #170 — Caja fuerte");
  assert.equal(motivoRetiroCierre({ turnoId: 170, destino: "   " }), "Retiro de cierre del turno #170");
});

// ---------------------------------------------------------------------------
// 21, 22, 23 · Casos REALES de producción (Casiano casas, 02/08/2026)
// ---------------------------------------------------------------------------
test("21 · turno 170 real: fondo omitido, no faltante", () => {
  const c = calcularEfectivoEsperado({
    montoInicial: 10000,
    ventas: [vta("EFECTIVO", 5000), vta("EFECTIVO", 4400)],
  });
  assert.equal(c.ventasEfectivo, 9400);
  assert.equal(c.efectivoEsperado, 19400);
  assert.equal(calcularDiferencia(9400, c.efectivoEsperado), -10000);

  const d = detectarFondoOmitido({ contado: 9400, montoInicial: 10000, ventasEfectivo: 9400, efectivoEsperado: 19400 });
  assert.equal(d.omitido, true, "el flujo nuevo lo hubiera frenado antes de cerrar");
  assert.equal(d.fondoInicial, 10000);
});

test("22 · turno 171 real: mismo patrón con 15 ventas", () => {
  const c = calcularEfectivoEsperado({
    montoInicial: 10000,
    ventas: [vta("EFECTIVO", 63293), vta("MERCADOPAGO", 16902)],
  });
  assert.equal(c.efectivoEsperado, 73293);
  assert.equal(calcularDiferencia(63293, c.efectivoEsperado), -10000);
  assert.equal(
    detectarFondoOmitido({ contado: 63293, montoInicial: 10000, ventasEfectivo: 63293, efectivoEsperado: 73293 }).omitido,
    true
  );
});

test("23 · turno 173 real: bien contado, sin advertencia", () => {
  const c = calcularEfectivoEsperado({
    montoInicial: 10000,
    ventas: [vta("EFECTIVO", 57101.7), vta("DEBITO", 4194.8)],
  });
  assert.equal(c.efectivoEsperado, 67101.7);
  assert.equal(calcularDiferencia(67101.7, c.efectivoEsperado), 0);
  assert.equal(
    detectarFondoOmitido({ contado: 67101.7, montoInicial: 10000, ventasEfectivo: 57101.7, efectivoEsperado: 67101.7 }).omitido,
    false
  );
  // Y su reparto de cierre cierra exacto.
  const s = sugerirRepartoCierre({ contado: 67101.7, montoInicial: 10000 });
  assert.deepEqual(s, { fondoDejado: 10000, retirado: 57101.7 });
  assert.equal(validarRepartoCierre({ contado: 67101.7, ...s }).valido, true);
});

test("23b · turno 175 real: el arrastre que el flujo nuevo corta", () => {
  // Cerró con 385.000 contra 322.500 esperados: +62.500 de sobrante, porque el
  // cajón nunca se vació. Con el reparto obligatorio, del cierre salen 375.000 y
  // quedan 10.000 — y el turno siguiente arranca sabiendo exactamente cuánto recibe.
  const s = sugerirRepartoCierre({ contado: 385000, montoInicial: 10000 });
  assert.deepEqual(s, { fondoDejado: 10000, retirado: 375000 });
  assert.equal(validarRepartoCierre({ contado: 385000, ...s }).valido, true);
  const ap = evaluarRecepcionFondo({ sugerido: s.fondoDejado, recibido: 10000 });
  assert.equal(ap.coincide, true);
  assert.equal(ap.montoInicial, 10000);
});

// ---------------------------------------------------------------------------
// 24 · Turnos históricos con los campos nuevos en NULL
// ---------------------------------------------------------------------------
test("24 · turno histórico sin los campos nuevos no rompe nada", () => {
  // Un cierre viejo no tiene fondoDejadoCierre: la apertura siguiente sugiere 0 y
  // el cajero declara lo que recibe, como hasta ahora.
  const ev = evaluarRecepcionFondo({ sugerido: null, recibido: 10000 });
  assert.equal(ev.diferencia, 10000);
  assert.equal(ev.requiereObservacion, true);

  const v = validarApertura({ sugerido: undefined, recibido: 0 });
  assert.equal(v.valido, true);
  assert.equal(v.montoInicial, 0);

  // Y el reparto de un cierre viejo (sin retiro registrado) sigue siendo legible.
  assert.deepEqual(sugerirRepartoCierre({ contado: undefined, montoInicial: undefined }), { fondoDejado: 0, retirado: 0 });
});

// ---------------------------------------------------------------------------
// Fondo declarado a mano (herencia desactivada hasta que exista CajaFisica)
// ---------------------------------------------------------------------------
test("11 · la apertura pide el fondo a mano, sin sugerido ni observación obligatoria", async () => {
  const { validarFondoManual } = await import("./cierreCaja.js");

  const v = validarFondoManual(15000);
  assert.equal(v.valido, true);
  assert.equal(v.montoInicial, 15000);
  assert.equal(v.error, null);

  // Cero es válido: arrancar sin fondo es una decisión legítima.
  assert.equal(validarFondoManual(0).valido, true);
  assert.equal(validarFondoManual(0).montoInicial, 0);

  // Sin observación NO se rechaza: no hay monto sugerido contra el cual diferir.
  assert.equal(validarFondoManual(15000).valido, true);
});

test("11b · el fondo manual rechaza lo que no es un importe válido", async () => {
  const { validarFondoManual } = await import("./cierreCaja.js");
  for (const malo of [null, undefined, "", -1, "abc", Infinity, NaN, true, {}]) {
    assert.equal(validarFondoManual(malo).valido, false, `deberia rechazar ${String(malo)}`);
  }
});

test("11c · el fondo manual normaliza a centavos", async () => {
  const { validarFondoManual } = await import("./cierreCaja.js");
  assert.equal(validarFondoManual("10000.559").montoInicial, 10000.56);
  assert.equal(validarFondoManual("  ").valido, false);
});
