// LA RECEPCIÓN SIN FACTURA ES LA MISMA RECEPCIÓN, SIN PAPEL.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/recepcionSinFactura.test.mjs
//
// ── EL DEFECTO QUE LO TRAJO ───────────────────────────────────────────────
//
// Un pedido ENVIADO que llegaba sin factura no se podía recibir. "Llegó sin
// factura" abría otra pantalla —"Detalle (N productos)" con tarjetas escritas
// a mano— cuyo "Recibir mercadería" mandaba el cierre sin el total a pagar: la
// ruta contestaba 400 pidiéndolo, y el motivo iba a una hoja que en esa rama no
// estaba montada. El botón parecía no hacer nada. Reproducido contra
// `erpazul_al` el 2026-09-24 con un pedido ENVIADO sin comprobantes.
//
// Ahora sin factura es la misma lista, la misma tarjeta y las mismas dos hojas
// que con papel, con las líneas del pedido como filas. Estos candados afirman
// las piezas; el camino entero se recorrió en el navegador.
//
// ── DE DÓNDE SALE EL FIXTURE ──────────────────────────────────────────────
//
// `DEL_ENDPOINT` es la respuesta de `/api/compras-proveedor/conciliacion/2`
// contra `erpazul_al`, copiada tal cual —un pedido ENVIADO sin comprobantes,
// sembrado con las rutas de la app—. No está escrito de memoria: es la forma
// que la pantalla recibe.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  filaSinPapel,
  claveDeFila,
  filasDeConciliacion,
} from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  ESTADO_LINEA,
  estadoDeLinea,
  precioCambio,
  hayQueDecidirElPrecio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { recibidosDelCierre, costosQueNoSeTocan } from "@/lib/compras-proveedor/cierreDeRecepcion";
import { hayQuePedirLaConciliacion } from "@/lib/compras-proveedor/papelDelPedido";
import {
  serializarRecepcionEnCurso,
  deserializarRecepcionEnCurso,
} from "@/lib/compras-proveedor/retornoPedido";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import ListaDeLaFactura from "./ListaDeLaFactura.jsx";
import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import HojaCerrarRecepcion from "./HojaCerrarRecepcion.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGINA = "app/modulos/compras-proveedor/[id]/page.jsx";
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const aLaVista = (el) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ");

/** `sinComprobante` de la conciliación del pedido 2 de `erpazul_al`, tal cual. */
const DEL_ENDPOINT = {
  grupos: [],
  sinComprobante: [
    {
      pedidoDetalleId: 5,
      producto: "Gaseosa Cola 1,5 L",
      cantidadPedida: 4,
      unidad: "BULTO",
      costoCatalogo: 7200,
      subtotalPedido: 28800,
      cantidadRecibida: null,
      kgRecibidos: null,
      esFiambre: false,
      productoBaseId: 1,
      factorPack: 6,
      unidadesSueltas: null,
      motivoPrincipal: null,
      motivoDetalle: null,
    },
    {
      pedidoDetalleId: 6,
      producto: "Yerba Mate 1 kg",
      cantidadPedida: 2,
      unidad: "BULTO",
      costoCatalogo: 38000,
      subtotalPedido: 76000,
      cantidadRecibida: null,
      kgRecibidos: null,
      esFiambre: false,
      productoBaseId: 2,
      factorPack: 10,
      unidadesSueltas: null,
      motivoPrincipal: null,
      motivoDetalle: null,
    },
  ],
};
const [GASEOSA, YERBA] = DEL_ENDPOINT.sinComprobante;

// ── LA FORMA ──────────────────────────────────────────────────────────────

test("LA FILA SIN PAPEL TIENE LA FORMA EXACTA DE UNA FILA DE LA CONCILIACIÓN", () => {
  // La fila con papel la arma `armarFila`, adentro de `filasDeConciliacion`.
  // Sus claves no dependen de los valores, así que un renglón mínimo alcanza
  // para saber cuáles son.
  const conPapel = filasDeConciliacion({
    comprobantes: [{ id: 1, lineas: [{ id: 7, cantidad: 1, pedidoDetalleId: 5 }] }],
  }).grupos[0].filas[0];
  const sinPapel = filaSinPapel(GASEOSA);
  const faltan = Object.keys(conPapel).filter((k) => !(k in sinPapel));
  const sobran = Object.keys(sinPapel).filter((k) => !(k in conPapel));
  assert.deepEqual(faltan, [], "a la fila sin papel le falta algo que la tarjeta o las hojas leen");
  assert.deepEqual(sobran, ["sinPapel"], "la fila sin papel inventó un campo que nadie más conoce");
});

test("Y LOS CAMPOS QUE LA HOJA NECESITA PARA CONTAR LLEGAN DEL ENDPOINT", () => {
  // El `.map` de `sinComprobante` tiraba el tamaño del bulto: sin él, la hoja
  // no puede contar "bultos de 6" ni sumar sueltas.
  const { sinComprobante } = filasDeConciliacion({
    detalles: [
      {
        id: 5, cantidad: 4, precioCosto: 7200, unidad: "BULTO", nombre: "Gaseosa Cola 1,5 L",
        productoBaseId: 1, factorPack: 6, unidadesSueltas: 2, motivoPrincipal: "Faltante", motivoDetalle: null,
      },
    ],
  });
  const f = filaSinPapel(sinComprobante[0]);
  assert.equal(f.factorPack, 6);
  assert.equal(f.unidadesSueltas, 2);
  assert.equal(f.motivoPrincipal, "Faltante");
  assert.equal(f.productoBaseId, 1, "sin el producto el lápiz no sabe a dónde ir");
});

test("LA CLAVE DE UNA FILA SIN PAPEL NO CHOCA CON LA DE UN RENGLÓN DEL PAPEL", () => {
  assert.equal(claveDeFila(filaSinPapel(GASEOSA)), "pedido-5");
  assert.equal(claveDeFila({ lineaId: 5, pedidoDetalleId: 5 }), 5);
});

// ── LO CONTADO ────────────────────────────────────────────────────────────

test("ARRANCA EN LO PEDIDO Y DICE SI FALTA O SOBRA CONTRA LO PEDIDO", () => {
  assert.equal(filaSinPapel(GASEOSA).cantidad, 4, "no arrancó en lo pedido");
  assert.equal(estadoDeLinea(filaSinPapel(GASEOSA)), ESTADO_LINEA.COINCIDE);
  assert.equal(estadoDeLinea(filaSinPapel(GASEOSA, { contada: 3 })), ESTADO_LINEA.FALTA);
  assert.equal(estadoDeLinea(filaSinPapel(GASEOSA, { contada: 5 })), ESTADO_LINEA.SOBRA);
});

test("SIN PAPEL NO HAY PRECIO QUE DECIDIR: EL COSTO ES EL DEL PEDIDO", () => {
  const f = filaSinPapel(YERBA);
  assert.equal(f.costoFactura, null);
  assert.equal(f.costoCatalogo, 38000);
  assert.equal(precioCambio(f), false);
  assert.equal(hayQueDecidirElPrecio(f), false);
});

// ── LO QUE SE VE ──────────────────────────────────────────────────────────

test("LA TARJETA DICE 'LLEGÓ' Y EL COSTO DEL PEDIDO, NO 'FACTURA' NI 'PAPEL'", () => {
  const t = aLaVista(React.createElement(TarjetaLineaFactura, { fila: filaSinPapel(GASEOSA, { contada: 3 }) }));
  assert.match(t, /Llegó 3 PACK x6/);
  assert.match(t, /falta 1/);
  assert.match(t, /Costo \$ ?7\.200,00/);
  assert.doesNotMatch(t, /Factura|Papel|ERP/);
});

test("CONTRAPRUEBA: CON PAPEL LA TARJETA SIGUE DICIENDO 'FACTURA'", () => {
  const { sinPapel, ...conPapel } = filaSinPapel(GASEOSA);
  const t = aLaVista(React.createElement(TarjetaLineaFactura, { fila: { ...conPapel, lineaId: 7 } }));
  assert.match(t, /Factura/);
  assert.doesNotMatch(t, /Llegó/);
});

test("LA LISTA SIN PAPEL NO HABLA DE FACTURA NI DE LÍNEAS", () => {
  const filas = DEL_ENDPOINT.sinComprobante.map((d) => filaSinPapel(d));
  const t = aLaVista(React.createElement(ListaDeLaFactura, { sinPapel: true, filas, revisadas: {} }));
  assert.match(t, /Llegó sin factura/);
  assert.match(t, /0 \/ 2 revisados/);
  assert.doesNotMatch(t, /Ganancia|Factura #|Leída/, "habla de un papel que no llegó");
  assert.doesNotMatch(t, /líneas?\b|ítems?\b|renglón|renglones/i);
});

test("LA HOJA SIN PAPEL NO OFRECE ACEPTAR UN AUMENTO, Y SÍ EL LÁPIZ", () => {
  const fila = filaSinPapel(YERBA);
  const conPermiso = aLaVista(
    React.createElement(HojaCorregirLinea, { fila, abierta: true, onEditarProducto: () => {} })
  );
  assert.match(conPermiso, /Editar producto/);
  assert.match(conPermiso, /Costo del pedido/);
  assert.match(conPermiso, /Pediste 2/);
  assert.doesNotMatch(conPermiso, /Aceptar el precio nuevo|Dejar el que tenía/);
  assert.doesNotMatch(conPermiso, /El papel dice|la factura dice/);
  assert.doesNotMatch(conPermiso, /líneas?\b|ítems?\b|renglón|renglones/i);

  // Sin permiso de editar productos, el lápiz no aparece —rebotaría— y el texto
  // no manda a un botón que no está.
  const sinPermiso = aLaVista(React.createElement(HojaCorregirLinea, { fila, abierta: true }));
  assert.doesNotMatch(sinPermiso, /Editar producto/);
  assert.match(sinPermiso, /Costo del pedido/);
});

test("LA HOJA DE CIERRE SIN FACTURA HABLA DEL PEDIDO, NO DE UNA FACTURA SIN TOTAL", () => {
  const filas = DEL_ENDPOINT.sinComprobante.map((d) => filaSinPapel(d));
  const t = aLaVista(
    React.createElement(HojaCerrarRecepcion, { abierta: true, filas, totalesDeFacturas: [], contados: {} })
  );
  assert.match(t, /Llegó sin factura: entra lo que contaste en cada producto/);
  assert.match(t, /productos del pedido/);
  assert.doesNotMatch(t, /Alguna factura|del papel|comprobante que los respalda/);
  assert.doesNotMatch(t, /líneas?\b|ítems?\b|renglón|renglones/i);
});

test("CONTRAPRUEBA: CON UNA FACTURA SIN TOTAL, LA HOJA SIGUE PIDIÉNDOLO COMO SIEMPRE", () => {
  const t = aLaVista(
    React.createElement(HojaCerrarRecepcion, { abierta: true, filas: [], totalesDeFacturas: [null] })
  );
  assert.match(t, /Alguna factura no trae total impreso/);
  assert.doesNotMatch(t, /Llegó sin factura/);
});

// ── EL CIERRE ─────────────────────────────────────────────────────────────

test("AL CERRAR SIN PAPEL ENTRA LO CONTADO, LÍNEA POR LÍNEA", () => {
  const filas = [filaSinPapel(GASEOSA, { contada: 3 }), filaSinPapel(YERBA)];
  assert.deepEqual(recibidosDelCierre({ filas, sinComprobante: [], contados: { 5: 3, 6: 2 } }), {
    5: 3,
    6: 2,
  });
});

test("SIN PAPEL EL CIERRE NO TOCA EL COSTO DEL CATÁLOGO; CON PAPEL NO SE EXCLUYE NADA", () => {
  // Medido contra `erpazul_al`: con la exclusión, un costo corregido con el
  // lápiz (38.000 → 45.000) sobrevivió al cierre; sacándola, el mismo recorrido
  // lo pisó de vuelta con el de la línea (60.000 → 38.000).
  const sinPapel = DEL_ENDPOINT.sinComprobante.map((d) => filaSinPapel(d));
  assert.deepEqual(costosQueNoSeTocan(sinPapel), [5, 6]);
  const conPapel = filasDeConciliacion({
    comprobantes: [{ id: 1, lineas: [{ id: 7, cantidad: 1, pedidoDetalleId: 5 }] }],
  }).grupos[0].filas;
  assert.deepEqual(costosQueNoSeTocan(conPapel), []);
});

// ── LAS PUERTAS ───────────────────────────────────────────────────────────

test("EN ENVIADO, ELEGIR 'SIN FACTURA' PIDE LA CONCILIACIÓN AUNQUE NO HAYA COMPROBANTES", () => {
  assert.equal(hayQuePedirLaConciliacion({ estado: "ENVIADO", hayComprobantes: 0, sinFactura: true }), true);
  assert.equal(hayQuePedirLaConciliacion({ estado: "ENVIADO", hayComprobantes: 0 }), false);
  assert.equal(hayQuePedirLaConciliacion({ estado: "CONFIRMADO", sinFactura: true }), false);
});

test("LA ELECCIÓN SOBREVIVE A IR AL LÁPIZ Y VOLVER, Y SOLO CUANDO ES VERDAD", () => {
  const guardado = serializarRecepcionEnCurso({ pedidoId: 2, recibidos: { 5: 3 }, sinFactura: true });
  assert.equal(deserializarRecepcionEnCurso(JSON.stringify(guardado)).sinFactura, true);
  // Con papel se guarda igual que antes: sin la clave.
  const conPapel = serializarRecepcionEnCurso({ pedidoId: 2, recibidos: { 5: 3 } });
  assert.equal("sinFactura" in conPapel, false);
  // Un texto manipulado no enciende el camino sin papel.
  const raro = JSON.stringify({ ...conPapel, sinFactura: "true" });
  assert.equal("sinFactura" in deserializarRecepcionEnCurso(raro), false);
});

test("LA PÁGINA: UNA SOLA RECEPCIÓN, UN SOLO RECIBIR, Y EL LÁPIZ SOLO SIN PAPEL", () => {
  const p = codigoDe(PAGINA);
  assert.doesNotMatch(p, /ListaConciliacion/, "volvió la tabla de la pantalla vieja");
  assert.doesNotMatch(p, /Solo continuar si la mercadería llegó/, "volvió el recibir con confirm()");
  // Recibir pasa siempre por la hoja de cierre, que es la que manda el total.
  assert.equal((p.match(/ejecutarAccion\("recibir"/g) || []).length, 1);
  assert.match(p, /costosExcluidos: costosQueNoSeTocan\(filasDelCierre\)/);
  // Y viaja en el cuerpo: es la línea que, apagada, dejó pisar el costo
  // corregido en la contraprueba contra `erpazul_al`.
  assert.match(p, /if \(extra\?\.costosExcluidos\?\.length\) bodyData\.costosExcluidos = extra\.costosExcluidos;/);
  assert.match(p, /filas=\{filasDeLaRecepcion\}/);
  assert.match(p, /onEditarProducto=\{sinPapel && puedeEditarProductoP \? irAEditarProducto : null\}/);
  assert.match(p, /origen: ORIGENES\.PEDIDO_DETALLE/);
  // "Llegó sin factura" solo se ofrece sin comprobantes: vive en el estado
  // vacío del panel, que el panel dibuja únicamente cuando no hay ninguno.
  assert.match(p, /vacio=\{\s*esRecepcion && !sinFactura/);
});
