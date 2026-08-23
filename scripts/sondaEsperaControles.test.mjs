// CANDADO: LA SONDA DE LA TARJETA ESPERA A LOS CONTROLES, NO SOLO AL LISTADO.
//
// ── EL DEFECTO QUE ESTO IMPIDE, Y YA FRENÓ UN DESPLIEGUE ──────────────────
//
// La afirmación `14j` de `scripts/sonda-tarjeta-producto.mjs` compara el número
// que muestra la card de mantenimiento contra el total del listado filtrado.
// Para leerlo, la sonda navegaba por URL con `?control=…` y esperaba **solo a
// que aparecieran las tarjetas del listado**.
//
// Eso alcanzaba mientras el listado y los controles salían a la vez: para cuando
// el listado dibujaba, los contadores ya estaban. Desde que los controles salen
// DESPUÉS de que termina el primer listado —que es lo que hace
// `lib/productos/ordenDeCargaProductos.js`— ya no alcanza: en ese instante las
// cards siguen calculando, la sonda lee `null` y 14j da rojo.
//
// Pasó de verdad el 2026-08-23: el despliegue de `3cc3c337` frenó acá, con
// "el listado trajo 1766" y `null` en la card, determinista en dos corridas.
//
// ── POR QUÉ ES UN CANDADO Y NO ALCANZA CON ARREGLAR LA SONDA ──────────────
//
// Porque el defecto es **una espera que mira lo que no debe**, y eso no se ve
// leyendo: la sonda seguía pasando en todo lo demás y su rojo apuntaba a la
// coherencia de los números, que era exactamente lo único que NO estaba mal.
//
// Un candado que mira la estructura de la espera se pone rojo el día que alguien
// vuelva a esperar solo las tarjetas, sin necesidad de levantar un navegador.
//
// ── LO QUE ESTE CANDADO NO PRUEBA ─────────────────────────────────────────
//
// No prueba que la espera funcione: eso lo prueba correr la sonda. Prueba que la
// espera EXISTE y que mira los tres estados que distinguen "todavía calculando"
// de "ya terminó". Son preguntas distintas y las dos hacen falta.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const SONDA = leer("scripts/sonda-tarjeta-producto.mjs");
const CARRUSEL = leer("components/productos/CarruselControles.jsx");

test("SEC1. EXISTE UNA ESPERA POR EL ESTADO DE LOS CONTROLES", () => {
  // No basta con esperar tarjetas: hace falta una espera propia que pregunte por
  // los contadores. Si esta función desaparece, 14j vuelve a leer `null`.
  assert.match(
    SONDA,
    /const esperarControlesResueltos = async/,
    "no hay ninguna espera por el estado de los controles: 14j va a volver a leer null"
  );
});

test("SEC2. LA ESPERA MIRA LOS TRES ESTADOS QUE DISTINGUEN CALCULANDO DE LISTO", () => {
  // ── LOS TRES, Y NINGUNO SOBRA ───────────────────────────────────────────
  //
  // Salen de cómo `CarruselControles` dibuja de verdad, no de una idea:
  //
  //   · SIN BLOQUE — con `controles` vacío el componente devuelve `null`, así
  //     que la sección "Para revisar" NO EXISTE. Esperar adentro de algo que no
  //     está no es esperar.
  //   · CALCULANDO — mientras `cargando` es true dibuja la etiqueta
  //     "calculando…". Es el estado que la sonda leía como si fuera el final.
  //   · SIN NÚMERO — la card puede estar y todavía no traer su cuenta.
  const espera = SONDA.match(/const esperarControlesResueltos = async[\s\S]*?\n  \};/);
  assert.ok(espera, "no se encontró el cuerpo de la espera");
  const cuerpo = espera[0];

  assert.match(cuerpo, /Para revisar/, "la espera no busca el bloque de controles");
  assert.match(cuerpo, /calculando/i, "la espera no mira la etiqueta de 'calculando…'");
  assert.match(cuerpo, /aria-pressed/, "la espera no mira la card activa");

  // Y el timeout es EXPLÍCITO, no un sleep adivinado.
  assert.match(cuerpo, /Date\.now\(\)/, "la espera no tiene un vencimiento medido");
  assert.doesNotMatch(
    cuerpo,
    /await sleep\(\d{4,}\)/,
    "la espera volvió a ser un sleep largo adivinado en vez de una condición"
  );
});

test("SEC3. LOS ESTADOS QUE LA ESPERA MIRA EXISTEN EN EL COMPONENTE REAL", () => {
  // ── LA MITAD QUE EVITA ESPERAR UN FANTASMA ──────────────────────────────
  //
  // Una espera puede estar escrita y no encontrar nunca su condición: quedaría
  // venciendo por timeout siempre, y el rojo diría "no cargó" sobre una pantalla
  // sana. Por eso se comprueba contra el componente que DIBUJA.
  assert.match(CARRUSEL, /calculando/i, "el carrusel dejó de decir 'calculando…': la espera no la va a ver nunca");
  assert.match(CARRUSEL, /Para revisar/, "el carrusel dejó de rotular 'Para revisar'");
  assert.match(
    CARRUSEL,
    /if \(controles\.length === 0\) return null;/,
    "cambió cuándo el bloque no se dibuja: revisar el estado 'sin bloque' de la espera"
  );
});

test("SEC4. 14j USA LA ESPERA, Y SIGUE COMPARANDO LOS DOS NÚMEROS", () => {
  // ── QUE LA ESPERA EXISTA NO SIRVE SI 14j NO LA LLAMA ────────────────────
  //
  // Es el defecto de la primera versión de OC10 en la otra tanda: el guardia
  // estaba escrito y el camino que importaba no pasaba por él.
  const i14j = SONDA.indexOf("14j");
  assert.ok(i14j > 0, "no se encontró la afirmación 14j");

  // La espera tiene que llamarse ANTES de leer el número de la card.
  const iLlamada = SONDA.lastIndexOf("esperarControlesResueltos(", i14j);
  const iLectura = SONDA.lastIndexOf("cantidadEnLaCard", i14j);
  assert.ok(iLlamada > 0, "14j no espera a que los controles terminen");
  assert.ok(
    iLlamada < iLectura,
    "la espera se llama DESPUÉS de leer la card, que no sirve de nada"
  );

  // Y LA AFIRMACIÓN NO SE AFLOJÓ: sigue exigiendo igualdad exacta entre el
  // número de la card y el total del listado. Un `>=`, un margen o un `if` que
  // saltee la comparación convertirían la sonda en decorativa.
  const bloque = SONDA.slice(i14j - 400, i14j + 200);
  assert.match(
    bloque,
    /Number\(trasUrl\.total\) === cantidadEnLaCard/,
    "14j dejó de comparar por igualdad exacta el total del listado contra la card"
  );
  assert.match(
    bloque,
    /cantidadEnLaCard !== null/,
    "14j dejó de rechazar un contador ausente: un null volvería a pasar por bueno"
  );

  // ── Y EL TIMEOUT TIENE QUE DECIDIR, NO SOLO DECORAR EL MENSAJE ──────────
  //
  // Lo destapó la contraprueba y no la lectura: con la espera venciendo a
  // propósito, 14j daba VERDE igual, porque el resultado de la espera solo se
  // usaba para redactar el motivo y la card estaba lista de casualidad cuando se
  // la leía. Un estado indeterminado que termina en verde es justo lo que esta
  // sonda no puede hacer.
  assert.match(
    bloque,
    /listasLasCards\.ok &&/,
    "vencer la espera no hace fallar a 14j: un estado indeterminado puede pasar por verde"
  );
});

test("SEC5. UN CONTADOR EN CERO ES UN RESULTADO, NO UN 'TODAVÍA NO'", () => {
  // ── LA TRAMPA MÁS FÁCIL DE ESTA ESPERA ──────────────────────────────────
  //
  // Si la condición de "ya terminó" se escribiera como `Number(texto) > 0` o
  // como un chequeo de verdad del número, una card que legítimamente cuenta 0
  // —no hay nada para revisar— se leería como "todavía calculando" y la sonda
  // vencería por timeout sobre una pantalla perfecta.
  //
  // Por eso la condición mira que HAYA un dígito, no que el número sea distinto
  // de cero.
  const espera = SONDA.match(/const esperarControlesResueltos = async[\s\S]*?\n  \};/)[0];
  assert.doesNotMatch(
    espera,
    /Number\([^)]*\)\s*>\s*0/,
    "la espera trata un contador en 0 como 'todavía no cargó'"
  );
  assert.match(
    espera,
    /\\d/,
    "la espera no comprueba que la card tenga un dígito"
  );
});
