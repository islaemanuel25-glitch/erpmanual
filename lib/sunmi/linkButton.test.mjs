// EL BOTÓN-ENLACE ES UNA PIEZA DEL KIT, Y NO PUEDE VOLVERSE UNA PÍLDORA.
//
// ── QUÉ DEFECTO CIERRA ────────────────────────────────────────────────────
//
// El importador escribía el `<button>` a mano, con `text-xs sunmi-text-accent
// underline` en la propia pantalla. El trinquete lo contaba como elemento crudo
// y tenía razón: una decisión de apariencia repetida fuera del kit.
//
// La migración obvia —`SunmiButton`— era la equivocada: lo habría convertido en
// una píldora con relleno, borde y radio. Por eso el contrato lo tuvo que cerrar
// Figma (fYqIEZxHRb6yx6pIUrUG2h, nodo 13:2) y no el que estaba desplegando.
//
// ── LO QUE ESTE CANDADO AFIRMA, Y POR QUÉ CADA COSA ───────────────────────
//
// Lo que la pieza NO pone es tan contrato como lo que pone. Un enlace sin caja
// se alinea con el texto que lo rodea; en cuanto alguien le agregue un `px-3`
// "para que respire", deja de ser un enlace y nadie se va a acordar de por qué
// no lo tenía.
//
// Y el margen exterior es del consumidor a propósito: dónde se separa del
// párrafo de arriba lo decide la pantalla. Por eso se afirma que el importador
// conserva su `mt-1` — si mañana alguien lo mete adentro de la pieza, todas las
// pantallas heredan una separación que solo una pidió.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PIEZA_RUTA = path.join(RAIZ, "components/sunmi/SunmiLinkButton.jsx");
const CONSUMIDOR_RUTA = path.join(RAIZ, "components/compras-proveedor/ImportarPedidoDesdeArchivo.jsx");

test("la pieza vive en el kit", () => {
  // No es un detalle de orden: el contador exime a `components/sunmi/` de la
  // regla de elementos crudos porque una pieza del kit ES lo que renderiza. Si
  // esto viviera en otro lado, el `<button>` de adentro volvería a ser deuda.
  assert.ok(fs.existsSync(PIEZA_RUTA), "SunmiLinkButton no está en components/sunmi/");
});

/**
 * El archivo SIN comentarios. No es prolijidad: es el defecto que este proyecto
 * ya pagó tres veces, y esta misma tanda lo volvió a pagar. El encabezado de
 * `SunmiLinkButton` explica por qué NO es un `<a href>` y transcribe el texto
 * del importador —"Ver los 12 renglones que quedaron afuera"—, así que un
 * candado que mire el texto crudo encuentra las dos cosas que viene a prohibir
 * y da rojo para siempre, señalando su propia documentación.
 */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PIEZA = sinComentarios(fs.readFileSync(PIEZA_RUTA, "utf8"));
const CONSUMIDOR = sinComentarios(fs.readFileSync(CONSUMIDOR_RUTA, "utf8"));

test("renderiza un <button> de verdad, con type button por defecto", () => {
  assert.match(PIEZA, /<button/, "tiene que ser un button: la acción no navega");
  assert.doesNotMatch(PIEZA, /<a\s/, "un <a> mentiría: esto no lleva a ningún lado");
  assert.match(PIEZA, /type\s*=\s*"button"/, "el default tiene que ser type button");
  // Sin el default, adentro de un <form> el botón envía el formulario. Es el
  // defecto clásico y no se ve hasta que alguien lo pone en una pantalla con
  // formulario.
  assert.match(PIEZA, /type\s*=\s*\{\s*type\s*\}/, "el consumidor tiene que poder cambiarlo");
});

test("tiene la apariencia de enlace aprobada", () => {
  for (const clase of ["text-xs", "sunmi-text-accent", "underline"]) {
    assert.ok(PIEZA.includes(clase), `perdió ${clase}, que es parte del contrato`);
  }
});

test("NO agrega fondo, borde, píldora ni padding", () => {
  // Lo que la pieza no pone también es contrato. Ver el encabezado.
  const prohibidas = [
    [/\bbg-/, "fondo"],
    [/\bborder\b|\bborder-[0-9a-z]/, "borde"],
    [/\brounded/, "radio o píldora"],
    [/\bp[xy]?-[0-9]/, "padding"],
    [/sunmi-btn/, "la base del botón con forma de píldora"],
  ];
  for (const [re, que] of prohibidas) {
    assert.doesNotMatch(PIEZA, re, `la pieza agregó ${que}: dejó de ser un enlace`);
  }
});

test("no define anillo de foco propio: usa el nativo del navegador", () => {
  // Al quitarse las supresiones globales, un <button> sin contrato propio vuelve
  // a recibir el anillo nativo de :focus-visible. Agregarle uno acá duplicaría
  // la señal y podría dar doble indicador, que es lo que el contrato de foco
  // evita. Ver lib/sunmi/focoVisible.test.mjs.
  assert.doesNotMatch(PIEZA, /focus/, "la pieza inventó un tratamiento de foco propio");
});

test("no sabe nada del importador: es genérica", () => {
  for (const palabra of ["descartad", "renglones", "Ver menos", "receta", "importar"]) {
    assert.ok(
      !PIEZA.toLowerCase().includes(palabra.toLowerCase()),
      `la pieza conoce "${palabra}": se le metió el caso de uso adentro`
    );
  }
});

test("el importador la consume, y NO escribe el botón a mano", () => {
  assert.match(CONSUMIDOR, /import SunmiLinkButton from "@\/components\/sunmi\/SunmiLinkButton"/);
  assert.match(CONSUMIDOR, /<SunmiLinkButton/);
  assert.doesNotMatch(
    CONSUMIDOR,
    /className="text-xs sunmi-text-accent mt-1 underline"/,
    "volvió el botón crudo con la apariencia escrita en la pantalla"
  );
});

test("y el consumidor conserva SU margen exterior", () => {
  // Figma dejó explícito que el `mt-1` no pertenece a la pieza.
  const uso = CONSUMIDOR.match(/<SunmiLinkButton[\s\S]*?\n\s*>/);
  assert.ok(uso, "no se encontró el uso");
  assert.match(uso[0], /className="mt-1"/, "el importador perdió su separación del párrafo de arriba");
  assert.doesNotMatch(PIEZA, /mt-1/, "el margen del consumidor se metió adentro de la pieza");
});
