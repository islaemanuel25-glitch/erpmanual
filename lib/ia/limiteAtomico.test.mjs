// EL LÍMITE TIENE QUE SER ATÓMICO, Y ESO SE AFIRMA EN DOS NIVELES.
//
// ── LO QUE ESTE ARCHIVO PUEDE Y LO QUE NO ─────────────────────────────────
//
// Un candado no puede probar una carrera contra PostgreSQL: no hay base acá y
// fabricar una sería probar el remedo. Lo que SÍ puede es afirmar que el
// mecanismo está puesto y que nadie lo saque sin enterarse — y que el contador
// de mentira que usan los demás candados no sea más flojo que el de verdad.
//
// La carrera de verdad la corre `scripts/probar-limite-atomico.mjs`: deja el
// contador en 19 de 20, lanza 25 reservas simultáneas mezclando importador y
// comprobantes, y comprueba que exactamente una reserve. Medido el 2026-08-28:
//
//   con bloqueo .... reservaron 1, bloqueadas 24, contador final 20
//   sin bloqueo .... reservaron 21, bloqueadas 4,  contador final 40
//
// Ese segundo número es la contraprueba: sin el bloqueo se llega al DOBLE del
// tope. Si algún día la contraprueba dejara de pasarse, la prueba de arriba no
// estaría distinguiendo nada.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LLAVE_BLOQUEO_CUOTA, contadorEnMemoria } from "@/lib/ia/contadorDeIa";

const SRC = readFileSync("lib/ia/contadorDeIa.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("LA RESERVA CUENTA E INSERTA ADENTRO DE UNA TRANSACCIÓN", () => {
  // Contar y después insertar son dos operaciones: entre una y otra, otro
  // pedido puede contar lo mismo. La transacción es lo que las vuelve una.
  assert.match(SRC, /\$transaction\(/, "la reserva dejó de ser transaccional");
});

test("Y TOMA UN BLOQUEO DE POSTGRES, NO UNO DE NODE", () => {
  // Un candado dentro de Node no sirve: la aplicación puede correr en varios
  // procesos o contenedores y cada uno tendría el suyo. El único lugar que
  // todos comparten es la base.
  assert.match(SRC, /pg_advisory_xact_lock/, "se fue el bloqueo de PostgreSQL");
  // `xact` y no el de sesión: el de transacción se suelta solo al terminar,
  // también si algo explota. Con el de sesión, una excepción deja el bloqueo
  // tomado y la aplicación entera se queda esperando para siempre.
  assert.doesNotMatch(SRC, /pg_advisory_lock\(/, "un bloqueo de sesión no se suelta si algo explota");
});

test("EL BLOQUEO VA ANTES DE CONTAR", () => {
  // Después de contar ya sería tarde: la ventana que se quiere cerrar es
  // justamente la que hay entre contar y escribir.
  //
  // Se mira SOLO dentro de `reservarConsulta`. Mirando el archivo entero, el
  // `count` de `usadasHoy` —que está más arriba y solo informa, sin reservar—
  // hacía que el candado diera rojo sobre una función que no es la que decide.
  const desde = SRC.indexOf("export async function reservarConsulta");
  assert.ok(desde > 0, "no se encontró la función de reserva");
  const cuerpo = SRC.slice(desde);
  const i = cuerpo.indexOf("pg_advisory_xact_lock");
  const j = cuerpo.indexOf("llamadaLector.count");
  assert.ok(i > 0 && j > 0, "no se encontraron las dos piezas dentro de la reserva");
  assert.ok(i < j, "se cuenta antes de tomar el bloqueo: la carrera sigue abierta");
});

test("la llave del bloqueo es UNA SOLA para todos", () => {
  // Si cada procedencia usara la suya, no se estarían coordinando con nadie — y
  // eso se ve exactamente igual que funcionar, hasta el día que dos pedidos
  // simultáneos pasen el tope.
  assert.equal(typeof LLAVE_BLOQUEO_CUOTA, "number");
  const llaves = SRC.match(/pg_advisory_xact_lock\(\$\{([^}]+)\}/g) || [];
  const distintas = new Set(llaves);
  assert.ok(distintas.size <= 1, `hay ${distintas.size} llaves distintas: no se coordinan entre sí`);
});

test("EL CONTADOR EN MEMORIA TAMBIÉN HACE COLA", async () => {
  // No por concurrencia real, sino porque `reservar` es async: dos llamadas
  // pueden intercalarse entre el await y el incremento. Sin la cola, el
  // contador de mentira se pasaría del tope y los candados que ejercen el
  // límite estarían probando algo MÁS FLOJO que lo que corre de verdad.
  const contador = contadorEnMemoria({ limite: 20, usadas: 19 });
  const veinticinco = await Promise.all(
    Array.from({ length: 25 }, (_, i) => contador.reservar({ modelo: i % 2 ? "a" : "b" }))
  );
  const reservaron = veinticinco.filter((r) => r.ok).length;
  assert.equal(reservaron, 1, "reservaron de más con 19 de 20");
  assert.equal(contador.cuantasSeContaron(), 20, "el contador se pasó de 20");
});

test("y con el contador vacío, veinticinco simultáneas reservan exactamente veinte", async () => {
  const contador = contadorEnMemoria({ limite: 20 });
  const r = await Promise.all(Array.from({ length: 25 }, () => contador.reservar({ modelo: "x" })));
  assert.equal(r.filter((x) => x.ok).length, 20);
  assert.equal(r.filter((x) => !x.ok).length, 5);
  assert.equal(contador.cuantasSeContaron(), 20, "nunca 21");
});

test("LA PRUEBA DE LA CARRERA EXISTE Y NO LLAMA A NINGUNA IA", () => {
  // El script que corre la carrera de verdad. Se afirma que existe —para que no
  // se borre sin que nadie lo note— y que no toca al proveedor: escribe filas
  // del contador y nada más.
  const script = readFileSync("scripts/probar-limite-atomico.mjs", "utf8");
  assert.match(script, /pg_advisory_xact_lock/, "la prueba dejó de ejercer el bloqueo");
  assert.match(script, /--sin-bloqueo/, "se fue la contraprueba");
  assert.ok(!script.includes("generativelanguage"), "la prueba llama al proveedor");
  assert.ok(!script.includes("GEMINI_API_KEY"), "la prueba toca la clave de la IA");
  // Y limpia lo que escribe: una prueba que deja filas del contador mentiría
  // sobre la cuota del día siguiente.
  assert.match(script, /deleteMany/, "la prueba no limpia lo que escribió");
});
