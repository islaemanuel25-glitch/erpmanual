// EL LÍMITE DE LOGIN NO PUEDE DEJAR AFUERA AL QUE ENTRA BIEN.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// El 2026-08-12 Emanuel estuvo diez minutos sin poder entrar desde el celular
// mientras el sistema vendía normalmente. La causa terminó siendo su conexión de
// datos, pero investigándolo aparecieron dos cosas en el limitador que lo habrían
// producido igual, y que se arreglaron:
//
//   1. Contaba TODOS los intentos, aciertos incluidos, y sumaba ANTES de validar.
//      Diez entradas normales en 15 minutos —cambiar de ubicación, cerrar y
//      volver, dos personas en el mismo local— bloqueaban la IP sin que nadie se
//      hubiera equivocado nunca.
//
//   2. La ventana arrancaba en el PRIMER intento. Quedar bloqueado en el décimo
//      significaba esperar lo que restara de esos 15 minutos, con la persona
//      reintentando —lo único que podía hacer— y cada reintento gastando cupo.
//      El mecanismo se alimentaba solo.
//
// La lógica vive en `app/api/login/route.js` y no se puede importar sin arrastrar
// medio Next, así que estos candados reimplementan el MISMO algoritmo y fijan su
// comportamiento. Si la ruta cambia y esto no, la diferencia se ve al leerlos
// juntos — que es mejor que no tener nada fijado.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VENTANA = 15 * 60 * 1000;
const MAX = 10;

/** El mismo algoritmo que la ruta, para poder ejercerlo sin levantar Next. */
function crearLimitador(ahora = () => Date.now()) {
  const intentos = new Map();
  return {
    bloqueado(ip) {
      const e = intentos.get(ip);
      if (!e) return false;
      if (ahora() > e.resetAt) { intentos.delete(ip); return false; }
      return e.count >= MAX;
    },
    registrar(ip) {
      const now = ahora();
      const e = intentos.get(ip);
      if (!e || now > e.resetAt) { intentos.set(ip, { count: 1, resetAt: now + VENTANA }); return; }
      e.count += 1;
      e.resetAt = now + VENTANA;
    },
    perdonar(ip) {
      const e = intentos.get(ip);
      if (!e) return;
      e.count = Math.max(0, e.count - 1);
    },
    cuenta: (ip) => intentos.get(ip)?.count ?? 0,
  };
}

test("DIEZ ENTRADAS BIEN NO BLOQUEAN A NADIE", () => {
  // Es el caso real: cambiar de ubicación, cerrar y volver, dos personas en el
  // mismo local. Ninguna es un intento de adivinar una contraseña.
  const l = crearLimitador();
  for (let i = 0; i < 10; i++) {
    assert.equal(l.bloqueado("1.2.3.4"), false, `entrada ${i + 1}`);
    l.registrar("1.2.3.4");
    l.perdonar("1.2.3.4"); // entró bien
  }
  assert.equal(l.bloqueado("1.2.3.4"), false, "diez entradas buenas no bloquean");
  assert.equal(l.cuenta("1.2.3.4"), 0);
});

test("diez intentos FALLIDOS sí bloquean, que es para lo que existe", () => {
  const l = crearLimitador();
  for (let i = 0; i < 10; i++) l.registrar("1.2.3.4");
  assert.equal(l.bloqueado("1.2.3.4"), true);
});

test("un acierto entre fallidos devuelve UN cupo, no los limpia todos", () => {
  // Perdonar todo sería regalarle al que adivina una contraseña la posibilidad
  // de seguir probando desde cero.
  const l = crearLimitador();
  for (let i = 0; i < 9; i++) l.registrar("1.2.3.4");
  l.registrar("1.2.3.4");
  l.perdonar("1.2.3.4");
  assert.equal(l.cuenta("1.2.3.4"), 9);
  assert.equal(l.bloqueado("1.2.3.4"), false, "queda uno de margen");
});

test("LA VENTANA CORRE DESDE EL ÚLTIMO INTENTO", () => {
  // Antes arrancaba en el primero: bloquearse en el décimo obligaba a esperar lo
  // que restara, no quince minutos.
  let t = 1_000_000;
  const l = crearLimitador(() => t);
  for (let i = 0; i < 10; i++) { l.registrar("1.2.3.4"); t += 1000; }
  assert.equal(l.bloqueado("1.2.3.4"), true);

  // Catorce minutos después del último: sigue bloqueado.
  t += 14 * 60 * 1000;
  assert.equal(l.bloqueado("1.2.3.4"), true);

  // Pasados los quince desde el último, se destraba.
  t += 61 * 1000;
  assert.equal(l.bloqueado("1.2.3.4"), false);
});

test("insistir NO acorta la espera", () => {
  // El desincentivo que un límite de intentos tiene que dar: el que sigue
  // probando corre su propio reloj hacia adelante.
  let t = 1_000_000;
  const l = crearLimitador(() => t);
  for (let i = 0; i < 10; i++) l.registrar("1.2.3.4");
  t += 10 * 60 * 1000;
  l.registrar("1.2.3.4"); // insiste a los diez minutos
  t += 6 * 60 * 1000; // y espera seis más: 16 desde el primero, 6 desde el último
  assert.equal(l.bloqueado("1.2.3.4"), true, "el reloj corre desde el último");
});

test("cada IP tiene su propio cupo", () => {
  const l = crearLimitador();
  for (let i = 0; i < 10; i++) l.registrar("1.2.3.4");
  assert.equal(l.bloqueado("1.2.3.4"), true);
  assert.equal(l.bloqueado("5.6.7.8"), false);
});

// ── QUE LA RUTA SIGA HACIENDO ESTO ─────────────────────────────────────────

test("la ruta perdona el acierto y corre la ventana desde el último intento", () => {
  // Sin esto, los candados de arriba fijarían un algoritmo que la ruta ya no usa.
  const fuente = readFileSync(new URL("../../app/api/login/route.js", import.meta.url), "utf8");
  assert.match(fuente, /perdonarIntento\(ip\);/, "el acierto tiene que devolver el cupo");
  assert.match(fuente, /entry\.resetAt = now \+ LOGIN_RATE_WINDOW_MS;/, "la ventana corre desde el último");
  assert.match(fuente, /const LOGIN_RATE_MAX = 10;/);
});
