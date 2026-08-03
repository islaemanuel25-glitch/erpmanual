// Pruebas del reparto de un retiro de recaudación.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/retiroDinero.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calcularRetiroSugerido,
  sugerirRepartoRetiro,
  validarRepartoRetiro,
  resolverFondoObjetivo,
  motivoRetiroRecaudacion,
  esMotivoReservado,
  validarIdempotencyKey,
  calcularRecaudacionEsperada,
  evaluarRetiro,
} from "@/lib/caja/retiroDinero";

// ── La regla NUEVA: el retiro sale del ESPERADO, no del contado ─────────────
//
// Fórmula anterior (incorrecta):  sugerido = contado − fondoObjetivo
// Fórmula nueva:                  recaudación = max(0, esperadoAntes − fondoObjetivo)
//                                 sugerido    = min(recaudación, contado)
//
// La anterior metía la diferencia dentro del retiro: un sobrante se llevaba como
// si fuera venta y un faltante se tapaba dejando menos fondo. Además desplazaba
// el efectivo esperado de forma permanente, hasta dejarlo negativo.

test("1. caso EXACTO: esperado 120.000, contado 120.000, fondo 30.000 → retira 90.000", () => {
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000, efectivoContado: 120000,
  });
  assert.equal(r.recaudacionEsperada, 90000);
  assert.equal(r.efectivoRetirado, 90000);
  assert.equal(r.fondoDejado, 30000);
});

test("2. SOBRANTE: contado 125.000 → retira 90.000 igual, quedan 35.000", () => {
  // El sobrante NO se retira: no es recaudación, es una diferencia sin explicar.
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000, efectivoContado: 125000,
  });
  assert.equal(r.efectivoRetirado, 90000, "no debe llevarse el sobrante");
  assert.equal(r.fondoDejado, 35000, "el sobrante queda en el cajón");

  const e = evaluarRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000,
    efectivoContado: 125000, efectivoRetirado: 90000,
  });
  assert.equal(e.diferencia, 5000);
  assert.equal(e.fondoFisicoRestante, 35000);
  assert.equal(e.fondoFisicoDistinto, true, "35.000 ≠ 30.000: hay que decirlo");
  assert.equal(e.efectivoEsperadoDespues, 30000, "el esperado NO queda desplazado");
});

test("3. FALTANTE: contado 115.000 → retira 90.000 igual, quedan 25.000", () => {
  // El faltante NO se tapa reduciendo el retiro: se lleva la recaudación completa
  // y el fondo queda corto, que es exactamente lo que pasó en la realidad.
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000, efectivoContado: 115000,
  });
  assert.equal(r.efectivoRetirado, 90000);
  assert.equal(r.fondoDejado, 25000);

  const e = evaluarRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000,
    efectivoContado: 115000, efectivoRetirado: 90000,
  });
  assert.equal(e.diferencia, -5000);
  assert.equal(e.fondoFisicoRestante, 25000);
  assert.equal(e.fondoFisicoDistinto, true);
  assert.equal(e.efectivoEsperadoDespues, 30000);
});

test("4. FALTANTE SEVERO: contado 70.000 con recaudación de 90.000", () => {
  // No se puede sacar plata que no está: el tope es lo contado.
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000, efectivoContado: 70000,
  });
  assert.equal(r.recaudacionEsperada, 90000);
  assert.equal(r.efectivoRetirado, 70000, "el tope es el contado");
  assert.equal(r.fondoDejado, 0, "el cajón queda vacío");

  const e = evaluarRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000,
    efectivoContado: 70000, efectivoRetirado: 70000,
  });
  assert.equal(e.diferencia, -50000);
  assert.equal(e.retiroLimitadoPorFaltante, true, "hay que avisar que no alcanzó");
  assert.equal(e.fondoFisicoRestante, 0);
});

test("5. el sugerido NUNCA supera al contado ni es negativo", () => {
  const casos = [
    [0, 0, 0], [120000, 30000, 0], [120000, 30000, 5], [10000, 30000, 50000],
    [0, 30000, 50000], [-1000, 30000, 1000], [120000, 0, 120000],
  ];
  for (const [esp, obj, cont] of casos) {
    const s = calcularRetiroSugerido({ efectivoEsperadoAntes: esp, fondoObjetivo: obj, efectivoContado: cont });
    assert.ok(s >= 0, `esp=${esp} obj=${obj} cont=${cont}: sugerido negativo (${s})`);
    assert.ok(s <= Math.max(0, cont), `esp=${esp} obj=${obj} cont=${cont}: sugerido ${s} > contado`);
  }
});

test("6. esperado por debajo del objetivo → no hay recaudación que retirar", () => {
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 20000, fondoObjetivo: 30000, efectivoContado: 20000,
  });
  assert.equal(r.recaudacionEsperada, 0);
  assert.equal(r.efectivoRetirado, 0);
  assert.equal(r.fondoDejado, 20000);
});

test("7. ajuste manual: se puede retirar menos, y queda marcado", () => {
  const e = evaluarRetiro({
    efectivoEsperadoAntes: 120000, fondoObjetivo: 30000,
    efectivoContado: 120000, efectivoRetirado: 50000,
  });
  assert.equal(e.retiroDistintoDeRecaudacion, true);
  assert.equal(e.fondoFisicoRestante, 70000);
  assert.equal(e.fondoFisicoDistinto, true);
  assert.equal(e.diferencia, 0, "ajustar el retiro NO cambia la diferencia");
});

test("8. la invariante sigue siendo exacta: retirado + fondo físico = contado", () => {
  const casos = [
    [120000, 30000, 120000], [120000, 30000, 125000], [120000, 30000, 115000],
    [120000, 30000, 70000], [20000, 30000, 20000], [120000.55, 30000.35, 120000.55],
  ];
  for (const [esp, obj, cont] of casos) {
    const r = sugerirRepartoRetiro({ efectivoEsperadoAntes: esp, fondoObjetivo: obj, efectivoContado: cont });
    const v = validarRepartoRetiro({
      efectivoContado: cont, efectivoRetirado: r.efectivoRetirado, fondoDejado: r.fondoDejado,
    });
    assert.equal(v.valido, true, `esp=${esp} obj=${obj} cont=${cont}: ${v.error}`);
  }
});

test("9. precisión en centavos, sin residuo binario", () => {
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 120000.55, fondoObjetivo: 30000.35, efectivoContado: 120000.55,
  });
  assert.equal(r.recaudacionEsperada, 90000.2);
  assert.equal(r.efectivoRetirado, 90000.2);
  assert.equal(r.fondoDejado, 30000.35);
  const e = evaluarRetiro({
    efectivoEsperadoAntes: 0.3, fondoObjetivo: 0.1, efectivoContado: 0.3, efectivoRetirado: 0.2,
  });
  assert.equal(e.diferencia, 0);
  assert.equal(e.fondoFisicoRestante, 0.1);
});

// ── REGRESIÓN: dos retiros después de una diferencia ───────────────────────

test("9b. la diferencia NO crece con retiros sucesivos, y el esperado no se va a negativo", () => {
  // Éste es el defecto que motivó la corrección. Con la fórmula anterior,
  // retirar un sobrante desplazaba el esperado y la misma diferencia reaparecía
  // más grande en cada conteo. Se simula la cadena completa.
  const OBJ = 30000;
  let esperado = 120000;

  // Retiro 1 con un sobrante de +5.000.
  const r1 = sugerirRepartoRetiro({ efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: 125000 });
  const e1 = evaluarRetiro({
    efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: 125000, efectivoRetirado: r1.efectivoRetirado,
  });
  assert.equal(e1.diferencia, 5000);
  assert.equal(r1.efectivoRetirado, 90000);
  esperado = e1.efectivoEsperadoDespues;          // el movimiento descuenta exactamente lo retirado
  assert.equal(esperado, 30000, "el esperado queda en el fondo objetivo, no negativo");
  let fisico = r1.fondoDejado;                     // 35.000 (el sobrante sigue en el cajón)
  assert.equal(fisico, 35000);

  // Se venden 40.000 en efectivo.
  esperado += 40000;   // 70.000
  fisico += 40000;     // 75.000

  // Retiro 2: el MISMO sobrante de 5.000 sigue ahí, sin crecer.
  const r2 = sugerirRepartoRetiro({ efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: fisico });
  const e2 = evaluarRetiro({
    efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: fisico, efectivoRetirado: r2.efectivoRetirado,
  });
  assert.equal(e2.diferencia, 5000, "la diferencia sigue siendo +5.000, no se duplicó");
  assert.equal(r2.efectivoRetirado, 40000, "se lleva solo lo vendido");
  esperado = e2.efectivoEsperadoDespues;
  fisico = r2.fondoDejado;
  assert.equal(esperado, 30000);
  assert.equal(fisico, 35000, "el sobrante sigue explicable, intacto");

  // Tercer retiro sin ventas: nada que llevar, la diferencia no se mueve.
  const r3 = sugerirRepartoRetiro({ efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: fisico });
  assert.equal(r3.efectivoRetirado, 0);
  const e3 = evaluarRetiro({
    efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: fisico, efectivoRetirado: 0,
  });
  assert.equal(e3.diferencia, 5000);
  assert.equal(e3.efectivoEsperadoDespues, 30000, "sigue sin desplazarse");
});

test("9c. lo mismo con FALTANTE: se mantiene explicable y no se agranda", () => {
  const OBJ = 30000;
  let esperado = 120000;
  const r1 = sugerirRepartoRetiro({ efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: 115000 });
  const e1 = evaluarRetiro({
    efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: 115000, efectivoRetirado: r1.efectivoRetirado,
  });
  assert.equal(e1.diferencia, -5000);
  esperado = e1.efectivoEsperadoDespues;
  let fisico = r1.fondoDejado;
  assert.equal(esperado, 30000);
  assert.equal(fisico, 25000);

  esperado += 40000;   // 70.000
  fisico += 40000;     // 65.000

  const r2 = sugerirRepartoRetiro({ efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: fisico });
  const e2 = evaluarRetiro({
    efectivoEsperadoAntes: esperado, fondoObjetivo: OBJ, efectivoContado: fisico, efectivoRetirado: r2.efectivoRetirado,
  });
  assert.equal(e2.diferencia, -5000, "el faltante sigue siendo el mismo");
  assert.equal(r2.efectivoRetirado, 40000);
  assert.equal(e2.efectivoEsperadoDespues, 30000);
  assert.equal(r2.fondoDejado, 25000);
});


// ── Fondo objetivo y su fallback ───────────────────────────────────────────

test("10. fondo objetivo: primero el configurado del local", () => {
  const r = resolverFondoObjetivo({ configurado: 30000, montoInicial: 5000 });
  assert.equal(r.fondoObjetivo, 30000);
  assert.equal(r.origen, "CONFIGURADO");
});

test("11. sin configurar cae al montoInicial del turno, NUNCA a cero", () => {
  for (const vacio of [null, undefined, ""]) {
    const r = resolverFondoObjetivo({ configurado: vacio, montoInicial: 5000 });
    assert.equal(r.fondoObjetivo, 5000, `configurado=${String(vacio)}`);
    assert.equal(r.origen, "MONTO_INICIAL");
  }
});

test("12. un fondo configurado en 0 es una decisión, no un vacío", () => {
  // Cero configurado significa "retirar todo": es válido y NO cae al fallback.
  const r = resolverFondoObjetivo({ configurado: 0, montoInicial: 5000 });
  assert.equal(r.fondoObjetivo, 0);
  assert.equal(r.origen, "CONFIGURADO");
});

test("13. sin ningún dato el origen queda marcado como SIN_DATO", () => {
  const r = resolverFondoObjetivo({});
  assert.equal(r.fondoObjetivo, 0);
  assert.equal(r.origen, "SIN_DATO");
});

// ── Motivo reservado e idempotencia ────────────────────────────────────────

test("14. el motivo del movimiento es estable y reconocible", () => {
  assert.equal(motivoRetiroRecaudacion(42), "Retiro de recaudación #42");
});

test("15. el motivo reservado no se puede imitar desde un egreso manual", () => {
  assert.equal(esMotivoReservado("Retiro de recaudación #7"), true);
  assert.equal(esMotivoReservado("  retiro de RECAUDACIÓN de hoy"), true);
  assert.equal(esMotivoReservado("Pago a proveedor"), false);
  assert.equal(esMotivoReservado(""), false);
  assert.equal(esMotivoReservado(null), false);
});

test("15b. el guard no depende de la tilde — la primera versión sí y no servía", () => {
  // Escribir "recaudacion" sin tilde, o mandarla mal codificada, es el MISMO
  // intento. Un guard que solo reconoce la grafía perfecta no protege de nada:
  // se detectó en pruebas de integración, donde un motivo con el acento roto
  // pasó y creó un movimiento manual con el texto del flujo automático.
  assert.equal(esMotivoReservado("Retiro de recaudacion #1"), true);
  assert.equal(esMotivoReservado("RETIRO DE RECAUDACION"), true);
  assert.equal(esMotivoReservado("  retiro de recaudacion  "), true);
  // Y no se pasa de rosca: un motivo que solo comparte una palabra sigue siendo válido.
  assert.equal(esMotivoReservado("Retiro para el banco"), false);
  assert.equal(esMotivoReservado("Recaudacion del sabado"), false);
});

test("16. la clave de idempotencia es obligatoria", () => {
  // Sin clave, dos envíos crearían dos retiros y descontarían dos veces: en
  // Postgres los NULL no colisionan en el UNIQUE, así que la fila quedaría
  // desprotegida. Por eso acá sí es obligatoria.
  for (const vacia of [undefined, null, "", "   "]) {
    assert.equal(validarIdempotencyKey(vacia).valido, false, `clave=${String(vacia)}`);
  }
  assert.equal(validarIdempotencyKey("retiro-9-172000").valido, true);
  assert.equal(validarIdempotencyKey("x".repeat(121)).valido, false);
});

// ── El caso funcional de referencia ────────────────────────────────────────

test("17. caso de referencia completo, dos retiros en el mismo turno", () => {
  const r = sugerirRepartoRetiro({ efectivoEsperadoAntes: 120000, fondoObjetivo: 30000, efectivoContado: 120000 });
  assert.equal(r.efectivoRetirado, 90000);
  assert.equal(r.fondoDejado, 30000);
  // Segundo retiro: 40.000 vendidos sobre el fondo de 30.000.
  const r2 = sugerirRepartoRetiro({ efectivoEsperadoAntes: 70000, fondoObjetivo: 30000, efectivoContado: 70000 });
  assert.equal(r2.efectivoRetirado, 40000);
  assert.equal(r2.fondoDejado, 30000);
  assert.equal(calcularRecaudacionEsperada({ efectivoEsperadoAntes: 70000, fondoObjetivo: 30000 }), 40000);
});
