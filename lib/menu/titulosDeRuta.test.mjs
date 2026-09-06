// CANDADO: QUÉ TÍTULO LE TOCA A CADA RUTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/titulosDeRuta.test.mjs
//
// ── EL DEFECTO QUE ESTO FIJA ───────────────────────────────────────────────
//
// `usePageTitle` cae en `useMenu().currentTitle` cuando no hay override, y ese
// título sale del item del menú que matchea por prefijo más largo. Para una
// pantalla interna eso devuelve el nombre del MÓDULO: parado en Cobros, el
// título decía "Configuración POS".
//
// ── POR QUÉ SE EJERCE LA FUNCIÓN Y NO SE LEE EL MAPA ───────────────────────
//
// Porque lo que hay que proteger no es qué claves tiene el objeto, sino qué
// contesta la resolución. `findOverride` matchea la clave exacta o el prefijo
// seguido de "/", y esa regla es la que decide si una entrada alcanza a las
// rutas hijas y si NO alcanza a las hermanas. Leer el mapa no prueba nada de
// eso; ejercerlo con rutas reales, sí.
//
// La función vive adentro de `usePageTitle.js`, que es un hook y no se puede
// importar en Node sin React. Así que acá va la MISMA regla, copiada, y abajo
// hay un candado que compara las dos implementaciones carácter por carácter:
// si alguien cambia la del hook y no ésta, se pone rojo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TITULOS_POR_RUTA,
  LEGACY_HEADER_TITLES,
  LEGACY_LAYOUTBASE_TITLES,
} from "@/lib/menu/legacyTitles.js";

/** Copia de `findOverride` de `hooks/usePageTitle.js`. Ver el candado de abajo. */
function findOverride(overrides, pathname) {
  if (!overrides || typeof overrides !== "object" || !pathname) return undefined;
  if (Object.prototype.hasOwnProperty.call(overrides, pathname)) return overrides[pathname];

  let best;
  let bestLen = -1;
  for (const key of Object.keys(overrides)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (pathname === key || pathname.startsWith(key + "/")) {
      if (key.length > bestLen) {
        best = overrides[key];
        bestLen = key.length;
      }
    }
  }
  return best;
}

const PORTADA = "/modulos/configuracion/pos-ventas";
const COBROS = `${PORTADA}/cobros`;

// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO RUTAS DE LA PANTALLA
// ══════════════════════════════════════════════════════════════════════════

test("Cobros resuelve su propio título, no el del módulo", () => {
  assert.equal(findOverride(LEGACY_LAYOUTBASE_TITLES, COBROS), "Cobros");
});

test("y lo resuelve IGUAL en escritorio, que lee otro mapa", () => {
  // El título se dibuja en dos lugares: el bloque mobile de LayoutBase y el
  // <h1> del Header. Cada uno tiene su propio mapa de overrides. Si la entrada
  // estuviera en uno solo, el teléfono y la computadora dirían cosas distintas
  // de la misma pantalla.
  assert.equal(findOverride(LEGACY_HEADER_TITLES, COBROS), "Cobros");
});

test("las pantallas de agregar y editar heredan 'Cobros'", () => {
  // Es lo que corresponde: las dos escriben su propio encabezado —"Agregar
  // medio de cobro" y el nombre del medio— y lo que el shell tiene que decir
  // arriba es de qué sección son.
  for (const mapa of [LEGACY_LAYOUTBASE_TITLES, LEGACY_HEADER_TITLES]) {
    assert.equal(findOverride(mapa, `${COBROS}/nuevo`), "Cobros");
    assert.equal(findOverride(mapa, `${COBROS}/12`), "Cobros");
    assert.equal(findOverride(mapa, `${COBROS}/defecto%3ADEBITO`), "Cobros");
  }
});

test("la PORTADA no queda alcanzada: sigue resolviendo por el menú", () => {
  // Sin override, `usePageTitle` cae en currentTitle y ahí el item del menú le
  // da "Configuración POS", que es lo correcto para esa pantalla.
  for (const mapa of [LEGACY_LAYOUTBASE_TITLES, LEGACY_HEADER_TITLES]) {
    assert.equal(findOverride(mapa, PORTADA), undefined);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// EL PREFIJO NO SE DERRAMA
// ══════════════════════════════════════════════════════════════════════════

test("las hermanas de Cobros NO se ven afectadas", () => {
  for (const ruta of [`${PORTADA}/reglas`, `${PORTADA}/integraciones`]) {
    assert.equal(findOverride(LEGACY_LAYOUTBASE_TITLES, ruta), undefined, ruta);
    assert.equal(findOverride(LEGACY_HEADER_TITLES, ruta), undefined, ruta);
  }
});

test("una ruta que solo COMPARTE el comienzo del texto no matchea", () => {
  // La regla exige la clave exacta o el prefijo seguido de "/". Sin eso,
  // "/…/cobros-viejos" caería adentro por ser una subcadena.
  assert.equal(findOverride(LEGACY_LAYOUTBASE_TITLES, `${COBROS}-viejos`), undefined);
  assert.equal(findOverride(LEGACY_LAYOUTBASE_TITLES, `${COBROS}x`), undefined);
});

test("los overrides legacy que ya existían siguen contestando lo mismo", () => {
  // La entrada nueva se agregó por spread a los dos mapas; esto comprueba que
  // no pisó nada de lo que ya había.
  assert.equal(findOverride(LEGACY_HEADER_TITLES, "/modulos/pos-ventas"), "POS");
  assert.equal(
    findOverride(LEGACY_HEADER_TITLES, "/modulos/auditoria-pos-ventas"),
    "Auditoría POS Ventas"
  );
  assert.equal(findOverride(LEGACY_HEADER_TITLES, "/modulos/dashboard"), "Panel");
  assert.equal(findOverride(LEGACY_LAYOUTBASE_TITLES, "/modulos/dashboard"), "Panel");
});

test("`/modulos/pos-ventas` NO se confunde con la portada de configuración", () => {
  // Son dos rutas distintas que comparten el final del texto. El override de
  // POS no puede alcanzar a la de configuración ni al revés.
  assert.equal(findOverride(LEGACY_HEADER_TITLES, PORTADA), undefined);
  assert.equal(findOverride(LEGACY_HEADER_TITLES, "/modulos/pos-ventas/algo"), "POS");
});

// ══════════════════════════════════════════════════════════════════════════
// LA COPIA NO SE PUEDE SEPARAR DEL ORIGINAL
// ══════════════════════════════════════════════════════════════════════════

test("la regla de match de acá es la MISMA que la de usePageTitle", () => {
  // Sin esto, el día que alguien cambie `findOverride` en el hook, este candado
  // seguiría en verde probando una regla que ya no corre en ningún lado.
  const hook = readFileSync("hooks/usePageTitle.js", "utf8");
  assert.match(
    hook,
    /pathname === key \|\| pathname\.startsWith\(key \+ "\/"\)/,
    "cambió la regla de prefijo del hook: hay que actualizar la copia de este candado"
  );
  assert.match(
    hook,
    /if \(Object\.prototype\.hasOwnProperty\.call\(overrides, pathname\)\)/,
    "cambió el match exacto del hook"
  );
});

test("el mapa compartido tiene la entrada, y solo la que hace falta", () => {
  assert.deepEqual(Object.keys(TITULOS_POR_RUTA), [COBROS]);
});
