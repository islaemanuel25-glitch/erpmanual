// UNA LECTURA LENTA NO PUEDE ROMPER LA PANTALLA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/lecturasEnCurso.test.mjs
//
// ── QUÉ DEFIENDE, Y POR QUÉ NO LO VE NINGÚN OTRO CONTROL ──────────────────
//
// El 2026-09-21 la pantalla de la receta mostró "El servidor contestó 504"
// cuando la lectura se fue al techo de 45 segundos. El que contestó no fue la
// aplicación sino nginx, que corta a los 60 por default — un archivo que vive
// en otra máquina y que ningún candado de este repo puede leer.
//
// Por eso la defensa NO es un número más chico: es que no haya ningún pedido
// HTTP largo. Lo que se afirma acá es que arrancar un trabajo DEVUELVE ENSEGUIDA
// y que preguntar por él también, sin importar cuánto tarde el trabajo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  arrancarTurno,
  mirarTurno,
  olvidarTurno,
  vaciarTurnos,
  cuantosTurnos,
  relojDeTurnos,
  ESTADO_TURNO,
  TEXTO_TURNO,
  VIDA_DEL_TURNO_MS,
} from "@/lib/compras-proveedor/comprobante/lector/lecturasEnCurso";

const esperar = (ms = 0) => new Promise((listo) => setTimeout(listo, ms));

test("ARRANCAR NO ESPERA: CONTESTA AUNQUE EL TRABAJO TARDE UN MINUTO", async () => {
  vaciarTurnos();
  let terminar;
  const eterno = new Promise((listo) => (terminar = listo));

  const t0 = Date.now();
  const id = arrancarTurno({ id: "t1", trabajo: () => eterno });
  const tardo = Date.now() - t0;

  // El punto entero: arrancar cuesta lo que cuesta poner algo en un Map.
  assert.ok(tardo < 50, `arrancar tardó ${tardo} ms: está esperando el trabajo`);
  assert.equal(id, "t1");

  // Y preguntar tampoco espera.
  const t1 = Date.now();
  const estado = mirarTurno("t1");
  assert.ok(Date.now() - t1 < 50, "preguntar por el turno espera el trabajo");
  assert.equal(estado.estado, ESTADO_TURNO.LEYENDO);
  assert.equal(estado.texto, TEXTO_TURNO[ESTADO_TURNO.LEYENDO]);

  terminar({ ok: true });
  await esperar();
});

test("EL TEXTO DE LA ESPERA DICE CUÁNTO PUEDE TARDAR", () => {
  // Sin el minuto, una espera de 40 segundos se lee como que se colgó, y la
  // persona toca el botón otra vez — que gasta otra consulta de IA.
  assert.match(TEXTO_TURNO[ESTADO_TURNO.LEYENDO], /Leyendo el papel/);
  // "Unos minutos" desde el 2026-10-09: con el modelo grande, un minuto ya no
  // es el techo, y prometerlo haría que una lectura buena parezca colgada.
  assert.match(TEXTO_TURNO[ESTADO_TURNO.LEYENDO], /puede tardar unos minutos/);
  // Y ningún texto de este módulo nombra un número de HTTP.
  for (const texto of Object.values(TEXTO_TURNO)) {
    assert.ok(!/\b[45]\d\d\b/.test(texto), `un texto muestra un código HTTP: ${texto}`);
  }
});

test("CUANDO EL TRABAJO TERMINA, EL RESULTADO ESTÁ ESPERANDO", async () => {
  vaciarTurnos();
  arrancarTurno({ id: "t2", trabajo: async () => ({ ok: true, lectura: { lineas: [1, 2] } }) });
  await esperar(5);
  const estado = mirarTurno("t2");
  assert.equal(estado.estado, ESTADO_TURNO.LISTO);
  assert.equal(estado.resultado.lectura.lineas.length, 2);
  assert.ok(Number.isFinite(estado.tardoMs));
});

test("UN TRABAJO QUE EXPLOTA NO TUMBA NADA Y QUEDA COMO FALLO", async () => {
  // Nadie espera esta promesa, así que sin el `catch` sería un rechazo sin
  // manejar — y en Node eso puede matar al proceso que atiende a los locales.
  vaciarTurnos();
  arrancarTurno({ id: "t3", trabajo: async () => { throw new Error("se cayó Google"); } });
  await esperar(5);
  const estado = mirarTurno("t3");
  assert.equal(estado.estado, ESTADO_TURNO.FALLO);
  assert.match(estado.error, /se cayó Google/);
});

test("UN TURNO QUE NO EXISTE SE DICE EN CASTELLANO, NO CON UN NÚMERO", async () => {
  vaciarTurnos();
  const estado = mirarTurno("nunca-existió");
  assert.equal(estado.estado, ESTADO_TURNO.NO_ESTA);
  assert.match(estado.texto, /Se reinició el sistema/);
  // Y dice que no se perdió nada, que es lo que la persona necesita saber.
  assert.match(estado.texto, /no se guardó nada/);
});

test("EL TURNO DE OTRO NO SE PUEDE MIRAR", async () => {
  // El número de turno viaja por la barra de direcciones. Sin esto, cualquiera
  // con un turno ajeno vería la lectura de otro local.
  vaciarTurnos();
  arrancarTurno({ id: "t4", dueño: 7, trabajo: async () => ({ ok: true, secreto: 1 }) });
  await esperar(5);
  assert.equal(mirarTurno("t4", { dueño: 9 }).estado, ESTADO_TURNO.NO_ESTA);
  assert.equal(mirarTurno("t4", { dueño: 7 }).estado, ESTADO_TURNO.LISTO);
});

test("LOS TURNOS TERMINADOS NO SE ACUMULAN PARA SIEMPRE", async () => {
  // Cada lectura guarda su resultado entero —once renglones y la receta— en
  // memoria. Sin vencimiento, el proceso que atiende a los cinco locales se
  // llena de lecturas que nadie va a volver a mirar.
  vaciarTurnos();
  let t = 1_000_000;
  relojDeTurnos(() => t);
  try {
    arrancarTurno({ id: "t5", trabajo: async () => ({ ok: true }) });
    await esperar(5);
    assert.equal(mirarTurno("t5").estado, ESTADO_TURNO.LISTO);
    t += VIDA_DEL_TURNO_MS + 1;
    assert.equal(mirarTurno("t5").estado, ESTADO_TURNO.NO_ESTA, "el turno viejo no se venció");
    assert.equal(cuantosTurnos(), 0);
  } finally {
    relojDeTurnos(null);
  }
});

test("UN TURNO SIN TERMINAR NO SE VENCE, POR VIEJO QUE SEA", async () => {
  // El vencimiento es para los TERMINADOS. Vencer uno que todavía está leyendo
  // sería contestar "se reinició el sistema" sobre una lectura que está andando.
  vaciarTurnos();
  let t = 2_000_000;
  relojDeTurnos(() => t);
  try {
    let terminar;
    arrancarTurno({ id: "t6", trabajo: () => new Promise((listo) => (terminar = listo)) });
    // El trabajo arranca en una microtarea, así que `terminar` todavía no
    // existe en esta línea. Es la misma razón por la que arrancar no espera.
    await esperar();
    t += VIDA_DEL_TURNO_MS * 5;
    assert.equal(mirarTurno("t6").estado, ESTADO_TURNO.LEYENDO);
    terminar({ ok: true });
    await esperar();
  } finally {
    relojDeTurnos(null);
  }
});

test("OLVIDAR SACA EL TURNO: LA PANTALLA YA SE LO LLEVÓ", async () => {
  vaciarTurnos();
  arrancarTurno({ id: "t7", trabajo: async () => ({ ok: true }) });
  await esperar(5);
  assert.equal(mirarTurno("t7").estado, ESTADO_TURNO.LISTO);
  olvidarTurno("t7");
  assert.equal(mirarTurno("t7").estado, ESTADO_TURNO.NO_ESTA);
  assert.equal(cuantosTurnos(), 0);
});
