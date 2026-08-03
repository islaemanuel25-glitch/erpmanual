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
} from "@/lib/caja/retiroDinero";

// ── Los siete casos del pedido ─────────────────────────────────────────────

test("1. fondo 30.000, contado 120.000 → retiro 90.000, fondo 30.000", () => {
  const r = sugerirRepartoRetiro({ efectivoContado: 120000, fondoObjetivo: 30000 });
  assert.equal(r.efectivoRetirado, 90000);
  assert.equal(r.fondoDejado, 30000);
});

test("2. contado 20.000 con fondo objetivo 30.000 → retiro 0, fondo 20.000", () => {
  // No alcanza el objetivo: NO se retira nada y queda todo. El fondo real es
  // menor al deseado y la pantalla debe mostrarlo, no disimularlo.
  const r = sugerirRepartoRetiro({ efectivoContado: 20000, fondoObjetivo: 30000 });
  assert.equal(r.efectivoRetirado, 0);
  assert.equal(r.fondoDejado, 20000);
});

test("3. contado igual al fondo objetivo → retiro 0", () => {
  assert.equal(calcularRetiroSugerido({ efectivoContado: 30000, fondoObjetivo: 30000 }), 0);
  const r = sugerirRepartoRetiro({ efectivoContado: 30000, fondoObjetivo: 30000 });
  assert.equal(r.efectivoRetirado, 0);
  assert.equal(r.fondoDejado, 30000);
});

test("4. fondo dejado manual 70.000 sobre contado 120.000 → retiro 50.000", () => {
  // Dejar MÁS que el objetivo es válido: hay días que se necesita más cambio.
  // La regla es la suma exacta, no la igualdad con el objetivo.
  const v = validarRepartoRetiro({
    efectivoContado: 120000,
    efectivoRetirado: 50000,
    fondoDejado: 70000,
  });
  assert.equal(v.valido, true);
  assert.equal(v.efectivoRetirado, 50000);
  assert.equal(v.fondoDejado, 70000);
});

test("5. importes negativos → rechazo", () => {
  assert.equal(validarRepartoRetiro({ efectivoContado: -1, efectivoRetirado: 0, fondoDejado: -1 }).valido, false);
  assert.equal(validarRepartoRetiro({ efectivoContado: 100, efectivoRetirado: -50, fondoDejado: 150 }).valido, false);
  assert.equal(validarRepartoRetiro({ efectivoContado: 100, efectivoRetirado: 150, fondoDejado: -50 }).valido, false);
});

test("6. un reparto que no suma el contado → rechazo", () => {
  const v = validarRepartoRetiro({ efectivoContado: 120000, efectivoRetirado: 90000, fondoDejado: 20000 });
  assert.equal(v.valido, false);
  assert.match(v.error, /exactamente el efectivo contado/i);
});

test("7. precisión: centavos exactos, sin residuo binario", () => {
  // 0.1 + 0.2 en float da 0.30000000000000004. Acá tiene que dar 0.30 exacto,
  // porque un residuo de ese tipo se lee como diferencia de caja.
  const v = validarRepartoRetiro({ efectivoContado: 0.3, efectivoRetirado: 0.1, fondoDejado: 0.2 });
  assert.equal(v.valido, true);
  assert.equal(v.efectivoRetirado, 0.1);
  assert.equal(v.fondoDejado, 0.2);

  const r = sugerirRepartoRetiro({ efectivoContado: 120000.55, fondoObjetivo: 30000.35 });
  assert.equal(r.efectivoRetirado, 90000.2);
  assert.equal(r.fondoDejado, 30000.35);
  // La suma cierra exactamente contra el contado.
  const v2 = validarRepartoRetiro({
    efectivoContado: 120000.55,
    efectivoRetirado: r.efectivoRetirado,
    fondoDejado: r.fondoDejado,
  });
  assert.equal(v2.valido, true);
});

// ── El sugerido siempre produce un reparto válido ──────────────────────────

test("8. el reparto sugerido SIEMPRE cierra contra el contado", () => {
  const casos = [
    [0, 0], [0, 30000], [1, 30000], [29999.99, 30000], [30000, 30000],
    [30000.01, 30000], [120000, 30000], [999999.99, 0.01], [12345.67, 7654.33],
  ];
  for (const [contado, objetivo] of casos) {
    const r = sugerirRepartoRetiro({ efectivoContado: contado, fondoObjetivo: objetivo });
    const v = validarRepartoRetiro({
      efectivoContado: contado,
      efectivoRetirado: r.efectivoRetirado,
      fondoDejado: r.fondoDejado,
    });
    assert.equal(v.valido, true, `contado=${contado} objetivo=${objetivo}: ${v.error}`);
    assert.ok(r.efectivoRetirado >= 0, "el sugerido nunca es negativo");
  }
});

test("9. el sugerido nunca es negativo, ni con objetivo absurdo", () => {
  assert.equal(calcularRetiroSugerido({ efectivoContado: 100, fondoObjetivo: 999999 }), 0);
  assert.equal(calcularRetiroSugerido({ efectivoContado: 100, fondoObjetivo: -500 }), 100);
  assert.equal(calcularRetiroSugerido({ efectivoContado: -100, fondoObjetivo: 30000 }), 0);
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

test("17. caso de referencia completo: 120.000 contados, fondo 30.000", () => {
  const r = sugerirRepartoRetiro({ efectivoContado: 120000, fondoObjetivo: 30000 });
  assert.equal(r.efectivoRetirado, 90000);
  assert.equal(r.fondoDejado, 30000);

  // Segundo retiro del mismo turno, ya sobre el estado posterior: el cajón tiene
  // el fondo de 30.000 más 40.000 vendidos.
  const r2 = sugerirRepartoRetiro({ efectivoContado: 70000, fondoObjetivo: 30000 });
  assert.equal(r2.efectivoRetirado, 40000);
  assert.equal(r2.fondoDejado, 30000);
});
