// UNA LÍNEA NO DECLARADA QUE LLEGÓ SOLO EN SUELTAS — LA #373.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/agregadaSoloSueltas.test.mjs
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Detalle 12496 de la transferencia 373, leído de producción: agregado en
// recepción, PACK x12, `recibido` 0 bultos y `recibidoUnidadesSueltas` 1,
// revisado. Llegó UNA unidad suelta de algo que el remito no traía.
//
// El botón Confirmar del teléfono contaba "sin cargar" a toda agregada con
// `cantidadRecibida` no positiva, y `cantidadRecibida` es SOLO el campo de
// bultos. 0 bultos + 1 suelta quedaba trabado, mientras el renglón, el estado y
// el importe de la misma línea ya sumaban la suelta. Y la línea no aparecía en
// el tab Diferencias ni en el bloque de cierre: solo en Todos.
//
// ── LOS FIXTURES SON LAS FORMAS REALES ────────────────────────────────────
//
// La fila de Prisma es la que escribe `linea-recepcion` al agregar —cantidad 0,
// snapshot con cantidades en 0 y la presentación con su factor congelado— más
// lo que guarda el conteo. El DTO es el que arma `detalle/route.js` sobre esa
// fila, con los nombres de ahí. Nada inventado para que pase.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RecepcionMovil, { AVISO_FALTA_CANTIDAD } from "./RecepcionMovil.jsx";
import {
  FILTRO,
  pasaFiltro,
  productosVisibles,
  resumenDeRecepcion,
} from "@/lib/transferencias/controlFisico";
import { planificarRecepcion } from "@/lib/transferencias/recepcionServidor";
import { lineasCorregidasDeProducto } from "@/lib/transferencias/correccionEconomica";

/** El costo congelado de un PACK x12: 12 × $1.400. */
const COSTO_PACK = 16800;

// ═══════════════════════════════════════════════════════════════════════════
// LAS FORMAS
// ═══════════════════════════════════════════════════════════════════════════

/** Una línea del remito ya contada y correcta, para que el remito esté cerrado. */
const ORIGINAL = Object.freeze({
  id: 12400,
  nombre: "Agua 500 ml",
  cantidadEnviada: 6,
  cantidadRecibida: 6,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  factorPack: 1,
  unidadMedida: "unidad",
  presentacionEnvio: "UNIDAD",
  cantidadPresentada: 6,
  sueltasEnviadas: 0,
  factorPresentacion: null,
  pesoPiezaKg: null,
  motivoPrincipal: "",
  motivoDetalle: "",
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: true,
  revisadoEnRecepcionAt: "2026-10-08T15:00:00.000Z",
  categoria: null,
  precioCosto: 500,
  subtotal: 3000,
});

/** El 12496 como lo manda `/api/transferencias/detalle`. */
const AGREGADA_DTO = Object.freeze({
  id: 12496,
  nombre: "Gaseosa 1,5 L",
  cantidadEnviada: 0,
  cantidadRecibida: 0,
  recibidoUnidadesSueltas: 1,
  unidadEnviada: "BULTO",
  factorPack: 12,
  unidadMedida: "pack",
  presentacionEnvio: "PACK",
  cantidadPresentada: 0,
  sueltasEnviadas: 0,
  factorPresentacion: 12,
  // 0 y no null: `detalle` pasa la columna por `toNumber`. Visto en la corrida.
  pesoPiezaKg: 0,
  motivoPrincipal: "",
  motivoDetalle: "",
  agregadoEnRecepcion: true,
  revisadoEnRecepcion: true,
  revisadoEnRecepcionAt: "2026-10-08T15:05:00.000Z",
  categoria: null,
  precioCosto: COSTO_PACK,
  subtotal: 0,
});

/** La misma agregada recién tocada en el catálogo: sin bultos ni sueltas. */
const AGREGADA_EN_CERO = Object.freeze({
  ...AGREGADA_DTO,
  id: 12497,
  nombre: "Jugo 1 L",
  recibidoUnidadesSueltas: 0,
});

/** El 12496 como fila de Prisma, que es lo que lee `confirmar-recepcion`. */
const AGREGADA_FILA = Object.freeze({
  id: 12496,
  cantidad: 0,
  recibido: 0,
  recibidoUnidadesSueltas: 1,
  unidadEnviada: "BULTO",
  presentacionEnvio: "PACK",
  cantidadPresentada: 0,
  sueltasEnviadas: 0,
  factorPresentacion: 12,
  pesoPiezaKg: null,
  precioCosto: COSTO_PACK,
  motivoPrincipal: null,
  motivoDetalle: null,
  agregadoEnRecepcion: true,
  revisadoEnRecepcion: true,
  producto: {
    id: 900,
    nombre: "Gaseosa 1,5 L",
    base: { id: 90, nombre: "Gaseosa 1,5 L", unidad_medida: "pack", factor_pack: 12, precio_costo: COSTO_PACK },
  },
});

/** La pantalla del teléfono montada con las líneas dadas, como la monta el workspace. */
function pantalla(items) {
  const resumen = resumenDeRecepcion(items);
  return renderToStaticMarkup(
    React.createElement(RecepcionMovil, {
      item: { id: 373, estado: "Recibiendo", items, resumen: {} },
      resumen,
      categorias: [],
      visibles: items,
      filtro: FILTRO.TODOS,
      texto: "",
      puedeRecibir: true,
      onFiltrar() {},
      onCategoria() {},
      onTexto() {},
      onElegir() {},
      FilaProducto: () => null,
      confirmarRecepcion() {},
    })
  );
}

/** El `<button>` de Confirmar, con sus atributos. */
function botonConfirmar(html) {
  const m = html.match(/<button[^>]*>(?:(?!<\/button>).)*✓ Confirmar<\/button>/s);
  assert.ok(m, "no se encontró el botón Confirmar");
  return m[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 0 BULTOS + SUELTAS NO TRABA CONFIRMAR
// ═══════════════════════════════════════════════════════════════════════════

test("1. una agregada con 0 bultos y 1 suelta NO traba Confirmar", () => {
  const boton = botonConfirmar(pantalla([ORIGINAL, AGREGADA_DTO]));
  assert.doesNotMatch(boton, /\bdisabled\b/, "Confirmar quedó gris con la suelta cargada");
});

test("1b. contraprueba: la misma agregada en cero SÍ lo traba", () => {
  const boton = botonConfirmar(pantalla([ORIGINAL, AGREGADA_EN_CERO]));
  assert.match(boton, /\bdisabled\b/, "una agregada sin cantidad dejó confirmar");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. EL NO DECLARADO ES UNA DIFERENCIA
// ═══════════════════════════════════════════════════════════════════════════

test("2. el no declarado entra en el filtro Diferencias y en su contador", () => {
  const items = [ORIGINAL, AGREGADA_DTO];
  assert.equal(pasaFiltro(AGREGADA_DTO, FILTRO.DIFERENCIAS), true);
  const r = resumenDeRecepcion(items);
  assert.equal(r.diferencias, 1, "el contador de Diferencias dejó afuera al no declarado");
  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.DIFERENCIAS }).map((d) => d.id),
    [12496]
  );
  // El remito no se mueve por eso: sigue siendo una línea y sin pendientes.
  assert.equal(r.totalRemito, 1);
  assert.equal(r.pendientes, 0);
});

test("2b. y aparece en el bloque «Diferencias» del cierre, con su Revisar", () => {
  const html = pantalla([ORIGINAL, AGREGADA_DTO]);
  const i = html.indexOf(">Diferencias</p>");
  assert.ok(i >= 0, "no se dibujó el bloque Diferencias del cierre");
  const bloque = html.slice(i);
  assert.match(bloque, /Gaseosa 1,5 L/);
  assert.match(bloque, /Revisar<\/button>/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA AGREGADA EN CERO DICE QUÉ LE FALTA, PEGADO A ELLA
// ═══════════════════════════════════════════════════════════════════════════

test("3. una agregada sin bultos ni sueltas muestra «Falta cargar la cantidad»", () => {
  const html = pantalla([ORIGINAL, AGREGADA_EN_CERO]);
  const i = html.indexOf("Jugo 1 L");
  assert.ok(i >= 0, "la agregada en cero no está en el bloque Diferencias");
  const despues = html.slice(i, html.indexOf("Revisar</button>", i));
  assert.ok(despues.includes(AVISO_FALTA_CANTIDAD), "el aviso no está pegado a su diferencia");
});

test("3b. contraprueba: con la suelta cargada el aviso NO aparece", () => {
  assert.ok(!pantalla([ORIGINAL, AGREGADA_DTO]).includes(AVISO_FALTA_CANTIDAD));
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CONFIRMAR MUEVE 1 UNIDAD Y LA VALORIZA EN $1.400 — EJECUTADO
// ═══════════════════════════════════════════════════════════════════════════
//
// Corre las dos funciones que `confirmar-recepcion` llama sobre la fila firme:
// `planificarRecepcion` decide cuánto entra al destino y cuánto se ajusta el
// origen, y `lineasCorregidasDeProducto` cuánto vale. El route arma el renglón
// de la venta igual que acá: `recibidasFisicas` del plan, `factor` de la escala
// y `precioPresentacion` de la columna congelada.

test("4. confirmar la agregada solo con sueltas descuenta 1 del origen, acredita 1 y vale $1.400", () => {
  const r = planificarRecepcion([AGREGADA_FILA]);
  assert.equal(r.ok, true, `el plan se rechazó: ${r.error}`);
  const plan = r.planes.get(12496);

  assert.equal(plan.recibidaUnidades, 1, "al destino no entra la unidad suelta");
  assert.equal(plan.ajusteOrigenUnidades, -1, "al origen no se le descuenta la unidad");
  assert.equal(plan.excedenteUnidades, 1);
  assert.equal(plan.tocaTransito, false, "una agregada no tiene tránsito que liberar");

  const v = lineasCorregidasDeProducto({
    lineaAgregada: { productoBaseId: 90, nombre: "Gaseosa 1,5 L", precioPresentacion: COSTO_PACK },
    factor: 12,
    recibidasFisicas: plan.recibidaUnidades,
  });
  assert.equal(v.subtotalProducto, 1400, "la unidad suelta no se valorizó en $1.400");
  assert.equal(v.recibidasFisicas, 1);
});
