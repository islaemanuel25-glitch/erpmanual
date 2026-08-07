// Pruebas ESTRUCTURALES: candados sobre el código, no sobre valores.
//
// El defecto no era una fórmula mal escrita sino una escritura de más: el margen
// EFECTIVO se guardaba encima del CONFIGURADO. Una prueba de valores no lo
// detecta si mañana alguien vuelve a agregar esa asignación en otro lugar. Estas
// leen el fuente y fallan si el patrón reaparece.
//
// Se leen los archivos SIN comentarios: los comentarios de este repo describen
// justamente lo que ya no se hace, y matchearían falsos positivos.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

function leerSinComentarios(rel) {
  const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function archivosDe(dir, ext = [".js", ".jsx"]) {
  const salida = [];
  const caminar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        caminar(p);
      } else if (ext.includes(path.extname(e.name))) {
        salida.push(p);
      }
    }
  };
  caminar(path.join(RAIZ, dir));
  return salida;
}

// Cuerpo de una función `const nombre = (…) => { … }` hasta su cierre, contando
// llaves. Suficiente para este archivo y evita depender de un parser.
function cuerpoDeFuncion(src, nombre) {
  const inicio = src.indexOf(`const ${nombre} =`);
  assert.notEqual(inicio, -1, `no se encontró ${nombre}`);
  const abre = src.indexOf("{", inicio);
  let nivel = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === "{") nivel++;
    else if (src[i] === "}") {
      nivel--;
      if (nivel === 0) return src.slice(inicio, i + 1);
    }
  }
  throw new Error(`no se cerró ${nombre}`);
}

const FORM = "components/productos/FormProducto.jsx";

// ── 1. aplicarRedondeoVenta no toca el margen ────────────────────────────────

test("1. aplicarRedondeoVenta no escribe `margen`", () => {
  const cuerpo = cuerpoDeFuncion(leerSinComentarios(FORM), "aplicarRedondeoVenta");
  assert.ok(!/\bmargen\b/.test(cuerpo), "aplicarRedondeoVenta vuelve a mencionar margen");
});

test("1b. aplicarRedondeoVenta sí redondea precio_venta", () => {
  const cuerpo = cuerpoDeFuncion(leerSinComentarios(FORM), "aplicarRedondeoVenta");
  assert.ok(/precio_venta/.test(cuerpo));
  assert.ok(/redondearA100Arriba/.test(cuerpo));
});

// ── 2. Solo onChangeVenta deriva margen desde un precio escrito ──────────────

test("2. dentro del form, solo onChangeVenta deriva margen desde el precio", () => {
  const src = leerSinComentarios(FORM);
  // Toda asignación de margen que se apoye en precio_venta / pv.
  const sospechosas = [];
  for (const m of src.matchAll(/margen:\s*([^,}\n]+)/g)) {
    if (/precio_venta|\bpv\b|pvR/.test(m[1])) sospechosas.push(m[0]);
  }
  // La única derivación legítima vive en onChangeVenta y usa la variable `m`
  // calculada ahí; no debe existir ninguna otra expresión que arme el margen a
  // partir del precio en el mismo objeto.
  assert.deepEqual(sospechosas, [], `derivaciones de margen fuera de lugar: ${sospechosas.join(" | ")}`);

  const cuerpo = cuerpoDeFuncion(src, "onChangeVenta");
  assert.ok(/pv \/ pc - 1/.test(cuerpo), "onChangeVenta debe seguir derivando el margen");
});

test("2b. ninguna otra función del form deriva margen del costo/venta", () => {
  const src = leerSinComentarios(FORM);
  const derivaciones = [...src.matchAll(/\/\s*pc\s*-\s*1|\/\s*precio_costo\s*-\s*1/g)];
  assert.equal(
    derivaciones.length,
    1,
    `se esperaba 1 derivación (onChangeVenta), hay ${derivaciones.length}`
  );
});

// ── 3. Nadie redondea a 100 con Math.round ───────────────────────────────────

test("3. ningún consumidor usa Math.round para redondear a 100", () => {
  const ofensores = [];
  for (const dir of ["app", "lib", "components"]) {
    for (const archivo of archivosDe(dir)) {
      if (archivo.includes(".test.")) continue;
      const src = fs
        .readFileSync(archivo, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      // Math.round(x / 100) * 100  → redondeo a 100 que puede bajar el precio.
      // No confundir con Math.round(x * 100) / 100, que es redondeo a centavos.
      if (/Math\.round\s*\([^)]*\/\s*100\s*\)\s*\*\s*100/.test(src)) {
        ofensores.push(path.relative(RAIZ, archivo));
      }
    }
  }
  assert.deepEqual(ofensores, [], `redondeo a 100 con Math.round en: ${ofensores.join(", ")}`);
});

// ── 4. Ninguna API deriva y persiste margen desde precio_venta/precio_costo ──

test("4. ninguna ruta de API arma `margen` a partir de los precios", () => {
  const ofensores = [];
  for (const archivo of archivosDe("app/api")) {
    const src = fs
      .readFileSync(archivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const m of src.matchAll(/margen\s*[:=]\s*([^,;}\n]+)/g)) {
      if (/precio_venta|precio_costo|precioVenta|precioCosto/.test(m[1])) {
        ofensores.push(`${path.relative(RAIZ, archivo)} → ${m[0].trim()}`);
      }
    }
  }
  assert.deepEqual(ofensores, [], `APIs derivando margen: ${ofensores.join(" | ")}`);
});

// ── 5. Los consumidores usan el helper común ────────────────────────────────

test("5. los consumidores importan lib/precios/precioDesdeMargen", () => {
  // El editor de productos ya no calcula precios por su cuenta: delega la
  // propagación por costo en lib/precios/propagarCostoALocales, que es quien
  // importa el helper. Ese módulo entra a la lista en su lugar.
  const consumidores = [
    "components/productos/FormProducto.jsx",
    "lib/compras-proveedor/costoMaestro.js",
    "lib/precios/propagarCostoALocales.js",
    "app/api/productos/precios/preview/route.js",
  ];
  for (const rel of consumidores) {
    const src = leerSinComentarios(rel);
    // El módulo de propagación es hermano del helper, así que lo importa como
    // "./precioDesdeMargen.js"; el resto lo hace por ruta con carpeta.
    assert.ok(
      /precios\/precioDesdeMargen|\.\/precioDesdeMargen/.test(src),
      `${rel} no importa el helper común`
    );
  }
});

test("5b. ya no quedan fórmulas costo×(1+margen/100) sueltas en los consumidores", () => {
  const consumidores = [
    "lib/compras-proveedor/costoMaestro.js",
    "app/api/productos/editar/[id]/route.js",
    "app/api/productos/precios/preview/route.js",
  ];
  for (const rel of consumidores) {
    const src = leerSinComentarios(rel);
    assert.ok(
      !/\(\s*1\s*\+\s*\w*[Mm]argen\w*\s*\/\s*100\s*\)/.test(src),
      `${rel} todavía repite la fórmula a mano`
    );
  }
});

// ── 6. la propagación por costo no cae a margen 0 ───────────────────────────
//
// La propagación depósito→locales vivía duplicada: una copia en el editor de
// productos y otra en el flujo de compras. Esa duplicación es lo que permitió que
// los dos caminos divergieran —por edición se propagaba a todos los locales y por
// compra solo al que compraba— y dejó locales vendiendo bajo costo. Ahora hay un
// único módulo y los candados apuntan ahí.

test("6. propagarCostoALocales no usa el fallback `margen ?? 0`", () => {
  const cuerpo = leerSinComentarios("lib/precios/propagarCostoALocales.js");

  assert.ok(!/margen\s*\?\?\s*0/.test(cuerpo), "sigue el fallback a margen 0");
  assert.ok(!/:\s*0\s*\)/.test(cuerpo.match(/const margenConfigurado[\s\S]{0,240}/)?.[0] || ""),
    "sigue habiendo un 0 como margen por defecto");
  assert.ok(/hayReglaAutomatica/.test(cuerpo), "debe usar la compuerta común");
  assert.ok(!/Math\.round/.test(cuerpo), "no debe redondear con Math.round");
});

test("6b. sin regla automática, propagarCostoALocales no escribe precio_venta", () => {
  const cuerpo = leerSinComentarios("lib/precios/propagarCostoALocales.js");
  const asignaciones = [...cuerpo.matchAll(/data\.precio_venta\s*=/g)];
  assert.equal(asignaciones.length, 1, "debe haber una sola asignación de precio_venta");
  const idxGuard = cuerpo.indexOf("hayReglaAutomatica");
  assert.ok(idxGuard !== -1 && idxGuard < cuerpo.indexOf("data.precio_venta ="),
    "la asignación debe quedar detrás de la compuerta");
});

test("6c. el editor delega la propagación en el módulo común", () => {
  const src = leerSinComentarios("app/api/productos/editar/[id]/route.js");
  assert.ok(/propagarCostoALocales/.test(src), "el editor debe delegar, no recalcular");
  assert.ok(!/data\.precio_venta\s*=/.test(src.slice(src.indexOf("async function syncFromBaseToLocales"), src.indexOf("export async function PUT"))),
    "el editor no debe volver a calcular precios por su cuenta");
});

test("6d. el flujo de compras propaga a TODAS las ubicaciones, no solo a la que compra", () => {
  const src = leerSinComentarios("lib/compras-proveedor/costoMaestro.js");
  assert.ok(/propagarCostoALocales/.test(src),
    "actualizarCostoRealProducto debe propagar el costo a todas las ubicaciones");
});
