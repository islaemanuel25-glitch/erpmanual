// CANDADO: UN `destino` EN LA URL NO AMPLÍA EL ALCANCE EN EL TABLERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/alcanceDelTablero.test.mjs
//
// Hasta el 2026-09-28, `/api/transferencias/tablero` usaba el `destino` pedido
// tal cual:
//   · un LOCAL con `?destino=<otro>` leía las transferencias de otra ubicación;
//   · un DEPÓSITO con un destino de otro grupo se llevaba el corte de su Semana
//     Operativa, y lo que él mismo le hubiera despachado.
// La regla canónica ya existía en Finanzas —`resolverLocalPedido`, mismo
// parámetro y mismo motivo— y el tablero no la usaba.
//
// Afirma la FORMA del arreglo; que funcione contra la base lo prueba
// `scripts/pruebas-db/transferenciasAlcance.mjs`, que corre en CI.
//
// Lee el código SIN COMENTARIOS (regla 5 de CLAUDE.md): el comentario del arreglo
// nombra las mismas funciones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolverLocalPedido, ERROR_FUERA_DE_ALCANCE, ERROR_DESTINO_INVALIDO } from "../finanzas/alcanceFinanciero.js";

const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const RUTA = sinComentariosJs(readFileSync("app/api/transferencias/tablero/route.js", "utf8"));

test("el tablero usa la regla canónica de Finanzas, para local Y depósito, con la lista del grupo", () => {
  assert.match(RUTA, /import \{ resolverLocalPedido \} from "@\/lib\/finanzas\/alcanceFinanciero";/);
  assert.match(
    RUTA,
    /const elegido = resolverLocalPedido\(\{\s*esDeposito,\s*localDeLaSesion: vista\.localId,\s*destinoPedido: searchParams\.get\("destino"\),\s*localesDelGrupo: \(locales \|\| \[\]\)\.map\(\(l\) => \(\{ localId: l\.id \}\)\),\s*\}\);\s*if \(elegido\.error\) \{\s*return NextResponse\.json\(\{ ok: false, error: elegido\.error \}, \{ status: 403 \}\);/
  );
});

test("el parámetro crudo se lee UNA sola vez, en la regla; después se usa el local resuelto", () => {
  assert.equal(RUTA.split('searchParams.get("destino")').length - 1, 1);
  assert.match(RUTA, /const localPedido = elegido\.localId;/);
  assert.match(RUTA, /\.\.\.\(elegido\.localId \? \[elegido\.localId\] : \[\]\)/);
});

test("y la regla se decide ANTES de leer nada del local pedido", () => {
  const regla = RUTA.indexOf("resolverLocalPedido({");
  assert.ok(regla > RUTA.indexOf("relacionesDelDeposito(vista.grupoId)"), "la lista del grupo tiene que estar leída antes");
  for (const despues of ["vigenciasDeUbicaciones(", "prisma.transferencia.findMany(", "prisma.transferencia.findFirst("]) {
    const i = RUTA.indexOf(despues);
    assert.ok(i > regla, `${despues} corre antes de la regla de alcance`);
  }
});

test("la regla: un local, el suyo; un depósito, uno de SU grupo", () => {
  const local = (destinoPedido) => resolverLocalPedido({ esDeposito: false, localDeLaSesion: 5, destinoPedido });
  assert.deepEqual(local(null), { localId: 5 });
  assert.deepEqual(local("5"), { localId: 5 });
  assert.deepEqual(local("6"), { localId: null, error: ERROR_FUERA_DE_ALCANCE });
  assert.equal(local("-3").error, ERROR_DESTINO_INVALIDO);

  const grupo = [{ localId: 7 }, { localId: 8 }];
  const deposito = (destinoPedido) => resolverLocalPedido({ esDeposito: true, localDeLaSesion: 1, destinoPedido, localesDelGrupo: grupo });
  assert.deepEqual(deposito(null), { localId: null });
  assert.deepEqual(deposito("8"), { localId: 8 });
  assert.deepEqual(deposito("9"), { localId: null, error: ERROR_FUERA_DE_ALCANCE });
  assert.deepEqual(deposito("1"), { localId: null, error: ERROR_FUERA_DE_ALCANCE }, "el depósito no es uno de sus locales");
  assert.equal(deposito("abc").error, ERROR_DESTINO_INVALIDO);
});

test("la prueba de base que lo reproduce corre en CI", () => {
  const ci = readFileSync(".github/workflows/verificacion.yml", "utf8");
  assert.match(ci, /\n\s*node --import \.\/scripts\/alias-loader\.mjs scripts\/pruebas-db\/transferenciasAlcance\.mjs\n/);
});
