// UNA TARJETA FUERA DE RANGO TIENE DOS DECISIONES: «USAR PRECIO NUEVO» Y
// «DEJAR COMO ESTÁ». LO QUE NADIE TOCÓ NO SE APLICA NUNCA.
//
// ── EL CASO (Emanuel, 2026-11-25, lista de Arcor) ─────────────────────────
//
// «BUTTER TOFFEES AVELLANAS — Bajó 13,2 %. Arcor suele aumentar entre 0 % y
// 15 %», «Fuera de rango», con un solo «✓ Usar»: no había forma de decir
// "dejalo como está". Y «Para aplicar 180» igual a «Cambian 180» no dejaba claro
// si aplicar metía los fuera de rango que nadie tocó.
//
// Lo que hacía antes aplicar con un fuera de rango sin tocar: no lo escribía.
// `revalidarFila` lo omite por FUERA_DE_RANGO si nadie lo eligió sabiéndolo
// (`laEligioUnaPersona`), y el contador ya no lo contaba (`seVaAEscribir`).
//
// ── DE DÓNDE SALE LA FORMA DE LOS DATOS ───────────────────────────────────
//
// La fila es la de `nadaFueraDeRangoSeEscribe.test.mjs` —la de la importación
// #5, con las columnas que seleccionan `resultado` y `aplicar`—. Las decisiones
// se aplican sobre ella con los mismos cambios de columna que escriben las
// rutas: `seleccion` EXCLUIR/INCLUIR/MARCAR y `confirmar` con la aceptación.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { revalidarFila, MOTIVO_OMISION } from "./aplicacion.js";
import { CONFIG_GENERICA } from "./configuraciones/generico.js";
import { ESTADO_LINEA } from "./estados.js";
import { contarResultado, seVaAEscribir, MOTIVO_REVISION } from "./resultadoDeLaLista.js";
import {
  ACCION_DEJAR,
  ACCION_USAR,
  ESTADO_TU_PRODUCTO,
  MOTIVO_DESMARCADA,
  TEXTO_DEJAR_COMO_ESTA,
  TEXTO_USAR_PRECIO_NUEVO,
  tusProductosDeLaLista,
} from "./tusProductos.js";
import TarjetaProductoDeLaLista, { TEXTO_USAR } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";

const RANGO = { minPct: 2, maxPct: 15 };
const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1, cabecera: { aumentoEsperadoMinPct: 2, aumentoEsperadoMaxPct: 15 } };
const BASE = {
  id: 1, nombre: "PRODUCTO POR CAJA", precio_costo: 1000, precio_venta: 1800, margen: 40, redondeo_100: false,
  es_combo: false, unidad_medida: "UNIDAD", activo: true, locales: [{ activo: true }], factor_pack: 12,
  modoCompraProveedor: "BULTO", pesoReferenciaKg: null, creadoEnLocalId: 1,
};
const VINCULADO = new Date("2026-09-17T09:00:00Z");
const CONFIRMADO = new Date("2026-09-17T10:00:00Z");
const ACEPTADO = new Date("2026-09-17T10:00:01Z");

/** Fuera de rango y sin tocar: lo que el motor dejó listo solo. */
const SIN_TOCAR = Object.freeze({
  id: 77, estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, motivo: null, productoBaseId: 1,
  codigoCrudo: "1612", descripcionProveedor: "BUTTER TOFFEES AVELLANAS", precioConIva: 879.66,
  unidadProveedor: null, unidadesPorBulto: 12, factorErp: 12, costoAnterior: 1000,
  costoMaestroPropuesto: 11083.72, diferenciaPct: 1008.4, aumentoEsperadoMinPct: 2, aumentoEsperadoMaxPct: 15,
  multiplicadorConfirmado: null, confirmadoEn: null, vinculadoEn: VINCULADO, fueraDeRangoAceptadaEn: null,
  aplicada: false, excluidaManual: false, seleccionada: true,
});

// Lo que escriben las rutas, columna por columna.
const usarPrecioNuevo = (f) => ({ ...f, multiplicadorConfirmado: 12, confirmadoEn: CONFIRMADO, fueraDeRangoAceptadaEn: ACEPTADO, seleccionada: true });
const excluir = (f) => ({ ...f, excluidaManual: true, seleccionada: false }); // `seleccion` EXCLUIR
const incluir = (f) => ({ ...f, excluidaManual: false }); // `seleccion` INCLUIR
const marcar = (f) => ({ ...f, seleccionada: true }); // `seleccion` MARCAR

/** La lectura que la tarjeta muestra y que «Usar» confirma (`lecturasDeLaFila`). */
const LECTURA = { clave: "BULTO", multiplicador: 12, costoNuevo: 11083.72, variacionPct: 1008.4, fueraDeRango: true };

function tarjeta(fila) {
  const r = tusProductosDeLaLista({
    productos: [{ id: 1, nombre: "BUTTER TOFFEES AVELLANAS", precio_costo: 1000, filas: [fila] }],
    rango: RANGO,
    lecturaPorFila: new Map([[fila.id, { lectura: LECTURA, confirmable: true }]]),
    abierta: true,
    proveedor: "Arcor",
  });
  return { item: r.items[0], conteo: r.conteo };
}
/** «Para aplicar N»: el `listos` del servidor, el mismo predicado que «Cambian». */
const paraAplicar = (filas) => contarResultado(filas, RANGO).listos;
const seAplica = (fila) =>
  fila.seleccionada === true && // aplicar lee `{ seleccionada: true, aplicada: false }`
  revalidarFila({ fila, base: BASE, contexto: CONTEXTO, config: { ...CONFIG_GENERICA, impuestoAdicionalPct: null }, recargoPct: 5 }).aplicable;
const dibujar = (item) =>
  renderToStaticMarkup(React.createElement(TarjetaProductoDeLaLista, { item, abierta: true, onUsar() {}, onDejar() {} }));
const botones = (html) =>
  [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    texto: m[2].replace(/<[^>]+>/g, "").trim(),
    marcado: /aria-pressed="true"/.test(m[1]),
  }));

test("(a) FUERA DE RANGO SIN TOCAR: queda en «Para revisar», no se aplica y no suma en «Para aplicar»", () => {
  const { item, conteo } = tarjeta(SIN_TOCAR);
  assert.equal(item.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(item.motivo, MOTIVO_REVISION.AUMENTO_DISTINTO);
  assert.equal(conteo.porEstado.REVISAR, 1);
  assert.equal(seVaAEscribir(SIN_TOCAR, RANGO), false);
  assert.equal(paraAplicar([SIN_TOCAR]), 0);
  // Aunque esté tildada, aplicar no la escribe: nadie la eligió.
  const r = revalidarFila({ fila: SIN_TOCAR, base: BASE, contexto: CONTEXTO, config: { ...CONFIG_GENERICA, impuestoAdicionalPct: null }, recargoPct: 5 });
  assert.equal(r.motivo, MOTIVO_OMISION.FUERA_DE_RANGO);
  assert.equal(seAplica(SIN_TOCAR), false);
  // Y la tarjeta ofrece las dos, ninguna marcada.
  assert.deepEqual(botones(dibujar(item)).slice(0, 2), [
    { texto: TEXTO_USAR_PRECIO_NUEVO, marcado: false },
    { texto: TEXTO_DEJAR_COMO_ESTA, marcado: false },
  ]);
});

test("(b) «DEJAR COMO ESTÁ»: no se aplica, sale de «Para revisar» y no suma", () => {
  const dejada = excluir(SIN_TOCAR);
  const { item, conteo } = tarjeta(dejada);
  assert.equal(item.estado, ESTADO_TU_PRODUCTO.NO_LO_CAMBIO);
  assert.equal(conteo.porEstado.REVISAR, 0, "salió de «Para revisar»");
  assert.equal(seVaAEscribir(dejada, RANGO), false);
  assert.equal(paraAplicar([dejada]), 0);
  assert.equal(seAplica(dejada), false, "destildada: aplicar no la lee");
  assert.deepEqual(item.dejar, { accion: ACCION_DEJAR.INCLUIR, marcado: true });
  assert.deepEqual(botones(dibujar(item)).slice(0, 2), [
    { texto: TEXTO_USAR_PRECIO_NUEVO, marcado: false },
    { texto: TEXTO_DEJAR_COMO_ESTA, marcado: true },
  ]);
});

test("(c) «USAR PRECIO NUEVO»: se aplica y suma en «Para aplicar»", () => {
  const usada = usarPrecioNuevo(SIN_TOCAR);
  const { item } = tarjeta(usada);
  assert.equal(item.estado, ESTADO_TU_PRODUCTO.CAMBIA);
  assert.equal(seVaAEscribir(usada, RANGO), true);
  assert.equal(paraAplicar([usada]), 1);
  assert.equal(seAplica(usada), true);
  assert.deepEqual(botones(dibujar(item)).slice(0, 2), [
    { texto: TEXTO_USAR_PRECIO_NUEVO, marcado: true },
    { texto: TEXTO_DEJAR_COMO_ESTA, marcado: false },
  ]);
});

test("(d) SE CAMBIA DE UNA A OTRA, EN LOS DOS SENTIDOS", () => {
  // Usar → Dejar: «Dejar como está» excluye.
  const usada = usarPrecioNuevo(SIN_TOCAR);
  assert.deepEqual(tarjeta(usada).item.dejar, { accion: ACCION_DEJAR.EXCLUIR, marcado: false });
  const dejada = excluir(usada);
  assert.equal(tarjeta(dejada).item.estado, ESTADO_TU_PRODUCTO.NO_LO_CAMBIO);
  assert.equal(paraAplicar([dejada]), 0);

  // Dejar → Usar, con lo ya aceptado: vuelve a incluir y tilda.
  const { item } = tarjeta(dejada);
  assert.equal(item.usar.accion, ACCION_USAR.MARCAR);
  assert.equal(item.usar.desdeDejada, true, "primero la vuelve a incluir");
  const incluida = incluir(dejada);
  assert.equal(tarjeta(incluida).item.motivo, MOTIVO_DESMARCADA, "incluida sola, queda para tildar");
  const otraVezUsada = marcar(incluida);
  assert.equal(tarjeta(otraVezUsada).item.estado, ESTADO_TU_PRODUCTO.CAMBIA);
  assert.equal(paraAplicar([otraVezUsada]), 1);
  assert.equal(seAplica(otraVezUsada), true);

  // Dejar → Usar sin haber aceptado nunca: es el «Usar» de una sin tocar, con
  // la pregunta de fuera de rango.
  const dejadaSinTocar = tarjeta(excluir(SIN_TOCAR)).item;
  assert.equal(dejadaSinTocar.usar.accion, ACCION_USAR.CONFIRMAR);
  assert.equal(dejadaSinTocar.usar.fueraDeRango, true);
  assert.equal(dejadaSinTocar.usar.desdeDejada, true);
  // Y tocar «Dejar como está» marcado la devuelve a «Para revisar».
  assert.equal(tarjeta(incluir(excluir(SIN_TOCAR))).item.estado, ESTADO_TU_PRODUCTO.REVISAR);
});

test("(e) UNO EN RANGO SIGUE COMO HOY: se aplica, suma, y su tarjeta tiene un solo «✓ Usar»", () => {
  const enRango = { ...SIN_TOCAR, id: 78, precioConIva: 87.3016, costoMaestroPropuesto: 1100, diferenciaPct: 10 };
  const { item } = tarjeta(enRango);
  assert.equal(item.estado, ESTADO_TU_PRODUCTO.CAMBIA);
  assert.equal(item.dejar, null, "sin «Dejar como está»");
  assert.equal(paraAplicar([enRango]), 1);
  assert.equal(seAplica(enRango), true);
  assert.deepEqual(botones(dibujar(item)).slice(0, 1), [{ texto: TEXTO_USAR, marcado: true }]);
  assert.ok(!dibujar(item).includes(TEXTO_DEJAR_COMO_ESTA));
});

test("«PARA APLICAR» CUENTA SOLO LO QUE CAMBIA: en rango + fuera de rango usados", () => {
  const filas = [
    { ...SIN_TOCAR, id: 1 }, // sin tocar
    excluir({ ...SIN_TOCAR, id: 2 }), // dejada
    usarPrecioNuevo({ ...SIN_TOCAR, id: 3 }), // usada
    { ...SIN_TOCAR, id: 4, precioConIva: 87.3016, costoMaestroPropuesto: 1100, diferenciaPct: 10 }, // en rango
  ];
  assert.equal(paraAplicar(filas), 2);
  assert.deepEqual(filas.map(seAplica), [false, false, true, true]);
});

test("LA RUTA Y LA PANTALLA: «Dejar como está» vale para esta lista y no se recuerda", () => {
  const sinComentarios = (ruta) =>
    readFileSync(new URL(`../../../${ruta}`, import.meta.url), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
  const ruta = sinComentarios("app/api/proveedores/listas/[id]/seleccion/route.js");
  assert.match(ruta, /const recordar = body\?\.soloEstaLista !== true;/);
  assert.match(ruta, /if \(productosTocados\.length > 0 && recordar\) \{/);
  const pagina = sinComentarios("app/modulos/proveedores/listas/[id]/page.jsx");
  assert.match(pagina, /\{ accion: d\.accion, ids: \[item\.filaId\], soloEstaLista: true \}/);
  assert.match(pagina, /body: JSON\.stringify\(\{ accion: ACCION_DEJAR\.INCLUIR, ids: \[item\.filaId\], soloEstaLista: true \}\)/);
  // Las dos listas de tarjetas pasan el botón.
  assert.equal([...pagina.matchAll(/onDejar=\{dejar\}/g)].length, 2);
  // Y la misma pieza del kit, sin una nueva: `BotonUsar` con su texto.
  const tarjetaFuente = sinComentarios("components/proveedores/listas/TarjetaProductoDeLaLista.jsx");
  assert.match(tarjetaFuente, /<BotonUsar\s+texto=\{TEXTO_DEJAR_COMO_ESTA\}/);
  assert.match(tarjetaFuente, /<BotonUsar\s+texto=\{TEXTO_USAR_PRECIO_NUEVO\}/);
});
