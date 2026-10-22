// CANDADO: RECIBIR UNA TRANSFERENCIA EN LA COMPUTADORA (`RecepcionEscritorio`).
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/recepcionEscritorio.test.mjs
//
// Lo que dibuja la composición aprobada (Figma EVJ2KvVCrY0oVSowfboymQ,
// 384:483), y que sus COPIAS de las reglas del teléfono sigan diciendo lo
// mismo que el original. El teléfono no se toca (regla del 2026-10-14), así
// que la regla de confirmar, lo que dice cada línea y lo que manda "✓
// Coincide" están escritos dos veces: el último candado compara los renglones
// de las dos copias y se pone rojo si una cambia y la otra no.
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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import RecepcionEscritorio, {
  TEXTO_TODO_REVISADO,
  cierreDeRecepcion,
  cuerpoDeCoincide,
  siguientePendiente,
} from "./RecepcionEscritorio.jsx";
import { resumenDeRecepcion, categoriasDelRemito } from "@/lib/transferencias/controlFisico";
import { MOTIVOS_FALTANTE } from "@/lib/transferencias/recepcionUI";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fuente = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

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
      filtro: "TODOS",
      categoriaId: null,
      texto: "",
      aviso: "",
      puedeRecibir: true,
      guardando: false,
      onFiltrar() {},
      onCategoria() {},
      onTexto() {},
      onVoz() {},
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

test("el panel abre en el primer pendiente con la hoja del teléfono; sin pendientes, avisa", () => {
  // Sin nada elegido, el panel muestra el primer pendiente del remito.
  const html = pantalla([COINCIDE, PENDIENTE]);
  const panel = html.slice(html.indexOf("data-panel-producto"));
  assert.match(texto(panel), /^.*Pancho 24 Als Fiambres · se cuenta por PACK x24/);
  // La ficha con `enHoja`: su botón dice "y seguir", como en la hoja.
  assert.match(texto(panel), /✓ (Revisado|Guardar) y seguir/);
  // Anterior: el que está antes en la lista.
  assert.match(texto(panel), /‹ Anterior/);

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

// ── LAS COPIAS NO SE DESPEGAN DEL ORIGINAL ────────────────────────────────
//
// El teléfono no se toca, así que estas reglas viven dos veces. Una copia
// que se queda vieja no avisa sola: el teléfono dejaría confirmar algo que la
// computadora no, o mandaría otra cantidad en "✓ Coincide". Cada renglón de
// abajo es una regla; tiene que estar, igual, en los dos archivos. Si alguien
// cambia la del teléfono, esto se pone rojo y dice cuál falta copiar.
test("las copias de la computadora dicen lo mismo que el teléfono, renglón por renglón", () => {
  const compu = fuente("components/transferencias/RecepcionEscritorio.jsx");
  const pares = [
    // La regla de confirmar, de `RecepcionMovil`.
    ["components/transferencias/RecepcionMovil.jsx", "const todoRevisado = pendientes === 0 && (resumen?.totalRemito ?? 0) > 0;"],
    ["components/transferencias/RecepcionMovil.jsx", "if (d.agregadoEnRecepcion || d.motivoPrincipal) return false;"],
    ["components/transferencias/RecepcionMovil.jsx", "if (d.cantidadRecibida == null) return false;"],
    ["components/transferencias/RecepcionMovil.jsx", "return env != null && rec != null && rec !== env;"],
    ["components/transferencias/RecepcionMovil.jsx", "const faltaCargar = (d) => d.agregadoEnRecepcion === true && !(fisicasRecibidasDe(d) > 0);"],
    ["components/transferencias/RecepcionMovil.jsx", "const trabado = !todoRevisado || sinMotivo > 0 || sinCargar > 0;"],
    // Lo que dice cada línea, de `TarjetaRecepcionMovil`.
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "const mostrado = envioComoSeCuenta(envio);"],
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "fisicasContadas == null || fisicasEnviadas == null ? null : fisicasContadas - fisicasEnviadas;"],
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "const recibidasMostradas = porUnidad ? fisicasContadas : d.cantidadRecibida;"],
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "const importeRemito = esAgregada ? null : d.subtotal;"],
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "const importeRecibido = d.subtotalRecibido == null ? d.subtotal : d.subtotalRecibido;"],
    // Lo que manda "✓ Coincide", y cómo se pinta.
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "recibido: envio.cantidad,"],
    ["components/transferencias/TarjetaRecepcionMovil.jsx", "recibidoUnidadesSueltas: envio.sueltas || 0,"],
  ];
  for (const [rel, renglon] of pares) {
    assert.ok(fuente(rel).includes(renglon), `${rel} ya no dice «${renglon}»: la regla cambió, hay que copiarla a la computadora`);
    assert.ok(compu.includes(renglon), `la computadora no dice «${renglon}»: su copia se despegó del teléfono`);
  }
  // Cómo se pinta "✓ Coincide". Desde el 2026-10-22 la clase del teléfono vive
  // en la pieza compartida con el depósito (`PiezasDeRevision`) y la tarjeta la
  // toma de ahí: el renglón ya no es el mismo texto en los dos archivos, pero
  // el VALOR sí tiene que serlo.
  const tarjeta = fuente("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.ok(tarjeta.includes("const CLASE_COINCIDE = CLASE_ACCION_RAPIDA;"), "la tarjeta dejó de tomar la clase de la pieza compartida");
  assert.ok(
    fuente("components/revision/PiezasDeRevision.jsx").includes('export const CLASE_ACCION_RAPIDA = "sunmi-btn-accent-outline";'),
    "la clase de la acción rápida cambió: hay que copiarla a la computadora"
  );
  assert.ok(compu.includes('const CLASE_COINCIDE = "sunmi-btn-accent-outline";'), "la computadora no pinta Coincide igual que el teléfono");
});
