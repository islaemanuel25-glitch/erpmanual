// EL PUESTO DE TRABAJO SE DIBUJA, Y DICE LO QUE TIENE QUE DECIR.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/controlFisicoRender.test.mjs
//
// Los candados de `controlFisico.test.mjs` prueban las decisiones; éstos MONTAN
// los componentes con `react-dom/server`. Es lo que atrapa la familia de
// defectos que compila y explota en pantalla, y lo que comprueba que el número
// de la card sea el mismo que sale del filtro cuando se dibuja de verdad.
//
// Lo que esto NO puede contestar, dicho para que nadie lo confunda con una
// validación visual: no mide píxeles, ni recortes, ni superposiciones, ni si el
// modal entra en el viewport a 360.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ResumenControlFisico from "./ResumenControlFisico.jsx";
import AccionesRecepcion, { AVISO_SIN_GUARDAR } from "./AccionesRecepcion.jsx";
import FichaProductoRecepcion, { ROTULO_SUELTAS, TEXTO_ESTADO } from "./FichaProductoRecepcion.jsx";
import { ESTADO_PRODUCTO, FILTRO, resumenDeRecepcion } from "@/lib/transferencias/controlFisico";

const linea = (extra = {}) => ({
  id: 1,
  nombre: "9 de Oro Vainilla",
  codigoBarra: "7790895000997",
  codigoBarraSecundario: null,
  codigoBarraPropio: null,
  cantidadEnviada: 6,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "BULTO",
  factorPack: 6,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  revisadoEnRecepcionAt: null,
  revisadoEnRecepcionPor: null,
  motivoPrincipal: "",
  motivoDetalle: "",
  categoria: { id: 3, nombre: "Bebidas" },
  ...extra,
});

const pintarFicha = (props) =>
  renderToStaticMarkup(React.createElement(FichaProductoRecepcion, { puedeRecibir: true, ...props }));

/**
 * El TEXTO que se lee en pantalla, sin las etiquetas.
 *
 * Hace falta porque el número y su unidad viven en nodos distintos —
 * `35</span> unidades`— así que buscar "35 unidades" en el marcado crudo falla
 * aunque la pantalla lo diga. La primera versión de estos candados se puso roja
 * por eso, y el defecto era del candado: el componente estaba bien.
 */
const texto = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

// ═══════════════════════════════════════════════════════════════════════════

test("el resumen se monta y dice PRODUCTOS, no líneas", () => {
  const items = [
    linea({ id: 1, revisadoEnRecepcion: true, cantidadRecibida: 6 }),
    linea({ id: 2 }),
    linea({ id: 3, agregadoEnRecepcion: true, cantidadEnviada: 0, cantidadRecibida: 2 }),
  ];
  const html = renderToStaticMarkup(
    React.createElement(ResumenControlFisico, {
      resumen: resumenDeRecepcion(items),
      filtro: FILTRO.PENDIENTES,
      onFiltrar: () => {},
    })
  );

  assert.ok(html.includes("Productos revisados"), "no se monta el resumen");
  assert.ok(!/\blíneas\b/i.test(html), "la pantalla habla de líneas y tiene que hablar de productos");

  // El denominador son los del remito: 2, no 3.
  assert.ok(html.includes("1 / 2"), "el producto agregado se está contando en el denominador");
  assert.ok(html.includes("No declarados"), "falta la card del no declarado");

  // La cuenta escrita, para poder verificarla sin confiar.
  assert.match(html, /1 correctos \+ 0 faltantes \+ 0 sobrantes = 1 revisados de 2/);
});

test("las cards exponen su estado con aria-pressed, no solo con color", () => {
  const html = renderToStaticMarkup(
    React.createElement(ResumenControlFisico, {
      resumen: resumenDeRecepcion([linea()]),
      filtro: FILTRO.PENDIENTES,
      onFiltrar: () => {},
    })
  );
  assert.match(html, /aria-pressed="true"/, "el filtro activo no se anuncia");
  assert.match(html, /aria-pressed="false"/, "los inactivos tampoco");
});

test("un producto en PACK x6 se recibe en PACK x6, no en unidades", () => {
  const html = pintarFicha({ producto: linea() });
  assert.ok(html.includes("PACK x6"), "se perdió la presentación del envío");
  // El campo editable arranca proponiendo lo enviado: el caso feliz de un toque.
  assert.match(html, /value="6"/, "no propone lo enviado");
  // Y las unidades físicas se ven, pero como dato secundario.
  assert.ok(html.includes("36 unidades"), "no se muestra el equivalente físico");
});

test("el desglose de sueltas SOLO existe cuando la presentación agrupa", () => {
  const conPack = pintarFicha({ producto: linea() });
  assert.ok(conPack.includes(ROTULO_SUELTAS), "un PACK tiene que poder declarar sueltas");

  const enUnidad = pintarFicha({
    producto: linea({ unidadEnviada: "UNIDAD", factorPack: 1, cantidadEnviada: 10 }),
  });
  assert.ok(
    !enUnidad.includes(ROTULO_SUELTAS),
    "en UNIDAD el desglose no significa nada y se sumaría encima de sí mismo"
  );
});

test("el estado se dice con TEXTO, no solo con color", () => {
  const revisado = pintarFicha({
    producto: linea({ revisadoEnRecepcion: true, cantidadRecibida: 6 }),
  });
  assert.ok(revisado.includes(TEXTO_ESTADO[ESTADO_PRODUCTO.CORRECTO]));

  const faltante = pintarFicha({
    producto: linea({ revisadoEnRecepcion: true, cantidadRecibida: 5, motivoPrincipal: "Faltante" }),
  });
  assert.ok(faltante.includes(TEXTO_ESTADO[ESTADO_PRODUCTO.FALTANTE]));

  const pendiente = pintarFicha({ producto: linea() });
  assert.ok(pendiente.includes(TEXTO_ESTADO[ESTADO_PRODUCTO.PENDIENTE]));
});

test("un pack incompleto muestra 35 unidades y -1 de diferencia", () => {
  const html = pintarFicha({
    producto: linea({
      revisadoEnRecepcion: true,
      cantidadRecibida: 5,
      recibidoUnidadesSueltas: 5,
      motivoPrincipal: "Faltante",
    }),
  });
  const t = texto(html);
  assert.ok(t.includes("Ingreso físico: 35 unidades"), `el pack incompleto no da 35 → ${t.slice(0, 200)}`);
  assert.ok(!t.includes("34,998") && !t.includes("34.998"), "apareció el decimal que se evita");
  assert.ok(t.includes("Diferencia -1 unidad"), "la diferencia física tiene que ser -1");
});

test("6 packs + 1 suelta se lee como diferencia, aunque los packs coincidan", () => {
  const html = pintarFicha({
    producto: linea({
      revisadoEnRecepcion: true,
      cantidadRecibida: 6,
      recibidoUnidadesSueltas: 1,
      motivoPrincipal: "Sobrante",
    }),
  });
  const t = texto(html);
  assert.ok(t.includes("Ingreso físico: 37 unidades"), `→ ${t.slice(0, 200)}`);
  assert.ok(
    t.includes("Diferencia +1 unidad"),
    "comparar solo la presentación diría que no hay diferencia"
  );
  assert.ok(t.includes(TEXTO_ESTADO[ESTADO_PRODUCTO.SOBRANTE]));
});

test("una línea agregada NO pide motivo y ofrece quitarse", () => {
  const html = pintarFicha({
    producto: linea({
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 2,
      revisadoEnRecepcion: true,
    }),
    onQuitar: () => {},
  });
  assert.ok(html.includes("Agregado en recepción"), "falta el badge");
  assert.ok(!html.includes("Motivo de la diferencia"), "su procedencia ya explica el caso");
  assert.ok(html.includes("Quitar producto agregado"));
});

test("una línea DEL REMITO no ofrece quitarse", () => {
  const html = pintarFicha({ producto: linea(), onQuitar: () => {} });
  assert.ok(!html.includes("Quitar producto agregado"), "una línea del remito no se borra");
});

test("recibiendo NO hay 'Guardar cambios': escribiría 150 defaults que nadie contó", () => {
  // El peligro concreto: la ficha PROPONE lo enviado en cada producto para el
  // caso feliz de un toque. Un guardado masivo tomaría esas 150 propuestas como
  // cantidades reales. Sin el handler, el botón no se dibuja.
  const base = {
    id: 97,
    item: { id: 97, estado: "Recibiendo", items: [], origen: {}, destino: {}, resumen: {} },
    me: { id: 1, permisos: ["*"] },
    guardando: false,
    confirmando: false,
    confirmarRecepcion: () => {},
    puedeCancelar: false,
    puedeRecibir: true,
  };

  const recibiendo = renderToStaticMarkup(
    React.createElement(AccionesRecepcion, { ...base, guardarCambios: null, dirty: true })
  );
  assert.ok(!recibiendo.includes("Guardar cambios"), "el guardado masivo sigue ofreciéndose");
  assert.ok(!recibiendo.includes(AVISO_SIN_GUARDAR), "avisa de un borrador que no existe");
  // Pero confirmar sigue estando: es el acto que mueve stock.
  assert.ok(recibiendo.includes("Confirmar recepción"));
  // Y las acciones de siempre no se perdieron.
  for (const t of ["PDF Envío", "PDF Recepción", "Imprimir ticket POS"]) {
    assert.ok(recibiendo.includes(t), `desapareció "${t}"`);
  }

  // Con el handler —el detalle histórico de quien no recibe— sí se dibuja.
  const conGuardar = renderToStaticMarkup(
    React.createElement(AccionesRecepcion, { ...base, guardarCambios: () => {}, dirty: true })
  );
  assert.ok(conGuardar.includes("Guardar cambios"));
  assert.ok(conGuardar.includes(AVISO_SIN_GUARDAR));
});

test("sin permiso de recibir no hay editor ni botón de revisar", () => {
  const html = pintarFicha({
    producto: linea({ revisadoEnRecepcion: true, cantidadRecibida: 6 }),
    puedeRecibir: false,
  });
  assert.ok(!html.includes("Marcar como revisado"));
  assert.ok(!html.includes(ROTULO_SUELTAS));
  // Pero el dato histórico se sigue leyendo.
  assert.ok(html.includes("PACK x6"));
});
