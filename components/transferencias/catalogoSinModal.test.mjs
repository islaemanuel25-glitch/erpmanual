// EL PRODUCTO NO DECLARADO SE INFORMA SIN ABRIR NINGÚN MODAL (V16).
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/catalogoSinModal.test.mjs
//
// ── EL DEFECTO QUE CIERRA ────────────────────────────────────────────────
//
// Eran DOS búsquedas para lo mismo. Se escribía en el buscador de la pantalla,
// la pantalla avisaba que el producto no figuraba, había que tocar un botón, se
// abría un modal, y **había que volver a escribir lo mismo**. Con la mercadería
// en la mano, eso es tipear dos veces para informar una caja.
//
// Salió de usarlo con la #195. Ahora el mismo texto busca en los dos lados y los
// resultados del catálogo bajan como filas de la misma lista.
//
// ── QUÉ SE CONSERVA, Y POR QUÉ IMPORTA ───────────────────────────────────
//
// El modal NO se borra: escritorio lo sigue usando, porque allá la lista y la
// ficha van lado a lado y el panel no estorba. Lo que no puede haber son dos
// implementaciones de la misma fila ni dos armadores del mismo pedido — el día
// que una cambie, el teléfono y la computadora dirían cosas distintas sobre el
// mismo producto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FilaCatalogoRecepcion, {
  ROTULO_CATALOGO,
  ACCION_AGREGAR_FILA,
} from "./FilaCatalogoRecepcion.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const texto = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

const MOVIL = "components/transferencias/RecepcionMovil.jsx";
const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";

/** Un resultado tal como lo manda `buscar-productos-origen`. */
const producto = (extra = {}) => ({
  productoLocalId: 4210,
  baseId: 2461,
  nombre: "COCA COLA ZERO 2.25L",
  codigoBarra: "7790895000324",
  unidadMedida: "pack",
  factorPack: 6,
  categoriaNombre: "Bebidas",
  precioVenta: 4800,
  ...extra,
});

const pintarFila = (p, props = {}) =>
  texto(renderToStaticMarkup(React.createElement(FilaCatalogoRecepcion, { p, onElegir: () => {}, ...props })));

// ═══════════════════════════════════════════════════════════════════════════
// LA FILA
// ═══════════════════════════════════════════════════════════════════════════

test("C1. LA FILA DICE LO QUE HACE FALTA PARA RECONOCER LA CAJA", () => {
  const t = pintarFila(producto());
  assert.match(t, /COCA COLA ZERO 2\.25L/);
  assert.match(t, /7790895000324/, "sin el código no se distinguen dos presentaciones del mismo producto");
  assert.match(t, /PACK x6/);
  assert.match(t, /Bebidas/);
  assert.match(t, /\$4\.800,00/);
  assert.match(t, new RegExp(ACCION_AGREGAR_FILA.replace("+", "\\+")));
});

test("C2. NI STOCK NI COSTO DEL ORIGEN", () => {
  // `transferencias.recibir` no es el permiso de ver stock ni costos, y el
  // endpoint dejó de mandarlos. Antes esto dibujaba "Stock origen 0" para todos
  // —un dato falso, que es peor que un dato que no está—.
  const t = pintarFila(producto());
  for (const prohibido of ["Stock", "Costo", "Disponible"]) {
    assert.ok(!t.includes(prohibido), `la fila volvió a mostrar "${prohibido}"`);
  }
  const fuente = codigoDe("components/transferencias/FilaCatalogoRecepcion.jsx");
  assert.ok(!/stockActual|precioCosto/.test(fuente));
});

test("C3. SIN PRECIO NO SE INVENTA UN CERO", () => {
  // Es el defecto del "Stock origen 0" otra vez: un cero fabricado se lee como
  // un dato y no como una ausencia.
  const t = pintarFila(producto({ precioVenta: null, precio: null }));
  assert.doesNotMatch(t, /\$0,00/);
  assert.match(t, /COCA COLA ZERO/, "la fila tiene que seguir sirviendo sin precio");
});

// ═══════════════════════════════════════════════════════════════════════════
// CERO MODALES EN EL CAMINO DEL TELÉFONO
// ═══════════════════════════════════════════════════════════════════════════

test("C4. EL MÓVIL DIBUJA LAS FILAS Y NO ABRE NINGÚN MODAL PARA ESTO", () => {
  const movil = codigoDe(MOVIL);
  assert.match(movil, /<FilaCatalogoRecepcion/, "el móvil dejó de mostrar el catálogo en línea");
  assert.ok(
    !movil.includes("onAbrirAgregar"),
    "volvió el botón que abría el modal: son dos búsquedas para lo mismo"
  );
  // Las tres hojas del móvil son las de siempre —producto, más acciones e
  // información general—. El catálogo no agregó una cuarta.
  assert.equal(
    (movil.match(/forma="hoja"/g) || []).length,
    3,
    "apareció una hoja nueva en el camino del teléfono"
  );
});

test("C5. EL AVISO ES UNA LÍNEA Y DICE QUÉ HACER", () => {
  const movil = codigoDe(MOVIL);
  assert.match(movil, /MENSAJE_NO_FIGURA_CORTO/);
  assert.ok(
    !movil.includes("informalo como producto no declarado"),
    "quedó el texto que mandaba a buscar un botón que ya no existe"
  );
});

test("C6. EL ROTULO DE LA SECCIÓN SALE DE LA PIEZA, no escrito a mano", () => {
  assert.equal(ROTULO_CATALOGO, "EN EL CATÁLOGO");
  assert.match(codigoDe(MOVIL), /\{ROTULO_CATALOGO\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CEREBRO SIGUE SIENDO UNO SOLO
// ═══════════════════════════════════════════════════════════════════════════

test("C7. LA BÚSQUEDA VIVE EN EL WORKSPACE, no en la composición móvil", () => {
  // `RecepcionMovil` es presentación: sin estado de negocio, sin endpoints. Si
  // buscara por su cuenta, el teléfono y el escritorio podrían ofrecer productos
  // distintos para el mismo texto.
  const movil = codigoDe(MOVIL);
  for (const prohibido of ["fetch(", "useMemo(", "buscar-productos-origen"]) {
    assert.ok(!movil.includes(prohibido), `la composición móvil está decidiendo: «${prohibido}»`);
  }
  assert.equal((movil.match(/useState\(/g) || []).length, 2, "el móvil se guardó estado de negocio");

  const ws = codigoDe(WORKSPACE);
  assert.match(ws, /buscar-productos-origen/, "el cerebro dejó de consultar el catálogo");
  assert.match(ws, /catalogo=\{catalogo\}/);
  assert.match(ws, /onAgregarDesdeCatalogo=\{agregarDesdeCatalogo\}/);
});

test("C8. SOLO SE CONSULTA EL CATÁLOGO CUANDO EL PRODUCTO NO FIGURA", () => {
  // Buscar en cada tecla sería pedirle al servidor 150 veces algo que el 99 % de
  // las veces ya está en la lista de arriba.
  const ws = codigoDe(WORKSPACE);
  assert.match(ws, /if \(!noFigura \|\| !puedeRecibir \|\| !item\?\.id\)/);
  assert.match(ws, /q\.length < 2/, "se perdió el mínimo de caracteres");
  assert.match(ws, /setTimeout\(/, "se perdió el respiro entre teclas");
});

test("C9. UN SOLO ARMADOR DEL PEDIDO, compartido con el modal", () => {
  // Con dos armadores, el día que el contrato cambie uno de los dos manda un
  // pedido que el servidor rechaza.
  const ws = codigoDe(WORKSPACE);
  assert.match(ws, /validarLineaNueva\(\{/);
  assert.match(ws, /unidadDeProductoNuevo\(producto\)/);
  // Y la línea nace en CERO: proponer un 1 es proponer un dato que nadie contó.
  assert.match(ws, /recibido: 0,/);
});

test("C10. EL MODAL SIGUE EXISTIENDO PARA ESCRITORIO", () => {
  // No se borra: allá la lista y la ficha van lado a lado y el panel no
  // estorba. Y `ACCION_AGREGAR` lo importa el escritorio — si el archivo
  // desapareciera, esa pantalla deja de compilar.
  const ws = codigoDe(WORKSPACE);
  assert.match(ws, /<AgregarProductoRecibido/);
  assert.match(ws, /setAgregarAbierto\(true\)/);
  assert.ok(
    fs.existsSync(path.join(RAIZ, "components/transferencias/AgregarProductoRecibido.jsx")),
    "se borró el modal que usa escritorio"
  );
});

test("C11. UNA SOLA FILA PARA LAS DOS SUPERFICIES", () => {
  // El modal reusa la pieza extraída en vez de conservar su copia. Dos filas
  // para lo mismo es cómo el teléfono y la computadora terminan diciendo cosas
  // distintas del mismo producto.
  const agregar = codigoDe("components/transferencias/AgregarProductoRecibido.jsx");
  assert.match(agregar, /FilaCatalogoRecepcion/, "el modal se quedó con su copia de la fila");
  assert.ok(
    !/function FilaResultado\(/.test(agregar),
    "quedó la fila vieja adentro del modal: son dos implementaciones de lo mismo"
  );
});
