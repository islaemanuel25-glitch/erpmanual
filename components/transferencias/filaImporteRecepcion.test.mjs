// LA FILA DEL DINERO DE LA CARD MÓVIL: COSTO A LA IZQUIERDA, TOTAL A LA DERECHA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/filaImporteRecepcion.test.mjs
//
// ── QUÉ AFIRMA, Y POR QUÉ MONTANDO ───────────────────────────────────────
//
// Se MONTA `FilaProducto` con `react-dom/server` y se lee el texto que queda en
// pantalla. No se recalcula ningún importe ni se vuelve a resolver ninguna
// presentación: los candados que comparan una función contra una copia de sí
// misma pasan siempre, incluso estando las dos mal.
//
// Lo que se comprueba es observable: qué dice la card, cuántas veces lo dice, y
// qué NO dice.
//
// ── LO QUE ESTO NO PUEDE CONTESTAR ───────────────────────────────────────
//
// No mide píxeles: un render a string no tiene layout, así que acá no se afirma
// cuánto mide una card ni que dos midan lo mismo.
//
// Lo que sí se defiende son las DOS causas de que puedan diferir, y las dos se
// ven en el marcado: que la fila exista con la misma forma para los cuatro
// modos comerciales —F4 los recorre y exige un solo costo en cada uno— y que
// sigan puestas las clases que impiden que se parta en dos renglones —F11—.
// La implementación no tiene ninguna rama por modo: la fila es una sola y el
// único que cambia es el texto que la atraviesa.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FilaProducto } from "./WorkspaceRecepcion.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** El texto que se lee, sin etiquetas: el número y su unidad viven en nodos distintos. */
const texto = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

const linea = (extra = {}) => ({
  id: 1,
  nombre: "AMARGO OBRERO 950ML",
  cantidadEnviada: 2,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "BULTO",
  factorPack: 6,
  presentacionEnvio: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  motivoPrincipal: "",
  motivoDetalle: "",
  categoria: null,
  precioCosto: 11400,
  subtotal: 22800,
  ...extra,
});

const pintar = (d, props = {}) =>
  texto(
    renderToStaticMarkup(
      React.createElement(FilaProducto, { d, activa: false, onElegir: () => {}, ...props })
    )
  );

// ── LOS TRES MODOS DEL DISEÑO APROBADO ────────────────────────────────────

test("F1. UNIDAD: un solo costo, el de la unidad, y su total", () => {
  const t = pintar(
    linea({
      nombre: "ALA POLVO MATIC 800GR",
      unidadEnviada: "UNIDAD",
      factorPack: 1,
      cantidadEnviada: 6,
      precioCosto: 3100,
      subtotal: 18600,
    }),
    { conImporte: true }
  );
  assert.match(t, /Costo UNIDAD · \$ 3\.100,00/);
  assert.match(t, /Total · \$ 18\.600,00/);
});

test("F2. PACK con factor 6: el costo es el DEL PACK, con su factor", () => {
  const t = pintar(linea(), { conImporte: true });
  assert.match(t, /Costo PACK x6 · \$ 11\.400,00/);
  assert.match(t, /Total · \$ 22\.800,00/);
  // El renglón de arriba y el del dinero hablan de la MISMA presentación.
  assert.match(t, /Enviado 2 PACK x6/);
});

test("F3. CAJÓN con factor 8: el vocabulario es el del dominio, no 'Bulto'", () => {
  const t = pintar(
    linea({
      nombre: "COCA COLA 2L",
      unidadMedida: "cajon",
      factorPack: 8,
      cantidadEnviada: 5,
      precioCosto: 15200,
      subtotal: 76000,
    }),
    { conImporte: true }
  );
  assert.match(t, /Costo CAJÓN x8 · \$ 15\.200,00/);
  assert.match(t, /Total · \$ 76\.000,00/);
  // "Bulto" es la etiqueta del helper DUPLICADO que todavía vive en el detalle
  // de escritorio. Si apareciera acá, esta card estaría resolviendo por su
  // cuenta en vez de usar la fuente canónica.
  assert.doesNotMatch(t, /Bulto/i, "la card usó el vocabulario del helper duplicado");
});

// ── UNA SOLA ESCALA DE COSTO POR CARD ─────────────────────────────────────

test("F4. NUNCA HAY DOS COSTOS EN LA MISMA CARD", () => {
  // Es la prohibición central del pedido: una línea que salió en pack NO puede
  // mostrar además el costo de la unidad suelta.
  for (const caso of [
    linea(),
    linea({ unidadEnviada: "UNIDAD", factorPack: 1 }),
    linea({ unidadMedida: "cajon", factorPack: 8 }),
    linea({ unidadMedida: "kg", unidadEnviada: "UNIDAD", factorPack: 1 }),
  ]) {
    const t = pintar(caso, { conImporte: true });
    assert.equal(
      (t.match(/Costo /g) || []).length,
      1,
      `la card muestra más de un costo: ${t}`
    );
    assert.equal((t.match(/Total · /g) || []).length, 1);
  }
});

// ── LA PRESENTACIÓN SALE DE LA FUENTE CANÓNICA ────────────────────────────

test("F5. LA CARD NO RESUELVE LA PRESENTACIÓN POR SU CUENTA", () => {
  const fuente = codigoDe("components/transferencias/WorkspaceRecepcion.jsx");
  // Usa el helper del dominio…
  assert.match(fuente, /nombreDePresentacion\(envio\)/);
  assert.match(fuente, /from "@\/lib\/transferencias\/presentacionEnvio"/);
  // …y NO reimplementa el eje en ningún lado del archivo.
  assert.doesNotMatch(
    fuente,
    /unidadEnviada\s*===\s*["']BULTO["']/,
    "el componente volvió a decidir la presentación por su cuenta"
  );
  assert.doesNotMatch(fuente, /"PACK x"|'PACK x'|`PACK x/, "el rótulo se está armando a mano");
});

test("F6. Y EL IMPORTE NO SE RECALCULA: sale tal cual del endpoint", () => {
  // Un total calculado en el front puede divergir del que valorizó el servidor,
  // que es el que cuadra con la lista y con los dos PDF.
  const fuente = codigoDe("components/transferencias/WorkspaceRecepcion.jsx");
  assert.match(fuente, /fmtMoneda\(d\.precioCosto\)/);
  assert.match(fuente, /fmtMoneda\(d\.subtotal\)/);
  assert.doesNotMatch(
    fuente,
    /d\.precioCosto\s*\*|\*\s*d\.precioCosto|d\.cantidadEnviada\s*\*/,
    "la pantalla está multiplicando para llegar al total"
  );
});

// ── LO QUE YA EXISTÍA NO SE MOVIÓ ─────────────────────────────────────────

test("F7. NO DECLARADO conserva su renglón y también muestra su importe", () => {
  const t = pintar(
    linea({
      nombre: "9 de Oro",
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 13,
      unidadEnviada: "UNIDAD",
      factorPack: 1,
      precioCosto: 2500,
      subtotal: 32500,
    }),
    { conImporte: true }
  );
  // Sigue diciendo "Recibido", no "Enviado": una línea agregada no tiene remito.
  assert.match(t, /Recibido 13 UNIDAD/);
  assert.doesNotMatch(t, /Enviado/);
  // Y la fila del dinero está igual que en cualquier otra card: la geometría no
  // cambia por ser un no declarado.
  assert.match(t, /Costo UNIDAD · \$ 2\.500,00/);
  assert.match(t, /Total · \$ 32\.500,00/);
});

test("F8. REVISADO sigue mostrando su marca y su resultado", () => {
  const t = pintar(
    linea({ revisadoEnRecepcion: true, cantidadRecibida: 2 }),
    { conImporte: true }
  );
  assert.match(t, /Revisado/);
  // El importe no desplaza al estado: los dos están.
  assert.match(t, /Costo PACK x6/);
});

// ── ESCRITORIO NO CAMBIA ──────────────────────────────────────────────────

test("F9. SIN `conImporte` LA CARD ES LA DE ANTES: escritorio intacto", () => {
  // Es la garantía de que esta tanda no tocó escritorio, y es de comportamiento:
  // la misma fila, montada como la monta la lista de escritorio, no dibuja ni el
  // costo ni el total.
  const t = pintar(linea());
  assert.doesNotMatch(t, /Costo /, "la fila de dinero se coló en escritorio");
  assert.doesNotMatch(t, /Total · /);
  // Y lo que escritorio ya mostraba sigue estando.
  assert.match(t, /AMARGO OBRERO 950ML/);
  assert.match(t, /Enviado 2 PACK x6/);
});

test("F10. Y LA LISTA DE ESCRITORIO NO PIDE EL IMPORTE", () => {
  const fuente = codigoDe("components/transferencias/WorkspaceRecepcion.jsx");
  // El único `conImporte` del archivo es la declaración de la prop con su
  // default en false. Si la lista de escritorio lo pasara, aparecería un segundo.
  assert.equal(
    (fuente.match(/conImporte/g) || []).length,
    2,
    "alguien le pasó conImporte a la lista de escritorio"
  );
  assert.match(fuente, /conImporte = false/);
  // Y el móvil sí lo pide.
  assert.match(codigoDe("components/transferencias/RecepcionMovil.jsx"), /conImporte/);
});

// ── LA GEOMETRÍA: LO QUE IMPIDE QUE LA FILA SE PARTA ──────────────────────

test("F11. LA FILA NO SE PARTE EN DOS RENGLONES", () => {
  // Es lo único de la altura que se puede afirmar sin navegador, y es lo que la
  // sostiene: la izquierda recorta y la derecha no se encoge. Sin estas clases,
  // un "CAJÓN x8" con un importe largo pasaría a dos renglones y esa card
  // quedaría más alta que la de una unidad.
  const html = renderToStaticMarkup(
    React.createElement(FilaProducto, {
      d: linea(),
      activa: false,
      onElegir: () => {},
      conImporte: true,
    })
  );
  // El recorte llega hasta los TRES cierres del final —el importe, el lado
  // derecho y la fila—. Una versión anterior cortaba en el primer par y dejaba
  // afuera justo el lado que venía a comprobar: el candado daba rojo sobre un
  // componente correcto.
  const fila = html.match(
    /<span class="flex items-baseline justify-between[\s\S]*?<\/span><\/span><\/span>/
  );
  assert.ok(fila, "no se encontró la fila del dinero en el marcado");
  assert.match(fila[0], /Costo /, "el recorte no agarró el lado del costo");
  assert.match(fila[0], /Total · /, "el recorte no agarró el lado del total");
  assert.match(fila[0], /min-w-0 truncate/, "el lado del costo puede pasar a dos renglones");
  assert.match(fila[0], /shrink-0 whitespace-nowrap/, "el total puede partirse");
});

test("F12. CERO HARDCODEO DE COLOR EN LA FILA NUEVA", () => {
  const fuente = codigoDe("components/transferencias/WorkspaceRecepcion.jsx");
  assert.doesNotMatch(fuente, /#[0-9a-fA-F]{3,8}\b/, "entró un hex");
  assert.doesNotMatch(fuente, /rgba?\(/, "entró un rgb");
  // Y los tonos que usa la fila son los tokens del tema.
  assert.match(fuente, /sunmi-text-muted/);
  assert.match(fuente, /sunmi-text-strong/);
});
