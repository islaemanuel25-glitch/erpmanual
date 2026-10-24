// LOS MENSAJES DE LA HOJA, EN CRIOLLO Y DICIENDO QUÉ HACER (Emanuel, 2026-10-24).
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/porQueNoSeConfirma.test.mjs
//
// El caso: tocó «Usar» desde un local y la hoja dijo "Esta fila no está
// esperando una lectura: o no se pudo leer, o no se le puede escribir el costo,
// o su código está repetido. Miralo en el detalle de la lista." Tres causas,
// ninguna salida, y un "detalle de la lista" que ya no existe.
//
// Las filas tienen el `estado` y el `motivo` que escribe el motor
// (`ESTADO_LINEA`, `MOTIVO_CONCILIACION`), no unos parecidos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

import { porQueNoSeConfirma, TEXTO_SIN_PROPIEDAD_DEL_COSTO } from "./porQueNoSeConfirma.js";
import { MOTIVO_NO_CONFIRMABLE, TEXTO_NO_CONFIRMABLE, puedeConfirmarse } from "./confirmarPresentacion.js";
import { MOTIVO_CONCILIACION } from "./conciliarLista.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const ABIERTA = { estado: "CONCILIADA" };

/** El motivo, como lo da `puedeConfirmarse` sobre esa fila, y su texto. */
function textoDe(fila) {
  const r = puedeConfirmarse({ aplicada: false, excluidaManual: false, productoBaseId: 5, ...fila }, ABIERTA);
  assert.equal(r.ok, false, "la fila tenía que no poder confirmarse");
  return porQueNoSeConfirma(r.motivo, fila);
}

test("CADA CAUSA DICE LA SUYA, Y QUÉ TOCAR", () => {
  const sinPropiedad = textoDe({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.SIN_PROPIEDAD_COSTO });
  assert.match(sinPropiedad, /ubicación que no administra su costo/);
  assert.match(sinPropiedad, /«No es este producto»/);
  assert.match(textoDe({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.PRODUCTO_COMBO }), /combo/);
  assert.match(textoDe({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.PRECIO_CERO }), /cero/);
  assert.match(textoDe({ estado: ESTADO_LINEA.CODIGO_DUPLICADO, motivo: null }), /más de una vez/);
  assert.match(textoDe({ estado: ESTADO_LINEA.ERROR, motivo: null }), /no se pudo leer/);
  assert.match(textoDe({ estado: ESTADO_LINEA.NO_MACHEADO, motivo: null }), /«No es este producto»/);
  // Los cuatro de arriba son textos DISTINTOS: con uno solo para todos volvería
  // el mensaje de las tres causas.
  const distintos = new Set([
    sinPropiedad,
    textoDe({ estado: ESTADO_LINEA.CODIGO_DUPLICADO }),
    textoDe({ estado: ESTADO_LINEA.ERROR }),
    textoDe({ estado: ESTADO_LINEA.NO_MACHEADO }),
  ]);
  assert.equal(distintos.size, 4);
});

test("LOS OTROS MOTIVOS SALEN DE SU TABLA, YA EN CRIOLLO", () => {
  assert.equal(porQueNoSeConfirma(MOTIVO_NO_CONFIRMABLE.EXCLUIDA, {}), TEXTO_NO_CONFIRMABLE.EXCLUIDA);
  assert.match(TEXTO_NO_CONFIRMABLE.EXCLUIDA, /«Volver a cambiarlo»/, "dejada como está, la salida es la de la hoja");
  assert.match(TEXTO_SIN_PROPIEDAD_DEL_COSTO, /Pasate a la ubicación que lo administra/);
  assert.equal(porQueNoSeConfirma(null, {}), null);
  for (const [m, t] of Object.entries(TEXTO_NO_CONFIRMABLE)) {
    assert.ok(!/importación|la fila |excluida\./i.test(t), `${m} sigue hablando en el idioma del código: ${t}`);
  }
});

/** El fuente sin comentarios: la frase vieja está CITADA en prosa a propósito. */
const sinComentarios = (t) =>
  t.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("LA FRASE VIEJA NO QUEDA EN NINGÚN LADO DEL CÓDIGO", () => {
  // `--untracked` para que un archivo recién escrito también cuente. Se buscan
  // los archivos que la nombran y después se mira cada uno SIN comentarios: los
  // que la citan para explicar por qué se fue no cuentan, y un candado que los
  // contara se pondría rojo por su propia prosa.
  let archivos = "";
  try {
    archivos = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "esperando una lectura", "--", "app", "components", "lib", ":!*.test.mjs"],
      { cwd: RAIZ, encoding: "utf8" }
    );
  } catch (e) {
    // git grep sale con 1 cuando no encuentra nada.
    if (e.status !== 1) throw e;
  }
  const conLaFrase = archivos
    .split("\n")
    .filter(Boolean)
    .filter((f) => sinComentarios(fs.readFileSync(path.join(RAIZ, f), "utf8")).includes("esperando una lectura"));
  assert.deepEqual(conLaFrase, [], "volvió el mensaje de las tres causas");
});
