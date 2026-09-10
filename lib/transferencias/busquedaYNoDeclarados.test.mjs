// BUSCAR ALGO QUE NO ESTÁ, Y NO PERDER LO QUE SE AGREGÓ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/busquedaYNoDeclarados.test.mjs
//
// Dos defectos que se tocan, y los dos terminan con el operador buscando algo
// que el sistema tiene o no tiene sin decírselo.
//
// ── EL PRIMERO: EL CAMINO DE SALIDA ESTABA DETRÁS DE UNA TECLA ──────────
//
// Se escribía "9 de oro", no coincidía con ninguna línea visible, y la pantalla
// contestaba "No hay productos que coincidan con este filtro". Para que
// apareciera el botón de informarlo había que tocar Enter — una tecla que nadie
// sabía que había que apretar, sobre un mensaje que hablaba del filtro.
//
// ── EL SEGUNDO: LO AGREGADO DESAPARECÍA ────────────────────────────────
//
// Un producto informado como no declarado no estaba en Pendientes, ni en
// Diferencias, ni en Revisados — **ni en "Todos"**, que excluía a los agregados
// a propósito. Existía en la base y en ningún filtro.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FILTRO,
  ESTADO_PRODUCTO,
  estadoDeProducto,
  faltaEnLaTransferencia,
  pasaFiltro,
  productosVisibles,
  resumenDeRecepcion,
} from "./controlFisico.js";
import { FilaProducto } from "@/components/transferencias/WorkspaceRecepcion";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";
const MOVIL = "components/transferencias/RecepcionMovil.jsx";

/** Una línea del remito, con la forma del DTO de `/api/transferencias/detalle`. */
const linea = (extra = {}) => ({
  id: 1,
  nombre: "COCA COLA 2L",
  codigoBarra: "7790895000218",
  cantidadEnviada: 48,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  unidadEnviada: "UNIDAD",
  factorPack: 8,
  unidadMedida: "cajon",
  presentacionEnvio: "CAJON",
  cantidadPresentada: 6,
  sueltasEnviadas: 0,
  factorPresentacion: 8,
  pesoPiezaKg: null,
  categoria: { id: 3, nombre: "Bebidas" },
  ...extra,
});

/** Una línea agregada durante la recepción, con su escala ya congelada. */
const agregada = (extra = {}) =>
  linea({
    id: 99,
    nombre: "9 DE ORO CLASICAS",
    codigoBarra: "7792200000159",
    cantidadEnviada: 0,
    cantidadRecibida: 2,
    recibidoUnidadesSueltas: 1,
    agregadoEnRecepcion: true,
    unidadEnviada: "BULTO",
    factorPack: 24,
    unidadMedida: "pack",
    presentacionEnvio: "PACK",
    cantidadPresentada: 0,
    sueltasEnviadas: 0,
    factorPresentacion: 24,
    categoria: { id: 9, nombre: "Galletitas" },
    ...extra,
  });

// ═══════════════════════════════════════════════════════════════════════════
// 1-3. "NO FIGURA" SE DECIDE MIENTRAS SE ESCRIBE, Y CONTRA TODO EL REMITO
// ═══════════════════════════════════════════════════════════════════════════

test("1. un texto que no está en la transferencia ofrece el camino de salida", () => {
  const items = [linea()];
  assert.equal(faltaEnLaTransferencia(items, "9 de oro"), true);

  // Y NO hace falta Enter: la pantalla lo deriva del texto en un `useMemo`.
  const src = codigoDe(WORKSPACE);
  assert.match(src, /const noFigura = useMemo\(/);
  assert.match(src, /faltaEnLaTransferencia\(items, texto\)/);

  // El CTA cuelga de ese booleano, no de haber tocado una tecla.
  assert.match(src, /\{noFigura && puedeRecibir && \(/);

  // Y el mensaje del FILTRO se calla cuando el producto directamente no esta:
  // una lista vacia porque el filtro tapo lo que hay no es lo mismo que una
  // lista vacia porque el producto no existe, y repetir "no coincide con este
  // filtro" manda a mirar el filtro.
  assert.match(src, /visibles\.length === 0 && !noFigura/);
  assert.match(codigoDe(MOVIL), /visibles\.length === 0 && !noFigura/);
  assert.ok(
    !/aviso === MENSAJE_NO_FIGURA/.test(src),
    "el camino de salida volvió a depender de un aviso que solo existe tras Enter"
  );
});

test("1b. y en el teléfono también, que es donde se trabaja", () => {
  const src = codigoDe(MOVIL);
  assert.match(src, /\{noFigura && puedeRecibir && \(/);
  assert.ok(
    !/aviso === mensajeNoFigura/.test(src),
    "la composición móvil volvió a comparar strings para decidir esto"
  );
});

test("2. un producto que SÍ está pero está tapado por un filtro NO lo ofrece", () => {
  // El caso exacto: "Coca Cola" está en la transferencia, pero el operador está
  // mirando Revisados y la línea está pendiente. La lista sale vacía.
  const items = [linea()];
  const visibles = productosVisibles(items, { filtro: FILTRO.REVISADOS, texto: "coca" });
  assert.equal(visibles.length, 0, "el filtro efectivamente la tapa");

  // Y aun así NO se ofrece informarla como no declarada: está en el remito.
  assert.equal(faltaEnLaTransferencia(items, "coca"), false);
});

test("2b. tampoco lo tapa un chip de categoría", () => {
  const items = [linea()];
  const visibles = productosVisibles(items, {
    filtro: FILTRO.TODOS,
    categoriaId: "9",
    texto: "coca",
  });
  assert.equal(visibles.length, 0);
  assert.equal(faltaEnLaTransferencia(items, "coca"), false);
});

test("2c. LA CONTRAPRUEBA: preguntarle a la lista filtrada daría lo contrario", () => {
  // Es el error que el nombre del parámetro existe para evitar. Si alguien le
  // pasara `visibles` en vez de `items`, un producto tapado por el filtro se
  // leería como ausente y la pantalla ofrecería duplicarlo.
  const items = [linea()];
  const visibles = productosVisibles(items, { filtro: FILTRO.REVISADOS, texto: "coca" });
  assert.equal(
    faltaEnLaTransferencia(visibles, "coca"),
    true,
    "si esto deja de dar true, la contraprueba dejó de probar el defecto"
  );
  assert.equal(faltaEnLaTransferencia(items, "coca"), false);

  // Y la pantalla le pasa `items`, no `visibles`.
  assert.match(codigoDe(WORKSPACE), /faltaEnLaTransferencia\(items, texto\)/);
});

test("3. con la búsqueda vacía no se ofrece nada", () => {
  const items = [linea()];
  for (const vacio of ["", "   ", null, undefined]) {
    assert.equal(faltaEnLaTransferencia(items, vacio), false, `«${vacio}» ofreció el CTA`);
  }
  // Y con la pantalla todavía sin líneas tampoco: sin transferencia cargada,
  // cualquier texto "no figura" y el CTA aparecería sobre la nada.
  assert.match(codigoDe(WORKSPACE), /items\.length > 0 && faltaEnLaTransferencia/);
});

test("3b. busca por código exacto y por nombre, con la normalización de siempre", () => {
  const items = [linea()];
  assert.equal(faltaEnLaTransferencia(items, "7790895000218"), false, "el código exacto está");
  assert.equal(faltaEnLaTransferencia(items, "COCA"), false, "mayúsculas");
  assert.equal(faltaEnLaTransferencia(items, "cola"), false, "parcial por nombre");
  assert.equal(faltaEnLaTransferencia(items, "zzz-no-existe"), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4-8. LO AGREGADO EXISTE, SE VE Y SE CUENTA APARTE
// ═══════════════════════════════════════════════════════════════════════════

test("4. un no declarado aparece en «Todos»", () => {
  const a = agregada();
  assert.equal(estadoDeProducto(a), ESTADO_PRODUCTO.NO_DECLARADO);
  assert.equal(pasaFiltro(a, FILTRO.TODOS), true, "«Todos» volvió a esconder los agregados");

  const items = [linea(), a];
  const visibles = productosVisibles(items, { filtro: FILTRO.TODOS });
  assert.equal(visibles.length, 2);
  assert.ok(visibles.some((d) => d.id === 99));
});

test("5. con 52 originales y 1 agregado, «Todos» pasa de 52 a 53", () => {
  const originales = Array.from({ length: 52 }, (_, i) => linea({ id: i + 1 }));

  const antes = resumenDeRecepcion(originales);
  assert.equal(antes.totalRemito, 52);
  assert.equal(antes.totalFisico, 52);
  assert.equal(productosVisibles(originales, { filtro: FILTRO.TODOS }).length, 52);

  const conAgregado = [...originales, agregada()];
  const despues = resumenDeRecepcion(conAgregado);
  assert.equal(despues.totalFisico, 53, "el listado físico tiene que crecer");
  assert.equal(productosVisibles(conAgregado, { filtro: FILTRO.TODOS }).length, 53);
});

test("6. y el avance del REMITO no se falsea: 49 pendientes siguen siendo 49", () => {
  // 52 originales, 3 revisados y correctos, 49 pendientes. Se agrega uno.
  const originales = Array.from({ length: 52 }, (_, i) =>
    linea({
      id: i + 1,
      ...(i < 3
        ? { revisadoEnRecepcion: true, cantidadRecibida: 6, recibidoUnidadesSueltas: 0 }
        : {}),
    })
  );
  const conAgregado = [...originales, agregada()];
  const r = resumenDeRecepcion(conAgregado);

  assert.equal(r.pendientes, 49, "el agregado se contó como un pendiente del remito");
  assert.equal(r.totalRemito, 52, "el denominador del remito se movió");
  assert.equal(r.revisados, 3);
  assert.equal(r.noDeclarados, 1);
  assert.equal(r.totalFisico, 53);

  // Los dos números conviven y cuentan cosas distintas. Esa es toda la idea.
  assert.equal(r.totalRemito + r.noDeclarados, r.totalFisico);

  // Y el agregado no entra en Pendientes ni en Diferencias.
  const a = agregada();
  assert.equal(pasaFiltro(a, FILTRO.PENDIENTES), false);
  assert.equal(pasaFiltro(a, FILTRO.DIFERENCIAS), false);
  assert.equal(pasaFiltro(a, FILTRO.REVISADOS), false);
});

test("6b. el tab «Todos» muestra el total FÍSICO y los otros tres el del remito", () => {
  const src = codigoDe(MOVIL);
  assert.match(src, /\[FILTRO\.TODOS\]: \(r\) => r\.totalFisico/);
  assert.match(src, /\[FILTRO\.PENDIENTES\]: \(r\) => r\.pendientes/);
  assert.match(src, /\[FILTRO\.REVISADOS\]: \(r\) => r\.revisados/);
});

test("7. la card del no declarado es una card normal, tocable, con su cantidad", () => {
  const html = renderToStaticMarkup(
    React.createElement(FilaProducto, { d: agregada(), activa: false, onElegir: () => {} })
  );

  // Es un botón del kit, igual que las demás: se toca entera para abrir la ficha.
  assert.match(html, /<button/, "dejó de ser tocable");
  assert.match(html, /data-detalle-id="99"/, "sin ancla para llevar la vista hasta ella");

  // Dice qué llegó, con los bultos completos Y la suelta.
  assert.ok(html.includes("Recibido 2 PACK x24 + 1 unidad suelta"), html.slice(0, 400));

  // Y su procedencia, con el token semántico del tema.
  assert.ok(html.includes("No declarado"), "no se identifica como no declarado");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(html), "apareció un color hexadecimal");

  // Lo que NO tiene: superficie propia, panel aparte ni doble cartel. Se dibuja
  // con la misma pieza que el resto del listado.
  const normal = renderToStaticMarkup(
    React.createElement(FilaProducto, { d: linea(), activa: false, onElegir: () => {} })
  );
  const clase = (h) => (h.match(/class="([^"]*)"/) || [])[1];
  assert.equal(clase(html), clase(normal), "la card del agregado usa otra superficie");
});

test("8. quitar el agregado devuelve «Todos» de 53 a 52", () => {
  const originales = Array.from({ length: 52 }, (_, i) => linea({ id: i + 1 }));
  const conAgregado = [...originales, agregada()];
  assert.equal(resumenDeRecepcion(conAgregado).totalFisico, 53);

  // Quitar es lo que hace la ruta: la línea desaparece de la respuesta.
  const sinAgregado = conAgregado.filter((d) => d.id !== 99);
  assert.equal(resumenDeRecepcion(sinAgregado).totalFisico, 52);
  assert.equal(productosVisibles(sinAgregado, { filtro: FILTRO.TODOS }).length, 52);
});

test("8b. después de agregar, la vista se acomoda para que se vea", () => {
  const src = codigoDe(WORKSPACE);

  // Se pasa a "Todos" y se sueltan los dos filtros que podrían taparlo.
  assert.match(src, /const agregarYMostrar = async \(cuerpo\) => \{/);
  assert.match(src, /setFiltro\(FILTRO\.TODOS\)/);
  assert.match(src, /setCategoriaId\(null\)/);
  assert.match(src, /setTexto\(""\)/);
  assert.match(src, /setPorMostrarId\(json\.detalleId\)/);

  // Y se lleva el scroll hasta la card, por el ancla del DOM.
  assert.match(src, /data-detalle-id=\{d\.id\}/);
  assert.match(src, /scrollIntoView/);

  // Lo que NO se hace: abrirle la ficha. En el teléfono la ficha reemplaza al
  // listado, así que "dejarlo visible" terminaría escondiendo la lista entera.
  const bloque = src.slice(src.indexOf("const agregarYMostrar"), src.indexOf("useEffect(() => {"));
  assert.ok(
    !/setSeleccionadoId/.test(bloque),
    "agregar volvió a abrir la ficha en vez de mostrar la card"
  );

  // Y el modal usa el envoltorio, no el handler pelado.
  assert.match(src, /onAgregar=\{agregarYMostrar\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. LO QUE YA FUNCIONABA NO RETROCEDE
// ═══════════════════════════════════════════════════════════════════════════

test("17. un no declarado conserva su factor congelado, no el del catálogo de hoy", () => {
  // La línea se informó con PACK x24 y el catálogo ya dice x6. Manda el snapshot.
  const a = agregada({ factorPack: 6, factorPresentacion: 24 });
  const html = renderToStaticMarkup(
    React.createElement(FilaProducto, { d: a, activa: false, onElegir: () => {} })
  );
  assert.ok(html.includes("PACK x24"), "leyó el factor vivo");
  assert.ok(!html.includes("PACK x6"), "leyó el factor vivo");
});
