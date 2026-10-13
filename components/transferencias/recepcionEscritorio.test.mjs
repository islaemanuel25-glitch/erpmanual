// CANDADO: RECIBIR UNA TRANSFERENCIA EN LA COMPUTADORA (`RecepcionEscritorio`).
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/recepcionEscritorio.test.mjs
//
// Lo que dibuja la composición aprobada (Figma EVJ2KvVCrY0oVSowfboymQ,
// 384:483) y, sobre todo, que lo que dice salga de las MISMAS funciones que el
// teléfono. El corte —`lg`— y que no decida nada está en
// `recepcionMovilV2.test.mjs` (8 y 9).
//
// ── DE DÓNDE SALEN LOS DATOS ─────────────────────────────────────────────
//
// La línea tiene la forma de `tarjetaRecepcionV21.test.mjs` —seis packs de 24,
// la línea real de la #198— y el resumen sale de `resumenDeRecepcion`, la
// función que usa el workspace. Nada del resumen se escribe a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RecepcionEscritorio, { TEXTO_TODO_REVISADO, siguientePendiente } from "./RecepcionEscritorio.jsx";
import { cuerpoDeCoincide } from "./TarjetaRecepcionMovil.jsx";
import { resumenDeRecepcion, categoriasDelRemito } from "@/lib/transferencias/controlFisico";
import { MOTIVOS_FALTANTE, cierreDeRecepcion } from "@/lib/transferencias/recepcionUI";

const texto = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Seis packs de 24, como en `tarjetaRecepcionV21.test.mjs`. */
const linea = (extra = {}) => ({
  id: 6698,
  nombre: "Pancho 24 Als",
  cantidadEnviada: 144,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  factorPack: 24,
  presentacionEnvio: "PACK",
  cantidadPresentada: 6,
  factorPresentacion: 24,
  sueltasEnviadas: 0,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  motivoPrincipal: "",
  motivoDetalle: "",
  categoria: { id: 3, nombre: "Fiambres" },
  precioCosto: 5250,
  subtotal: 31500,
  ...extra,
});

const PENDIENTE = linea();
const COINCIDE = linea({ id: 6699, nombre: "Salchicha", cantidadRecibida: 6, revisadoEnRecepcion: true });
const FALTANTE = linea({
  id: 6700,
  nombre: "Mortadela",
  cantidadRecibida: 5,
  recibidoUnidadesSueltas: 23,
  revisadoEnRecepcion: true,
  // El valor real, de la lista que ofrece la ficha: no uno escrito a mano.
  motivoPrincipal: MOTIVOS_FALTANTE[0].value,
});

function pantalla(items, extra = {}) {
  const item = { id: 152, estado: "ENVIADA", origen: { nombre: "Depósito" }, destino: { nombre: "Mini el 7" }, items };
  const resumen = resumenDeRecepcion(items);
  return renderToStaticMarkup(
    React.createElement(RecepcionEscritorio, {
      item,
      resumen,
      categorias: categoriasDelRemito(items),
      visibles: items,
      producto: null,
      filtro: "TODOS",
      categoriaId: null,
      texto: "",
      aviso: "",
      puedeRecibir: true,
      guardando: false,
      onFiltrar() {},
      onCategoria() {},
      onTexto() {},
      onTeclear() {},
      onVoz() {},
      onElegir() {},
      onRevisar: () => ({ ok: true }),
      ...extra,
    })
  );
}

test("una fila por producto, con la acción que corresponde a su estado", () => {
  const html = pantalla([PENDIENTE, COINCIDE, FALTANTE]);
  const filas = html.match(/<tr[^>]*data-sunmi-row[^>]*>[\s\S]*?<\/tr>/g) || [];
  assert.equal(filas.length, 3);
  const [pend, ok, falta] = filas.map(texto);

  // Pendiente: enviado en su presentación con las físicas debajo, nada recibido,
  // y las dos puertas de la tarjeta: Corregir y ✓ Coincide.
  assert.match(pend, /Pancho 24 Als Fiambres 6 PACK x24 144 unidades — /);
  assert.match(pend, /Corregir ✓ Coincide$/);
  // Revisado y coincide: la marca, sin botón.
  assert.match(ok, /Salchicha .* 6 PACK x24 144 unidades .*✓ Coincide Corregir$/);
  assert.ok(!/<button[^>]*>✓ Coincide/.test(filas[1]), "una revisada no ofrece Coincide");
  // Diferencia: "35 de 36" en rojo y "Faltó 1 unidad · Faltante".
  assert.match(falta, /5 PACK x24 \+ 23 143 de 144/);
  assert.match(filas[2], /sunmi-text-danger[^>]*>143 de 144/);
  assert.match(falta, /Faltó 1 unidad · Faltante$/);
  assert.ok(!/<button[^>]*>✓ Coincide/.test(filas[2]), "una línea con diferencia no ofrece Coincide");
});

test("Confirmar se traba con la MISMA regla que el teléfono, y dice por qué", () => {
  const conPendiente = pantalla([PENDIENTE, COINCIDE]);
  assert.equal(cierreDeRecepcion({ items: [PENDIENTE, COINCIDE], resumen: resumenDeRecepcion([PENDIENTE, COINCIDE]) }).trabado, true);
  assert.match(conPendiente, /<button[^>]*disabled=""[^>]*>Confirmar recepción<\/button>/);
  assert.match(texto(conPendiente), /Falta revisar 1 producto/);

  const listo = pantalla([COINCIDE, FALTANTE]);
  assert.match(listo, /<button(?![^>]*disabled)[^>]*>Confirmar recepción<\/button>/, "con todo revisado se tiene que poder confirmar");
  assert.ok(!/Falta revisar/.test(texto(listo)));
});

test("el panel es la hoja del teléfono; sin producto, avisa que está todo revisado", () => {
  const html = pantalla([PENDIENTE, COINCIDE], { producto: PENDIENTE });
  const panel = html.slice(html.indexOf("data-panel-producto"));
  assert.match(texto(panel), /^.*Pancho 24 Als Fiambres · se cuenta por PACK x24/);
  // La ficha con `enHoja`: su botón dice "y seguir", como en la hoja.
  assert.match(texto(panel), /✓ (Revisado|Guardar) y seguir/);
  // Siguiente: el que sigue en la lista.
  assert.match(texto(panel), /Siguiente: Salchicha ›/);

  const nada = pantalla([COINCIDE, FALTANTE]);
  assert.ok(texto(nada).includes(TEXTO_TODO_REVISADO));
});

test("✓ Coincide en la fila manda lo mismo que la tarjeta, y el siguiente pendiente es el que sigue", () => {
  assert.deepEqual(cuerpoDeCoincide(PENDIENTE), {
    detalleId: 6698,
    recibido: 6,
    recibidoUnidadesSueltas: 0,
    motivoPrincipal: null,
    motivoDetalle: null,
  });
  const otro = linea({ id: 7000, nombre: "Jamón" });
  assert.equal(siguientePendiente([PENDIENTE, COINCIDE, otro], PENDIENTE).id, 7000);
  assert.equal(siguientePendiente([PENDIENTE, COINCIDE, otro], otro).id, 6698, "al final vuelve al primero que falta");
  assert.equal(siguientePendiente([COINCIDE], COINCIDE), null);
});
