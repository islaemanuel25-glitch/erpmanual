// TERMINAR O CANCELAR UNA LISTA CON PRECIOS SIN APLICAR: NO SE CIERRA DIRECTO.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/cerrarConPendientes.test.mjs
//
// EL CASO (Dab, producción 77c4646f, 2026-10-24): la lista revisada entera, 56
// precios en «Para aplicar», «Terminar lista» y quedó Terminada con "0 costos
// actualizados" y "65 quedaron sin aplicar". Terminar no avisó, y una lista
// terminada ya no se aplica.
//
// El conteo tiene la forma de `datos.conteo` de la ruta del resultado
// (`resultadoDeLaLista.js`): `listos` es el número de la barra «Para aplicar»
// y `listosSinTildar` el de los que tienen precio nuevo y nadie marcó.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCerrarConPendientes from "@/components/proveedores/listas/HojaCerrarConPendientes";
import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import {
  AL_CERRAR,
  CIERRE,
  TEXTO_APLICAR_Y_TERMINAR,
  TEXTO_CANCELAR_SIN_APLICAR,
  TEXTO_TERMINAR_SIN_APLICAR,
  TITULO_PENDIENTES,
  aplicarYTerminar,
  pendientesAlCerrar,
  pendientesDeLaLista,
  queAbreAlCerrar,
  textoDePendientes,
} from "@/lib/proveedores/listas/cerrarConPendientes";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";

/** De la apertura de una función de la pantalla a la siguiente `const`. */
const funcion = (texto, nombre) => {
  const i = texto.indexOf(`const ${nombre} = `);
  assert.ok(i >= 0, `no está ${nombre}`);
  const j = texto.indexOf("\n  const ", i + 10);
  return texto.slice(i, j === -1 ? undefined : j);
};

const DAB = { listos: 56, listosSinTildar: 9, paraRevisar: 3 };
const html = (props) =>
  renderToStaticMarkup(
    React.createElement(HojaCerrarConPendientes, {
      onAplicarYTerminar: () => {},
      onCerrarSinAplicar: () => {},
      onVolver: () => {},
      ...props,
    })
  );
const botones = (h) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

test("CON PRECIOS PENDIENTES, TERMINAR ABRE LA HOJA Y NO TERMINA", () => {
  const p = pendientesAlCerrar(DAB, { controlando: false, puedeCambiarCostos: true });
  assert.deepEqual(p, { listos: 56, sinTildar: 9, hay: true });
  assert.equal(queAbreAlCerrar(p), AL_CERRAR.HOJA_PENDIENTES);
  // Solo listos sin tildar también cuenta.
  assert.equal(queAbreAlCerrar(pendientesAlCerrar({ listos: 0, listosSinTildar: 4 })), AL_CERRAR.HOJA_PENDIENTES);

  // El botón va por `alTerminar`, que con pendientes abre la hoja y nada más:
  // ni el modal de siempre ni el pedido de terminar.
  const pantalla = codigoDe(PANTALLA);
  assert.match(pantalla, /onClick=\{alTerminar\}[\s\S]{0,160}Terminar lista/);
  // Desde el 2026-10-24 el botón y la llegada desde «Terminar lista» del
  // listado abren con la misma función, `abrirTerminar`.
  const alTerminar = funcion(pantalla, "alTerminar");
  assert.match(alTerminar, /const alTerminar = \(\) => abrirTerminar\(pendientes\);/);
  const abrirTerminar = funcion(pantalla, "abrirTerminar");
  assert.match(
    abrirTerminar,
    /queAbreAlCerrar\(pend\) === AL_CERRAR\.HOJA_PENDIENTES\s*\?\s*setCerrandoConPendientes\(CIERRE\.TERMINAR\)\s*:\s*setTerminando\(true\)/
  );
  for (const f of [alTerminar, abrirTerminar]) assert.doesNotMatch(f, /terminar\(|finalizar/);
  // Las cuentas son las de la barra: el mismo `conteo`.
  // Desde el 2026-10-24 sale de `pendientesDeLaLista`, que comparte con la
  // llegada desde «Terminar lista» del listado; lee lo mismo: el control y la
  // ubicación sin costos no tienen pendientes.
  assert.match(pantalla, /const pendientes = pendientesDeLaLista\(\{ conteo, cabecera \}\);/);
  assert.deepEqual(pendientesDeLaLista({ conteo: DAB, cabecera: { modo: "ACTUALIZAR" } }), p);
  assert.equal(pendientesDeLaLista({ conteo: DAB, cabecera: { modo: "CONTROLAR" } }).hay, false);
  assert.equal(pendientesDeLaLista({ conteo: DAB, cabecera: { costos: { puedeCambiar: false } } }).hay, false);
  assert.match(pantalla, /\{listos\} \{listos === 1 \? "precio" : "precios"\}/);
  assert.match(pantalla, /const listos = conteo\.listos;/);
  // Ningún otro lugar abre el modal de terminar.
  assert.equal((pantalla.match(/setTerminando\(true\)/g) ?? []).length, 1);

  // La hoja SIN tarjetas (las cuentas nombran filas que no son de ninguna
  // tarjeta): título, el texto con los dos números y los tres botones a lo
  // ancho. Con tarjetas, `hojaDePendientes.test.mjs` (2026-10-24).
  const h = html({ accion: CIERRE.TERMINAR, pendientes: p });
  assert.ok(h.includes(TITULO_PENDIENTES) && TITULO_PENDIENTES === "Te quedan precios sin aplicar");
  assert.ok(
    h.includes(
      "56 precios están listos para aplicar y 9 con precio nuevo que no marcaste. Si terminás ahora, siguen con el costo anterior."
    )
  );
  assert.deepEqual(botones(h).slice(-3), [TEXTO_APLICAR_Y_TERMINAR, TEXTO_TERMINAR_SIN_APLICAR, "Volver"]);
  assert.equal(TEXTO_APLICAR_Y_TERMINAR, "✓ Aplicar y terminar");
  assert.equal(TEXTO_TERMINAR_SIN_APLICAR, "Terminar sin aplicar");
  for (const b of [...h.matchAll(/<button[^>]*class="([^"]*)"/g)].slice(-3)) assert.match(b[1], /\bw-full\b/);
});

test("LA HOJA ES LA DE ABAJO —LA DE VINCULAR Y EL REPORTE—, Y EL KIT SIN `forma` NO CAMBIA", () => {
  const props = {
    titulo: "T",
    puntos: ["uno"],
    textoConfirmar: "Sí",
    textoTrabajando: "…",
    onConfirmar: () => {},
    onVolver: () => {},
  };
  const de = (extra) => renderToStaticMarkup(React.createElement(SunmiHojaDeConfirmacion, { ...props, ...extra }));
  assert.equal(de({}), de({ forma: "centrado" }), "sin forma, la confirmación del kit tiene que quedar igual");
  assert.notEqual(de({ forma: "hoja" }), de({}), "la forma no llega al layout");
  assert.match(codigoDe("components/proveedores/listas/HojaCerrarConPendientes.jsx"), /forma: "hoja"/);
});

test("«APLICAR Y TERMINAR» ESCRIBE LOS COSTOS Y DESPUÉS TERMINA", async () => {
  const pasos = [];
  const aplicar = async () => (pasos.push("aplicar"), { ok: true, escritos: 56 });
  const terminar = async (op) => (pasos.push(["terminar", op]), true);
  assert.deepEqual(await aplicarYTerminar({ listos: 56, aplicar, terminar }), { terminada: true });
  assert.deepEqual(pasos, ["aplicar", ["terminar", { conservarAviso: true }]]);

  // Si aplicar falla, no termina: la lista queda abierta con el error.
  const sinTerminar = [];
  const falla = await aplicarYTerminar({
    listos: 56,
    aplicar: async () => ({ ok: false }),
    terminar: async () => (sinTerminar.push(1), true),
  });
  assert.deepEqual(falla, { terminada: false });
  // Si había precios y no escribió ninguno, tampoco: sería la misma pérdida.
  const cero = await aplicarYTerminar({
    listos: 56,
    aplicar: async () => ({ ok: true, escritos: 0 }),
    terminar: async () => (sinTerminar.push(1), true),
  });
  assert.deepEqual(cero, { terminada: false, sinEscribir: true });
  assert.equal(sinTerminar.length, 0);

  // En la pantalla: es el MISMO `aplicar` del botón «✓ Aplicar» —alcance
  // SELECCIONADAS, los marcados— y el mismo `terminar`. Desde el 2026-10-24
  // pasa por `aplicarLosPendientesYTerminar`, que antes marca los sin marcar.
  const pantalla = codigoDe(PANTALLA);
  assert.match(
    pantalla,
    /aplicarLosPendientesYTerminar\(\{\s*sinMarcar: pendientesPorProducto\.sinMarcar,\s*listos: pendientes\.listos,\s*marcar: marcarFilas,\s*aplicar,\s*terminar,\s*\}\)/
  );
  assert.match(pantalla, /<HojaConfirmarAplicar[\s\S]{0,300}onAplicar=\{aplicar\}/);
  const aplicarFn = funcion(pantalla, "aplicar");
  assert.match(aplicarFn, /\/aplicar`/);
  assert.match(aplicarFn, /alcance: "SELECCIONADAS"/);
  assert.match(aplicarFn, /return \{ ok: true, escritos \};/);
  const terminarFn = funcion(pantalla, "terminar");
  assert.match(terminarFn, /\/finalizar`/);
  assert.match(terminarFn, /if \(!conservarAviso\) setAviso\(null\)/);
  assert.match(terminarFn, /return true;/);
});

test("SIN PENDIENTES, TERMINAR Y CANCELAR SIGUEN COMO HOY", () => {
  const nada = pendientesAlCerrar({ listos: 0, listosSinTildar: 0, paraRevisar: 12 });
  assert.equal(nada.hay, false);
  assert.equal(queAbreAlCerrar(nada), AL_CERRAR.COMO_SIEMPRE);
  // En un control, o sin poder cambiar costos, no hay barra ni nada que aplicar.
  assert.equal(pendientesAlCerrar(DAB, { controlando: true }).hay, false);
  assert.equal(pendientesAlCerrar(DAB, { puedeCambiarCostos: false }).hay, false);
  // Lo de hoy: el modal de terminar, que termina con su botón; y el de cancelar.
  const pantalla = codigoDe(PANTALLA);
  assert.match(pantalla, /<ModalTerminar[\s\S]{0,250}onTerminar=\{\(\) => terminar\(\)\}/);
  assert.match(pantalla, /<ModalCancelarImportacion[\s\S]{0,500}onCancelar=\{cancelarLista\}/);
});

test("CANCELAR CON PENDIENTES: LA HOJA AVISA QUE SE PIERDEN Y PIDE CONFIRMAR, SIN OFRECER APLICAR", () => {
  const pantalla = codigoDe(PANTALLA);
  const alCancelar = funcion(pantalla, "alCancelar");
  assert.match(
    alCancelar,
    /queAbreAlCerrar\(pendientes\) === AL_CERRAR\.HOJA_PENDIENTES\s*\?\s*setCerrandoConPendientes\(CIERRE\.CANCELAR\)\s*:\s*setCancelando\(true\)/
  );
  // Los dos botones de cancelar van por ahí; nadie abre el modal salteándolo.
  assert.equal((pantalla.match(/onClick=\{alCancelar\}/g) ?? []).length, 2);
  assert.equal((pantalla.match(/setCancelando\(true\)/g) ?? []).length, 1);
  assert.match(pantalla, /cerrandoConPendientes === CIERRE\.CANCELAR \? cancelarLista\(\) : terminar\(\)/);

  const h = html({ accion: CIERRE.CANCELAR, pendientes: pendientesAlCerrar(DAB) });
  assert.ok(h.includes("Si cancelás ahora, se pierden: siguen con el costo anterior."));
  assert.deepEqual(botones(h).slice(-2), [TEXTO_CANCELAR_SIN_APLICAR, "Volver"]);
  assert.ok(!h.includes(TEXTO_APLICAR_Y_TERMINAR));
});

test("SIN TARJETAS Y SOLO SIN MARCAR: NO SE OFRECE «APLICAR Y TERMINAR», QUE NO LOS TOCARÍA", () => {
  // Sin tarjetas no hay a quién marcar, y aplicar solo escribe lo marcado.
  // Con tarjetas sí se ofrece: marca y aplica (`hojaDePendientes.test.mjs`).
  const p = pendientesAlCerrar({ listos: 0, listosSinTildar: 1 });
  const h = html({ accion: CIERRE.TERMINAR, pendientes: p });
  assert.ok(h.includes("1 con precio nuevo que no marcaste. Si terminás ahora, sigue con el costo anterior."));
  assert.ok(!h.includes(TEXTO_APLICAR_Y_TERMINAR));
  assert.deepEqual(botones(h).slice(-2), [TEXTO_TERMINAR_SIN_APLICAR, "Volver"]);
  assert.equal(textoDePendientes({ listos: 1, sinTildar: 0 }), "1 precio está listo para aplicar. Si terminás ahora, sigue con el costo anterior.");
});
