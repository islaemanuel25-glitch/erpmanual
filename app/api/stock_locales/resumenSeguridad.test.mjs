// CANDADOS DE SEGURIDAD Y ALCANCE DE `/api/stock_locales/resumen`.
//
// ── POR QUÉ UN ENDPOINT DE CONTEOS NECESITA ESTO ──────────────────────────
//
// Devuelve cuatro números y ningún producto, así que es fácil pensarlo como
// inofensivo. No lo es: esos números son del catálogo de UNA ubicación. Un
// resumen que aceptara cualquier `localId` le diría a un encargado cuántos
// productos bajo mínimo tiene el local de al lado.
//
// Y hay una segunda cosa que no es de seguridad pero se rompe igual de callada:
// si el resumen contara sobre un universo distinto al del listado, la card diría
// un número y la lista mostraría otro. Por eso el universo también se afirma acá.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const RESUMEN = leer("app/api/stock_locales/resumen/route.js");
const LISTAR = leer("app/api/stock_locales/listar/route.js");

test("SEG1. SIN SESIÓN NO CONTESTA", () => {
  assert.match(RESUMEN, /getUsuarioSession\(req\)/, "no lee la sesión");
  assert.match(RESUMEN, /if \(!session\)[\s\S]{0,220}status: 401/, "una petición sin sesión no termina en 401");
});

test("SEG2. EXIGE EL PERMISO DE STOCK, EL MISMO QUE EL LISTADO", () => {
  // Si pidiera uno distinto, alguien podría ver los conteos de una pantalla que
  // no puede abrir — o al revés, ver la lista y no sus cards.
  assert.match(RESUMEN, /checkPerm\(session, "stock\.ver"\)/, "el resumen no exige stock.ver");
  assert.match(LISTAR, /checkPerm\(session, "stock\.ver"\)/);
  assert.match(RESUMEN, /status: 403/, "un permiso faltante no termina en 403");
});

test("SEG3. NO SE PUEDE PEDIR EL RESUMEN DE UN LOCAL AJENO", () => {
  // ── EL CRITERIO, Y ES EL MISMO QUE YA USA EL LISTADO ────────────────────
  //
  // Quien tiene una ubicación en la sesión, mira ESA: el `localId` de la URL se
  // ignora. Solo un admin sin local fijo puede elegir, que es exactamente lo que
  // el listado ya permitía — un admin con `*` ve todas las ubicaciones.
  //
  // Se afirma la ESTRUCTURA de la decisión, no que exista la palabra: un
  // `localId = Number(searchParams…)` fuera del `if` de admin abriría el
  // endpoint a cualquiera y sería una línea sola.
  // El bloque va del `if` hasta el cierre del `else`, no hasta el del `if`: la
  // primera versión de este candado cortaba antes y daba rojo sobre un código
  // correcto. Un patrón que matchea de menos miente igual que uno que matchea de
  // más — los dos terminan en un rojo sobre algo que está bien.
  const bloque = RESUMEN.match(
    /if \(esAdmin && !sessionLocalId\) \{[\s\S]*?\n    \} else \{[\s\S]*?\n    \}/
  );
  assert.ok(bloque, "no se encontró la resolución de ubicación");

  const decision = bloque[0];
  assert.match(decision, /localId = Number\(searchParams\.get\("localId"\)/, "el admin no puede elegir ubicación");
  assert.match(decision, /\} else \{[\s\S]*localId = Number\(sessionLocalId/, "el no-admin no queda atado a su sesión");

  // Y FUERA de ese bloque no puede haber otra lectura del parámetro: sería la
  // puerta de atrás.
  const fuera = RESUMEN.replace(decision, "");
  assert.doesNotMatch(
    fuera,
    /searchParams\.get\("localId"\)/,
    "el localId de la URL se lee fuera del guardia de admin: cualquiera podría pedir otro local"
  );
});

test("SEG4. EL localId ENTRA COMO PARÁMETRO LIGADO, no interpolado", () => {
  // Lo único que viene de afuera es el `localId`. Interpolarlo en el SQL sería
  // inyección; las condiciones de estado sí se interpolan, pero son constantes
  // del módulo y no las escribe nadie desde la URL.
  assert.match(RESUMEN, /\$queryRawUnsafe\(sql, localId\)/, "el localId no viaja como parámetro ligado");
  assert.match(RESUMEN, /pl\."localId" = \$1/, "la consulta no usa un placeholder para la ubicación");
  assert.doesNotMatch(RESUMEN, /localId = \$\{/, "el localId se interpola en el SQL");
});

test("SEG5. EL UNIVERSO ES EXACTAMENTE EL DEL LISTADO", () => {
  // ── LO QUE SE ROMPE SI NO ────────────────────────────────────────────────
  //
  // Contar sobre `StockLocal` a secas se separaba del listado por los DOS lados:
  // de menos, porque un producto sin fila de stock no aparecía; y de más, porque
  // incluía filas de productos inactivos y de combos, que el listado no muestra.
  // Ninguna de las dos cosas falla: solo hacen que la card y la lista discrepen.
  assert.match(RESUMEN, /FROM "ProductoLocal" pl/, "el resumen no cuenta sobre ProductoLocal");
  assert.match(RESUMEN, /LEFT JOIN "StockLocal"/, "no es LEFT JOIN: los productos sin fila de stock se pierden");
  assert.match(RESUMEN, /pl\."activo" = true/, "el resumen cuenta productos inactivos");
  assert.match(RESUMEN, /pb\."activo" = true/, "el resumen cuenta productos de bases inactivas");
  assert.match(RESUMEN, /pb\."es_combo" = false/, "el resumen cuenta combos, que no tienen stock físico");

  // El listado excluye lo mismo, por su lado de Prisma.
  assert.match(LISTAR, /activo: true/);
  assert.match(LISTAR, /es_combo: false/);
});

test("SEG6. EL JOIN NO CRUZA UBICACIONES", () => {
  // `StockLocal` tiene su propio `localId`. Sin esa condición en el join, una
  // fila de stock de otra ubicación podría aparearse con el mismo
  // `ProductoLocal` y contaminar los conteos.
  assert.match(
    RESUMEN,
    /ON sl\."productoId" = pl\."id" AND sl\."localId" = pl\."localId"/,
    "el join no ata la ubicación: puede mezclar el stock de otro local"
  );
});

test("SEG7. UN ERROR NO SE DEVUELVE MUDO", () => {
  // La deuda del proyecto es al revés —206 rutas contestan "Error interno"—, así
  // que una ruta nueva no puede sumar otra.
  assert.doesNotMatch(RESUMEN, /"Error interno"/, "el resumen contesta un error mudo");
  assert.match(RESUMEN, /No se pudieron contar los estados de stock/, "el error no dice qué pasó");
  assert.match(RESUMEN, /err\.message/, "el motivo real se pierde");
});
