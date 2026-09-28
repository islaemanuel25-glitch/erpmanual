// CANDADO: UN `destino` EN LA URL NO AMPLÍA EL ALCANCE DE UN LOCAL EN EL TABLERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/alcanceDelTablero.test.mjs
//
// Hasta el 2026-09-28, en `/api/transferencias/tablero` el `destino` pedido
// reemplazaba el `destinoId` de un local, y con `?destino=<otro>` un local leía
// las transferencias de otra ubicación. La regla canónica ya existía en Finanzas
// —`resolverLocalPedido`, mismo parámetro y mismo motivo— y el tablero no la usaba.
//
// Afirma la FORMA del arreglo; que funcione contra la base lo prueba
// `scripts/pruebas-db/transferenciasAlcance.mjs`, que corre en CI.
//
// Lee el código SIN COMENTARIOS (regla 5 de CLAUDE.md): el comentario del arreglo
// nombra las mismas funciones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolverLocalPedido, ERROR_FUERA_DE_ALCANCE } from "../finanzas/alcanceFinanciero.js";

const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const RUTA = sinComentariosJs(readFileSync("app/api/transferencias/tablero/route.js", "utf8"));

test("el tablero usa la regla canónica de Finanzas, no una parecida al lado", () => {
  assert.match(RUTA, /import \{ resolverLocalPedido \} from "@\/lib\/finanzas\/alcanceFinanciero";/);
  assert.match(
    RUTA,
    /if \(!esDeposito\) \{\s*const propio = resolverLocalPedido\(\{\s*esDeposito: false,\s*localDeLaSesion: vista\.localId,\s*destinoPedido: searchParams\.get\("destino"\),\s*\}\);\s*if \(propio\.error\) \{\s*return NextResponse\.json\(\{ ok: false, error: propio\.error \}, \{ status: 403 \}\);/
  );
});

test("y la decide ANTES de leer nada del local pedido", () => {
  const regla = RUTA.indexOf("resolverLocalPedido({");
  assert.ok(regla > 0);
  for (const despues of ['searchParams.get("destino") || 0', "relacionesDelDeposito(", "vigenciasDeUbicaciones(", "prisma.transferencia.findMany("]) {
    const i = RUTA.indexOf(despues);
    assert.ok(i > regla, `${despues} se lee antes de la regla de alcance`);
  }
});

test("la regla, para quien no es depósito: el suyo o nada", () => {
  const local = (destinoPedido) => resolverLocalPedido({ esDeposito: false, localDeLaSesion: 5, destinoPedido });
  assert.deepEqual(local(null), { localId: 5 });
  assert.deepEqual(local("5"), { localId: 5 });
  assert.deepEqual(local("6"), { localId: null, error: ERROR_FUERA_DE_ALCANCE });
  assert.equal(local("-3").error !== undefined, true);
  assert.equal(local("abc").error !== undefined, true);
});

test("la prueba de base que lo reproduce corre en CI", () => {
  const ci = readFileSync(".github/workflows/verificacion.yml", "utf8");
  assert.match(ci, /\n\s*node --import \.\/scripts\/alias-loader\.mjs scripts\/pruebas-db\/transferenciasAlcance\.mjs\n/);
});
