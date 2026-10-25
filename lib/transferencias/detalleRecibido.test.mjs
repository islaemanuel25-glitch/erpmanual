// EL DETALLE RECIBIDO DEL TELÉFONO: QUÉ LE PASÓ A CADA LÍNEA, FILTROS Y ORDEN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/detalleRecibido.test.mjs
//
// ── DE DÓNDE SALE LA FORMA DE LAS LÍNEAS ───────────────────────────────────
//
// De `app/api/transferencias/detalle/route.js`, no de memoria. Cada línea trae
// los campos que ese `return` arma, y los números son coherentes con cómo los
// calcula el endpoint —CLAUDE.md, regla 2: un fixture que el endpoint nunca
// manda deja un candado verde que no cubre nada—:
//
//   · `devolucionOrigen` es `max(0, enviada − recibida)` en físicas: un faltante
//     de 1 trae 1, un sobrante o un agregado traen 0;
//   · `subtotal` es el del remito, así que un agregado trae 0;
//   · `subtotalRecibido` es lo recibido valorizado; nunca null en una recibida.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FILTRO_DETALLE,
  SUCESO_LINEA,
  armarDetalleRecibido,
  estadoDelResumen,
  filtroInicialDetalle,
  importeVigenteDeLinea,
  rotuloDelResumen,
  sucesoDeLinea,
  textoDelMotivo,
} from "./detalleRecibido.js";
import { contarLineasConDiferencia } from "./lineasConDiferencia.js";

const linea = (extra = {}) => ({
  id: 1,
  nombre: "COCA COLA 1.5L",
  codigoBarra: "7790895000430",
  cantidadEnviada: 6,
  cantidadRecibida: 6,
  recibidoUnidadesSueltas: null,
  precioCosto: 1000,
  subtotal: 6000,
  subtotalRecibido: 6000,
  devolucionOrigen: 0,
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

const exacta = linea({ id: 10 });
const faltan = linea({
  id: 11, cantidadRecibida: 5, devolucionOrigen: 1, subtotalRecibido: 5000, motivoPrincipal: "Faltante",
});
const sobran = linea({
  id: 12, cantidadEnviada: 12, cantidadRecibida: 13, subtotal: 12000, subtotalRecibido: 13000,
  motivoPrincipal: "Sobrante", motivoDetalle: "Vino uno de más",
});
const noVino = linea({
  id: 13, cantidadEnviada: 1, cantidadRecibida: 0, devolucionOrigen: 1, subtotal: 1000, subtotalRecibido: 0,
  motivoPrincipal: "Faltante",
});
const agregada = linea({
  id: 9, cantidadEnviada: 0, cantidadRecibida: 1, subtotal: 0, subtotalRecibido: 2780,
  agregadoEnRecepcion: true, agregadoEnRecepcionPor: { id: 3, nombre: "Ana" },
});

test("cada suceso con su etiqueta, en el orden de prioridad", () => {
  assert.equal(sucesoDeLinea(exacta).suceso, null);
  assert.deepEqual(
    [faltan, sobran, noVino, agregada].map((d) => sucesoDeLinea(d).suceso),
    [SUCESO_LINEA.FALTAN, SUCESO_LINEA.SOBRAN, SUCESO_LINEA.NO_VINO, SUCESO_LINEA.AGREGADO]
  );
  assert.equal(sucesoDeLinea(faltan).cantidad, 1);
  assert.equal(sucesoDeLinea(sobran).cantidad, 1);
});

test("un devuelto sin diferencia física se nombra como devuelto", () => {
  const s = sucesoDeLinea(linea({ devolucionOrigen: 2 }));
  assert.equal(s.suceso, SUCESO_LINEA.DEVUELTO);
  assert.equal(s.cantidad, 2);
  assert.equal(s.devuelto, true);
});

test("'antes' solo cuando el importe cambió, y nunca en un agregado", () => {
  assert.equal(sucesoDeLinea(exacta).importeAnterior, null);
  assert.equal(sucesoDeLinea(faltan).importeAnterior, 6000);
  assert.equal(sucesoDeLinea(noVino).importeAnterior, 1000);
  assert.equal(sucesoDeLinea(agregada).importeAnterior, null, "un agregado no tenía importe antes");
  // El importe que se muestra es lo recibido: un agregado no sale en $0,00 (#195).
  assert.equal(sucesoDeLinea(agregada).importe, 2780);
  assert.equal(importeVigenteDeLinea({ subtotal: 5, subtotalRecibido: null }), 5);
});

test("un agregado dice 'no venía': no tiene enviada que mostrar", () => {
  assert.equal(sucesoDeLinea(agregada).enviada, null);
  assert.equal(sucesoDeLinea(agregada).recibida, 1);
});

test("conteos de los cuatro filtros, y devueltos también cuentan en con diferencia", () => {
  const { conteos, enviados, agregados } = armarDetalleRecibido([agregada, exacta, faltan, sobran, noVino]);
  assert.deepEqual(conteos, {
    [FILTRO_DETALLE.CON_DIFERENCIA]: 4,
    [FILTRO_DETALLE.DEVUELTOS]: 2,
    [FILTRO_DETALLE.SIN_DIFERENCIA]: 1,
    [FILTRO_DETALLE.TODOS]: 5,
  });
  assert.equal(enviados, 4);
  assert.equal(agregados, 1);
});

test("el conteo de diferencias coincide con el del tablero", () => {
  // Las dos preguntas leen `lecturaFisicaDeLinea`. Si un día divergen, el
  // tablero dice "3 con diferencia" y el detalle muestra otra cantidad.
  const items = [exacta, faltan, sobran, noVino, agregada];
  assert.equal(
    armarDetalleRecibido(items).conteos[FILTRO_DETALLE.CON_DIFERENCIA],
    contarLineasConDiferencia(items)
  );
});

test("orden del remito, con los agregados al final", () => {
  // El agregado tiene un id MENOR a propósito: el orden no puede depender de
  // que el id venga bien.
  const { lineas } = armarDetalleRecibido([agregada, exacta, faltan, sobran, noVino]);
  assert.deepEqual(lineas.map(({ d }) => d.id), [10, 11, 12, 13, 9]);
});

test("abre en 'Con diferencia' si hay alguna; si no, en 'Todos'", () => {
  assert.equal(filtroInicialDetalle(armarDetalleRecibido([exacta, faltan]).conteos), FILTRO_DETALLE.CON_DIFERENCIA);
  assert.equal(filtroInicialDetalle(armarDetalleRecibido([exacta]).conteos), FILTRO_DETALLE.TODOS);
});

test("textos del resumen", () => {
  // 2026-10-23 15:46 UTC = viernes 23, 12:46 en Argentina.
  const fecha = "2026-10-23T15:46:00.000Z";
  assert.equal(rotuloDelResumen({ fecha, enviados: 60, agregados: 1 }), "Viernes 23 · 12:46 · 60 enviados · 1 agregado");
  assert.equal(rotuloDelResumen({ fecha, enviados: 60, agregados: 0 }), "Viernes 23 · 12:46 · 60 enviados");
  assert.equal(estadoDelResumen(6), "Recibida · 6 con diferencia");
  assert.equal(estadoDelResumen(0), "Recibida sin diferencias");
});

test("el motivo es el cargado; un agregado dice quién lo agregó", () => {
  assert.equal(textoDelMotivo(sobran), "Sobrante · Vino uno de más");
  assert.equal(textoDelMotivo(agregada), "No venía en el remito, lo agregó Ana");
});
