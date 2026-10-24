// UNA LISTA TERMINADA: EL REPORTE EN LA BARRA Y EN UNA HOJA, LO QUE NO SE
// APLICÓ EN PASADO, Y EL CHIP QUE ARRANCA EN ALGO.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/listaTerminada.test.mjs
//
// EL CASO (Dab terminada, producción d181984d, 2026-10-24):
//   · el reporte era un botón de medio ancho, de otro color, con un panel de
//     medio ancho y letra de 10 px;
//   · un cartel verde "Lista terminada." repetía la píldora "Terminada", y "65
//     están listos pero sin tildar, así que aplicar no los va a tocar" hablaba
//     de aplicar en futuro;
//   · el chip arrancaba en "Cambian 0" con "No hay ninguno en este grupo".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaReporte, {
  OPCIONES_REPORTE,
  TEXTO_PIE_REPORTE,
  TITULO_HOJA_REPORTE,
} from "@/components/proveedores/listas/HojaReporte";
import { TITULO_REPORTE } from "@/lib/proveedores/listas/reporteImportacion";
import {
  FILTRO,
  MOTIVO_OMITIDA,
  filtroParaMostrar,
  motivoEnCriollo,
  resumenDeLaCerrada,
  textoSinTildarEnUnaCerrada,
  textoTildadosSinAplicarEnUnaCerrada,
} from "@/lib/proveedores/listas/tusProductos";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";

/** Lo que hace falta para leer una rama de JSX: de su apertura a la siguiente marca. */
const entre = (texto, desde, hasta) => {
  const i = texto.indexOf(desde);
  assert.ok(i >= 0, `no está «${desde}»`);
  return texto.slice(i, texto.indexOf(hasta, i + desde.length));
};

test("EL REPORTE ES UNA HOJA: TÍTULO, LAS TRES OPCIONES COMO TARJETAS DEL KIT, Y EL PIE EN GRIS", () => {
  const html = renderToStaticMarkup(
    React.createElement(HojaReporte, { importacionId: 12, cabecera: { id: 12 }, onCerrar: () => {} })
  );
  assert.ok(html.includes(TITULO_HOJA_REPORTE), "falta el título de la hoja");
  assert.equal(TITULO_HOJA_REPORTE, "Reporte de la lista");
  // La hoja del kit, la misma de vincular.
  assert.match(html, /data-sunmi-modal/);
  // Las tres, a todo el ancho, con su título y su descripción.
  const tarjetas = [...html.matchAll(/<button[^>]*data-reporte="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(
    tarjetas.map((t) => t[1]),
    OPCIONES_REPORTE.map((o) => o.tipo)
  );
  for (const [i, t] of tarjetas.entries()) {
    assert.match(t[0], /class="w-full text-left sunmi-card-surface/, "no es la tarjeta del kit a todo el ancho");
    assert.ok(t[2].includes(TITULO_REPORTE[OPCIONES_REPORTE[i].tipo]));
    assert.ok(t[2].includes(OPCIONES_REPORTE[i].detalle));
    assert.match(t[2], /<svg/, "la opción no tiene su ícono");
  }
  // La línea de compartir, al pie y en gris.
  assert.match(html, new RegExp(`sunmi-text-muted[^>]*>[\\s\\S]*?${TEXTO_PIE_REPORTE.replace(/[.;]/g, "\\$&")}`));
  // Sin medidas escritas a mano ni botones crudos: lo que tenía el panel viejo.
  const fuente = codigoDe("components/proveedores/listas/HojaReporte.jsx");
  assert.ok(!/text-\[|max-w-\[/.test(fuente), "volvieron las medidas a mano del panel");
  assert.ok(!/<button/.test(fuente), "un botón crudo en vez de la tarjeta del kit");
  // El botón y el panel viejos no quedaron al lado.
  assert.ok(!fs.existsSync(path.join(RAIZ, "components/proveedores/listas/BotonReporte.jsx")), "volvió BotonReporte");
  assert.ok(!/BotonReporte/.test(codigoDe(PANTALLA)));
});

test("CERRADA, LA BARRA DE ABAJO DICE CUÁNTOS SE ACTUALIZARON Y TIENE EL «REPORTE» CON EL ESTILO DE «✓ APLICAR»", () => {
  const p = codigoDe(PANTALLA);
  const pie = entre(p, "pieDePantalla={", "despuesDelPie={");
  const cerrada = entre(pie, ") : !abierta ? (", ") : (");
  assert.match(cerrada, /\{resumenDeLaCerrada\(cabecera\.productosActualizados\)\}/);
  assert.match(cerrada, /<SunmiButton color="amber" onClick=\{\(\) => setViendoReporte\(true\)\}/);
  assert.match(cerrada, /\{TEXTO_REPORTE\}/);
  // «✓ Aplicar» es el mismo color: es "el estilo del botón principal".
  assert.match(pie, /color="amber"\s+onClick=\{\(\) => setConfirmando\(true\)\}/);
  // Abierta, el reporte va con Terminar y Cancelar, y nada de eso cerrada.
  assert.match(p, /\{abierta && \(\s*<div className="grid grid-cols-2 gap-2">[\s\S]*?Terminar lista[\s\S]*?Cancelar esta lista[\s\S]*?setViendoReporte\(true\)/);
  // Y los dos botones abren la misma hoja.
  assert.match(p, /\{viendoReporte && \(\s*<HojaReporte/);
  // El resumen, con su singular, de la misma función que usa la pantalla.
  assert.equal(resumenDeLaCerrada(12), "12 costos actualizados");
  assert.equal(resumenDeLaCerrada(1), "1 costo actualizado");
  assert.equal(resumenDeLaCerrada(null), "0 costos actualizados");
});

test("SE FUE EL CARTEL «LISTA TERMINADA.», Y LO QUE NO SE APLICÓ SE DICE EN PASADO", () => {
  const p = codigoDe(PANTALLA);
  assert.ok(!p.includes("Lista terminada."), "volvió el cartel que repite la píldora");
  assert.equal(
    textoSinTildarEnUnaCerrada(65),
    "65 quedaron sin aplicar: estaban listos pero sin tildar. Siguen con su costo anterior."
  );
  assert.equal(textoSinTildarEnUnaCerrada(1), "1 quedó sin aplicar: estaba listo pero sin tildar. Sigue con su costo anterior.");
  // Cerrada, los dos carteles son avisos en pasado; los de aplicar, solo abierta.
  assert.match(p, /if \(!abierta && [^)]*listosSinTildar[^{]*\{\s*avisos\.push\(\s*<Aviso key="sinTildar" tono="warning">\s*\{textoSinTildarEnUnaCerrada\(/);
  assert.match(p, /if \(!abierta && [^)]*omitidasAlAplicar[^{]*\{\s*avisos\.push\(\s*<Aviso key="omitidas" tono="warning">\s*\{textoTildadosSinAplicarEnUnaCerrada\(/);
  assert.match(p, /if \(abierta && [^)]*listosSinTildar[\s\S]*?aplicar no/);
  // Ningún texto de una cerrada habla de aplicar en futuro.
  const enFuturo = /va a tocar|van a actualizar|va a actualizar|no se aplica hasta|con los datos de hoy/i;
  for (const t of [
    textoSinTildarEnUnaCerrada(65),
    textoTildadosSinAplicarEnUnaCerrada(3),
    motivoEnCriollo({ motivo: MOTIVO_OMITIDA, abierta: false }),
  ]) {
    assert.ok(!enFuturo.test(t), `habla de aplicar en futuro: ${t}`);
    assert.match(t, /sin aplicar/);
  }
  // Contraprueba: abierta, el motivo de una omitida sigue siendo el de aplicar.
  assert.match(motivoEnCriollo({ motivo: MOTIVO_OMITIDA, abierta: true }), /Con los datos de hoy/);
});

test("CERRADA, EL CHIP ARRANCA EN EL PRIMERO QUE TENGA ALGO; ABIERTA, UNO VACÍO SE RESPETA", () => {
  // La forma de `tusProductosDeLaLista().conteo`.
  const conteo = { total: 158, traeLaLista: 33, porEstado: { SIN_VINCULAR: 0, REVISAR: 65, CAMBIA: 0, NO_LO_CAMBIO: 0 } };
  assert.equal(filtroParaMostrar(FILTRO.CAMBIA, conteo, { abierta: false }), FILTRO.REVISAR);
  assert.equal(filtroParaMostrar(FILTRO.CAMBIA, conteo, { abierta: true }), FILTRO.CAMBIA);
  assert.equal(filtroParaMostrar(null, conteo, { abierta: false }), FILTRO.REVISAR);
  // Cerrada y con algo, el que eligió la persona se queda.
  assert.equal(filtroParaMostrar(FILTRO.VINCULADOS, conteo, { abierta: false }), FILTRO.VINCULADOS);
  // La pantalla lo usa, y al terminar suelta el chip para volver a elegirlo.
  const p = codigoDe(PANTALLA);
  assert.match(p, /const filtroActivo = filtroParaMostrar\(filtro, tusProductos\.conteo, \{ abierta \}\);/);
  assert.match(entre(p, "const terminar = ", "if (cargandoUser"), /setFiltro\(null\);\s*await cargar\(\);/);
});
