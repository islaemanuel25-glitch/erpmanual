// UN CORTE DE RED NO ES "SE FUE EL OPERADOR".
//
//   node --import ./scripts/alias-loader.mjs --test lib/operador-revalidacion.test.mjs
//
// La pantalla revalida el operador cada 2 minutos y al volver el foco. Antes,
// sin red, el operador quedaba en null: en el POS el carrito de A desaparecía
// de la pantalla en medio de una venta sin conexión, y un carrito viejo sin
// dueño podía restaurarse y quedar cobrable. Acá se ejerce la función real que
// usa hooks/useOperadorActivo.js y, con ella, la carga del carrito real
// (lib/pos-ventas/carritoPorCaja.js) en el orden en que la pantalla las llama.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { estadoTrasRevalidar, leerRespuestaOperador, SIN_RESPUESTA } from "@/lib/operador-revalidacion";
import {
  cargarCarritoDeIdentidad,
  guardarCarritoDeCaja,
  claveBorrador,
  CLAVE_BORRADOR_LEGADO,
} from "@/lib/pos-ventas/carritoPorCaja";

const OP_A = { operadorId: 1, nombre: "Ana", localId: 5 };
const CON_A = { operador: OP_A, voucher: "vA", sinConexion: false };
const NADIE = { operador: null, voucher: null, sinConexion: false };

const respuesta = (status, cuerpo) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    if (cuerpo === undefined) throw new SyntaxError("no es JSON");
    return cuerpo;
  },
});

test("sin red: se conserva el último operador validado y se marca sinConexion", () => {
  assert.deepEqual(estadoTrasRevalidar(CON_A, SIN_RESPUESTA), { operador: OP_A, voucher: "vA", sinConexion: true });
  // Varias revalidaciones fallidas seguidas no lo pierden.
  let e = CON_A;
  for (let i = 0; i < 5; i++) e = estadoTrasRevalidar(e, SIN_RESPUESTA);
  assert.equal(e.operador, OP_A);
});

test("sin red y sin operador previo: no se inventa ninguno", () => {
  assert.deepEqual(estadoTrasRevalidar(NADIE, SIN_RESPUESTA), { operador: null, voucher: null, sinConexion: true });
});

test("el servidor contestó que no hay operador: null, aunque antes hubiera", () => {
  assert.deepEqual(estadoTrasRevalidar(CON_A, { ok: false, operador: null }), NADIE);
});

test("vuelve la red: decide la respuesta, no lo conservado", () => {
  const sinRed = estadoTrasRevalidar(CON_A, SIN_RESPUESTA);
  const opB = { operadorId: 2, nombre: "Beto", localId: 5 };
  assert.deepEqual(estadoTrasRevalidar(sinRed, { ok: true, operador: opB, voucher: "vB" }),
    { operador: opB, voucher: "vB", sinConexion: false });
  assert.deepEqual(estadoTrasRevalidar(sinRed, { ok: false }), NADIE, "el PIN venció mientras no había red");
});

test("qué cuenta como 'no se pudo preguntar'", async () => {
  assert.equal(await leerRespuestaOperador(respuesta(502)), SIN_RESPUESTA);
  assert.equal(await leerRespuestaOperador(respuesta(500, { ok: false })), SIN_RESPUESTA);
  assert.equal(await leerRespuestaOperador(respuesta(200)), SIN_RESPUESTA, "un 200 que no es JSON no es una respuesta");
  assert.equal(await leerRespuestaOperador(null), SIN_RESPUESTA);
  // Un 4xx sí es una respuesta: el servidor dijo que no.
  assert.deepEqual(await leerRespuestaOperador(respuesta(401)), { ok: false });
  assert.deepEqual(await leerRespuestaOperador(respuesta(200, { ok: true, operador: OP_A })), { ok: true, operador: OP_A });
});

// ── El carrito de A durante el corte ────────────────────────────────────────

function almacenamiento(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("CARRITO: A arma, se corta la red, la pantalla sigue en la caja de A y el viejo no aparece", () => {
  const LOCAL = 5;
  const CUENTA = 9;
  const viejo = JSON.stringify({ localId: LOCAL, userId: CUENTA, carrito: [{ nombre: "VIEJO" }] });
  const s = almacenamiento({ [CLAVE_BORRADOR_LEGADO]: viejo });
  const identidad = (estado) => ({ localId: LOCAL, userId: CUENTA, operadorId: estado.operador?.operadorId ?? null });

  // A entra y arma.
  let estado = CON_A;
  const cajaA = cargarCarritoDeIdentidad(s, identidad(estado));
  guardarCarritoDeCaja(s, cajaA, { localId: LOCAL, userId: CUENTA, carrito: [{ nombre: "YERBA" }] });

  // Se corta la red: la revalidación no puede preguntar.
  estado = estadoTrasRevalidar(estado, SIN_RESPUESTA);
  const durante = cargarCarritoDeIdentidad(s, identidad(estado));
  assert.equal(durante.clave, cajaA.clave, "la identidad del carrito no cambió");
  assert.deepEqual(durante.borrador.carrito, [{ nombre: "YERBA" }], "el carrito de A sigue a la vista");
  assert.equal(s.getItem(CLAVE_BORRADOR_LEGADO), viejo, "el borrador viejo no se restauró ni se mudó");
  assert.equal(s.getItem(claveBorrador({ localId: LOCAL, userId: CUENTA, operadorId: null })), null);

  // CONTRAPRUEBA: con la regla de antes —falla = null— la pantalla pasaba a la
  // caja de la cuenta y se llevaba el borrador viejo.
  const s2 = almacenamiento({ [CLAVE_BORRADOR_LEGADO]: viejo });
  const comoAntes = cargarCarritoDeIdentidad(s2, { localId: LOCAL, userId: CUENTA, operadorId: null });
  assert.notEqual(comoAntes.clave, cajaA.clave);
  assert.deepEqual(comoAntes.borrador.carrito, [{ nombre: "VIEJO" }]);
  assert.equal(s2.getItem(CLAVE_BORRADOR_LEGADO), null);

  // Vuelve la red con A todavía activo: todo sigue igual.
  estado = estadoTrasRevalidar(estado, { ok: true, operador: OP_A, voucher: "vA2" });
  assert.equal(cargarCarritoDeIdentidad(s, identidad(estado)).clave, cajaA.clave);
});

// ── El hook usa ESTA función, leído SIN comentarios ─────────────────────────
test("hooks/useOperadorActivo.js revalida con estadoTrasRevalidar y no pone null ante un error", () => {
  const hook = readFileSync("hooks/useOperadorActivo.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(hook, /from "@\/lib\/operador-revalidacion"/);
  assert.match(hook, /leerRespuestaOperador\(res\)/);
  assert.match(hook, /setEstado\(\(previo\) => estadoTrasRevalidar\(previo, respuesta\)\)/);
  const captura = hook.slice(hook.indexOf("} catch {"), hook.indexOf("} finally {"));
  assert.match(captura, /setEstado\(\(previo\) => estadoTrasRevalidar\(previo, SIN_RESPUESTA\)\)/,
    "sin red, el estado se calcula con estadoTrasRevalidar");
  assert.doesNotMatch(captura, /set\w+\(\s*null|SIN_OPERADOR/, "el catch volvió a borrar el operador");
  // Y la única otra escritura del estado es el logout.
  assert.equal(hook.split("setEstado(").length - 1, 3);
});
