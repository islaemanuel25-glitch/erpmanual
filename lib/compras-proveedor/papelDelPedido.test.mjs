// UNA PANTALLA NO AFIRMA "SIN PAPEL" SOBRE UN PEDIDO QUE TIENE COMPROBANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/papelDelPedido.test.mjs
//
// ── EL DEFECTO QUE ESTE CANDADO EXISTE PARA ATAJAR ────────────────────────
//
// Desplegado en `037ac915`, el pedido 232 —RECIBIDO, 24 líneas, con el
// comprobante 5 leído el 2026-09-20 y 15 renglones, 13 atados a una línea del
// pedido— mostró en pantalla dos frases falsas: "Este pedido se cerró sin
// ningún papel del proveedor" y "Estos 24 no venían en el papel".
//
// La causa no era el texto: eran DOS CRITERIOS para la misma pregunta. El
// servidor resuelve el papel buscando los comprobantes del pedido; la pantalla
// lo resolvía mirando si `filas` venía vacía, y `filas` estaba vacía porque el
// efecto que pide la conciliación cortaba antes de pedirla —esperaba el aviso de
// `PanelComprobantes`, que en RECIBIDO no se monta—. La pantalla concluyó "no
// hay papel" de un dato que nunca pidió.
//
// ── QUÉ SE AFIRMA ACÁ, Y POR QUÉ EN DOS NIVELES ───────────────────────────
//
// Las funciones puras se prueban con la forma que produce `filasDeConciliacion`
// —la del endpoint, no una escrita a mano—, y la pantalla se RENDERIZA de
// verdad con `react-dom/server`. Lo segundo es lo que cierra el agujero: el
// defecto no fue una decisión mal escrita, fue una frase dibujada, y un candado
// que solo mirara la función habría quedado verde con la pantalla mintiendo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PAPEL,
  papelDelPedido,
  cuantosComprobantes,
  hayQuePedirLaConciliacion,
  sePuedeAfirmarQueNoHayPapel,
} from "@/lib/compras-proveedor/papelDelPedido";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import PedidoRecibido from "@/components/compras-proveedor/PedidoRecibido.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Un candado que mira código saca los comentarios antes de mirar. */
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const FRASE_SIN_PAPEL = "sin ningún papel del proveedor";

// ── LOS DATOS DEL 232, MEDIDOS CONTRA PRODUCCIÓN ──────────────────────────
//
// 24 líneas en el pedido, un comprobante con renglones. No están escritos de
// memoria: salieron de contar en la base el 2026-09-21.
const DETALLES = [
  { id: 2565, productoBaseId: 2019, nombre: "Marlboro 20 Crafted Box", cantidad: 4, precioCosto: 40500, unidad: "BULTO", cantidadRecibida: 2 },
  { id: 2574, productoBaseId: 2031, nombre: "Philips 10", cantidad: 8, precioCosto: 34603.2, unidad: "BULTO", cantidadRecibida: 8 },
  { id: 2578, productoBaseId: 2044, nombre: "Liverpool rojo", cantidad: 25, precioCosto: 13200, unidad: "BULTO", cantidadRecibida: 25 },
];
const lineaDelPapel = (id, det) => ({
  id,
  textoCrudo: "M.CRAFTED 20 BOX",
  cantidad: det.cantidadRecibida,
  subtotalImpreso: det.cantidadRecibida * det.precioCosto,
  productoLocalId: 6100 + id,
  pedidoDetalleId: det.id,
  pedidoDetalle: det,
  precio: { precioAEscribir: det.precioCosto },
  unidad: { escala: "PEDIDO" },
});

/** La respuesta del endpoint, armada con la función que la arma de verdad. */
const respuestaCon = (lineas) => {
  const { grupos, sinComprobante } = filasDeConciliacion({
    comprobantes: lineas
      ? [{ id: 5, estado: "SIN_TOTAL", tipo: null, puntoVenta: null, numero: null, lineas }]
      : [],
    detalles: DETALLES,
  });
  return { ok: true, grupos, sinComprobante };
};

const CON_PAPEL = respuestaCon([lineaDelPapel(120, DETALLES[0]), lineaDelPapel(110, DETALLES[1])]);
const PAPEL_SIN_LEER = respuestaCon([]);
const NINGUN_PAPEL = respuestaCon(null);

// ── LAS FUNCIONES PURAS ───────────────────────────────────────────────────

test("con un comprobante con renglones, hay papel", () => {
  assert.equal(cuantosComprobantes(CON_PAPEL), 1);
  assert.equal(papelDelPedido({ conciliacion: CON_PAPEL }), PAPEL.CON_PAPEL);
  assert.equal(sePuedeAfirmarQueNoHayPapel(papelDelPedido({ conciliacion: CON_PAPEL })), false);
});

test("UN COMPROBANTE SIN LEER NO ES 'SIN PAPEL': el papel está, falta leerlo", () => {
  assert.equal(cuantosComprobantes(PAPEL_SIN_LEER), 1);
  assert.equal(papelDelPedido({ conciliacion: PAPEL_SIN_LEER }), PAPEL.SIN_LEER);
  assert.equal(sePuedeAfirmarQueNoHayPapel(papelDelPedido({ conciliacion: PAPEL_SIN_LEER })), false);
});

test("sin ningún comprobante, y solo ahí, se puede decir que no hay papel", () => {
  assert.equal(cuantosComprobantes(NINGUN_PAPEL), 0);
  assert.equal(papelDelPedido({ conciliacion: NINGUN_PAPEL }), PAPEL.SIN_PAPEL);
  assert.equal(sePuedeAfirmarQueNoHayPapel(papelDelPedido({ conciliacion: NINGUN_PAPEL })), true);
});

test("NO SABER TODAVÍA NO ES 'NO HAY': null es CARGANDO y un fallo es NO_SE_PUDO", () => {
  // Es la forma exacta del defecto: la respuesta nunca llegó y eso se leyó como
  // un "no hay papel".
  assert.equal(cuantosComprobantes(null), null);
  assert.equal(papelDelPedido({ conciliacion: null }), PAPEL.CARGANDO);
  assert.equal(papelDelPedido({ conciliacion: null, fallo: true }), PAPEL.NO_SE_PUDO);
  assert.equal(papelDelPedido({ conciliacion: CON_PAPEL, fallo: true }), PAPEL.NO_SE_PUDO);
  for (const estado of [PAPEL.CARGANDO, PAPEL.NO_SE_PUDO]) {
    assert.equal(sePuedeAfirmarQueNoHayPapel(estado), false);
  }
});

test("UN PEDIDO RECIBIDO PIDE LA CONCILIACIÓN AUNQUE NADIE LE HAYA AVISADO NADA", () => {
  // La contraprueba del defecto, escrita como condición: con la regla vieja
  // —`hayComprobantes === 0` corta— esta llamada daba false y la pantalla no
  // preguntaba nunca.
  assert.equal(hayQuePedirLaConciliacion({ estado: "RECIBIDO", hayComprobantes: 0 }), true);
  assert.equal(hayQuePedirLaConciliacion({ estado: "RECIBIDO" }), true);
  // En ENVIADO el panel sí está montado y sí avisa, así que ahí la condición se
  // conserva tal cual estaba.
  assert.equal(hayQuePedirLaConciliacion({ estado: "ENVIADO", hayComprobantes: 0 }), false);
  assert.equal(hayQuePedirLaConciliacion({ estado: "ENVIADO", hayComprobantes: 1 }), true);
  assert.equal(hayQuePedirLaConciliacion({ estado: "BORRADOR", hayComprobantes: 3 }), false);
});

// ── Y LA PANTALLA, RENDERIZADA ────────────────────────────────────────────

const PEDIDO = {
  id: 232,
  estado: "RECIBIDO",
  fechaRecibido: "2026-09-20T13:40:00.000Z",
  proveedor: { nombre: "Mauro" },
  detalles: DETALLES.map((d) => ({ ...d, producto: { base: { nombre: d.nombre } } })),
};

const dibujar = (props) =>
  renderToStaticMarkup(
    React.createElement(PedidoRecibido, {
      pedido: PEDIDO,
      comprobante: CON_PAPEL.grupos[0]?.comprobante ?? null,
      filas: [],
      sinComprobante: [],
      conciliacion: null,
      ...props,
    })
  );

test("CON COMPROBANTE, LA PANTALLA NO DICE QUE NO HAY PAPEL", () => {
  const html = dibujar({
    filas: CON_PAPEL.grupos[0].filas,
    sinComprobante: CON_PAPEL.sinComprobante,
    conciliacion: CON_PAPEL,
  });
  assert.ok(!html.includes(FRASE_SIN_PAPEL), "afirmó que no hay papel teniendo comprobante");
  // Y lo acordado vuelve a estar: los tres números, el papel y las dos listas.
  for (const texto of [
    "Te facturó",
    "A tus precios vale",
    "Ganás",
    "El papel de Mauro",
    "Entró esto",
    // Sin la "n" final: el fixture deja UNA línea afuera del papel y el título
    // se dice en singular. Lo que se afirma es que la lista aparte sigue
    // existiendo y sigue nombrándose por lo que es.
    "no venía en el papel",
  ]) {
    assert.ok(html.includes(texto), `falta en la pantalla: ${texto}`);
  }
});

test("MIENTRAS NO LLEGÓ LA RESPUESTA, LA PANTALLA NO AFIRMA NADA SOBRE EL PAPEL", () => {
  const html = dibujar({ conciliacion: null });
  assert.ok(!html.includes(FRASE_SIN_PAPEL), "afirmó sin haber preguntado");
  const roto = dibujar({ conciliacion: null, falloElPapel: true });
  assert.ok(!roto.includes(FRASE_SIN_PAPEL), "afirmó después de un fallo");
  assert.ok(roto.includes("No se pudo leer el papel"), "el fallo no se dice");
});

test("con el papel subido y sin leer, lo dice y no inventa una factura", () => {
  const html = dibujar({
    filas: [],
    sinComprobante: PAPEL_SIN_LEER.sinComprobante,
    conciliacion: PAPEL_SIN_LEER,
  });
  assert.ok(!html.includes(FRASE_SIN_PAPEL));
  assert.ok(html.includes("todavía no se leyó"));
  assert.ok(!html.includes("Te facturó"), "dibujó plata sin renglones leídos");
});

test("CONTRAPRUEBA: sin ningún comprobante, la frase SÍ aparece", () => {
  // Sin esto, los candados de arriba pasarían con la frase borrada del archivo.
  const html = dibujar({
    filas: [],
    sinComprobante: NINGUN_PAPEL.sinComprobante,
    conciliacion: NINGUN_PAPEL,
  });
  assert.ok(html.includes(FRASE_SIN_PAPEL), "el caso real de un pedido sin papel dejó de decirse");
  assert.ok(!html.includes("en el papel"), "llamó 'ausentes del papel' a todo lo que entró");
  assert.ok(html.includes("Entró esto"));
});

// ── Y QUE LA PANTALLA NO VUELVA A PREGUNTAR POR SU CUENTA ─────────────────

test("LA PANTALLA PREGUNTA POR EL PAPEL EN UN SOLO LUGAR", () => {
  const componente = codigoDe("components/compras-proveedor/PedidoRecibido.jsx");
  assert.ok(
    componente.includes("papelDelPedido"),
    "el componente dejó de usar el criterio compartido"
  );
  assert.ok(
    /estadoDelPapel\s*=\s*papelDelPedido\(/.test(componente),
    "el estado del papel volvió a decidirse en la pantalla en vez de preguntarlo"
  );
  assert.ok(
    !/hayPapel\s*=\s*filas\.length/.test(componente),
    "volvió a deducir si hay papel de que la lista de filas venga vacía"
  );
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.ok(
    pagina.includes("hayQuePedirLaConciliacion"),
    "la página dejó de usar la condición compartida para pedir la conciliación"
  );
  assert.ok(
    !/hayComprobantes\s*===\s*0/.test(pagina),
    "volvió la guarda que impedía pedir la conciliación de un pedido ya recibido"
  );
});
