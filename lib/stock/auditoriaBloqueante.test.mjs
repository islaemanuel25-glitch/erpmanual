// Candados del criterio "sin rastro no se mueve el stock", y del control muerto
// de ListaPrecio.esDefault.
//
// Los dos son candados ESTRUCTURALES: verifican una decisión sobre cómo está
// escrito el código, no un cálculo. Van juntos porque los dos cierran el mismo
// tipo de problema — algo que parecía hacer una cosa y hacía otra.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/stock/auditoriaBloqueante.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * El código, sin comentarios.
 *
 * Hace falta porque estos candados buscan que algo NO esté, y el comentario que
 * explica por qué se sacó nombra justamente lo que se sacó. Sin este paso, la
 * explicación dispara el candado que ella misma justifica.
 *
 * Se reemplaza por espacios y no por vacío, para no pegar dos palabras que
 * estaban separadas por un comentario.
 */
const soloCodigo = (rel) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/[^\n]*/gm, (m) => " ".repeat(m.length));

const AJUSTAR = "app/api/stock_locales/ajustar/route.js";

// ---------------------------------------------------------------------------
// El ajuste de stock no se mueve sin rastro
// ---------------------------------------------------------------------------

test("la auditoría del ajuste NO es best-effort", () => {
  const src = leer(AJUSTAR);
  assert.doesNotMatch(
    src,
    /auditoriaStock[\s\S]{0,600}?\}\)\s*\.catch\(/,
    "la auditoría del ajuste volvió a tragarse su error: el stock se movería " +
      "aunque no quede rastro, y un ajuste manual no tiene ningún documento atrás " +
      "que permita reconstruirlo."
  );
});

test("el stock y su auditoría van en la misma transacción", () => {
  // Sacar el .catch no alcanza: si la auditoría corre después de la escritura y
  // fuera de una transacción, un fallo deja el stock movido igual.
  const src = leer(AJUSTAR);
  assert.match(src, /prisma\.\$transaction\(async \(tx\) => \{/);
  assert.match(src, /tx\.auditoriaStock\.create/);
  assert.doesNotMatch(
    src,
    /await prisma\.auditoriaStock\.create/,
    "quedó una escritura de auditoría fuera de la transacción"
  );
});

test("sin grupoId el ajuste se rechaza en vez de escribir a ciegas", () => {
  const src = leer(AJUSTAR);
  assert.match(src, /if \(!grupoId\)/);
  assert.match(src, /TEXTO_SIN_AUDITORIA/);
  assert.match(src, /status: 409/);
});

test("los DOS modos —ajuste y límites— están cubiertos", () => {
  // El modo límites también mueve un dato del que no queda otro registro.
  const src = leer(AJUSTAR);
  const transacciones = src.match(/prisma\.\$transaction\(async \(tx\) => \{/g) || [];
  assert.equal(
    transacciones.length,
    2,
    `se esperaban 2 transacciones (ajuste y límites), hay ${transacciones.length}`
  );
  const rechazos = src.match(/TEXTO_SIN_AUDITORIA/g) || [];
  assert.ok(rechazos.length >= 3, "falta el rechazo por falta de grupo en alguno de los dos modos");
});

test("el criterio está escrito en el archivo, no solo aplicado", () => {
  // Para que el próximo que lo mire no lo vuelva a decidir al revés. La
  // divergencia con transferencias duró meses justamente porque nada la
  // explicaba.
  const src = leer(AJUSTAR);
  assert.match(src, /EL CRITERIO/);
  assert.match(src, /transferencias/i, "el criterio tiene que nombrar el caso con el que se alineó");
});

test("transferencias sigue siendo bloqueante", () => {
  // El alineamiento es de ajustes HACIA transferencias. Si alguien aflojara
  // transferencias, los dos volverían a divergir por el otro lado.
  const src = leer("app/api/transferencias/confirmar-recepcion/route.js");
  assert.match(src, /auditoriaStock/);
  assert.doesNotMatch(
    src,
    /auditoriaStock[\s\S]{0,400}?\}\)\s*\.catch\(/,
    "la auditoría de la recepción de transferencias pasó a ser best-effort"
  );
});

// ---------------------------------------------------------------------------
// ListaPrecio.esDefault salió de la pantalla
// ---------------------------------------------------------------------------

const PAGINA_LISTAS = "app/modulos/configuracion/listas-precios/page.jsx";
const MODAL_LISTAS = "components/listas-precios/ModalListaPrecio.jsx";

test("la pantalla de listas ya no deja marcar el default del grupo", () => {
  // El campo no lo lee NINGÚN camino de venta: lo declara el propio motor en
  // lib/precios/resolverListaCliente.js. El botón desmarcaba, marcaba, mostraba
  // una pill… y no cambiaba un solo precio.
  // Sobre el CÓDIGO, no sobre los comentarios: el comentario que explica por qué
  // se sacó nombra el endpoint y el handler.
  const src = soloCodigo(PAGINA_LISTAS);
  assert.doesNotMatch(src, /marcarDefault\(/, "volvió el botón de marcar default");
  assert.doesNotMatch(src, /puedeMarcarDefault/);
  assert.doesNotMatch(src, /marcar-default/, "volvió la llamada al endpoint");
  assert.doesNotMatch(src, /esDefault/, "volvió a leerse esDefault en la pantalla");
});

test("el modal ya no manda esDefault", () => {
  const src = soloCodigo(MODAL_LISTAS);
  assert.doesNotMatch(
    src,
    /diff\.esDefault|esDefault: form\.esDefault/,
    "el modal volvió a escribir esDefault"
  );
});

test("queda escrito POR QUÉ se sacó, y dónde se elige la lista que sí se aplica", () => {
  const src = leer(PAGINA_LISTAS);
  assert.match(src, /resolverListaCliente/);
  assert.match(src, /listaPrecioDefaultId/);
});

test("la columna NO se borró: el dato sigue en el esquema", () => {
  // Sacar el control de la pantalla es una cosa; borrar el dato es otra, y no se
  // hizo. Si alguien escribe una migración que la elimine, esto se pone rojo.
  const schema = leer("prisma/schema.prisma");
  assert.match(schema, /esDefault/, "se borró ListaPrecio.esDefault del esquema");
});

test("el motor sigue declarando que no lee esDefault", () => {
  // Si algún día se reconecta, esta línea deja de ser cierta y el candado avisa
  // que hay que revisar la pantalla.
  const src = leer("lib/precios/resolverListaCliente.js");
  assert.match(src, /esDefault del grupo NUNCA se consulta en runtime/);
});
