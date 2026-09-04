// Candados del formato de fechas e importes de ofertas.
// node --test lib/ofertas/formato.test.mjs
//
// El que más importa es el de la zona horaria. El contenedor corre en UTC, y una
// fecha formateada sin decir la zona sale con tres horas de menos: una oferta
// que termina el 11 a las 23:00 se mostraría terminando el 12. Es exactamente el
// defecto que `rangoArgentina.js` documenta haber sufrido en los filtros.
import test from "node:test";
import assert from "node:assert/strict";
import {
  fechaCorta,
  fechaHora,
  formatearRangoOferta,
  pesos,
  porcentaje,
  paraInputFechaHora,
  desdeInputFechaHora,
} from "./formato.js";

test("el rango se escribe como en el pedido", () => {
  assert.equal(
    formatearRangoOferta("2026-09-04T00:00:00-03:00", "2026-09-11T23:59:00-03:00"),
    "04/09 → 11/09"
  );
});

test("las 23:00 argentinas del 11 NO se muestran como el 12", () => {
  // En UTC esa fecha es el 12 a las 02:00. Sin zona explícita, esto daría 12/09.
  assert.equal(fechaCorta("2026-09-11T23:00:00-03:00"), "11/09");
});

test("la medianoche argentina se muestra en su día, no en el anterior", () => {
  assert.equal(fechaCorta("2026-09-04T00:00:00-03:00"), "04/09");
});

test("la fecha con hora conserva la hora argentina, en reloj de 24", () => {
  assert.equal(fechaHora("2026-09-04T08:30:00-03:00"), "04/09/2026 08:30");
  assert.equal(fechaHora("2026-09-04T20:30:00-03:00"), "04/09/2026 20:30");
});

test("una fecha ilegible no imprime 'Invalid Date'", () => {
  assert.equal(fechaCorta("no es fecha"), "—");
  assert.equal(fechaHora(null), "—");
});

// ── Importes y porcentajes ───────────────────────────────────────────────────
test("los pesos llevan separador argentino y dos decimales", () => {
  assert.equal(pesos(8100), "$8.100,00");
  assert.equal(pesos(900), "$900,00");
  assert.equal(pesos(0), "$0,00");
});

test("un importe ilegible no imprime NaN, y uno AUSENTE no imprime $0,00", () => {
  assert.equal(pesos(undefined), "—");
  assert.equal(pesos("hola"), "—");
  // Number(null) es 0: sin un chequeo explícito, un importe que no vino se
  // imprimiría como "$0,00", que es una afirmación y no una ausencia.
  assert.equal(pesos(null), "—");
  assert.equal(pesos(""), "—");
  assert.equal(pesos(0), "$0,00", "pero un cero de verdad SÍ se muestra");
});

test("el porcentaje con signo se usa para la variación de costo", () => {
  assert.equal(porcentaje(26.15, { conSigno: true }), "+26,15 %");
  assert.equal(porcentaje(-10, { conSigno: true }), "-10 %");
  assert.equal(porcentaje(10), "10 %");
  // Mismo agujero que en los pesos: null NO es cero por ciento.
  assert.equal(porcentaje(null), "—");
  assert.equal(porcentaje(undefined), "—");
  assert.equal(porcentaje(0), "0 %", "pero un cero de verdad SÍ se muestra");
});

// ── Ida y vuelta del campo de fecha y hora ───────────────────────────────────
test("el input muestra la hora ARGENTINA, no la UTC", () => {
  // 08:00 argentinas = 11:00 UTC. `toISOString().slice(0,16)` daría "T11:00".
  assert.equal(paraInputFechaHora("2026-09-04T08:00:00-03:00"), "2026-09-04T08:00");
});

test("abrir y guardar sin tocar nada NO corre la fecha tres horas", () => {
  const original = "2026-09-04T08:00:00.000-03:00";
  const enElInput = paraInputFechaHora(original);
  const devuelta = desdeInputFechaHora(enElInput);
  assert.equal(new Date(devuelta).getTime(), new Date(original).getTime());
});

test("la medianoche va y vuelve entera", () => {
  const original = "2026-09-04T00:00:00.000-03:00";
  assert.equal(paraInputFechaHora(original), "2026-09-04T00:00");
  assert.equal(new Date(desdeInputFechaHora("2026-09-04T00:00")).getTime(), new Date(original).getTime());
});

test("lo que escribe la persona se interpreta como hora argentina", () => {
  assert.equal(desdeInputFechaHora("2026-09-04T08:00"), "2026-09-04T11:00:00.000Z");
});

test("un texto que no es una fecha del input devuelve null en vez de una fecha inventada", () => {
  assert.equal(desdeInputFechaHora(""), null);
  assert.equal(desdeInputFechaHora("2026-09-04"), null);
  assert.equal(desdeInputFechaHora("cualquier cosa"), null);
});
