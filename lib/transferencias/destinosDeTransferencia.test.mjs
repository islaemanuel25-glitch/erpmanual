// A QUIÉN SE LE PUEDE TRANSFERIR: UNA PUERTA, NO DOS CRITERIOS PARECIDOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/destinosDeTransferencia.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA ─────────────────────────────────────────────
//
// La pantalla de crear transferencia ofrecía los destinos con
// `getLocalesDeGrupo`, que devuelve todas las filas de `GrupoLocal` y no filtra
// nada. Relevado el 2026-09-13, y las dos mitades del agujero:
//
//   · un local con `activo = false` se ofrecía como destino de una operación
//     NUEVA;
//   · el "EXCLUYE depósitos" de su comentario no es un filtro sino una
//     creencia — se cumple porque los depósitos viven en `GrupoDeposito`.
//
// Estos candados afirman el criterio, no la consulta: por eso el módulo no toca
// Prisma y acá no hace falta base.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  destinosDeTransferencia,
  puedeRecibirTransferencias,
} from "./destinosDeTransferencia.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

const local = (extra = {}) => ({ id: 2, nombre: "mini el 7", activo: true, ...extra });

test("un local que opera es destino válido", () => {
  assert.equal(puedeRecibirTransferencias(local()), true);
});

test("UN LOCAL DADO DE BAJA NO ES DESTINO: es empezar algo nuevo contra lo que ya no opera", () => {
  assert.equal(puedeRecibirTransferencias(local({ activo: false })), false);
});

test("el depósito no se transfiere a sí mismo, por los DOS caminos", () => {
  // Por la columna...
  assert.equal(puedeRecibirTransferencias(local({ es_deposito: true })), false);
  // ...y por ser el local del par, que es el camino que hoy manda: en producción
  // el depósito del grupo ni siquiera está en `GrupoLocal`.
  assert.equal(puedeRecibirTransferencias(local({ id: 7 }), { depositoLocalId: 7 }), false);
  // Y el mismo local, con OTRO depósito, sí es destino.
  assert.equal(puedeRecibirTransferencias(local({ id: 7 }), { depositoLocalId: 9 }), true);
});

test("SIN EL DATO `activo` NO ES DESTINO, y eso es a propósito", () => {
  // `activo === true` y no `activo !== false`. Si quien consulta se olvida de
  // pedir la columna, la lista sale VACÍA y se ve en el acto. Con la forma
  // permisiva, un `select` a medias volvería a ofrecer a un local de baja sin
  // que nada avise — la misma familia de defecto que la #97.
  const { activo, ...sinElCampo } = local();
  assert.equal(puedeRecibirTransferencias(sinElCampo), false);
});

test("nada raro pasa como destino", () => {
  assert.equal(puedeRecibirTransferencias(null), false);
  assert.equal(puedeRecibirTransferencias(undefined), false);
  assert.equal(puedeRecibirTransferencias({}), false);
  assert.equal(puedeRecibirTransferencias({ activo: true }), false, "sin id no es nadie");
});

test("la lista filtra los tres casos de una", () => {
  const destinos = destinosDeTransferencia(
    [
      local({ id: 2, nombre: "mini el 7" }),
      local({ id: 3, nombre: "Casiano", activo: false }),
      local({ id: 4, nombre: "otro depósito", es_deposito: true }),
      local({ id: 9, nombre: "el depósito mismo" }),
    ],
    { depositoLocalId: 9 }
  );
  assert.deepEqual(destinos.map((l) => l.id), [2]);
});

// ── LA OTRA MITAD: QUE LA PANTALLA DE VERDAD LA USE ───────────────────────

test("la ruta de opciones del POS usa esta puerta y NO `getLocalesDeGrupo`", () => {
  // Un criterio que nadie llama no defiende nada. Se lee el fuente sin
  // comentarios: un candado que busca en prosa no afirma nada.
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-transferencias/opciones/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.match(src, /destinosDeTransferencia\(/, "el modo depósito no filtra los destinos");
  assert.match(src, /puedeRecibirTransferencias\(/, "el modo admin no aplica el mismo criterio");
  assert.doesNotMatch(
    src,
    /getLocalesDeGrupo/,
    "volvió a ofrecer los destinos sin filtrar: `getLocalesDeGrupo` no mira `activo`"
  );
});

test("`getLocalesDeGrupo` SIGUE EXISTIENDO y sin filtro, porque contesta otra pregunta", () => {
  // Sus tres consumidores la usan para replicar el CATÁLOGO. Filtrar ahí por
  // `activo` rompería algo que hoy funciona: un local dado de baja y reactivado
  // después quedaría sin los productos creados durante su baja.
  //
  // Este candado existe para que el día que alguien "unifique" las dos
  // funciones, lo haga a propósito y leyendo esto.
  const src = fs
    .readFileSync(path.join(RAIZ, "lib/grupos.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const cuerpo = /export async function getLocalesDeGrupo[\s\S]*?\n}/.exec(src)?.[0] || "";
  assert.ok(cuerpo, "no se encontró getLocalesDeGrupo");
  assert.doesNotMatch(
    cuerpo,
    /activo/,
    "se le agregó un filtro por `activo`: eso deja huecos en el catálogo de un local reactivado"
  );

  const consumidores = ["app/api/productos/crear/route.js", "app/api/productos/import/apply/route.js", "app/api/productos/promover-a-deposito/route.js"];
  for (const ruta of consumidores) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.match(texto, /getLocalesDeGrupo/, `${ruta} dejó de usarla: revisar por qué`);
  }
});
