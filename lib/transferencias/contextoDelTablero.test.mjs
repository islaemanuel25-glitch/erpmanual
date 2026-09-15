// EL CONTEXTO DEL TABLERO VIAJA EN LA URL, Y VUELVE ENTERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/contextoDelTablero.test.mjs
//
// El defecto: entrar a una transferencia desde un período pasado y volver caía
// siempre en el período de hoy. Con 33 sin recibir de una semana pasada, eso es
// renavegar 33 veces.
//
// Acá se afirma la IDA Y VUELTA y los bordes de la validación. Que la pantalla
// de verdad restaure el contexto —y que diez flechas dejen UNA entrada en el
// historial— se mide en el arnés: eso vive en la navegación y ningún candado de
// función pura lo ve.

import { test } from "node:test";
import assert from "node:assert/strict";

import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import {
  DESPLAZAMIENTO_POR_DEFECTO,
  RUTA_CUENTA,
  esContextoPorDefecto,
  parseContextoDelTablero,
  serializarContextoDelTablero,
  urlDeVuelta,
  urlDelDetalle,
  urlDelTablero,
  vinoDelTablero,
} from "@/lib/transferencias/contextoDelTablero";

// ── 1 · LA IDA Y VUELTA ──────────────────────────────────────────────────

test("C1 · lo que se puso en la URL vuelve TAL CUAL", () => {
  const ctx = { unidad: UNIDADES.MES, desp: -3, local: 4 };
  const vuelta = parseContextoDelTablero(new URLSearchParams(serializarContextoDelTablero(ctx)));
  assert.deepEqual(vuelta, ctx);
});

test("C2 · el recorrido completo: tablero → detalle → vuelta", () => {
  // Es el caso del reporte: el depósito mirando la cuenta del local 4, tres
  // semanas atrás, entra a la transferencia 77 y vuelve.
  const ctx = { unidad: UNIDADES.SEMANA, desp: -3, local: 4 };
  const detalle = urlDelDetalle(77, ctx);
  assert.equal(detalle, "/modulos/transferencias/77?desp=-3&local=4&tab=1");

  const volver = urlDeVuelta(new URLSearchParams(detalle.split("?")[1]));
  assert.equal(volver, "/modulos/transferencias/local/4?desp=-3");
  // Y ese destino, releído, da el mismo contexto: el circuito cierra.
  assert.deepEqual(parseContextoDelTablero(new URLSearchParams("desp=-3")), {
    unidad: UNIDADES.SEMANA,
    desp: -3,
    local: null,
  });
});

test("C3 · sin local, la vuelta es a la cuenta propia", () => {
  const ctx = { unidad: UNIDADES.MES, desp: -2, local: null };
  assert.equal(urlDelDetalle(9, ctx), "/modulos/transferencias/9?unidad=MES&desp=-2&tab=1");
  assert.equal(urlDeVuelta({ unidad: "MES", desp: "-2" }), `${RUTA_CUENTA}?unidad=MES&desp=-2`);
});

// ── 2 · LOS DEFAULTS NO ENSUCIAN LA BARRA ────────────────────────────────

test("C4 · una pantalla recién abierta no escribe nada en la URL", () => {
  // `?unidad=SEMANA&desp=-1` dice lo mismo que la URL pelada y se ve como si
  // alguien hubiera navegado. Entrando desde el menú, la barra queda limpia.
  assert.equal(serializarContextoDelTablero({}), "");
  assert.equal(urlDelTablero({}), RUTA_CUENTA);
  // La MARCA va igual: es lo que distingue "vine del tablero en el período por
  // defecto" de "vine de la tabla de escritorio", que tiene su propio retorno.
  assert.equal(urlDelDetalle(5, {}), "/modulos/transferencias/5?tab=1");
  assert.equal(esContextoPorDefecto(parseContextoDelTablero({})), true);
  assert.equal(esContextoPorDefecto(parseContextoDelTablero({ desp: -2 })), false);
});

test("C5 · el local NO se escribe dos veces", () => {
  // Va en la RUTA. Repetirlo en la query sería el mismo hecho en dos lugares, y
  // dos que se pueden contradecir el día que alguien edite uno solo.
  const url = urlDelTablero({ unidad: UNIDADES.SEMANA, desp: -5, local: 7 });
  assert.equal(url, "/modulos/transferencias/local/7?desp=-5");
  assert.ok(!url.includes("local=7"));
});

// ── 3 · LO QUE VIENE DE AFUERA NO MANDA ──────────────────────────────────

test("C6 · una URL pegada a mano no puede elegir a dónde se vuelve", () => {
  // Nada de `returnTo`. Lo único que viaja es `local`, un entero, y la ruta se
  // DERIVA. Es la misma regla que `returnParams.js` de Ventas escribió primero.
  const sucia = new URLSearchParams(
    "unidad=SEMANA&desp=-2&local=3&returnTo=https://otro.com&next=/admin"
  );
  const ctx = parseContextoDelTablero(sucia);
  assert.deepEqual(ctx, { unidad: UNIDADES.SEMANA, desp: -2, local: 3 });
  const vuelta = urlDeVuelta(sucia);
  assert.ok(vuelta.startsWith("/modulos/transferencias/"), vuelta);
  assert.ok(!/otro\.com|admin/.test(vuelta), vuelta);
});

test("C7 · una unidad inventada cae en SEMANA, no rompe", () => {
  assert.equal(parseContextoDelTablero({ unidad: "QUINCENA" }).unidad, UNIDADES.SEMANA);
  assert.equal(parseContextoDelTablero({ unidad: "" }).unidad, UNIDADES.SEMANA);
  assert.equal(parseContextoDelTablero({}).unidad, UNIDADES.SEMANA);
  // Y "OTRO", que es un chip de la pantalla y NO una unidad del dominio.
  assert.equal(parseContextoDelTablero({ unidad: "OTRO" }).unidad, UNIDADES.SEMANA);
});

test("C8 · el desplazamiento tiene tope, y nunca es futuro", () => {
  // Hacia adelante no se pasa de 0: el período en curso es el último. Y hacia
  // atrás hay tope para que una URL pegada a mano no pida diez mil períodos.
  assert.equal(parseContextoDelTablero({ desp: 5 }).desp, DESPLAZAMIENTO_POR_DEFECTO);
  assert.equal(parseContextoDelTablero({ desp: -99999 }).desp, DESPLAZAMIENTO_POR_DEFECTO);
  assert.equal(parseContextoDelTablero({ desp: -120 }).desp, -120);
  assert.equal(parseContextoDelTablero({ desp: 0 }).desp, 0, "el período EN CURSO sí es válido");
  assert.equal(parseContextoDelTablero({ desp: "-3" }).desp, -3, "viene como texto de la URL");
  assert.equal(parseContextoDelTablero({ desp: "1.5" }).desp, DESPLAZAMIENTO_POR_DEFECTO);
  assert.equal(parseContextoDelTablero({ desp: "hola" }).desp, DESPLAZAMIENTO_POR_DEFECTO);
});

test("C9 · un local inválido se descarta y la vuelta es a la cuenta propia", () => {
  for (const malo of ["0", "-3", "abc", "1.5", ""]) {
    assert.equal(parseContextoDelTablero({ local: malo }).local, null, `entró ${malo}`);
  }
  assert.equal(urlDeVuelta({ local: "0", desp: "-2" }), `${RUTA_CUENTA}?desp=-2`);
});

test("C10 · un id de transferencia inválido no arma una URL rota", () => {
  for (const malo of [0, -1, "abc", null, undefined]) {
    assert.equal(urlDelDetalle(malo, { desp: -2 }), "/modulos/transferencias", `entró ${malo}`);
  }
});

// ── 4 · LOS DOS CAMINOS AL DETALLE NO SE PISAN ───────────────────────────

test("C11 · se distingue quién viene del tablero y quién de la tabla", () => {
  // Al detalle se llega desde el tablero del teléfono y desde la tabla del
  // reporte de escritorio. El segundo ya tiene su retorno en `sessionStorage` y
  // funciona: mandarlo al tablero le rompería el contexto, que es el mismo
  // defecto de esta tanda cambiado de lado.
  assert.equal(vinoDelTablero(new URLSearchParams("tab=1")), true);
  assert.equal(vinoDelTablero(new URLSearchParams("desp=-3&tab=1")), true);
  assert.equal(vinoDelTablero(new URLSearchParams("")), false, "la tabla de escritorio no manda nada");
  assert.equal(vinoDelTablero(new URLSearchParams("otro=1")), false);
  assert.equal(vinoDelTablero(null), false);
});

test("C12 · toda URL de detalle armada por el tablero se reconoce como suya", () => {
  // La contraprueba de C11: si `urlDelDetalle` dejara de poner la marca en el
  // caso del período por defecto, el botón volvería al listado de escritorio y
  // el defecto reaparecería solo en ese caso — el más común.
  for (const ctx of [{}, { desp: -3 }, { unidad: "MES" }, { local: 4 }]) {
    const url = urlDelDetalle(12, ctx);
    const qs = new URLSearchParams(url.split("?")[1] || "");
    assert.equal(vinoDelTablero(qs), true, url);
  }
});

// ── 5 · LA FORMA DEL DATO ES LA REAL, NO UN OBJETO PLANO ─────────────────

test("C13 · una URL SIN parámetros abre en el período CERRADO", () => {
  // ── EL DEFECTO QUE ESTE CANDADO CIERRA, Y ERA MÍO ──────────────────────
  //
  // `URLSearchParams.get` devuelve **null** cuando la clave no está, y
  // `Number(null)` es **0**. La primera versión daba `desp = 0` —el período EN
  // CURSO— sobre cualquier URL pelada, así que la pantalla abría en el período
  // equivocado y el rótulo decía "Acumulado" en vez de "Para cobrar".
  //
  // No se veía acá porque los demás candados pasan OBJETOS PLANOS, donde la
  // clave ausente da `undefined` y `Number(undefined)` es `NaN`, que sí se
  // descarta. La forma del dato de prueba no era la del dato real.
  const deLaUrl = parseContextoDelTablero(new URLSearchParams(""));
  assert.deepEqual(deLaUrl, { unidad: UNIDADES.SEMANA, desp: DESPLAZAMIENTO_POR_DEFECTO, local: null });
  assert.equal(deLaUrl.desp, -1, "cayó en el período EN CURSO en vez del cerrado");

  // Y las dos formas tienen que dar lo MISMO, que es lo que faltaba comprobar.
  assert.deepEqual(parseContextoDelTablero({}), deLaUrl);
  assert.deepEqual(parseContextoDelTablero(null), deLaUrl);
});

test("C14 · una clave presente pero VACÍA tampoco es un cero", () => {
  // `?desp=` llega como cadena vacía, y `Number("")` también es 0.
  const vacia = parseContextoDelTablero(new URLSearchParams("desp=&local=&unidad="));
  assert.equal(vacia.desp, DESPLAZAMIENTO_POR_DEFECTO);
  assert.equal(vacia.local, null);
  assert.equal(vacia.unidad, UNIDADES.SEMANA);
});

test("C15 · y un CERO escrito de verdad sí se respeta", () => {
  // La contracara: `?desp=0` es el período en curso pedido a propósito, y tiene
  // que seguir funcionando. Si este candado y C13 no pueden estar los dos en
  // verde, la distinción se perdió.
  assert.equal(parseContextoDelTablero(new URLSearchParams("desp=0")).desp, 0);
  assert.equal(serializarContextoDelTablero({ desp: 0 }), "desp=0");
});
