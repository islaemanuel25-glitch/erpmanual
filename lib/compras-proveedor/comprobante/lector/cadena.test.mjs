// Candados del titular y el respaldo.
//
// Lo que se protege: que el pase sea EXPLÍCITO —solo cuota o servicio caído— y
// que quede registrado cuál leyó y por qué se pasó.

import { test } from "node:test";
import assert from "node:assert/strict";

import { armarCadena, leerConCadena, correspondePasarAlRespaldo, MOTIVOS_QUE_PASAN } from "./cadena.js";
import { registrarLector, normalizarLectura, MOTIVO_LECTURA } from "./contrato.js";

/** Un lector de prueba que falla como se le diga. */
function registrarFalso(nombre, comportamiento) {
  registrarLector(nombre, () => ({
    nombre: `modelo-${nombre}`,
    disponible: () => ({ ok: true }),
    leer: async () => comportamiento(),
  }));
}

const LECTURA_OK = () => ({
  ok: true,
  lectura: normalizarLectura({ lineas: [{ cantidad: 1, netoUnitario: 2, subtotalImpreso: 2 }], pie: { total: 2 } }),
});

registrarFalso("t-ok", LECTURA_OK);
registrarFalso("t-sin-cuota", () => ({ ok: false, motivo: MOTIVO_LECTURA.CUOTA_AGOTADA }));
registrarFalso("t-caido", () => ({ ok: false, motivo: MOTIVO_LECTURA.SERVICIO_CAIDO }));
registrarFalso("t-ilegible", () => ({ ok: false, motivo: MOTIVO_LECTURA.RESPUESTA_ILEGIBLE }));
registrarFalso("t-no-soportado", () => ({ ok: false, motivo: MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO }));
registrarFalso("r-ok", LECTURA_OK);

const leer = (titular, respaldo) =>
  leerConCadena({ cadena: armarCadena({ titular, respaldo, env: {} }), archivo: {}, receta: {} });

// ── Cuándo se pasa y cuándo no ─────────────────────────────────────────────

test("si el titular anda, el respaldo NI SE TOCA", async () => {
  const r = await leer("t-ok", "r-ok");
  assert.equal(r.ok, true);
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.lector, "modelo-t-ok");
});

test("SIN CUOTA SE PASA AL RESPALDO, y queda por qué", async () => {
  const r = await leer("t-sin-cuota", "r-ok");
  assert.equal(r.ok, true);
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.porQuePaso, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(r.lector, "modelo-r-ok");
});

test("con el servicio caído también se pasa", async () => {
  const r = await leer("t-caido", "r-ok");
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.porQuePaso, MOTIVO_LECTURA.SERVICIO_CAIDO);
});

test("UNA RESPUESTA ILEGIBLE NO PASA AL RESPALDO", () => {
  // El candado que importa. El titular CONTESTÓ, pero mal: eso es calidad de
  // lectura, no disponibilidad. Pasar al respaldo convertiría "el modelo se
  // equivocó" en "probemos hasta que alguno diga algo", y el que dijera algo
  // ganaría por insistencia y no por acertar.
  return leer("t-ilegible", "r-ok").then((r) => {
    assert.equal(r.ok, false);
    assert.equal(r.usoRespaldo, false);
    assert.equal(r.motivo, MOTIVO_LECTURA.RESPUESTA_ILEGIBLE);
  });
});

test("un archivo no soportado tampoco pasa: es capacidad, no falla", async () => {
  const r = await leer("t-no-soportado", "r-ok");
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.ARCHIVO_NO_SOPORTADO);
});

test("la lista de motivos que pasan es SOLO esos dos", () => {
  assert.deepEqual([...MOTIVOS_QUE_PASAN].sort(), [MOTIVO_LECTURA.CUOTA_AGOTADA, MOTIVO_LECTURA.SERVICIO_CAIDO].sort());
  assert.equal(correspondePasarAlRespaldo(MOTIVO_LECTURA.RESPUESTA_ILEGIBLE), false);
  assert.equal(correspondePasarAlRespaldo(MOTIVO_LECTURA.NO_CONFIGURADO), false);
  assert.equal(correspondePasarAlRespaldo(undefined), false);
});

// ── Los casos degenerados ──────────────────────────────────────────────────

test("SIN RESPALDO CONFIGURADO la cadena tiene un eslabón y se comporta igual", async () => {
  const r = await leer("t-sin-cuota", undefined);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(r.respaldoDisponible, false);
});

test("NO HAY RESPALDO POR DEFECTO", () => {
  // Elegir en silencio un segundo proveedor sería mandarle datos a un servicio
  // que nadie eligió.
  const c = armarCadena({ titular: "t-ok", respaldo: undefined, env: {} });
  assert.equal(c.respaldo, null);
});

test("EL MISMO LECTOR DE LOS DOS LADOS NO ES UN RESPALDO", () => {
  // Si se quedó sin cuota, se va a quedar sin cuota otra vez.
  const c = armarCadena({ titular: "t-ok", respaldo: "t-ok", env: {} });
  assert.equal(c.respaldoInutil, true);
});

test("con respaldo inútil no se intenta dos veces", async () => {
  const r = await leer("t-sin-cuota", "t-sin-cuota");
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.respaldoDisponible, false);
});

test("SI EL TITULAR NO ESTÁ CONFIGURADO, NO LO TAPA EL RESPALDO", async () => {
  // Taparlo dejaría al titular sin usar sin que nadie se entere: el sistema
  // andaría, con el proveedor equivocado, para siempre.
  const r = await leerConCadena({
    cadena: armarCadena({ titular: "", respaldo: "r-ok", env: {} }),
    archivo: {},
    receta: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.usoRespaldo, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.SIN_LECTOR);
});

test("si fallan los dos, se informa el fallo del SEGUNDO", async () => {
  const r = await leer("t-sin-cuota", "t-caido");
  assert.equal(r.ok, false);
  assert.equal(r.usoRespaldo, true);
  assert.equal(r.porQuePaso, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(r.motivo, MOTIVO_LECTURA.SERVICIO_CAIDO);
});

test("el respaldo mal configurado se detecta al ARMAR, no al necesitarlo", () => {
  // Descubrirlo justo cuando el titular se cayó es el peor momento.
  const c = armarCadena({ titular: "t-ok", respaldo: "no-existe-este", env: {} });
  assert.equal(c.respaldo.ok, false);
  assert.match(c.respaldo.queHacer, /no existe/i);
});
