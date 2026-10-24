// UNA LISTA ABIERTA SE PUEDE CANCELAR, Y UNA CANCELADA NO ACEPTA MÁS TRABAJO.
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// Hasta el 2026-09-18 "Cancelar esta lista" existía en UN solo lugar de la
// pantalla: adentro del aviso amarillo de la lista que quedó atrapada en el rango
// 0 a 0, que es un caso puntual y viejo. Sobre una lista normal no había ninguna
// salida que no fuera aplicar o terminar.
//
// Así que subir el archivo equivocado terminaba en «Terminar», y en el historial
// quedaba como trabajo terminado. El endpoint de cancelar existía desde antes y
// no lo llamaba nadie.
//
// ── LAS DOS MITADES QUE ESTE ARCHIVO AFIRMA ───────────────────────────────
//
// 1. QUÉ SE PUEDE CANCELAR. Lo que está sin cerrar, y nada más. Una TERMINADA se
//    podía cancelar por la API y quedaba con `terminadaEn` Y `canceladaEn` a la
//    vez: terminada y cancelada, sin que nada falle. Eso dejó de poder pasar, y
//    dejó de ser teórico el día que el botón apareció en el listado, donde
//    conviven las abiertas con las terminadas.
//
// 2. QUÉ NO ACEPTA UNA CANCELADA. Aplicar y revisar. Esto ya andaba —las cuatro
//    puertas preguntan por `esImportacionAbierta`— y se escribe igual, porque
//    ahora hay muchas más listas canceladas que antes y lo que antes era
//    inalcanzable pasó a ser un camino de todos los días.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/cancelarUnaListaAbierta.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ESTADO_IMPORTACION,
  ESTADOS_ABIERTOS,
  ESTADOS_A_MEDIAS,
  esImportacionAbierta,
} from "./persistencia.js";
import { filaSeleccionable } from "./seleccion.js";
import { puedeConfirmarse } from "./confirmarPresentacion.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const RUTA_CANCELAR = "app/api/proveedores/listas/[id]/cancelar/route.js";
const RUTA_RESULTADO = "app/modulos/proveedores/listas/[id]/page.jsx";
const RUTA_LISTADO = "app/modulos/proveedores/listas/page.jsx";
const RUTA_MODAL = "components/proveedores/listas/ModalCancelarImportacion.jsx";

/**
 * El fuente sin comentarios.
 *
 * Este repo ya tuvo un candado VERDE que encontraba la palabra que buscaba
 * adentro de un comentario tres líneas más arriba. Y estos archivos están llenos
 * de comentarios que nombran justo lo que se busca.
 */
const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\/[^\n]*/g, "");

const fuenteDe = (ruta) => sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));

// ═══════════════════════════════════════════════════════════════════════════
// 1. QUÉ SE PUEDE CANCELAR
// ═══════════════════════════════════════════════════════════════════════════

test("UNA ABIERTA SIN COSTOS APLICADOS SE CANCELA", () => {
  // CONCILIADA es la lista recién leída: nada aplicado, todo por decidir. Es el
  // caso del archivo equivocado, que es el que originó todo esto.
  assert.equal(esImportacionAbierta(ESTADO_IMPORTACION.CONCILIADA), true);
});

test("UNA ABIERTA CON COSTOS APLICADOS TAMBIÉN, y por eso el aviso hace falta", () => {
  // PARCIALMENTE_APLICADA sigue abierta —aplicar una tanda no cierra el proceso—
  // así que se puede cancelar Y ya escribió costos. Las dos cosas juntas son el
  // motivo por el que el modal tiene que decir qué pasa con lo aplicado.
  assert.equal(esImportacionAbierta(ESTADO_IMPORTACION.PARCIALMENTE_APLICADA), true);
});

test("UNA TERMINADA NO: no puede quedar terminada Y cancelada", () => {
  // ── EL DEFECTO QUE ESTO CIERRA ──────────────────────────────────────────
  //
  // El endpoint rechazaba solo APLICADA, así que una TERMINADA pasaba: quedaba
  // con `terminadaEn` y `canceladaEn` puestos los dos. Nada fallaba, y cada
  // pantalla mostraba una de las dos según qué campo mirara.
  assert.equal(esImportacionAbierta(ESTADO_IMPORTACION.TERMINADA), false);
  assert.ok(!ESTADOS_A_MEDIAS.includes(ESTADO_IMPORTACION.TERMINADA));
});

test("Y UNA APLICADA TAMPOCO: sus costos están escritos", () => {
  assert.equal(esImportacionAbierta(ESTADO_IMPORTACION.APLICADA), false);
});

test("LA RUTA PREGUNTA POR «ABIERTA», no por una lista de estados escrita a mano", () => {
  const fuente = fuenteDe(RUTA_CANCELAR);

  assert.match(
    fuente,
    /esImportacionAbierta/,
    `${RUTA_CANCELAR} no usa \`esImportacionAbierta\`: si enumera estados a mano, el día que ` +
      `se agregue uno esta ruta va a decidir distinto que el resto del módulo`
  );

  // Y lo pregunta DOS veces: afuera y adentro de la transacción. La de adentro es
  // la que decide, porque entre la lectura y la escritura alguien pudo terminar la
  // lista desde otra pestaña.
  const veces = [...fuente.matchAll(/esImportacionAbierta\(/g)].length;
  assert.ok(
    veces >= 2,
    `${RUTA_CANCELAR} pregunta ${veces} vez/veces si está abierta; hacen falta dos —afuera y ` +
      `adentro de la transacción—, porque el estado puede cambiar en el medio`
  );

  // El BORRADOR entra: es la que quedó a medio leer, y esconderla dejaría una
  // importación colgada que nadie ve y nadie cancela.
  assert.match(fuente, /ESTADO_IMPORTACION\.BORRADOR/, `${RUTA_CANCELAR} no deja cancelar un BORRADOR`);
});

test("CONTRAPRUEBA: el chequeo de la ruta distingue de verdad", () => {
  // Un `assert.match` sobre un fuente grande pasa con que la palabra aparezca una
  // vez. Acá se ejerce el fuente SIN la llamada y se comprueba que el mismo
  // chequeo se pone rojo.
  const fuente = fuenteDe(RUTA_CANCELAR);
  const sinGuardia = fuente.replace(/esImportacionAbierta/g, "");
  assert.doesNotMatch(sinGuardia, /esImportacionAbierta/);
  assert.notEqual(fuente, sinGuardia, "el fuente no tenía la guardia para empezar");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. UNA CANCELADA NO ACEPTA APLICAR NI REVISAR
// ═══════════════════════════════════════════════════════════════════════════

const cancelada = { id: 1, estado: ESTADO_IMPORTACION.CANCELADA };
const abierta = { id: 1, estado: ESTADO_IMPORTACION.CONCILIADA };

/** Una fila lista para aplicar, que es el caso que MÁS tiene que rechazarse. */
const listaParaAplicar = {
  id: 10,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  aplicada: false,
  seleccionada: false,
  productoBaseId: 500,
  costoMaestroPropuesto: 1039.22,
  excluidaManual: false,
};

/**
 * Una fila por revisar, que es la que la cola ofrece resolver.
 *
 * `unidadProveedor: "BU"` no es decoración: `puedeConfirmarse` exige poder
 * determinar la base del precio —unidad, display o bulto— salvo que el proveedor
 * tenga su propio enumerador de lecturas. Sin ella la fila se rechaza por
 * BASE_INDETERMINADA, y la contraprueba de abajo —que sobre una lista ABIERTA la
 * misma fila sí se confirma— daría falso por un motivo que no tiene nada que ver
 * con cancelar. Un fixture incompleto habría hecho pasar el candado por la razón
 * equivocada.
 */
const porRevisar = {
  id: 11,
  estado: ESTADO_LINEA.FACTOR_DUDOSO,
  aplicada: false,
  productoBaseId: 500,
  excluidaManual: false,
  codigoNormalizado: "9140",
  unidadProveedor: "BU",
};

test("APLICAR: una fila de una cancelada no es seleccionable", () => {
  // La selección es la puerta de aplicar: lo que no se puede marcar no se aplica.
  assert.equal(filaSeleccionable(listaParaAplicar, cancelada).ok, false);
  // Y CONTRAPRUEBA en el mismo test: la MISMA fila sobre una lista abierta sí.
  // Sin esto, un `filaSeleccionable` que devolviera siempre false pasaría.
  assert.equal(filaSeleccionable(listaParaAplicar, abierta).ok, true);
});

test("REVISAR: en una cancelada no se puede vincular", () => {
  // Se vincula por dos rutas: la hoja de «Vincular con la lista» y «No es este
  // producto». Antes esto se afirmaba sobre `filaVinculable`, que era de la ruta
  // `filas/[filaId]/vincular`; esa ruta se borró el 2026-10-24 y la función con
  // ella. Lo que se afirma ahora es la puerta de las dos que quedan: el POST
  // pregunta si la lista está abierta ANTES de abrir la transacción que escribe.
  for (const ruta of [
    "app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js",
    "app/api/proveedores/listas/[id]/filas/[filaId]/otra-fila/route.js",
  ]) {
    const post = fuenteDe(ruta).split("export async function POST")[1] ?? "";
    const puerta = post.indexOf("if (!esImportacionAbierta(cab.estado))");
    const escribe = post.indexOf("$transaction");
    assert.ok(puerta >= 0, `${ruta}: el POST no pregunta si la lista está abierta`);
    assert.ok(escribe > puerta, `${ruta}: escribe antes de preguntar si la lista está abierta`);
  }
  // Y la pregunta dice que no para la cancelada y que sí para la abierta.
  assert.equal(esImportacionAbierta(cancelada.estado), false);
  assert.equal(esImportacionAbierta(abierta.estado), true);
});

test("REVISAR: en una cancelada no se puede confirmar una lectura", () => {
  const r = puedeConfirmarse(porRevisar, cancelada);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "IMPORTACION_CERRADA");
  // La contraprueba: sobre la abierta, la misma fila sí se confirma.
  assert.equal(puedeConfirmarse(porRevisar, abierta).ok, true);
});

test("Y EL CANCELADO NO ES UN ESTADO ABIERTO, que es de donde cuelgan los tres", () => {
  // Los tres predicados de arriba preguntan lo mismo. Se afirma acá para que, si
  // alguien alguna vez mete CANCELADA en la lista de abiertos, el rojo diga por
  // qué fallaron los tres y no haya que deducirlo.
  assert.equal(esImportacionAbierta(ESTADO_IMPORTACION.CANCELADA), false);
  assert.ok(!ESTADOS_ABIERTOS.includes(ESTADO_IMPORTACION.CANCELADA));
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. LAS PANTALLAS LO OFRECEN
// ═══════════════════════════════════════════════════════════════════════════

test("EL RESULTADO OFRECE CANCELAR AL LADO DE TERMINAR, con la lista abierta", () => {
  const fuente = fuenteDe(RUTA_RESULTADO);

  // Los dos botones, en el mismo bloque condicionado por `abierta`.
  assert.match(fuente, /Terminar lista/, "desapareció «Terminar lista»");
  assert.match(fuente, /Cancelar esta lista/, "el resultado no ofrece cancelar");

  // ── Y NO SOLO ADENTRO DEL AVISO DEL 0 A 0 ──────────────────────────────
  //
  // Es la afirmación que importa, porque el defecto era exactamente ése: el botón
  // existía, pero en un solo lugar y para un solo caso. Se cuenta cuántas veces
  // aparece: con una sola, volvió a estar escondido.
  const veces = [...fuente.matchAll(/Cancelar esta lista/g)].length;
  assert.ok(
    veces >= 2,
    `«Cancelar esta lista» aparece ${veces} vez en ${RUTA_RESULTADO}. Tiene que estar en la fila ` +
      `de abajo —siempre que la lista esté abierta— además del aviso del rango 0 a 0; con una sola ` +
      `vuelve a estar escondido adentro de ese aviso`
  );
});

test("EL LISTADO OFRECE CANCELAR EN LAS QUE QUEDARON A MEDIAS", () => {
  const fuente = fuenteDe(RUTA_LISTADO);
  assert.match(fuente, /Cancelar esta lista/, `${RUTA_LISTADO} no ofrece cancelar`);
  // Y usa el MISMO modal que el resultado, no una confirmación propia.
  assert.match(
    fuente,
    /ModalCancelarImportacion/,
    `${RUTA_LISTADO} confirma con algo que no es el modal compartido: dos textos sobre lo que ` +
      `pasa con los costos aplicados se separan el día que uno se corrija`
  );
  // El botón va en las "a medias": la tarjeta pregunta por el mismo predicado que
  // agrupa la sección, no por una lista de estados propia.
  assert.match(fuente, /quedoAMedias/, `${RUTA_LISTADO} decide con otra regla cuáles están a medias`);
});

// ── DESDE EL 2026-10-24, CANCELAR UNA APLICADA DESHACE ────────────────────
//
// Hasta acá el modal tenía dos textos: sin aplicados "no se cambia ningún
// costo", con aplicados "cancelar no los deshace, usá «Deshacer»". Con la regla
// nueva lo segundo es falso: cancelar una lista aplicada DESHACE, y eso se
// pregunta en otra hoja, "Cancelar la lista". El modal quedó para el caso sin
// nada aplicado, y "no se cambia ningún costo" es verdad porque las dos
// pantallas solo lo abren en ese caso. Eso es lo que se afirma ahora.

test("EL MODAL DE CANCELAR ES SOLO PARA UNA LISTA SIN NADA APLICADO", () => {
  const modal = fuenteDe(RUTA_MODAL);
  assert.match(modal, /No se cambia ningún costo/);
  assert.match(modal, /trabajo pendiente/i, `${RUTA_MODAL} no dice que la lista sale de lo pendiente`);
  // Ya no habla de aplicados: ese caso es de la otra hoja.
  assert.doesNotMatch(modal, /aplicados|no los deshace/i);

  // La pantalla de la lista: con algo aplicado, la hoja que deshace, antes que el modal.
  const resultado = fuenteDe(RUTA_RESULTADO);
  assert.match(
    resultado,
    /const alCancelar = \(\) =>\s*puedeDeshacer\s*\? setCancelandoConReversion\(true\)\s*: queAbreAlCerrar\(pendientes\) === AL_CERRAR\.HOJA_PENDIENTES\s*\? setCerrandoConPendientes\(CIERRE\.CANCELAR\)\s*: setCancelando\(true\);/
  );
  assert.match(resultado, /const puedeDeshacer = cabecera\.productosActualizados > 0;/);
  // El listado: el modal solo si cancelar no deshace; si deshace, la hoja.
  const listado = fuenteDe(RUTA_LISTADO);
  assert.match(listado, /abierto=\{aCancelar !== null && !cancelarDeshace\(aCancelar\)\}/);
  assert.match(listado, /\{aCancelar !== null && cancelarDeshace\(aCancelar\) && \(\s*<HojaCancelarLaLista/);
});

test("CONTRAPRUEBA: sin la condición, el modal se abriría sobre una lista aplicada", () => {
  // Se ejerce el mismo chequeo sobre el fuente sin la condición y tiene que
  // dejar de encontrarla: si no, el candado de arriba no distingue nada.
  const listado = fuenteDe(RUTA_LISTADO).replace("aCancelar !== null && !cancelarDeshace(aCancelar)", "aCancelar !== null");
  assert.doesNotMatch(listado, /abierto=\{aCancelar !== null && !cancelarDeshace\(aCancelar\)\}/);
});
