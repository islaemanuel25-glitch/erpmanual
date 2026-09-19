// Candados de "lo que la pantalla cuenta es lo que aplicar escribe".
//
// ── EL CASO, CON SUS NÚMEROS ───────────────────────────────────────────────
//
// Emanuel, a 360, en una importación de M Y F: el resultado decía "8 se
// actualizan", arriba "3 productos ya actualizados" y abajo "Deshacer los 3".
// Tocó "Aplicar los 8 precios" y salió un cartel VERDE que decía "Listo. Se
// actualizaron 0 productos". El botón siguió diciendo ocho y los contadores no
// se movieron.
//
// Eran TRES defectos encimados, y conviene tenerlos separados porque cada uno
// tapaba al siguiente:
//
//   1. El contador daba por "lista" a toda fila sin aplicar, sin excluir, sin
//      motivo de revisión — y NO MIRABA `seleccionada`. `aplicar` consulta
//      `{ seleccionada: true, aplicada: false }`. Dos predicados para una
//      pregunta. Medido en erpazul_al, importación 22: el resultado decía 361
//      listos y aplicar escribió 1, porque había 360 filas
//      `seleccionable: true, seleccionada: false`.
//
//   2. `revertir` devolvía la fila a pendiente con `aplicada: false` y la dejaba
//      DESTILDADA —`aplicar` la había destildado al escribirla—. Así que
//      deshacer dejaba filas que se contaban como listas y que aplicar no iba a
//      tocar nunca más. Es el caso exacto de Emanuel: una lista con deshechos.
//
//   3. El cartel leía `j.aplicadas`, y el endpoint manda `resumen.aplicadas`.
//      Decía "Se actualizaron 0 productos" SIEMPRE, hubiera escrito cero o
//      trescientos — y en verde, diciendo "Listo".
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/aplicarLoQueSeCuenta.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  contarResultado,
  resultadoCierra,
  seVaAEscribir,
} from "./resultadoDeLaLista.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** El rango del proveedor de la importación 22. */
const RANGO = { minPct: 2, maxPct: 15 };

/**
 * Una fila con la forma que `CAMPOS_CONTEO` trae de la base.
 *
 * Los defaults son los de una fila recién conciliada y lista: tildada, sin
 * aplicar, sin excluir, con un aumento adentro del rango. Los candados cambian
 * de a un campo, que es lo que hace que digan qué campo decide.
 */
const fila = (extra = {}) => ({
  id: 1,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  motivo: null,
  costoAnterior: 1000,
  productoBaseId: 10,
  excluidaManual: false,
  aplicada: false,
  seleccionada: true,
  diferenciaPct: 5,
  aumentoEsperadoMinPct: 2,
  aumentoEsperadoMaxPct: 15,
  confirmadoEn: null,
  vinculadoEn: null,
  multiplicadorConfirmado: null,
  fueraDeRangoAceptadaEn: null,
  costoMaestroPropuesto: 1050,
  ...extra,
});

/**
 * LO QUE `aplicar` VA A TRAER DE LA BASE, con su `where` textual.
 *
 * No es una reescritura del predicado: es la consulta de Prisma que la ruta hace
 * —`{ importacionId, seleccionada: true, aplicada: false }`— aplicada a mano
 * sobre las mismas filas. Es lo que permite comparar los dos lados sin montar la
 * base, y hay un candado abajo que comprueba que la ruta siga consultando así.
 */
const loQueAplicarTrae = (filas) =>
  filas.filter((f) => f.seleccionada === true && f.aplicada === false);

// ===========================================================================
// 1. EL CANDADO CENTRAL: contar y escribir son la misma pregunta
// ===========================================================================

test("aplicar sobre N filas listas escribe N, y el contador dice N", () => {
  const filas = [fila({ id: 1 }), fila({ id: 2 }), fila({ id: 3 })];
  const c = contarResultado(filas, RANGO);

  assert.equal(c.listos, 3);
  assert.equal(loQueAplicarTrae(filas).length, 3, "aplicar no trae las mismas");
  assert.equal(c.listos, loQueAplicarTrae(filas).length);
});

test("CONTRAPRUEBA: destildadas, el contador NO las promete y aplicar no las trae", () => {
  // Es el defecto exacto. Antes esto daba `listos: 3` contra 0 escritas.
  const filas = [
    fila({ id: 1, seleccionada: false }),
    fila({ id: 2, seleccionada: false }),
    fila({ id: 3, seleccionada: false }),
  ];
  const c = contarResultado(filas, RANGO);

  assert.equal(c.listos, 0, "el botón volvería a prometer escrituras que no ocurren");
  assert.equal(loQueAplicarTrae(filas).length, 0);
  // Y NO desaparecen: se cuentan aparte, porque un número que baja sin
  // explicación es la misma mentira al revés.
  assert.equal(c.listosSinTildar, 3);
});

test("los dos lados coinciden en TODA combinación de tildada y aplicada", () => {
  // Las cuatro esquinas, sobre el mismo juego de filas. Lo que se afirma es que
  // los dos números no se pueden separar, que es lo que el defecto rompió.
  const filas = [
    fila({ id: 1, seleccionada: true, aplicada: false }),
    fila({ id: 2, seleccionada: false, aplicada: false }),
    fila({ id: 3, seleccionada: true, aplicada: true }),
    fila({ id: 4, seleccionada: false, aplicada: true }),
  ];
  const c = contarResultado(filas, RANGO);
  assert.equal(c.listos, loQueAplicarTrae(filas).length);
  assert.equal(c.listos, 1);
});

test("el predicado falla CERRADO: sin la columna, no promete nada", () => {
  // Si una consulta se olvida de traer `seleccionada`, el número queda corto y
  // no al revés. Es la lección de `excluidaManual` y de `aplicada`, que ya
  // costaron dos contadores mintiendo.
  const sinLaColumna = fila();
  delete sinLaColumna.seleccionada;
  assert.equal(seVaAEscribir(sinLaColumna, RANGO), false);
  assert.equal(contarResultado([sinLaColumna], RANGO).listos, 0);
});

// ===========================================================================
// 2. Una fila ya aplicada no vuelve a contarse
// ===========================================================================

test("una fila ya aplicada no es «se actualiza» ni entra en el botón", () => {
  const filas = [fila({ id: 1, aplicada: true }), fila({ id: 2 })];
  const c = contarResultado(filas, RANGO);
  assert.equal(c.yaAplicadas, 1);
  assert.equal(c.listos, 1, "la aplicada se contó otra vez");
  assert.equal(loQueAplicarTrae(filas).length, 1);
});

test("una aplicada sigue sin contarse aunque quedara tildada", () => {
  // `aplicar` la destilda al escribirla, pero el contador no puede depender de
  // eso: la rama de `aplicada` va PRIMERO y manda.
  const c = contarResultado([fila({ aplicada: true, seleccionada: true })], RANGO);
  assert.equal(c.yaAplicadas, 1);
  assert.equal(c.listos, 0);
});

// ===========================================================================
// 3. Los números cierran
// ===========================================================================

test("los contadores suman el total, con destildadas en el medio", () => {
  const filas = [
    fila({ id: 1 }),
    fila({ id: 2, seleccionada: false }),
    fila({ id: 3, aplicada: true }),
    fila({ id: 4, excluidaManual: true }),
    fila({ id: 5, estado: ESTADO_LINEA.SIN_CAMBIOS }),
    fila({ id: 6, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: "FUERA_DE_RANGO" }),
    fila({ id: 7, estado: ESTADO_LINEA.NO_MACHEADO, productoBaseId: null }),
  ];
  const c = contarResultado(filas, RANGO);
  assert.equal(c.total, 7);
  assert.equal(resultadoCierra(c), true, `no cierra: ${JSON.stringify(c)}`);
  assert.equal(
    c.listos + c.listosSinTildar + c.yaAplicadas + c.sinCambio + c.dejadas + c.paraRevisar + c.sinProducto,
    7
  );
});

test("CONTRAPRUEBA: sin contar las destildadas, el total NO cierra", () => {
  // Es lo que probaría que `listosSinTildar` no es decoración: si se sacara de
  // la suma, una lista con filas destildadas dejaría de cerrar.
  const c = contarResultado([fila({ id: 1 }), fila({ id: 2, seleccionada: false })], RANGO);
  const sinEllas = { ...c, listosSinTildar: 0 };
  assert.equal(resultadoCierra(sinEllas), false);
  assert.equal(resultadoCierra(c), true);
});

// ===========================================================================
// 4. Las tres piezas del código que sostienen lo de arriba
// ===========================================================================
//
// Los tres leen fuente, así que sacan los comentarios ANTES de mirar: estos
// archivos cuentan el defecto en prosa —nombran `seleccionada`, el cartel verde
// y `j.aplicadas`— y sin eso un candado encontraría la explicación y daría verde
// por ella.

const sinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("el resultado TRAE la columna que decide", () => {
  // Sin esto el predicado falla cerrado y el botón diría 0 sobre una lista
  // entera de filas tildadas. La columna y el predicado van juntos.
  const src = sinComentarios("app/api/proveedores/listas/[id]/resultado/route.js");
  const i = src.indexOf("CAMPOS_CONTEO");
  const bloque = src.slice(i, src.indexOf("}", src.indexOf("{", i)) + 1);
  assert.match(bloque, /seleccionada:\s*true/, "CAMPOS_CONTEO no pide `seleccionada`");
  assert.match(bloque, /aplicada:\s*true/, "y tampoco `aplicada`");
});

test("aplicar sigue consultando por tildada y no aplicada", () => {
  // El otro lado del par. Si esta consulta cambiara, `loQueAplicarTrae` de
  // arriba dejaría de representarla y los candados 1 a 3 probarían una fantasía.
  const src = sinComentarios("app/api/proveedores/listas/[id]/aplicar/route.js");
  const veces = (src.match(/seleccionada:\s*true,\s*aplicada:\s*false/g) || []).length;
  assert.ok(veces >= 2, `la consulta de aplicar cambió de forma (${veces} coincidencias)`);
});

test("deshacer vuelve a tildar lo que devuelve a pendiente", () => {
  // El defecto de Emanuel. Sin esto, deshacer deja filas que se cuentan y no se
  // aplican nunca — y como el contador ahora mira `seleccionada`, quedarían
  // invisibles además de inaplicables.
  const src = sinComentarios("app/api/proveedores/listas/[id]/revertir/route.js");
  assert.match(src, /aplicada:\s*false/, "no devuelve la fila a pendiente");
  assert.match(src, /seleccionada:\s*true/, "no la vuelve a tildar");
  // Y solo lo seleccionable y no excluido: deshacer devuelve un costo, no borra
  // la decisión de dejar una fila como está.
  assert.match(src, /seleccionable:\s*true/);
  assert.match(src, /excluidaManual:\s*false/);
});

test("aplicar CERO no muestra cartel de éxito", () => {
  // Un verde que dice "Listo" sobre una operación que no escribió nada es la
  // pantalla afirmando que el trabajo está hecho. Emanuel tocó tres veces.
  const src = sinComentarios("app/modulos/proveedores/listas/[id]/page.jsx");
  const i = src.indexOf("const escritos");
  assert.ok(i > 0, "no se encontró el manejo del resultado de aplicar");
  const bloque = src.slice(i, i + 1400);
  assert.match(bloque, /escritos > 0/, "el éxito no está condicionado a haber escrito algo");
  // El `success` tiene que estar del lado del `> 0`, y el otro lado no.
  const [conEscrituras, sinEscrituras] = bloque.split(/\}\s*else\s*\{/);
  assert.match(conEscrituras, /tono:\s*"success"/);
  assert.ok(
    sinEscrituras && !/tono:\s*"success"/.test(sinEscrituras),
    "la rama de cero escrituras muestra un cartel de éxito"
  );
  assert.match(sinEscrituras ?? "", /No se actualizó ningún costo/);
});

test("el número del cartel sale de donde el servidor lo manda", () => {
  // `j.aplicadas` no existe: el endpoint manda `resumen.aplicadas`. Leer el
  // campo equivocado hacía que el cartel dijera 0 siempre.
  const src = sinComentarios("app/modulos/proveedores/listas/[id]/page.jsx");
  assert.match(src, /j\?\.resumen\?\.aplicadas/, "no lee el campo que el servidor manda");
  assert.ok(
    !/\bj\.aplicadas\b/.test(src),
    "volvió a leer `j.aplicadas`, que el endpoint nunca mandó"
  );
});
