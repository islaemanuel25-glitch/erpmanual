// LÓGICA DEFINITIVA DEL RETIRO: se elige el CAMBIO, el retiro se deduce.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/retiroCambio.test.mjs
//
// El flujo anterior preguntaba cuánto retirar y ofrecía elegir los billetes que
// salían. Eso no es lo que pasa en el mostrador: la persona agarra el cambio que
// necesita para seguir dando vuelto, lo deja, y todo lo demás se va. El importe
// del retiro es una resta, no una decisión.
//
// Estas pruebas fijan esa inversión y los límites que la hacen segura.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DENOMINACIONES,
  CLAVE_MONEDAS,
  totalDesglose,
  validarCambioQueQueda,
  filasCambio,
  limitarCambioAlConteo,
  calcularRetiroDesdeCambio,
  normalizarMonedas,
} from "@/lib/caja/conteoBilletes";
import {
  evaluarRetiroPorCambio,
  huellaDelTurno,
  compararHuellas,
  recalcularDiferencia,
} from "@/lib/caja/retiroDinero";
import {
  VERSION_BORRADOR,
  VERSION_ANTERIOR,
  armarBorrador,
  guardarBorrador,
  leerBorrador,
  migrarBorradorV1,
  claveBorrador,
  sanearDesglose,
} from "@/lib/caja/borradorRetiro";

/** localStorage de mentira, con la misma superficie que usa el código. */
function storageFalso(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    get length() {
      return datos.size;
    },
    key: (i) => [...datos.keys()][i] ?? null,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    _datos: datos,
  };
}

// ── El caso del pedido: 150.450 contado, 30.450 de cambio, 120.000 de retiro ──

test("6. 150.450 contado − 30.450 de cambio = 120.000 de retiro", () => {
  // 7 × $20.000 + 1 × $10.000 + $450 sueltos.
  const contado = { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 };
  // Queda: 1 × $20.000 + 5 × $2.000 ... no: se deja lo que hay. 1×$10.000,
  // 10×$2.000 no existen. Con lo contado, dejar $30.450 es 1×$20.000 + $10.000
  // + $450.
  const cambio = { 20000: 1, 10000: 1, [CLAVE_MONEDAS]: 450 };

  assert.equal(totalDesglose(contado), 150450);
  assert.equal(totalDesglose(cambio), 30450);
  assert.equal(
    calcularRetiroDesdeCambio({ efectivoContado: 150450, cambioQueQueda: 30450 }),
    120000
  );
});

test("3. el retiro se calcula solo: nunca se pregunta cuánto", () => {
  const casos = [
    { contado: 100000, cambio: 30000, retiro: 70000 },
    { contado: 100000, cambio: 0, retiro: 100000 },
    { contado: 45678.9, cambio: 12345.6, retiro: 33333.3 },
    { contado: 0, cambio: 0, retiro: 0 },
  ];
  for (const c of casos) {
    assert.equal(
      calcularRetiroDesdeCambio({ efectivoContado: c.contado, cambioQueQueda: c.cambio }),
      c.retiro,
      `${c.contado} − ${c.cambio}`
    );
  }
});

test("3b. el retiro nunca es negativo, aunque el cambio supere lo contado", () => {
  // No debería poder pasar —la validación lo impide— pero si pasara, el número
  // que se manda al backend no puede ser negativo.
  assert.equal(calcularRetiroDesdeCambio({ efectivoContado: 1000, cambioQueQueda: 5000 }), 0);
});

// ── Límites del cambio ──────────────────────────────────────────────────────

test("7. no se puede dejar más billetes de los contados", () => {
  const r = validarCambioQueQueda({
    desgloseContado: { 10000: 3 },
    desgloseCambio: { 10000: 5 },
    totalContado: 30000,
  });
  assert.equal(r.valido, false);
  assert.match(r.error, /No podés dejar más de lo que contaste/);
  assert.match(r.error, /\$10\.000 \(contaste 3, querés dejar 5\)/);
  assert.deepEqual(r.excesos[0], { valor: 10000, etiqueta: "$10.000", contadas: 3, quedan: 5 });
});

test("7b. dejar exactamente los contados es válido", () => {
  const r = validarCambioQueQueda({
    desgloseContado: { 10000: 3, 500: 2 },
    desgloseCambio: { 10000: 3, 500: 2 },
    totalContado: 31000,
  });
  assert.equal(r.valido, true);
  assert.equal(r.totalCambio, 31000);
});

test("7c. sin conteo detallado no se inventa un tope por denominación", () => {
  // Contó por monto total: no hay contra qué comparar billete a billete, solo
  // contra el total.
  const ok = validarCambioQueQueda({
    desgloseContado: {},
    desgloseCambio: { 10000: 3 },
    totalContado: 100000,
  });
  assert.equal(ok.valido, true);

  const pasado = validarCambioQueQueda({
    desgloseContado: {},
    desgloseCambio: { 10000: 3 },
    totalContado: 20000,
  });
  assert.equal(pasado.valido, false);
  assert.match(pasado.error, /más cambio que el efectivo contado/);
});

test("8. 'Monedas / otros' respeta su límite y se compara como importe", () => {
  const r = validarCambioQueQueda({
    desgloseContado: { 10000: 1, [CLAVE_MONEDAS]: 450 },
    desgloseCambio: { 10000: 1, [CLAVE_MONEDAS]: 900 },
    totalContado: 10450,
  });
  assert.equal(r.valido, false);
  assert.match(r.error, /Monedas \/ otros \(contaste 450, querés dejar 900\)/);

  const justo = validarCambioQueQueda({
    desgloseContado: { [CLAVE_MONEDAS]: 450 },
    desgloseCambio: { [CLAVE_MONEDAS]: 450 },
    totalContado: 450,
  });
  assert.equal(justo.valido, true);

  // Decimales al centavo, sin arrastre binario.
  const centavos = validarCambioQueQueda({
    desgloseContado: { [CLAVE_MONEDAS]: 0.3 },
    desgloseCambio: { [CLAVE_MONEDAS]: 0.1 + 0.2 },
    totalContado: 0.3,
  });
  assert.equal(centavos.valido, true, "0.1+0.2 no debería exceder a 0.3");
});

test("8b. las monedas nunca son negativas ni basura", () => {
  assert.equal(normalizarMonedas(-5), 0);
  assert.equal(normalizarMonedas("abc"), 0);
  assert.equal(normalizarMonedas(""), 0);
  assert.equal(normalizarMonedas("450.50"), 450.5);
});

test("7d. corregir el conteo hacia abajo recorta el cambio, no lo deja colgado", () => {
  // Contó 5, dejó 4, después corrige el conteo a 2: no pueden quedar 4.
  const recortado = limitarCambioAlConteo({ 10000: 4, [CLAVE_MONEDAS]: 900 }, { 10000: 2, [CLAVE_MONEDAS]: 450 });
  assert.equal(recortado[10000], 2);
  assert.equal(recortado[CLAVE_MONEDAS], 450);

  // Si no excede, no se toca.
  const intacto = limitarCambioAlConteo({ 10000: 1 }, { 10000: 5 });
  assert.equal(intacto[10000], 1);
});

test("2. la grilla del cambio muestra contadas y quedan en la misma fila", () => {
  const filas = filasCambio({
    desgloseContado: { 20000: 7, 10000: 1 },
    desgloseCambio: { 20000: 1, 10000: 1 },
  });
  const f20 = filas.find((f) => f.valor === 20000);
  assert.equal(f20.contadas, 7);
  assert.equal(f20.quedan, 1);
  assert.equal(f20.subtotalQueda, 20000);
  assert.equal(f20.excede, false);
  assert.equal(filas.length, DENOMINACIONES.length);

  // Sin conteo detallado, no hay columna "contadas" que mostrar.
  const sinConteo = filasCambio({ desgloseContado: {}, desgloseCambio: { 500: 2 } });
  assert.equal(sinConteo.find((f) => f.valor === 500).contadas, null);
});

// ── Evaluación completa ─────────────────────────────────────────────────────

test("5. la evaluación no expone ninguna elección de retiro", () => {
  const ev = evaluarRetiroPorCambio({
    efectivoEsperadoAntes: 158450,
    efectivoContado: 150450,
    cambioQueQueda: 30450,
    fondoObjetivo: 30000,
  });
  assert.equal(ev.totalRetiro, 120000);
  assert.equal(ev.cambioQueQueda, 30450);
  assert.equal(ev.diferencia, -8000, "diferencia = contado − esperado");
  assert.equal(ev.efectivoEsperadoDespues, 38450);
  assert.equal(ev.sinRecaudacion, false);
  // El fondo objetivo es referencia, no meta: dejar $30.450 con objetivo
  // $30.000 no es un error.
  assert.equal(ev.distanciaAlFondoObjetivo, 450);
  assert.equal("efectivoRetirado" in ev, false, "no hay retiro elegible");
  assert.equal("retiroDistintoDeRecaudacion" in ev, false);
  assert.equal("recaudacionEsperada" in ev, false, "no se sugiere cuánto sacar");
});

test("9. contado igual al cambio: no hay recaudación y no se puede confirmar", () => {
  const ev = evaluarRetiroPorCambio({
    efectivoEsperadoAntes: 30000,
    efectivoContado: 30000,
    cambioQueQueda: 30000,
  });
  assert.equal(ev.totalRetiro, 0);
  assert.equal(ev.sinRecaudacion, true);

  const vacio = evaluarRetiroPorCambio({ efectivoContado: 0, cambioQueQueda: 0 });
  assert.equal(vacio.sinRecaudacion, true);
});

test("9b. sin fondo objetivo configurado no se inventa una distancia", () => {
  const ev = evaluarRetiroPorCambio({ efectivoContado: 100000, cambioQueQueda: 30000 });
  assert.equal(ev.fondoObjetivo, null);
  assert.equal(ev.distanciaAlFondoObjetivo, null);
  assert.equal(ev.totalRetiro, 70000);
});

test("5b. cualquier importe de cambio es válido: no hay que dar exacto", () => {
  for (const cambio of [30000, 30200, 30300, 31450]) {
    const ev = evaluarRetiroPorCambio({
      efectivoEsperadoAntes: 150000,
      efectivoContado: 150000,
      cambioQueQueda: cambio,
      fondoObjetivo: 30000,
    });
    assert.equal(ev.totalRetiro, 150000 - cambio);
    assert.equal(ev.sinRecaudacion, false);
  }
});

// ── Concurrencia: se sigue vendiendo mientras se cuenta ─────────────────────

const HUELLA_BASE = {
  turnoId: 42,
  efectivoEsperado: 158450,
  totalRetirosCaja: 0,
  cantidadVentas: 87,
  estaCerrado: false,
};

test("14. la revalidación detecta ventas nuevas", () => {
  const c = compararHuellas(HUELLA_BASE, {
    ...HUELLA_BASE,
    efectivoEsperado: 166450,
    cantidadVentas: 90,
  });
  assert.equal(c.hayCambios, true);
  assert.equal(c.ventasNuevas, true);
  assert.equal(c.otroRetiro, false);
  assert.equal(c.ventasAgregadas, 3);
  assert.equal(c.esperadoAnterior, 158450);
  assert.equal(c.esperadoActual, 166450);
  assert.equal(c.diferenciaEsperado, 8000);
  assert.equal(c.bloquea, false);
});

test("14b. la revalidación detecta OTRO retiro concurrente", () => {
  // Otro dispositivo retiró: el esperado bajó y los retiros subieron. Mirar solo
  // el esperado no permitiría distinguirlo de una devolución.
  const c = compararHuellas(HUELLA_BASE, {
    ...HUELLA_BASE,
    efectivoEsperado: 38450,
    totalRetirosCaja: 120000,
  });
  assert.equal(c.otroRetiro, true);
  assert.equal(c.ventasNuevas, false);
  assert.equal(c.hayCambios, true);
  assert.equal(c.diferenciaEsperado, -120000);
});

test("14c. sin movimientos no molesta a nadie", () => {
  const c = compararHuellas(HUELLA_BASE, { ...HUELLA_BASE });
  assert.equal(c.hayCambios, false);
  assert.equal(c.bloquea, false);
  assert.equal(c.diferenciaEsperado, 0);
});

test("15. turno cerrado bloquea la confirmación", () => {
  const c = compararHuellas(HUELLA_BASE, { ...HUELLA_BASE, estaCerrado: true });
  assert.equal(c.bloquea, true);
  assert.equal(c.turnoCerrado, true);
});

test("15b. si el turno abierto ya es otro, también bloquea", () => {
  const c = compararHuellas(HUELLA_BASE, { ...HUELLA_BASE, turnoId: 43 });
  assert.equal(c.bloquea, true);
  assert.equal(c.turnoDistinto, true);
});

test("14d. el conteo de la persona NO se corrige solo: solo la diferencia", () => {
  // Contó 150.450 cuando el esperado era 158.450. Entran ventas por 8.000.
  // Si separó la bandeja, esa plata nueva no está en lo que contó. El sistema
  // NO puede tocar el contado; recalcula la diferencia contra el esperado nuevo
  // y deja que la persona decida.
  const contado = 150450;
  const antes = recalcularDiferencia({ efectivoContado: contado, efectivoEsperadoActual: 158450 });
  const despues = recalcularDiferencia({ efectivoContado: contado, efectivoEsperadoActual: 166450 });
  assert.equal(antes, -8000);
  assert.equal(despues, -16000);

  const c = compararHuellas(HUELLA_BASE, { ...HUELLA_BASE, efectivoEsperado: 166450, cantidadVentas: 88 });
  assert.equal(c.esperadoActual, 166450);
  // La huella no contiene el contado: no hay forma de que lo pise.
  assert.equal("efectivoContado" in huellaDelTurno(HUELLA_BASE), false);
});

// ── Borrador v2 ─────────────────────────────────────────────────────────────

test("10. el borrador guarda el CAMBIO, no el retiro", () => {
  const s = storageFalso();
  const b = armarBorrador({
    turnoId: 42,
    usuarioId: 1,
    modoConteo: "BILLETES",
    montoContado: "",
    desgloseContado: { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 },
    desgloseCambio: { 20000: 1, 10000: 1, [CLAVE_MONEDAS]: 450 },
    observacion: "se lleva Marcela",
    ahora: Date.parse("2026-08-04T12:00:00Z"),
  });
  assert.equal(b.version, VERSION_BORRADOR);
  assert.deepEqual(b.desgloseCambio, { 20000: 1, 10000: 1, [CLAVE_MONEDAS]: 450 });
  assert.equal("desgloseRetiro" in b, false);
  assert.equal("importeRetiro" in b, false);
  assert.equal("modoRetiro" in b, false);
  assert.equal("paso" in b, false);
  assert.equal("pasoActual" in b, false);

  guardarBorrador(s, b);
  const leido = leerBorrador(s, { turnoId: 42, usuarioId: 1, ahora: Date.parse("2026-08-04T13:00:00Z") });
  assert.deepEqual(leido.desgloseCambio, b.desgloseCambio);
  assert.equal(leido.observacion, "se lleva Marcela");
});

test("10b. el borrador guarda la hora en que empezó el conteo", () => {
  const b = armarBorrador({
    turnoId: 42,
    usuarioId: 1,
    modoConteo: "TOTAL",
    ahora: Date.parse("2026-08-04T12:34:00Z"),
  });
  assert.equal(b.conteoIniciadoEn, "2026-08-04T12:34:00.000Z");

  // Al volver a guardar más tarde, la hora del CONTEO no se mueve.
  const otra = armarBorrador({
    turnoId: 42,
    usuarioId: 1,
    modoConteo: "TOTAL",
    conteoIniciadoEn: b.conteoIniciadoEn,
    ahora: Date.parse("2026-08-04T12:50:00Z"),
  });
  assert.equal(otra.conteoIniciadoEn, "2026-08-04T12:34:00.000Z");
  assert.equal(otra.guardadoEn, "2026-08-04T12:50:00.000Z");
});

test("10c. el borrador NO guarda estado del servidor", () => {
  const b = armarBorrador({ turnoId: 42, usuarioId: 1, modoConteo: "TOTAL", montoContado: "150450" });
  for (const prohibido of [
    "efectivoEsperado",
    "esperado",
    "diferencia",
    "totalRetiro",
    "recaudacionEsperada",
    "fondoObjetivo",
  ]) {
    assert.equal(prohibido in b, false, `el borrador no debe guardar ${prohibido}`);
  }
});

test("11. un borrador viejo NO se interpreta como cambio: se rescata el conteo y se avisa", () => {
  const viejo = {
    version: VERSION_ANTERIOR,
    turnoId: 42,
    usuarioId: 1,
    modoConteo: "BILLETES",
    montoContado: "",
    desgloseContado: { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 },
    modoRetiro: "BILLETES",
    importeRetiro: "",
    // Los billetes que se LLEVABA. Interpretarlos como los que quedan
    // convertiría un retiro de 120.000 en uno de 30.450.
    desgloseRetiro: { 20000: 6 },
    observacion: "hola",
    guardadoEn: "2026-08-04T12:00:00.000Z",
  };

  const s = storageFalso({ [claveBorrador({ turnoId: 42, usuarioId: 1 })]: JSON.stringify(viejo) });
  const leido = leerBorrador(s, { turnoId: 42, usuarioId: 1, ahora: Date.parse("2026-08-04T13:00:00Z") });

  assert.equal(leido.version, VERSION_BORRADOR);
  assert.deepEqual(leido.desgloseContado, { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 }, "el conteo sí se rescata");
  assert.deepEqual(leido.desgloseCambio, {}, "el cambio queda vacío: nunca se dedujo del retiro viejo");
  assert.equal(leido.observacion, "hola");
  assert.match(leido.avisoCompat, /versión anterior/);
  assert.match(leido.avisoCompat, /elegí de nuevo/i);

  // Y quedó reescrito en el formato nuevo, sin rastros del viejo.
  const guardado = JSON.parse(s.getItem(claveBorrador({ turnoId: 42, usuarioId: 1 })));
  assert.equal(guardado.version, VERSION_BORRADOR);
  assert.equal("desgloseRetiro" in guardado, false);
});

test("11b. un borrador viejo SIN parte de retiro se migra en silencio", () => {
  const viejo = {
    version: VERSION_ANTERIOR,
    turnoId: 42,
    usuarioId: 1,
    modoConteo: "TOTAL",
    montoContado: "150450",
    desgloseContado: {},
    modoRetiro: "TOTAL",
    importeRetiro: "",
    desgloseRetiro: {},
    observacion: "",
    guardadoEn: "2026-08-04T12:00:00.000Z",
  };
  const migrado = migrarBorradorV1(viejo, Date.parse("2026-08-04T13:00:00Z"));
  assert.equal(migrado.montoContado, "150450");
  assert.equal(migrado.avisoCompat, undefined, "no hay nada perdido que avisar");
});

test("11c. una versión desconocida se descarta entera", () => {
  const clave = claveBorrador({ turnoId: 42, usuarioId: 1 });
  const s = storageFalso({
    [clave]: JSON.stringify({ version: 99, turnoId: 42, usuarioId: 1, guardadoEn: new Date().toISOString() }),
  });
  assert.equal(leerBorrador(s, { turnoId: 42, usuarioId: 1 }), null);
  assert.equal(s.getItem(clave), null, "además lo borra");
});

test("12. guardar el borrador no toca la red ni la base", async () => {
  const fuente = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./borradorRetiro.js", import.meta.url), "utf8")
  );
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const prohibido of ["fetch(", "prisma", "XMLHttpRequest", "navigator.sendBeacon"]) {
    assert.equal(sinComentarios.includes(prohibido), false, `el borrador no debe usar ${prohibido}`);
  }
});

test("12b. un desglose manipulado a mano se sanea antes de entrar a la cuenta", () => {
  const sucio = { 20000: -3, 10000: "2", 999999: 5, [CLAVE_MONEDAS]: -10, basura: "x" };
  const limpio = sanearDesglose(sucio);
  assert.equal(limpio[20000], undefined, "una cantidad negativa no entra");
  assert.equal(limpio[10000], 2);
  assert.equal(limpio[999999], undefined, "una denominación inexistente no entra");
  assert.equal(limpio[CLAVE_MONEDAS], undefined);
  assert.equal(limpio.basura, undefined);
  assert.equal(totalDesglose(limpio), 20000);
});
