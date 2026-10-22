// TODA LECTURA DE PEDIDOS DEJA AFUERA A LOS CANCELADOS, CON EL FILTRO ÚNICO.
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/sinCancelados.test.mjs
//
// ── EL CAMBIO QUE ESTO DEFIENDE (Tanda 9A) ────────────────────────────────
//
// Cancelar un pedido Solicitado lo BORRABA. Desde la 9A lo marca (estado
// "Cancelado"). Un pedido cancelado antes no existía, así que toda lectura de
// `PosTransferencia` —y toda lectura de sus líneas— lo dejaba afuera sin
// proponérselo. Para que siga igual, cada una pasa su `where` por
// `sinCancelados` (lib/pedidos/estados.js).
//
// ── QUÉ AFIRMA ────────────────────────────────────────────────────────────
//
// Que cada llamada de LECTURA a `posTransferencia` o `posTransferenciaDetalle`
// en `app/` y `lib/` lleva `sinCancelados(` en su argumento, salvo las que
// están en EXCEPCIONES, cada una con su motivo. Una lectura nueva sin el
// filtro y sin motivo lo pone rojo.
//
// Enumera con `git grep --untracked` (regla 10 de CLAUDE.md): una ruta nueva
// sin commitear también cuenta. Saca los comentarios antes de mirar (regla 5):
// el nombre del filtro en prosa no cuenta como uso.
//
// ── LO QUE NO CUBRE ───────────────────────────────────────────────────────
//
// Es análisis de texto: una lectura armada con una clave dinámica
// (`prisma[modelo]`) o con el `where` en una variable que pasó por el filtro
// en OTRA línea le pasa por al lado. Por eso el filtro va escrito en la misma
// llamada, aunque quede repetido.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ESTADO_PEDIDO, sinCancelados } from "./estados.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const LECTURA = /\.(posTransferencia|posTransferenciaDetalle)\.(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy)\(/g;

/**
 * Las lecturas que NO usan el filtro. Una lista con motivo, no un `if`.
 * Clave: `archivo#modelo.método`; `veces` es cuántas llamadas así hay hoy.
 */
const EXCEPCIONES = Object.freeze({
  "app/api/pedidos/historial/route.js#posTransferencia.findMany": {
    veces: 1,
    motivo:
      "el historial del local MUESTRA los cancelados: tiene el filtro \"Cancelados\" (2026-10-22). Un pedido cancelado " +
      "es historial, no un pedido vivo; el estado sale tal cual y la pantalla lo dice \"Cancelado\".",
  },
  "app/api/pedidos/historial/route.js#posTransferencia.count": {
    veces: 1,
    motivo: "ídem: el total del historial cuenta los cancelados que lista",
  },
  "lib/integraciones/azul-chat/pedidosEventos.js#posTransferencia.findMany": {
    veces: 1,
    motivo:
      "PEDIDO_SOLICITADO es el hecho de haber pedido: un pedido solicitado y después cancelado SÍ se solicitó. " +
      "Antes desaparecía al borrarse; desde la 9A queda, y es el cambio esperado (DEC-0013).",
  },
  "app/api/admin/reset-operativo/route.js#posTransferencia.count": {
    veces: 1,
    motivo: "cuenta las filas que el reset va a BORRAR: un cancelado es una fila que se borra, y el informe dice cuántas",
  },
  "app/api/admin/reset-operativo/route.js#posTransferenciaDetalle.count": {
    veces: 1,
    motivo: "ídem: las líneas de un cancelado también se borran en el reset",
  },
  "app/api/productos/eliminar/[id]/route.js#posTransferenciaDetalle.findFirst": {
    veces: 1,
    motivo:
      "no lista pedidos: frena el borrado de un producto que tiene historial. La línea de un pedido cancelado es historial, " +
      "y además la clave foránea de la línea impediría borrar el producto. Antes de la 9A se podía borrar.",
  },
  "app/api/pos-transferencias/eliminarItem/route.js#posTransferenciaDetalle.findUnique": {
    veces: 1,
    motivo: "ruta huérfana, sin consumidores en la interfaz; la Tanda 9A decidió no tocarla",
  },
});

const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function archivosConLecturas() {
  let salida = "";
  try {
    salida = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", "posTransferencia(Detalle)?\\.", "--", "app", "lib", ":!*.test.mjs"],
      { cwd: RAIZ, encoding: "utf8" },
    );
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
  return salida.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** El texto del argumento de la llamada que abre en `desde` (justo después del `(`). */
function argumento(src, desde) {
  let nivel = 1;
  for (let i = desde; i < src.length; i += 1) {
    if (src[i] === "(") nivel += 1;
    else if (src[i] === ")") {
      nivel -= 1;
      if (nivel === 0) return src.slice(desde, i);
    }
  }
  return src.slice(desde);
}

/** Las lecturas de un fuente: `{ clave, conFiltro }` por llamada. */
function lecturasDe(archivo, fuente) {
  const src = sinComentarios(fuente);
  return [...src.matchAll(LECTURA)].map((m) => ({
    clave: `${archivo}#${m[1]}.${m[2]}`,
    conFiltro: /\bsinCancelados\(/.test(argumento(src, m.index + m[0].length)),
  }));
}

/** Lo que no cumple: lecturas sin filtro que no están exceptuadas, y excepciones que ya no existen. */
function problemas(lecturas, excepciones = EXCEPCIONES) {
  const sinFiltro = new Map();
  for (const l of lecturas) if (!l.conFiltro) sinFiltro.set(l.clave, (sinFiltro.get(l.clave) ?? 0) + 1);
  const salida = [];
  for (const [clave, veces] of sinFiltro) {
    const ex = excepciones[clave];
    if (!ex) salida.push(`${clave}: lee pedidos sin sinCancelados y sin motivo en EXCEPCIONES`);
    else if (ex.veces !== veces) salida.push(`${clave}: ${veces} lecturas sin filtro, la excepción dice ${ex.veces}`);
  }
  for (const clave of Object.keys(excepciones)) {
    if (!sinFiltro.has(clave)) salida.push(`${clave}: la excepción ya no corresponde a ninguna lectura; sacarla`);
  }
  return salida;
}

function todasLasLecturas() {
  return archivosConLecturas().flatMap((f) => lecturasDe(f, fs.readFileSync(path.join(RAIZ, f), "utf8")));
}

test("toda lectura de pedidos o de sus líneas pasa por sinCancelados, salvo las exceptuadas con motivo", () => {
  const lecturas = todasLasLecturas();
  // Que miró algo: hoy son más de veinte llamadas en más de quince archivos.
  assert.ok(lecturas.length > 20, `solo ${lecturas.length} lecturas: ¿cambió cómo se enumera?`);
  assert.deepEqual(problemas(lecturas), []);
});

test("cada excepción tiene motivo escrito", () => {
  for (const [clave, ex] of Object.entries(EXCEPCIONES)) {
    assert.ok(typeof ex.motivo === "string" && ex.motivo.length > 30, clave);
    assert.ok(Number.isInteger(ex.veces) && ex.veces > 0, clave);
  }
});

test("CONTRAPRUEBA: sacar el filtro de una lectura real la pone roja; en un comentario no cuenta", () => {
  // Decía `app/api/pedidos/historial/route.js`, que desde el 2026-10-22 lee
  // los cancelados a propósito (está en EXCEPCIONES). El ejemplo pasa a otra
  // lectura real que sigue filtrando.
  const archivo = "app/api/pos-transferencias/cancelar/route.js";
  const real = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
  assert.deepEqual(problemas(lecturasDe(archivo, real), {}), []);
  const sinFiltro = real.replace("where: sinCancelados({ id: posId }),", "where: { id: posId },");
  assert.notEqual(sinFiltro, real, "el reemplazo tiene que tocar algo");
  assert.deepEqual(problemas(lecturasDe(archivo, sinFiltro), {}), [
    `${archivo}#posTransferencia.findUnique: lee pedidos sin sinCancelados y sin motivo en EXCEPCIONES`,
  ]);
  // El nombre del filtro en un comentario arriba de la llamada no la salva.
  const conComentario = `// sinCancelados( acá no hay código\nawait prisma.posTransferencia.findMany({ where: { destinoId: 1 } });`;
  assert.equal(lecturasDe("x.js", conComentario)[0].conFiltro, false);
  // Y una llamada en un comentario no es una lectura.
  assert.deepEqual(lecturasDe("x.js", "// prisma.posTransferencia.findMany({})"), []);
  // Las líneas también: una lectura de detalles sin el filtro de la relación.
  assert.equal(lecturasDe("x.js", "prisma.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: 1 } })")[0].conFiltro, false);
  assert.equal(lecturasDe("x.js", "prisma.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: 1, pos: sinCancelados() } })")[0].conFiltro, true);
});

test("CONTRAPRUEBA: una excepción que ya no tiene lectura, o con otra cantidad, también es rojo", () => {
  const ex = { "a.js#posTransferencia.count": { veces: 1, motivo: "x".repeat(40) } };
  assert.deepEqual(problemas([], ex), ["a.js#posTransferencia.count: la excepción ya no corresponde a ninguna lectura; sacarla"]);
  const dos = [{ clave: "a.js#posTransferencia.count", conFiltro: false }, { clave: "a.js#posTransferencia.count", conFiltro: false }];
  assert.deepEqual(problemas(dos, ex), ["a.js#posTransferencia.count: 2 lecturas sin filtro, la excepción dice 1"]);
});

test("CONTRAPRUEBA: la enumeración ve un archivo nuevo sin commitear", () => {
  const rel = "app/api/__sin_cancelados_contraprueba__/route.js";
  const abs = path.join(RAIZ, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  try {
    fs.writeFileSync(abs, "export const x = () => prisma.posTransferencia.findMany({ where: {} });\n");
    assert.ok(problemas(todasLasLecturas()).some((p) => p.startsWith(`${rel}#posTransferencia.findMany`)));
  } finally {
    fs.rmSync(path.dirname(abs), { recursive: true, force: true });
  }
});

// ── el filtro mismo ───────────────────────────────────────────────────────

test("sinCancelados deja el where como estaba y le suma 'no cancelado' en AND", () => {
  const no = { estado: { not: ESTADO_PEDIDO.CANCELADO } };
  assert.deepEqual(sinCancelados(), { AND: [no] });
  // `findUnique` necesita el id en el primer nivel: sigue ahí.
  assert.deepEqual(sinCancelados({ id: 5 }), { id: 5, AND: [no] });
  // Un estado pedido sigue pedido; el AND solo lo acota.
  assert.deepEqual(sinCancelados({ estado: "Solicitado", destinoId: 3 }), { estado: "Solicitado", destinoId: 3, AND: [no] });
  // Un AND que ya venía se conserva, sea lista u objeto.
  assert.deepEqual(sinCancelados({ AND: [{ a: 1 }] }), { AND: [{ a: 1 }, no] });
  assert.deepEqual(sinCancelados({ AND: { a: 1 } }), { AND: [{ a: 1 }, no] });
  // No toca lo que recibe.
  const w = { id: 1, AND: [{ a: 1 }] };
  sinCancelados(w);
  assert.deepEqual(w, { id: 1, AND: [{ a: 1 }] });
});

test("los estados del pedido, congelados; Cancelado es el que escribe cancelar", () => {
  assert.ok(Object.isFrozen(ESTADO_PEDIDO));
  assert.equal(ESTADO_PEDIDO.CANCELADO, "Cancelado");
  const cancelar = sinComentarios(fs.readFileSync(path.join(RAIZ, "app/api/pos-transferencias/cancelar/route.js"), "utf8"));
  // Marca, no borra.
  assert.doesNotMatch(cancelar, /\.delete(Many)?\(/, "cancelar volvió a borrar");
  assert.match(cancelar, /estado: ESTADO_PEDIDO\.CANCELADO,\s*canceladoAt: new Date\(\),\s*canceladoPorUserId: session\.id,/);
  // Solo desde Solicitado, en la misma condición del update.
  assert.match(cancelar, /where: \{ id: posId, estado: ESTADO_PEDIDO\.SOLICITADO \}/);
  assert.match(cancelar, /prisma\.\$transaction\(/);
});
