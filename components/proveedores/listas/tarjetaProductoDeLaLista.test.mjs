// LA TARJETA DE UN PRODUCTO TUYO EN LA REVISIÓN DE UNA LISTA, DIBUJADA.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/tarjetaProductoDeLaLista.test.mjs
//
// Se mira lo que la tarjeta DIBUJA, no su fuente. Y los `item` no se escriben a
// mano: salen de `tusProductosDeLaLista`, con filas que tienen los campos que la
// ruta del resultado le pide a la base. Un `item` "razonable" escrito acá podría
// tener una combinación de campos que el servidor nunca manda —es el defecto que
// CLAUDE.md tiene anotado tres veces—.

import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaProductoDeLaLista, {
  ROTULO_EN_LA_LISTA,
  TEXTO_CORREGIR,
  TEXTO_NO_ESTA,
  TEXTO_NO_VIENE,
  TEXTO_USAR,
  TEXTO_VINCULAR,
  cuentaDe,
} from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { CLASE_ACCION_CORREGIR, CLASE_ACCION_RAPIDA } from "@/components/revision/PiezasDeRevision";
import { tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";
import { lecturaParaPantalla } from "@/lib/proveedores/listas/explicarLectura";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";

const RANGO = { minPct: 2, maxPct: 15 };

let proximoId = 1;
/** Una fila con los campos que selecciona `resultado/route.js` para esta lista. */
function fila(cambios = {}) {
  return {
    id: proximoId++,
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    motivo: null,
    costoAnterior: 1300,
    productoBaseId: 55,
    excluidaManual: false,
    aplicada: false,
    seleccionada: true,
    diferenciaPct: 13.06,
    aumentoEsperadoMinPct: 2,
    aumentoEsperadoMaxPct: 15,
    confirmadoEn: null,
    vinculadoEn: null,
    multiplicadorConfirmado: null,
    fueraDeRangoAceptadaEn: null,
    costoMaestroPropuesto: 1469.75,
    codigoCrudo: "1612",
    descripcionProveedor: "SOLITAS ANIMACION 400G",
    precioConIva: 146.975,
    unidadesPorBulto: 10,
    ...cambios,
  };
}

function itemDe({ filas = [], lecturaPorFila = null, abierta = true } = {}) {
  return tusProductosDeLaLista({
    productos: [{ id: 7, nombre: "Solitas Animación 400 g", precio_costo: 1300, codigo_barra: null, codigo_barra_secundario: null, filas }],
    rango: RANGO,
    lecturaPorFila,
    abierta,
  }).items[0];
}

const dibujar = (props) => renderToStaticMarkup(React.createElement(TarjetaProductoDeLaLista, props));

/** Los botones que dibuja, con su texto y su clase. */
function botones(html) {
  return [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    atributos: m[1],
    texto: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
}

test("SIN VINCULAR: «Vincular» arriba en la clase rápida, «No viene» abajo, y «no está» en ámbar", () => {
  const html = dibujar({ item: itemDe(), abierta: true });
  const b = botones(html);
  assert.deepEqual(b.map((x) => x.texto), [TEXTO_VINCULAR, TEXTO_NO_VIENE]);
  assert.ok(b[0].atributos.includes(CLASE_ACCION_RAPIDA), "«Vincular» no tiene la forma del «✓ Coincide»");
  assert.ok(b[1].atributos.includes(CLASE_ACCION_CORREGIR), "«No viene» no tiene la forma del «Corregir»");
  assert.ok(html.includes(ROTULO_EN_LA_LISTA));
  assert.match(html, new RegExp(`sunmi-text-warning">${TEXTO_NO_ESTA}<`));
  assert.ok(html.includes("Hoy cuesta"), "sin renglón la cuenta dice lo que cuesta hoy");
  // Sin costo nuevo, una raya.
  assert.match(html, />—</);
});

test("PARA REVISAR CON LECTURA: «✓ Usar» arriba y «Corregir» abajo, el renglón y la cuenta", () => {
  const f = fila({ diferenciaPct: 99.5, costoMaestroPropuesto: 2587 });
  const lectura = lecturaParaPantalla({
    lectura: { clave: "PACK_10", multiplicador: 10, costoNuevo: 1469.75, variacionPct: 13.06, estado: ESTADO_VARIACION.ESPERADO },
    precioLista: 146.975,
    recargoPct: 0,
    factorPack: 10,
    recomendada: true,
  });
  const item = itemDe({ filas: [f], lecturaPorFila: new Map([[f.id, { lectura, confirmable: true }]]) });
  const html = dibujar({ item, abierta: true });
  assert.deepEqual(botones(html).map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
  assert.ok(html.includes("1612 · SOLITAS ANIMACION 400G"), "no está el renglón de la lista");
  assert.match(cuentaDe(item), /× 10 · hoy /);
  // El porcentaje, verde porque está adentro del rango.
  assert.match(html, /sunmi-text-success[^>]*>\+13,1 %</);
});

test("CAMBIA: el mismo «✓ Usar», relleno y apretado", () => {
  const html = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true });
  const b = botones(html);
  assert.deepEqual(b.map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
  assert.match(b[0].atributos, /aria-pressed="true"/);
  assert.ok(!b[0].atributos.includes(CLASE_ACCION_RAPIDA), "relleno no puede ser el contorno");
});

test("FUERA DEL RANGO EL PORCENTAJE VA EN ÁMBAR", () => {
  const f = fila({ diferenciaPct: 99.5 });
  const html = dibujar({ item: itemDe({ filas: [f] }), abierta: true });
  assert.match(html, /sunmi-text-warning[^>]*>\+99,5 %</);
});

test("UNA LISTA CERRADA NO TIENE BOTONES, Y UN CONTROL NO TIENE «USAR»", () => {
  const cerrada = dibujar({ item: itemDe({ filas: [fila()], abierta: false }), abierta: false });
  assert.equal(botones(cerrada).length, 0);
  const control = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true, controlando: true });
  assert.deepEqual(botones(control).map((x) => x.texto), [TEXTO_CORREGIR]);
});

test("EL RECHAZO DEL SERVIDOR SE DIBUJA EN LA TARJETA DONDE SE TOCÓ", () => {
  const html = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true, error: "No se pudo. No se guardó nada." });
  assert.match(html, /sunmi-text-danger[^>]*>No se pudo\. No se guardó nada\.</);
});
