// CONTROLAR ES OTRO OBJETIVO, NO UN RANGO EN CERO.
//
// ── EL CASO QUE LO ORIGINA ─────────────────────────────────────────────────
//
// Emanuel subió una lista de Arcor con el rango en 0 % a 0 %, a propósito:
// quería ver si la lista coincidía con sus costos. El rango 0–0 es válido para
// `rangoValido` —0 ≤ 0— así que el motor siguió como si nada, y ahí se rompió en
// silencio: para elegir la columna de precio, una fila solo cuenta como
// "explicada" si el precio da EXACTAMENTE el costo de hoy, al centavo.
//
// Con redondeo eso no pasa casi nunca. Las dos columnas de Arcor —sin IVA y con
// IVA— sacaron cero, ninguna llegó a la mayoría mínima, y el motor le pasó la
// decisión al usuario con "coincide en 0 de cada 100" en las dos opciones.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/modoDeLaLista.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  AVISO_CERO_A_CERO,
  CONTROL,
  MODO_LISTA,
  ORDEN_CONTROL,
  TEXTO_CONTROL,
  coincideConElCosto,
  compararConLaLista,
  diferenciaContraElCosto,
  elCeroACeroEsUnControl,
  esModoValido,
  fueUnCeroACeroConvertido,
  modoDeImportacion,
  recomendarPorCercania,
  resolverModo,
  textoDelRango,
} from "./modoDeLaLista.js";

// ── LA TOLERANCIA ─────────────────────────────────────────────────────────

test("un precio idéntico al costo coincide", () => {
  assert.equal(coincideConElCosto(11049.39, 11049.39), true);
});

test("LA TOLERANCIA ES DOBLE, Y NINGUNA DE LAS DOS SOLA ALCANZA", () => {
  // En un producto de $35.000, medio por ciento son $177 y eso NO es redondeo:
  // con una tolerancia solo en pesos, $177 de diferencia pasaría como igual si
  // el umbral fuera porcentual sobre otro producto. Y en uno de $50, un peso es
  // el 2 % y sí es redondeo.
  //
  // Caso grande: $35.364,59 contra $35.400 son $35 de diferencia, 0,1 % → igual.
  assert.equal(coincideConElCosto(35364.59, 35400), true);
  // Y $35.364,59 contra $36.000 son $635, 1,8 % → distinto.
  assert.equal(coincideConElCosto(35364.59, 36000), false);

  // Caso chico: $50 contra $50,80 son 80 centavos, 1,6 % — pasa POR PESOS.
  assert.equal(coincideConElCosto(50, 50.8), true);
  // Con una tolerancia solo porcentual del 0,5 %, ése habría dado distinto.
  assert.ok((0.8 / 50) * 100 > 0.5, "el caso chico tiene que superar el 0,5 %");

  // Y $50 contra $53 son $3, 6 % — no pasa por ninguna de las dos.
  assert.equal(coincideConElCosto(50, 53), false);
});

test("sin costo cargado no se puede comparar, y no se inventa un veredicto", () => {
  assert.equal(coincideConElCosto(0, 100), false);
  assert.equal(coincideConElCosto(null, 100), false);
  assert.equal(compararConLaLista({ costoActual: 0, precio: 100 }), null);
  assert.equal(compararConLaLista({ costoActual: 1000, precio: null }), null);
});

// ── LAS TRES SITUACIONES ──────────────────────────────────────────────────

test("la lista dice más, dice menos, o dice lo mismo", () => {
  assert.equal(compararConLaLista({ costoActual: 1000, precio: 1000 }), CONTROL.COINCIDE);
  assert.equal(compararConLaLista({ costoActual: 1000, precio: 1200 }), CONTROL.TU_COSTO_MAS_BAJO);
  assert.equal(compararConLaLista({ costoActual: 1000, precio: 800 }), CONTROL.TU_COSTO_MAS_ALTO);
});

test("una diferencia de redondeo NO se llama diferencia", () => {
  // Es lo que separa el modo controlar de un rango en cero: con 0–0, $1.000,50
  // contra $1.000 era "aumento alto". Acá es lo mismo.
  assert.equal(compararConLaLista({ costoActual: 1000, precio: 1000.5 }), CONTROL.COINCIDE);
  assert.equal(compararConLaLista({ costoActual: 1000, precio: 999.5 }), CONTROL.COINCIDE);
});

test("el caso real de Emanuel: Cofler Air con la columna equivocada", () => {
  // Costo de hoy $35.364,59 por caja de 20; la lista sin IVA da $1.684,03 por
  // unidad, o sea $33.680,60 la caja: −4,8 %. No coincide, y el veredicto es
  // que su costo es más alto que lo que dice la lista.
  const caja = 1684.03 * 20;
  assert.equal(
    compararConLaLista({ costoActual: 35364.59, precio: caja }),
    CONTROL.TU_COSTO_MAS_ALTO
  );
  const d = diferenciaContraElCosto({ costoActual: 35364.59, precio: caja });
  assert.equal(d.pct, -4.8, `dio ${d.pct}`);
  assert.ok(d.pesos < 0);
});

test("el orden nombra las tres situaciones y ninguna de más", () => {
  assert.deepEqual([...ORDEN_CONTROL].sort(), Object.values(CONTROL).sort());
  for (const c of ORDEN_CONTROL) assert.ok(TEXTO_CONTROL[c]?.titulo, `${c} sin texto`);
});

// ── EL 0–0 CARGADO A MANO ─────────────────────────────────────────────────

test("0 A 0 ES UN CONTROL, y se avisa en vez de cambiar de modo en silencio", () => {
  const r = resolverModo({ modoPedido: MODO_LISTA.ACTUALIZAR, minPct: 0, maxPct: 0 });
  assert.equal(r.modo, MODO_LISTA.CONTROLAR);
  assert.equal(r.aviso, AVISO_CERO_A_CERO);
  assert.match(r.aviso, /0 %/);
  assert.match(r.aviso, /cuánto suele aumentar/);
});

test("UN RANGO VACÍO NO ES UN 0 A 0", () => {
  // `Number(null)` y `Number("")` dan 0 los dos, y los dos pasan `isFinite`. Sin
  // el corte por vacío, un formulario a medio llenar en modo actualizar se
  // convertía en un control, con un aviso diciéndole a la persona que puso 0 %
  // cuando no puso nada.
  assert.equal(elCeroACeroEsUnControl({ minPct: null, maxPct: null }), false);
  assert.equal(elCeroACeroEsUnControl({ minPct: "", maxPct: "" }), false);
  assert.equal(elCeroACeroEsUnControl({ minPct: 0, maxPct: null }), false, "medio vacío tampoco");
  assert.equal(elCeroACeroEsUnControl({}), false);

  // Y el cero de verdad sigue contando, escrito como lo manda un formulario.
  assert.equal(elCeroACeroEsUnControl({ minPct: "0", maxPct: "0" }), true);
  assert.equal(elCeroACeroEsUnControl({ minPct: 0, maxPct: 0 }), true);

  // La consecuencia, que es lo que se vería: un envío sin rango en modo
  // actualizar sigue siendo de actualizar y falla por configuración incompleta,
  // que es un mensaje que dice qué falta.
  assert.equal(resolverModo({ modoPedido: MODO_LISTA.ACTUALIZAR, minPct: "", maxPct: "" }).modo,
    MODO_LISTA.ACTUALIZAR);
});

test("un 0 a 15 es un rango de verdad y NO es un control", () => {
  // "Que no baje y que no suba más de 15" es una lista de actualizar normal. Si
  // esto se tomara por control, un proveedor que a veces no aumenta quedaría sin
  // poder actualizar nunca.
  assert.equal(elCeroACeroEsUnControl({ minPct: 0, maxPct: 15 }), false);
  const r = resolverModo({ modoPedido: MODO_LISTA.ACTUALIZAR, minPct: 0, maxPct: 15 });
  assert.equal(r.modo, MODO_LISTA.ACTUALIZAR);
  assert.equal(r.aviso, null);
});

test("pedir controlar no necesita rango ni deja aviso", () => {
  const r = resolverModo({ modoPedido: MODO_LISTA.CONTROLAR });
  assert.equal(r.modo, MODO_LISTA.CONTROLAR);
  assert.equal(r.aviso, null);
});

test("un rango normal sigue siendo de actualizar", () => {
  const r = resolverModo({ modoPedido: MODO_LISTA.ACTUALIZAR, minPct: 10, maxPct: 20 });
  assert.equal(r.modo, MODO_LISTA.ACTUALIZAR);
  assert.equal(r.aviso, null);
});

test("LOS DOS CONTROLES SE DISTINGUEN DESPUÉS, SIN UNA COLUMNA MÁS", () => {
  // El aviso del 0 a 0 tiene que sobrevivir a la navegación: se sube la lista,
  // se cae en el resultado, y una semana después alguien abre esa importación y
  // el aviso sigue explicando por qué es un control. Sin esto habría que
  // guardarlo en una columna, y una columna más es una más que mantener de
  // acuerdo con las otras dos.
  const elegido = { modo: MODO_LISTA.CONTROLAR, aumentoEsperadoMinPct: null, aumentoEsperadoMaxPct: null };
  const convertido = { modo: MODO_LISTA.CONTROLAR, aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 0 };

  assert.equal(fueUnCeroACeroConvertido(convertido), true);
  assert.equal(fueUnCeroACeroConvertido(elegido), false, "elegirlo a mano no lleva aviso");

  // Y una lista de actualizar no es un control por más que su rango sea raro.
  assert.equal(
    fueUnCeroACeroConvertido({ modo: MODO_LISTA.ACTUALIZAR, aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 0 }),
    false
  );
  assert.equal(fueUnCeroACeroConvertido({}), false, "una importación vieja no es un control");
  assert.equal(
    fueUnCeroACeroConvertido({ modo: MODO_LISTA.CONTROLAR, aumentoEsperadoMinPct: 10, aumentoEsperadoMaxPct: 20 }),
    false
  );
});

// ── LA FRASE QUE NO PUEDE VOLVER A APARECER ───────────────────────────────

test('NUNCA SE DICE "entre 0,0 % y 0,0 %"', () => {
  // Es la frase que Emanuel vio 213 veces. No es solo fea: es FALSA. Dice que
  // este proveedor suele aumentar entre cero y cero, cuando lo que pasó es que
  // nadie cargó ningún aumento esperado porque la lista se subió a controlar.
  const comoLaPantalla = (n) => `${Number(n).toFixed(1).replace(".", ",")} %`;

  assert.equal(textoDelRango({ minPct: 0, maxPct: 0 }, comoLaPantalla), "");
  assert.equal(textoDelRango({ minPct: "0", maxPct: "0" }, comoLaPantalla), "");
  assert.equal(textoDelRango({ minPct: null, maxPct: null }, comoLaPantalla), "");
  assert.equal(textoDelRango({}, comoLaPantalla), "");
  assert.equal(textoDelRango(undefined, comoLaPantalla), "");

  // CONTRAPRUEBA: el formateador es el de la pantalla y produciría la frase mala
  // si `textoDelRango` la dejara pasar. Sin esto, el candado de arriba pasaría
  // igual con una función que devuelve "" para todo.
  assert.equal(
    `entre ${comoLaPantalla(0)} y ${comoLaPantalla(0)}`,
    "entre 0,0 % y 0,0 %",
    "el formateador de la prueba ya no arma la frase que se está prohibiendo"
  );
});

test("un rango de verdad SÍ se dice", () => {
  // La otra mitad, y hace falta: una función que devolviera "" siempre pasaría
  // el candado de arriba y dejaría a todas las pantallas sin decir el rango.
  const comoLaPantalla = (n) => `${Number(n).toFixed(1).replace(".", ",")} %`;
  assert.equal(textoDelRango({ minPct: 5, maxPct: 8 }, comoLaPantalla), "entre 5,0 % y 8,0 %");
  assert.equal(textoDelRango({ minPct: 0, maxPct: 15 }, comoLaPantalla), "entre 0,0 % y 15,0 %");
});

// ── LO GUARDADO ───────────────────────────────────────────────────────────

test("las importaciones viejas, sin columna, son de actualizar", () => {
  // No se escribe nada en el histórico: el default cubre las 4.748 filas que ya
  // están, y todas son de actualizar porque el modo no existía.
  assert.equal(modoDeImportacion({}), MODO_LISTA.ACTUALIZAR);
  assert.equal(modoDeImportacion({ modo: null }), MODO_LISTA.ACTUALIZAR);
  assert.equal(modoDeImportacion(null), MODO_LISTA.ACTUALIZAR);
  assert.equal(modoDeImportacion({ modo: "CUALQUIER_COSA" }), MODO_LISTA.ACTUALIZAR);
  assert.equal(modoDeImportacion({ modo: MODO_LISTA.CONTROLAR }), MODO_LISTA.CONTROLAR);
});

test("esModoValido no acepta cualquier cosa", () => {
  assert.equal(esModoValido(MODO_LISTA.ACTUALIZAR), true);
  assert.equal(esModoValido(MODO_LISTA.CONTROLAR), true);
  assert.equal(esModoValido("controlar"), false, "no se aceptan minúsculas: el enum es el enum");
  assert.equal(esModoValido(undefined), false);
});

test("CONTRAPRUEBA: sin la tolerancia, el control vuelve a ser un rango en cero", () => {
  // Lo que se afirma es que la tolerancia HACE ALGO. Comparando al centavo
  // —que es lo que hacía el motor con 0–0— el caso de redondeo que arriba
  // coincide pasaría a ser una diferencia, y volverían las 213 filas.
  const alCentavo = (a, b) => Math.round(a * 100) === Math.round(b * 100);
  assert.equal(alCentavo(1000, 1000.5), false, "al centavo, medio peso ya es distinto");
  assert.equal(coincideConElCosto(1000, 1000.5), true, "con tolerancia, es el mismo costo");
});

// ── ELEGIR LA LECTURA EN MODO CONTROLAR ───────────────────────────────────

test("de varias lecturas gana la que coincide con el costo de hoy", () => {
  // El caso de Arcor: la lista dice $11.049,39 y el producto está cargado por
  // bulto de 6. Leerlo por unidad da $11.049,39 y por bulto $66.296,34; el costo
  // de hoy es $11.049,39, así que la buena es la de unidad.
  const evaluadas = [
    { clave: "MISMA_PRESENTACION", costoNuevo: 11049.39, distancia: 0 },
    { clave: "BULTO_6", costoNuevo: 66296.34, distancia: 500 },
  ];
  const r = recomendarPorCercania(evaluadas, 11049.39);
  assert.equal(r.recomendada, "MISMA_PRESENTACION");
  assert.equal(r.coincide, true);
});

test("COINCIDIR LE GANA A ESTAR CERCA, aunque la distancia sea parecida", () => {
  // Es el criterio propio de este modo: se vino a controlar si la lista coincide
  // con los costos, así que una que coincide dentro de la tolerancia vale más
  // que una apenas más cerca que no coincide.
  const evaluadas = [
    { clave: "CERCA", costoNuevo: 1010, distancia: 1 },
    { clave: "COINCIDE", costoNuevo: 1000.4, distancia: 4 },
  ];
  const r = recomendarPorCercania(evaluadas, 1000);
  assert.equal(r.recomendada, "COINCIDE");
  assert.equal(r.coincide, true);
});

test("si ninguna coincide, gana la más cerca y se dice que no coincide", () => {
  const evaluadas = [
    { clave: "LEJOS", costoNuevo: 5000, distancia: 400 },
    { clave: "MENOS_LEJOS", costoNuevo: 1200, distancia: 20 },
  ];
  const r = recomendarPorCercania(evaluadas, 1000);
  assert.equal(r.recomendada, "MENOS_LEJOS");
  assert.equal(r.coincide, false, "acercarse no es coincidir, y la pantalla tiene que poder decirlo");
});

test("sin lecturas usables no se recomienda nada", () => {
  assert.deepEqual(recomendarPorCercania([], 1000), { recomendada: null, coincide: false });
  assert.deepEqual(
    recomendarPorCercania([{ clave: "X", costoNuevo: null }], 1000),
    { recomendada: null, coincide: false }
  );
});
