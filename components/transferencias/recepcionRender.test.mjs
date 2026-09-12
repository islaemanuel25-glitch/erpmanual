// LA RECEPCIÓN SE DIBUJA, Y LO QUE DIBUJA DICE LO QUE TIENE QUE DECIR.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/recepcionRender.test.mjs
//
// ── POR QUÉ ESTE ARCHIVO EXISTE APARTE DE recepcionUI.test.mjs ─────────────
//
// Aquéllos prueban FUNCIONES y leen el fuente. Ninguna de las dos cosas monta el
// componente, y `CLAUDE.md` tiene cinco casos anotados del mismo tipo: algo que
// compilaba, con sus candados en verde, y el defecto vivía en el espacio entre
// las piezas. El peor fue un `SunmiInput` sin importar — es JSX, así que compila
// y explota recién en el navegador.
//
// Acá se RENDERIZA de verdad, con `react-dom/server`. No reemplaza abrir la
// pantalla —no mide píxeles, ni recortes, ni si el modal entra en el viewport—,
// pero contesta dos preguntas que ningún candado de texto contesta: que el árbol
// se monta sin explotar, y que lo que sale contiene lo que tiene que contener.
//
// Lo que NO puede contestar está dicho para que nadie lo confunda con una
// verificación visual completa: nada de esto ve superposiciones ni scroll.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TablaDetalleTransferencia from "./TablaDetalleTransferencia.jsx";
import AccionesRecepcion, { AVISO_SIN_GUARDAR } from "./AccionesRecepcion.jsx";

/** Una línea del remito, con la forma que devuelve `/api/transferencias/detalle`. */
const linea = (extra = {}) => ({
  id: 1,
  nombre: "Coca-Cola 2,25 L",
  codigoBarra: "7790895000997",
  cantidadEnviada: 10,
  cantidadRecibida: null,
  precioCosto: 1000,
  subtotal: 10000,
  ajusteOrigen: null,
  devolucionOrigen: null,
  excedenteOrigen: null,
  agregadoEnRecepcion: false,
  agregadoEnRecepcionPor: null,
  agregadoEnRecepcionAt: null,
  motivoPrincipal: "",
  motivoDetalle: "",
  unidadEnviada: "UNIDAD",
  factorPack: 1,
  unidadMedida: "unidad",
  esFiambreFijo: false,
  pesoReferenciaKg: null,
  ...extra,
});

const transferencia = (items, estado = "Recibiendo") => ({
  id: 97,
  estado,
  items,
  origen: { id: 1, nombre: "Depósito" },
  destino: { id: 2, nombre: "Local 4" },
  resumen: { costoTotal: 10000 },
});

const editar = (items) =>
  items.map((d) => ({
    id: d.id,
    enviado: d.cantidadEnviada,
    recibido: d.cantidadRecibida == null ? d.cantidadEnviada : d.cantidadRecibida,
    motivoPrincipal: d.motivoPrincipal || "",
    motivoDetalle: d.motivoDetalle || "",
  }));

const pintar = (props) => {
  const items = props.items;
  return renderToStaticMarkup(
    React.createElement(TablaDetalleTransferencia, {
      item: transferencia(items, props.estado),
      editItems: props.editItems ?? editar(items),
      setEditItems: () => {},
      inputsHabilitados: props.inputsHabilitados ?? true,
      onAgregarProducto: props.onAgregarProducto,
      onQuitarLinea: props.onQuitarLinea,
      quitandoId: null,
    })
  );
};

// ═══════════════════════════════════════════════════════════════════════════

test("A · enviado 10 / recibido 10: se monta y no anuncia diferencia", () => {
  const items = [linea()];
  const html = pintar({ items, editItems: editar(items) });
  assert.ok(html.includes("Coca-Cola 2,25 L"), "no se dibujó el producto");
  assert.ok(html.includes("Productos transferidos"));
  // La diferencia es 0 y se muestra como 0, no como "+0" ni como "—".
  assert.ok(!html.includes("+0"), "un 0 no lleva signo");
});

// ── CÓMO SE MIRA EL MOTIVO, Y POR QUÉ NO SE BUSCAN LAS <option> ───────────
//
// `SunmiSelectAdv` dibuja su lista SOLO cuando está abierto: en el marcado
// cerrado no hay ninguna `<option>`. La primera versión de estos dos candados
// buscaba el texto "Sobrante" en el HTML y daba rojo — no por un defecto del
// producto, sino porque miraba donde no estaba.
//
// Lo que sí se puede afirmar, y es más fuerte: el control CERRADO muestra la
// etiqueta de la opción elegida buscándola entre sus hijos. Así que se renderiza
// con un motivo ya elegido y se comprueba que la etiqueta aparezca. Si la lista
// de opciones fuera la del signo equivocado, el valor guardado no estaría entre
// los hijos, no habría etiqueta que mostrar y saldría el placeholder.

test("B · enviado 10 / recibido 15: dice +5 y su motivo es del SOBRANTE", () => {
  const items = [linea()];
  const editItems = editar(items).map((e) => ({ ...e, recibido: 15, motivoPrincipal: "Sobrante" }));
  const html = pintar({ items, editItems });

  assert.ok(html.includes("+5"), "la diferencia positiva no se lee con signo");
  // Y lo ENVIADO sigue diciendo 10: la pantalla no reescribe el remito.
  assert.ok(html.includes("10"), "se perdió lo enviado");

  // "Sobrante" está entre las opciones, así que el control cerrado lo rotula.
  assert.ok(html.includes("Sobrante"), "el motivo del sobrante no llegó al control");
  assert.ok(!html.includes("Seleccionar"), "el control no reconoció el motivo elegido");

  // Contraprueba en el mismo test: un motivo de FALTANTE sobre una diferencia
  // positiva no está entre las opciones, así que el control cae al placeholder.
  const conFaltante = pintar({
    items,
    editItems: editar(items).map((e) => ({ ...e, recibido: 15, motivoPrincipal: "Faltante" })),
  });
  assert.ok(
    conFaltante.includes("Seleccionar"),
    "un motivo de faltante sigue siendo aceptable sobre un sobrante"
  );
});

test("B2 · enviado 10 / recibido 8: sigue ofreciendo los motivos de siempre", () => {
  const items = [linea()];
  const editItems = editar(items).map((e) => ({ ...e, recibido: 8, motivoPrincipal: "Faltante" }));
  const html = pintar({ items, editItems });
  assert.ok(html.includes("-2"), "la diferencia negativa no se muestra");
  assert.ok(html.includes("Faltante"), "se perdió el motivo del faltante");
  assert.ok(!html.includes("Seleccionar"), "el control no reconoció Faltante");

  const dañado = pintar({
    items,
    editItems: editar(items).map((e) => ({ ...e, recibido: 8, motivoPrincipal: "Producto dañado" })),
  });
  assert.ok(dañado.includes("Producto dañado"), "se perdió el motivo de producto dañado");

  // Y "Sobrante" no es aceptable para explicar una falta.
  const sobrante = pintar({
    items,
    editItems: editar(items).map((e) => ({ ...e, recibido: 8, motivoPrincipal: "Sobrante" })),
  });
  assert.ok(sobrante.includes("Seleccionar"), "se acepta Sobrante para explicar una falta");
});

test("E · una línea agregada se ve marcada, con su ingreso físico y su Quitar", () => {
  const items = [
    linea(),
    linea({
      id: 2,
      nombre: "Fanta 2,25 L",
      cantidadEnviada: 0,
      cantidadRecibida: 2,
      unidadEnviada: "BULTO",
      factorPack: 6,
      agregadoEnRecepcion: true,
      motivoPrincipal: "Sobrante",
    }),
  ];
  const html = pintar({ items, onQuitarLinea: () => {}, onAgregarProducto: () => {} });

  assert.ok(html.includes("Fanta 2,25 L"));
  assert.ok(html.includes("Agregado en recepción"), "la línea agregada no está marcada");
  // 2 bultos de 6 son 12 unidades, y eso se dice.
  assert.ok(html.includes("12 unidades"), "no se muestra el ingreso físico");
  // Quitar aparece para la agregada.
  assert.ok(html.includes("Quitar"), "no se ofrece quitar la línea agregada");

  // Y el botón de agregar está en la cabecera de la sección.
  assert.ok(html.includes("Agregar producto recibido"), "falta el botón de agregar");
});

test("una línea DEL REMITO no ofrece Quitar aunque haya otra que sí", () => {
  const items = [
    linea({ id: 1, nombre: "SoloDelRemito" }),
    linea({ id: 2, nombre: "Agregada", agregadoEnRecepcion: true, cantidadEnviada: 0 }),
  ];
  const html = pintar({ items, onQuitarLinea: () => {} });
  // Un solo "Quitar" en el móvil y uno en la tabla: dos, de la MISMA línea.
  const cuantos = (html.match(/Quitar/g) || []).length;
  assert.equal(cuantos, 2, `hay ${cuantos} botones Quitar: tendría que haber uno por presentación`);
});

test("15 · en Recibida no hay Agregar ni Quitar", () => {
  const items = [linea({ cantidadRecibida: 10, agregadoEnRecepcion: true, cantidadEnviada: 0 })];
  // La página no entrega los handlers cuando no se puede recibir.
  const html = pintar({
    items,
    estado: "Recibida",
    inputsHabilitados: false,
    onAgregarProducto: null,
    onQuitarLinea: null,
  });
  assert.ok(!html.includes("Agregar producto recibido"), "aparece Agregar en una recepción cerrada");
  assert.ok(!html.includes("Quitar"), "aparece Quitar en una recepción cerrada");
  // Pero la marca de línea agregada SÍ se conserva: es historia.
  assert.ok(html.includes("Agregado en recepción"), "se perdió el rastro de la línea agregada");
});

test("14 · el aviso de cambios sin guardar se ve, y solo cuando corresponde", () => {
  const base = {
    id: 97,
    item: transferencia([linea()]),
    me: { id: 1, permisos: ["*"] },
    guardando: false,
    confirmando: false,
    guardarCambios: () => {},
    confirmarRecepcion: () => {},
    puedeCancelar: false,
  };

  const sucio = renderToStaticMarkup(
    React.createElement(AccionesRecepcion, { ...base, puedeRecibir: true, dirty: true })
  );
  assert.ok(sucio.includes(AVISO_SIN_GUARDAR), "no se avisa que hay cambios sin guardar");

  const limpio = renderToStaticMarkup(
    React.createElement(AccionesRecepcion, { ...base, puedeRecibir: true, dirty: false })
  );
  assert.ok(!limpio.includes(AVISO_SIN_GUARDAR), "el aviso aparece sin que haya cambios");

  // Y las acciones que ya existían siguen estando: no se perdió ninguna.
  for (const texto of ["PDF Envío", "PDF Recepción", "Imprimir ticket POS", "Guardar cambios", "Confirmar recepción"]) {
    assert.ok(sucio.includes(texto), `desapareció la acción "${texto}"`);
  }
});

test("una línea AGREGADA no dibuja el selector de motivo, en móvil Y en escritorio", () => {
  // El caso del flujo: Producto A con 10→15 y su Sobrante, más Fanta agregada.
  const items = [
    linea({ id: 1, nombre: "Producto A", cantidadEnviada: 10, cantidadRecibida: null }),
    linea({
      id: 2,
      nombre: "Fanta 2,25 L",
      cantidadEnviada: 0,
      cantidadRecibida: 2,
      unidadEnviada: "BULTO",
      factorPack: 6,
      agregadoEnRecepcion: true,
      // SIN motivo, que es como la crea `linea-recepcion`.
      motivoPrincipal: "",
    }),
  ];
  const editItems = editar(items).map((e) =>
    e.id === 1 ? { ...e, recibido: 15, motivoPrincipal: "Sobrante" } : e
  );
  const html = pintar({ items, editItems });

  // La agregada se identifica sola.
  assert.ok(html.includes("Agregado en recepción"), "falta el badge de la línea agregada");
  assert.ok(html.includes("12 unidades"), "falta el ingreso físico de la agregada");

  // Y la original conserva su motivo, que el control cerrado rotula.
  assert.ok(html.includes("Sobrante"), "la línea original perdió su motivo");
  assert.ok(html.includes("+5"), "la línea original perdió su diferencia");

  // EL CONTRASTE QUE IMPORTA: hay UN solo selector de motivo por presentación
  // —el de la línea original—, no dos. Si la agregada también lo dibujara, el
  // "Seleccionar…" del suyo aparecería, porque no tiene motivo elegido.
  assert.ok(
    !html.includes("Seleccionar"),
    "la línea agregada está dibujando su propio selector de motivo, vacío"
  );

  // El rótulo "Motivo" aparece DOS veces y está bien: uno es el de la card del
  // teléfono y el otro el encabezado de la columna del escritorio. Uno por
  // presentación, no uno por línea — que es lo que pasaría si la agregada
  // también dibujara el suyo.
  const rotulos = (html.match(/>Motivo</g) || []).length;
  assert.equal(rotulos, 2, `hay ${rotulos} rótulos "Motivo": uno por presentación`);
});

test("y una línea agregada SIN motivo no rompe nada al dibujarse sola", () => {
  const items = [
    linea({
      id: 2,
      nombre: "Fanta 2,25 L",
      cantidadEnviada: 0,
      cantidadRecibida: 2,
      unidadEnviada: "BULTO",
      factorPack: 6,
      agregadoEnRecepcion: true,
      motivoPrincipal: "",
    }),
  ];
  const html = pintar({ items });
  assert.ok(html.includes("Fanta 2,25 L"));
  assert.ok(html.includes("Agregado en recepción"));
  assert.ok(!html.includes("Seleccionar"), "se le pide motivo a una línea agregada");
  // Y si NINGUNA línea puede pedir motivo, la columna entera desaparece: quedaría
  // llena de guiones. Esto lo encontró este mismo candado.
  assert.ok(
    !html.includes(">Motivo<"),
    "queda la columna Motivo sin ninguna línea que pueda tener uno"
  );
});

test("17 · un 0 recibido se dibuja como 0 y no como lo enviado", () => {
  const items = [linea()];
  const editItems = editar(items).map((e) => ({ ...e, recibido: 0 }));
  const html = pintar({ items, editItems });
  assert.ok(html.includes("-10"), "la diferencia de un 0 recibido tiene que ser -10");
  assert.ok(html.includes('value="0"'), "el campo tendría que mostrar 0, no el total enviado");
});

// ── EL IMPORTE DE LÍNEA EN ESCRITORIO ─────────────────────────────────────
//
// Los dos defectos de la #191 y de la #195 viven también acá, y por el mismo
// motivo: esta tabla lee `d.subtotal` pelado en sus DOS vistas —la lista de
// tarjetas y la tabla ancha—, sin siquiera la rama de la línea agregada que el
// V16 le puso al teléfono.
//
// El fixture de este archivo tenía el mismo agujero que el del móvil: todas sus
// líneas van con `cantidadRecibida: null`, y ahí `subtotal` y `subtotalRecibido`
// valen lo mismo. Sin una línea corregida, ninguna afirmación sobre plata puede
// distinguir cuál de los dos se leyó.

/** Enviado 10 por $10.000, recibido 25 por $25.000. */
const lineaCorregida = (extra = {}) =>
  linea({ cantidadRecibida: 25, subtotalRecibido: 25000, ...extra });

test("18 · el importe de línea sigue a la CORRECCIÓN, no se queda en el del remito", () => {
  const items = [lineaCorregida()];
  const html = pintar({ items, editItems: editar(items) });
  assert.ok(
    html.includes("25.000"),
    "escritorio no muestra el importe de lo RECIBIDO en una línea corregida"
  );
});

test("19 · y un producto AGREGADO no se dibuja en $0,00, que es la #195 de este lado", () => {
  // Una agregada no venía en el remito: su `subtotal` vale cero por definición.
  // Mostrarlo es decir que no vale nada la mercadería que sí entró.
  const items = [
    lineaCorregida({
      id: 2,
      nombre: "Fanta 2,25 L",
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 13,
      subtotal: 0,
      subtotalRecibido: 32500,
    }),
  ];
  const html = pintar({ items, editItems: editar(items) });
  assert.ok(html.includes("32.500"), "escritorio no valoriza el producto agregado");
});
