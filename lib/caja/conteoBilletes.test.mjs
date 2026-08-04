// Conteo por billetes y borrador del retiro.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/conteoBilletes.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DENOMINACIONES,
  CLAVE_MONEDAS,
  totalDesglose,
  filasDesglose,
  subtotalDenominacion,
  normalizarCantidad,
  desgloseCoincide,
  desgloseVacio,
  validarRetiroPorBilletes,
  ajustarCantidad,
  fondoFisicoRestante,
} from "@/lib/caja/conteoBilletes";

import {
  claveBorrador,
  armarBorrador,
  guardarBorrador,
  leerBorrador,
  descartarBorrador,
  limpiarBorradoresViejos,
  detectarEsperadoCambiado,
  VENCIMIENTO_HORAS,
} from "@/lib/caja/borradorRetiro";

import { sugerirRepartoRetiro } from "@/lib/caja/retiroDinero";

/** localStorage de mentira, para probar sin navegador. */
function storageFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _mapa: m,
  };
}

// ── 1 a 10 · Lógica del conteo ─────────────────────────────────────────────

test("1. los billetes contados actualizan el total contado", () => {
  assert.equal(totalDesglose({ 20000: 2, 10000: 3 }), 70000);
  assert.equal(totalDesglose({ 1000: 5, 500: 2, 100: 3 }), 6300);
  assert.equal(totalDesglose({}), 0);
});

test("2. los billetes a retirar actualizan el total a retirar", () => {
  // Misma función: el desglose de retiro se totaliza igual que el de conteo.
  assert.equal(totalDesglose({ 20000: 1, 2000: 4 }), 28000);
});

test("3. 2 × $20.000 + 3 × $10.000 = $70.000 — el ejemplo del pedido", () => {
  const filas = filasDesglose({ 20000: 2, 10000: 3 });
  const f20 = filas.find((f) => f.valor === 20000);
  const f10 = filas.find((f) => f.valor === 10000);
  assert.equal(f20.subtotal, 40000);
  assert.equal(f10.subtotal, 30000);
  assert.equal(totalDesglose({ 20000: 2, 10000: 3 }), 70000);
});

test("4. lo que queda es contado − retiro", () => {
  assert.equal(fondoFisicoRestante(120000, 90000), 30000);
  assert.equal(fondoFisicoRestante(120000, 120000), 0);
  // Nunca negativo: eso lo bloquea la validación, no se arrastra al cálculo.
  assert.equal(fondoFisicoRestante(100, 500), 0);
});

test("5. retirar más de lo contado se rechaza", () => {
  const r = validarRetiroPorBilletes({
    desgloseContado: {},
    desgloseRetiro: { 20000: 5 },
    totalContado: 50000,
  });
  assert.equal(r.valido, false);
  assert.match(r.error, /más de lo que hay/i);
});

test("6. una cantidad negativa nunca cuenta", () => {
  assert.equal(normalizarCantidad(-3), 0);
  assert.equal(normalizarCantidad("-1"), 0);
  assert.equal(normalizarCantidad(2.9), 2, "los billetes son enteros");
  assert.equal(totalDesglose({ 10000: -5 }), 0);
  // Y el botón de menos no baja de cero.
  assert.deepEqual(ajustarCantidad({ 1000: 0 }, 1000, -1), { 1000: 0 });
  assert.deepEqual(ajustarCantidad({ 1000: 2 }, 1000, -1), { 1000: 1 });
});

test("7. no se pueden retirar más billetes de una denominación que los contados", () => {
  // Sacar del cajón un billete que no está es imposible.
  const r = validarRetiroPorBilletes({
    desgloseContado: { 10000: 3, 1000: 10 },
    desgloseRetiro: { 10000: 5 },
  });
  assert.equal(r.valido, false);
  assert.match(r.error, /más billetes de los que contaste/i);
  assert.equal(r.excesos[0].valor, 10000);
  assert.equal(r.excesos[0].contados, 3);
  assert.equal(r.excesos[0].aRetirar, 5);
});

test("7b. sin conteo detallado NO se inventa la restricción por denominación", () => {
  // Si el cajero contó por monto total, no hay contra qué comparar.
  const r = validarRetiroPorBilletes({
    desgloseContado: {},
    desgloseRetiro: { 10000: 5 },
    totalContado: 120000,
  });
  assert.equal(r.valido, true);
});

test("8. cambiar de billetes a monto total no deja dos valores contradictorios", () => {
  const desglose = { 20000: 2, 10000: 3 }; // 70.000
  assert.equal(desgloseCoincide(desglose, 70000), true);
  assert.equal(desgloseCoincide(desglose, 65000), false, "hay que avisar el desacople");
  assert.equal(desgloseVacio({}), true);
  assert.equal(desgloseVacio(desglose), false);
});

test("9. 'Monedas / otros' entra como importe, no como cantidad", () => {
  // Es la bolsa de lo que no vale la pena contar por unidad.
  assert.equal(totalDesglose({ [CLAVE_MONEDAS]: 350.5 }), 350.5);
  assert.equal(totalDesglose({ 1000: 2, [CLAVE_MONEDAS]: 125.75 }), 2125.75);
  // Y también se controla al retirar.
  const r = validarRetiroPorBilletes({
    desgloseContado: { [CLAVE_MONEDAS]: 100 },
    desgloseRetiro: { [CLAVE_MONEDAS]: 500 },
  });
  assert.equal(r.valido, false);
});

test("10. el retiro sugerido sigue saliendo del ESPERADO, no del contado", () => {
  // Este módulo NO redefine la regla monetaria de d541204.
  const r = sugerirRepartoRetiro({
    efectivoEsperadoAntes: 120000,
    fondoObjetivo: 30000,
    efectivoContado: 125000, // hay un sobrante de 5.000
  });
  assert.equal(r.efectivoRetirado, 90000, "el sobrante no se retira");
  assert.equal(r.fondoDejado, 35000);
});

test("10b. la lista vigente es la que se usa hoy, y está ordenada", () => {
  // Fija la configuración ACTUAL, no una verdad permanente: el BCRA emite
  // billetes nuevos cada tanto y esta lista se va a ampliar. Si eso pasa, se
  // toca `DENOMINACIONES` —el único lugar donde vive— y se actualiza esta
  // línea. Hoy no hay $5.000 en circulación, por eso no está.
  const valores = DENOMINACIONES.map((d) => d.valor);
  assert.deepEqual(valores, [20000, 10000, 2000, 1000, 500, 200, 100]);
  // De mayor a menor, como se cuenta en la práctica.
  assert.deepEqual(valores, [...valores].sort((a, b) => b - a));
  // Cada fila necesita etiqueta para pintarse.
  for (const d of DENOMINACIONES) assert.ok(d.etiqueta, `falta etiqueta de ${d.valor}`);
});

test("10d. las denominaciones viven en UN solo lugar", () => {
  // Dispersarlas en componentes o pruebas es la forma segura de que dejen de
  // coincidir. Todo lo que las necesita las importa de acá.
  assert.ok(Array.isArray(DENOMINACIONES) && DENOMINACIONES.length > 0);
  assert.equal(CLAVE_MONEDAS, "monedas");
  // "Monedas / otros" NO es una denominación: es un importe suelto.
  assert.ok(!DENOMINACIONES.some((d) => d.valor === CLAVE_MONEDAS));
  assert.equal(totalDesglose({ [CLAVE_MONEDAS]: 1 }), 1, "entra como importe, no multiplicado");
});

test("10c. el subtotal por fila es exacto en centavos", () => {
  assert.equal(subtotalDenominacion(20000, 3), 60000);
  assert.equal(subtotalDenominacion(100, 7), 700);
  assert.equal(subtotalDenominacion(500, 0), 0);
});

// ── 11 a 17 · Borrador ─────────────────────────────────────────────────────

const base = { turnoId: 7, usuarioId: 3 };

test("11. el borrador se guarda y se recupera por turno y usuario", () => {
  const s = storageFalso();
  const b = armarBorrador({
    ...base,
    modoConteo: "BILLETES",
    montoContado: "70000",
    desgloseContado: { 20000: 2, 10000: 3 },
    modoRetiro: "BILLETES",
    importeRetiro: "40000",
    desgloseRetiro: { 20000: 2 },
    observacion: "se lleva Ana",
  });
  assert.equal(guardarBorrador(s, b), true);

  const leido = leerBorrador(s, base);
  assert.equal(leido.montoContado, "70000");
  assert.deepEqual(leido.desgloseContado, { 20000: 2, 10000: 3 });
  assert.deepEqual(leido.desgloseRetiro, { 20000: 2 });
  assert.equal(leido.observacion, "se lleva Ana");
});

test("12. un borrador NO se recupera en otro turno ni con otro usuario", () => {
  const s = storageFalso();
  guardarBorrador(s, armarBorrador({ ...base, modoConteo: "TOTAL", montoContado: "999" }));
  assert.equal(leerBorrador(s, { turnoId: 8, usuarioId: 3 }), null, "se filtró a otro turno");
  assert.equal(leerBorrador(s, { turnoId: 7, usuarioId: 4 }), null, "se filtró a otro usuario");
  assert.ok(leerBorrador(s, base), "y sigue disponible para el suyo");
});

test("13. un borrador vencido se descarta solo", () => {
  const s = storageFalso();
  const hace13h = Date.now() - (VENCIMIENTO_HORAS + 1) * 3600 * 1000;
  guardarBorrador(s, armarBorrador({ ...base, montoContado: "500", ahora: hace13h }));
  assert.equal(leerBorrador(s, base), null, "no debería ofrecerse");
  assert.equal(s.getItem(claveBorrador(base)), null, "y además se borra");
});

test("13b. al abrir con el turno activo se limpian los borradores de turnos viejos", () => {
  // Un turno cerrado no vuelve: su borrador no puede reaparecer mañana.
  const s = storageFalso();
  guardarBorrador(s, armarBorrador({ turnoId: 5, usuarioId: 3, montoContado: "1" }));
  guardarBorrador(s, armarBorrador({ turnoId: 6, usuarioId: 3, montoContado: "2" }));
  guardarBorrador(s, armarBorrador({ turnoId: 7, usuarioId: 3, montoContado: "3" }));
  guardarBorrador(s, armarBorrador({ turnoId: 5, usuarioId: 9, montoContado: "otro usuario" }));

  const borrados = limpiarBorradoresViejos(s, { turnoIdActivo: 7, usuarioId: 3 });
  assert.equal(borrados, 2);
  assert.ok(leerBorrador(s, { turnoId: 7, usuarioId: 3 }), "el activo sobrevive");
  assert.ok(s.getItem(claveBorrador({ turnoId: 5, usuarioId: 9 })), "el de otro usuario no se toca");
});

test("14. guardar el borrador NO crea movimientos ni toca la base", () => {
  // El módulo es puro y solo escribe en el storage que se le pasa: no hay forma
  // de que cree un CajaMovimiento. Se comprueba que lo único escrito es su clave.
  const s = storageFalso();
  guardarBorrador(s, armarBorrador({ ...base, montoContado: "70000" }));
  assert.deepEqual([...s._mapa.keys()], [claveBorrador(base)]);
});

test("14b. el borrador NO guarda el estado del servidor", () => {
  // esperado, diferencia, recaudación y fondo objetivo envejecen: si el cajero
  // cobra tres ventas mientras el borrador espera, reusarlos mostraría una
  // diferencia inventada.
  const b = armarBorrador({
    ...base,
    modoConteo: "TOTAL",
    montoContado: "70000",
    // Aunque se intente colar, no forma parte de lo persistido.
    efectivoEsperado: 999999,
    diferencia: -1234,
  });
  for (const prohibido of ["efectivoEsperado", "diferencia", "recaudacionEsperada", "fondoObjetivo"]) {
    assert.equal(prohibido in b, false, `el borrador guardó ${prohibido}`);
  }
});

test("15. descartar el borrador lo deja limpio para el próximo retiro", () => {
  const s = storageFalso();
  guardarBorrador(s, armarBorrador({ ...base, montoContado: "70000" }));
  descartarBorrador(s, base);
  assert.equal(leerBorrador(s, base), null);
});

test("16. un borrador corrupto no rompe la pantalla", () => {
  const s = storageFalso({ [claveBorrador(base)]: "{ esto no es json" });
  assert.equal(leerBorrador(s, base), null);
  assert.equal(s.getItem(claveBorrador(base)), null, "y se limpia solo");
});

test("17. si el efectivo esperado cambió, se detecta y se informa", () => {
  const sin = detectarEsperadoCambiado({ esperadoAlAbrir: 120000, esperadoAhora: 120000 });
  assert.equal(sin.cambio, false);

  const con = detectarEsperadoCambiado({ esperadoAlAbrir: 120000, esperadoAhora: 135000 });
  assert.equal(con.cambio, true);
  assert.equal(con.anterior, 120000);
  assert.equal(con.actual, 135000);
  assert.equal(con.diferencia, 15000);

  // También cuando baja (entró un retiro de otro cajero, por ejemplo).
  const baja = detectarEsperadoCambiado({ esperadoAlAbrir: 120000, esperadoAhora: 30000 });
  assert.equal(baja.cambio, true);
  assert.equal(baja.diferencia, -90000);
});

test("17b. sin storage el flujo no se rompe, solo se pierde la comodidad", () => {
  assert.equal(guardarBorrador(null, armarBorrador(base)), false);
  assert.equal(leerBorrador(null, base), null);
  assert.doesNotThrow(() => descartarBorrador(null, base));
  assert.equal(limpiarBorradoresViejos(null, { turnoIdActivo: 7, usuarioId: 3 }), 0);
});
