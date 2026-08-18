// Candados de lib/precios/redondeo.js — la ÚNICA función de redondeo a 100.
//
// Convivían dos: `redondear100` (acá) y `redondearA100Arriba` (que vivía en
// precioDesdeMargen). Este archivo existe para que no vuelvan a ser dos, y para
// fijar el punto donde diferían: LOS CENTAVOS.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/precios/redondeo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  redondear100,
  precioUnitarioQueSeCobra,
  precioEnEscalaQueSeCobra,
} from "./redondeo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// LOS CENTAVOS — donde las dos funciones diferían, y donde había plata en juego
// ---------------------------------------------------------------------------

test("un precio exacto NO salta de múltiplo por ruido binario", () => {
  // Este es EL caso. La versión que usaba el POS devolvía 1500 acá: cien pesos
  // de más en el ticket, salidos de un residuo de coma flotante y de ninguna
  // regla de negocio.
  assert.equal(redondear100(1400.0000000001), 1400);
  assert.equal(redondear100(1400.0000000000002), 1400);
  assert.equal(redondear100(700 * 1.0), 700);
});

test("el residuo típico de un cálculo de margen no infla el precio", () => {
  // 1050 × 1,3 = 1365,0000000000002 en binario.
  assert.equal(redondear100(1050 * 1.3), 1400);
  assert.equal(redondear100(0.29 * 100 * 100), 2900);
});

test("un centavo de verdad SÍ sube al siguiente múltiplo", () => {
  // La normalización es a centavos, no un margen de tolerancia: un centavo real
  // es plata y tiene que empujar. Si esto se rompe, el redondeo estaría
  // perdonando importes.
  assert.equal(redondear100(1400.01), 1500);
  assert.equal(redondear100(1400.005), 1500); // redondea a 1400,01 y sube
  assert.equal(redondear100(1401), 1500);
});

test("es idempotente: redondear dos veces da lo mismo", () => {
  for (const v of [1365, 1400, 1400.0000001, 999.999, 2900]) {
    const una = redondear100(v);
    assert.equal(redondear100(una), una, `${v} no es idempotente`);
  }
});

// ---------------------------------------------------------------------------
// Siempre hacia arriba, nunca Math.round
// ---------------------------------------------------------------------------

test("siempre hacia arriba", () => {
  assert.equal(redondear100(1), 100);
  assert.equal(redondear100(0.5), 100);
  assert.equal(redondear100(101), 200);
  assert.equal(redondear100(199), 200);
  assert.equal(redondear100(999.999999999), 1000);
});

test("un múltiplo exacto se queda donde está", () => {
  for (const v of [100, 200, 1300, 1400, 1500, 2900]) {
    assert.equal(redondear100(v), v);
  }
});

test("NUNCA baja el precio", () => {
  // Math.round bajaría 1401 a 1400, por debajo de costo+margen, que es
  // justamente lo que el margen configurado promete.
  for (const v of [101, 149, 150, 151, 1401, 1449, 1450, 1451]) {
    assert.ok(redondear100(v) >= v, `redondear100(${v}) bajó el precio`);
  }
});

// ---------------------------------------------------------------------------
// Valores que no son un precio
// ---------------------------------------------------------------------------

test("cero, negativos e inválidos dan 0", () => {
  // Un precio negativo no es un precio. Los mapeos de stock y de búsqueda
  // esperan 0 y muestran "sin precio".
  for (const v of [0, -1, -50, null, undefined, "", "abc", NaN, Infinity, -Infinity]) {
    assert.equal(redondear100(v), 0, `redondear100(${JSON.stringify(v)}) tendría que dar 0`);
  }
});

test("acepta un string numérico", () => {
  assert.equal(redondear100("1365"), 1400);
  assert.equal(redondear100("1400.0000001"), 1400);
});

// ---------------------------------------------------------------------------
// Estructural: que no vuelva a haber dos
// ---------------------------------------------------------------------------

test("no existe una segunda función de redondeo a 100", () => {
  const src = leer("lib/precios/precioDesdeMargen.js");
  assert.doesNotMatch(
    src,
    /export function redondearA100Arriba|export function redondear100/,
    "volvió a haber una segunda función de redondeo a 100 en precioDesdeMargen. " +
      "La única vive en lib/precios/redondeo.js."
  );
});

test("nadie escribe el redondeo a 100 a mano", () => {
  // Enumera lib/ y app/ enteros: una tercera copia escrita en otro archivo es
  // el mismo problema con otra cara.
  const encontrados = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        recorrer(p);
      } else if (/\.(js|jsx|mjs)$/.test(e.name) && !e.name.endsWith(".test.mjs")) {
        const src = fs.readFileSync(p, "utf8");
        // El patrón del redondeo a 100: ceil o round dividiendo y multiplicando.
        if (/Math\.(ceil|round)\s*\([^)]*\/\s*100\s*\)\s*\*\s*100/.test(src)) {
          const rel = path.relative(ROOT, p).replace(/\\/g, "/");
          if (rel !== "lib/precios/redondeo.js") encontrados.push(rel);
        }
      }
    }
  };
  recorrer(path.join(ROOT, "lib"));
  recorrer(path.join(ROOT, "app"));

  assert.deepEqual(
    encontrados,
    [],
    `hay redondeo a 100 escrito a mano en: ${encontrados.join(", ")}. ` +
      `Usar redondear100 de lib/precios/redondeo.js.`
  );
});

test("los diez llamadores importan del mismo archivo", () => {
  const LLAMADORES = [
    "app/api/pos-ventas/buscar-producto/route.js",
    "app/api/productos/precios/preview/route.js",
    "app/api/reportes-stock/valorizado/route.js",
    "app/api/stock_locales/buscar-producto/route.js",
    "components/productos/FormProducto.jsx",
    "lib/combos/formComboLogic.js",
    "lib/combos/service.js",
    "lib/precios/calcularPrecioConLista.js",
    "lib/precios/precioDesdeMargen.js",
    "lib/precios/recargoFijoUnidad.js",
    "lib/stock/mapItem.js",
  ];
  for (const rel of LLAMADORES) {
    const src = leer(rel);
    // El import puede ser por alias (`@/lib/precios/redondeo`), relativo desde
    // otra carpeta (`../precios/redondeo.js`) o hermano (`./redondeo`). Lo que
    // importa es que apunte a ESE archivo y no a otro.
    assert.match(
      src,
      /import \{ redondear100 \} from "[@.][^"]*\/redondeo(\.js)?"/,
      `${rel} no importa redondear100 de lib/precios/redondeo`
    );
  }
});

// ── EL PRECIO QUE SE COBRA ────────────────────────────────────────────────
//
// El catálogo mostraba el precio guardado mientras el POS cobraba el redondeado.
// Medido contra producción: de 2.592 productos con el redondeo prendido, 1.130
// mostraban un número distinto del que se cobra.

test("el unitario de un pack sale de dividir por el factor, y después se redondea", () => {
  // El orden importa: redondear el bulto y después dividir da otro número.
  assert.equal(
    precioUnitarioQueSeCobra({ precio: 31900, factor: 24, unidad: "pack", redondeo100: true }),
    1400 // 31900/24 = 1329,17 → 1400
  );
  assert.equal(
    precioUnitarioQueSeCobra({ precio: 31900, factor: 24, unidad: "pack", redondeo100: false }),
    31900 / 24
  );
});

test("sin factor, o con factor 1, el unitario ES el precio guardado", () => {
  for (const f of [1, 0, null, undefined]) {
    assert.equal(precioUnitarioQueSeCobra({ precio: 2050, factor: f, unidad: "unidad" }), 2050);
  }
});

test("un pack sin la unidad de bulto NO se divide", () => {
  // El factor solo? No alcanza. Un producto con unidad "unidad" y factor 24
  // tiene el precio guardado POR UNIDAD: dividirlo inventaría un pack.
  assert.equal(precioUnitarioQueSeCobra({ precio: 4800, factor: 24, unidad: "unidad" }), 4800);
});

test("EL NÚMERO GRANDE DE UN PACK NO SE REDONDEA, y eso está decidido", () => {
  // El POS no cobra bultos: un "bulto redondeado" sería un número que no cobra
  // nadie. El unitario redondeado —el que sí se cobra— va en la línea de abajo.
  assert.equal(
    precioEnEscalaQueSeCobra({ precio: 31900, factor: 24, unidad: "pack", redondeo100: true }),
    31900
  );
});

test("para todo lo demás, el número grande ES el que se cobra", () => {
  // Suelto y kilo: la escala guardada ya es la unitaria, así que se redondea.
  assert.equal(
    precioEnEscalaQueSeCobra({ precio: 2050, factor: null, unidad: "unidad", redondeo100: true }),
    2100
  );
  assert.equal(
    precioEnEscalaQueSeCobra({ precio: 12340, factor: null, unidad: "kg", redondeo100: true }),
    12400
  );
  // Y sin la opción prendida no se toca nada.
  assert.equal(
    precioEnEscalaQueSeCobra({ precio: 2050, factor: null, unidad: "unidad", redondeo100: false }),
    2050
  );
});

test("sin precio devuelven null, no cero", () => {
  // Cero se lee como "vale cero" y es la misma regla que defiende `formatearMoneda`.
  for (const v of [null, undefined, ""]) {
    assert.equal(precioUnitarioQueSeCobra({ precio: v, factor: 6, unidad: "pack" }), null);
    assert.equal(precioEnEscalaQueSeCobra({ precio: v, factor: 6, unidad: "pack" }), null);
  }
});

test("LA PANTALLA LO USA: el catálogo no redondea por su cuenta", () => {
  // Sin esto, el helper puede estar perfecto y la pantalla seguir mostrando el
  // precio guardado. Es el hueco de "nadie comprueba que la página lo llame".
  const src = leer("app/modulos/productos/page.jsx")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(src, /precioEnEscalaQueSeCobra\(/, "el número grande tiene que salir del helper");
  assert.match(src, /redondeo100:\s*p\.redondeo100/, "y la equivalencia también");
  assert.doesNotMatch(
    src,
    /formatearMoneda\(\s*p\.precioVenta\s*\)/,
    "no puede volver a mostrarse el precio guardado crudo"
  );
});

test("LA FICHA NO: ahí se edita el valor guardado", () => {
  // En Editar el campo es EDITABLE. Si mostrara el redondeado, abrir un producto
  // y guardarlo sin tocar nada le cambiaría el precio. Comprobado además
  // abriendo la ficha: muestra 33800, que es lo que está en la base.
  const src = leer("components/productos/FormProducto.jsx");
  assert.doesNotMatch(src, /precioEnEscalaQueSeCobra|precioUnitarioQueSeCobra/);
});
