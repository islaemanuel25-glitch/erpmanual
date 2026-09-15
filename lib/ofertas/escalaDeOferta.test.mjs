// EL PRECIO DE UNA OFERTA ESTÁ EN LA MISMA ESCALA QUE EL QUE COBRA EL POS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/escalaDeOferta.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SU NÚMERO ─────────────────────────────
//
// `precio_venta` está guardado en escala de BULTO cuando el producto es pack o
// cajón con factor mayor a 1. El POS lo divide antes de cobrar; el módulo de
// ofertas NO lo dividía.
//
// Medido sobre producción el 2026-09-15: **"9 DE ORO AGRIDULCE", pack x20, vale
// $25.000 en la base y $1.250 por unidad.** Son 1330 de 2115 productos activos
// en mini el 7 — el 63 % del catálogo.
//
// Y no era un rótulo mal puesto. El motor compara `precioOferta` contra el
// `precioNormal` de la línea, que es el unitario. La única oferta que llegó a
// producción tenía $22.500 contra un normal de $1.250, así que el motor la
// habría descartado: una oferta que no oferta, sin ningún aviso.
//
// ── POR QUÉ HAY UN CANDADO DE EQUIVALENCIA Y NO SOLO UNO DE NÚMERO ───────
//
// El de número prueba que hoy da bien. El de equivalencia prueba que ofertas y
// POS no se pueden volver a separar, que es el problema de fondo: las dos
// escalas se separaron porque eran dos reglas escritas en dos lugares.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ESCALA_BULTO,
  ESCALA_UNIDAD,
  escalaDeVentaDe,
  valorEnLaEscalaDeVenta,
} from "@/lib/precios/escalaDeVenta";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** El producto de la oferta real de producción, tal cual está en la base. */
const NUEVE_DE_ORO = {
  unidad_medida: "pack",
  factor_pack: 20,
  modo_envio: "SOLO_UNIDAD",
  redondeo_100: false,
  precio_venta: 25000,
  precio_costo: 19200,
};

const comoOfertas = (base, esDeposito) => {
  const producto = {
    unidad_medida: base.unidad_medida,
    modoEnvio: base.modo_envio ?? null,
    modoCompraProveedor: base.modoCompraProveedor,
    pesoReferenciaKg: base.pesoReferenciaKg,
    pesoEsFijo: base.pesoEsFijo,
    modoVentaDeposito: base.modoVentaDeposito,
    modalidad: base.modalidad,
  };
  const escala = escalaDeVentaDe(producto, esDeposito);
  return {
    escala,
    precio: Number(
      valorEnLaEscalaDeVenta({
        escala,
        valor: base.precio_venta,
        factor: base.factor_pack,
        unidad: base.unidad_medida,
        redondeo100: base.redondeo_100 === true,
        pesoReferenciaKg: base.pesoReferenciaKg,
      })
    ),
    costo: Number(
      valorEnLaEscalaDeVenta({
        escala,
        valor: base.precio_costo,
        factor: base.factor_pack,
        unidad: base.unidad_medida,
        redondeo100: false,
        pesoReferenciaKg: base.pesoReferenciaKg,
      })
    ),
  };
};

// ── 1 · EL NÚMERO ─────────────────────────────────────────────────────────

test("E1 · un pack x20 a $25.000 en la base sale $1.250 por la puerta de ofertas", () => {
  // Es el caso exacto de la oferta que estaba en producción, con los números
  // reales. Si alguien vuelve a sacar la conversión, este candado dice 25000.
  const r = comoOfertas(NUEVE_DE_ORO, false);
  assert.equal(r.escala, ESCALA_UNIDAD);
  assert.equal(r.precio, 1250);
  assert.equal(r.costo, 960);
});

test("E2 · en un LOCAL siempre es por unidad, sin mirar el modo de envío", () => {
  // `modoSalidaDeVenta` devuelve UNIDAD para cualquier no-depósito. Es lo que
  // hace que los cuatro locales cobren por unidad.
  for (const modo of ["SOLO_UNIDAD", "SOLO_BULTO", "MIXTO", null]) {
    const r = comoOfertas({ ...NUEVE_DE_ORO, modo_envio: modo }, false);
    assert.equal(r.escala, ESCALA_UNIDAD, `modo ${modo} cambió la escala en un local`);
    assert.equal(r.precio, 1250);
  }
});

test("E3 · en el DEPÓSITO un SOLO_BULTO sale por bulto, y eso NO es un error", () => {
  // Medido en producción: 1040 de 1330 productos de pack del depósito son
  // SOLO_BULTO. Forzar unidad ahí cobraría el precio de UNA unidad por un bulto
  // entero — el mismo defecto dado vuelta y en contra del comercio.
  const r = comoOfertas({ ...NUEVE_DE_ORO, modo_envio: "SOLO_BULTO" }, true);
  assert.equal(r.escala, ESCALA_BULTO);
  assert.equal(r.precio, 25000);
  assert.equal(r.costo, 19200);

  // Y el mismo producto en un local sigue saliendo por unidad.
  const enLocal = comoOfertas({ ...NUEVE_DE_ORO, modo_envio: "SOLO_BULTO" }, false);
  assert.equal(enLocal.precio, 1250);
});

test("E4 · unidad suelta y kg NO se dividen", () => {
  // Dividir un producto que no está guardado por bulto es el error simétrico.
  const suelto = comoOfertas(
    { unidad_medida: "unidad", factor_pack: 1, precio_venta: 800, precio_costo: 500 },
    false
  );
  assert.equal(suelto.precio, 800);

  // Un pack con factor 1 tampoco: no hay bulto que deshacer.
  const factorUno = comoOfertas({ ...NUEVE_DE_ORO, factor_pack: 1 }, false);
  assert.equal(factorUno.precio, 25000);
});

test("E5 · el redondeo va en el PRECIO y no en el costo", () => {
  // El precio se cobra, el costo se paga. Es el mismo criterio que ya aplica la
  // tarjeta del catálogo, y por eso el llamador pasa `redondeo100: false` para
  // el costo en vez de decidirlo adentro.
  const r = comoOfertas({ ...NUEVE_DE_ORO, redondeo_100: true }, false);
  assert.equal(r.precio, 1300, "1250 redondeado a 100 hacia arriba");
  assert.equal(r.costo, 960, "el costo NO se redondea");
});

// ── 2 · LA EQUIVALENCIA, QUE ES LA QUE IMPIDE QUE SE VUELVAN A SEPARAR ────

/**
 * La fórmula del POS, escrita acá a mano desde
 * `app/api/pos-ventas/buscar-producto/route.js` —`esBultoConPack` y el redondeo
 * de `precioVentaUnitario`—.
 *
 * Se escribe aparte A PROPÓSITO: si importara la misma función que usa ofertas,
 * el candado compararía una cosa consigo misma y daría verde siempre. Escrita
 * independiente, una divergencia entre las dos reglas sale en rojo.
 */
function comoElPos(base) {
  const precioDB = Number(base.precio_venta);
  const costoDB = Number(base.precio_costo);
  const factor = Number(base.factor_pack);
  const esBultoConPack =
    factor > 1 && precioDB > 0 && ["pack", "cajon"].includes(base.unidad_medida);

  let unitario = esBultoConPack ? precioDB / factor : precioDB;
  const costoUnitario = esBultoConPack ? costoDB / factor : costoDB;
  if (base.redondeo_100 === true) unitario = Math.ceil(unitario / 100) * 100;
  return { precio: Number(unitario.toFixed(2)), costo: Number(costoUnitario.toFixed(2)) };
}

test("E6 · OFERTAS Y POS DEVUELVEN EL MISMO UNITARIO, sobre una tabla de casos", () => {
  const CASOS = [
    { nombre: "9 de oro pack x20", unidad_medida: "pack", factor_pack: 20, precio_venta: 25000, precio_costo: 19200, redondeo_100: false },
    { nombre: "con redondeo", unidad_medida: "pack", factor_pack: 20, precio_venta: 25000, precio_costo: 19200, redondeo_100: true },
    { nombre: "cajón x12", unidad_medida: "cajon", factor_pack: 12, precio_venta: 26000, precio_costo: 20000, redondeo_100: false },
    { nombre: "pack x56 con decimales", unidad_medida: "pack", factor_pack: 56, precio_venta: 33500, precio_costo: 23862.23, redondeo_100: false },
    { nombre: "unidad suelta", unidad_medida: "unidad", factor_pack: 1, precio_venta: 800, precio_costo: 500, redondeo_100: false },
    { nombre: "pack factor 1", unidad_medida: "pack", factor_pack: 1, precio_venta: 900, precio_costo: 600, redondeo_100: false },
  ];

  for (const c of CASOS) {
    // En un LOCAL, que es donde el POS vende por unidad.
    const ofertas = comoOfertas({ ...c, modo_envio: "SOLO_UNIDAD" }, false);
    const pos = comoElPos(c);
    assert.equal(
      Number(ofertas.precio.toFixed(2)),
      pos.precio,
      `${c.nombre}: ofertas dio ${ofertas.precio} y el POS ${pos.precio}`
    );
    assert.equal(
      Number(ofertas.costo.toFixed(2)),
      pos.costo,
      `${c.nombre}: el costo difiere — ofertas ${ofertas.costo}, POS ${pos.costo}`
    );
  }
});

test("E7 · CONTRAPRUEBA · la comparación de E6 sabe ver una diferencia", () => {
  // Sin esto, E6 podría estar en verde porque las dos ramas devuelven lo mismo
  // por casualidad o porque la comparación no compara nada.
  const c = { unidad_medida: "pack", factor_pack: 20, precio_venta: 25000, precio_costo: 19200, redondeo_100: false };
  const sinDividir = { precio: 25000, costo: 19200 };
  assert.notEqual(comoOfertas({ ...c, modo_envio: "SOLO_UNIDAD" }, false).precio, sinDividir.precio);
  assert.notEqual(comoElPos(c).precio, sinDividir.precio);
});

// ── 3 · OFERTAS NO ESCRIBE SU PROPIA REGLA DE ESCALA ──────────────────────

test("E8 · `servidor.js` usa la puerta compartida y no divide por su cuenta", () => {
  // Dos copias de una regla de escala es cómo empezó este problema. El candado
  // afirma que ofertas llama a la puerta y que NO tiene una división propia.
  const src = fs
    .readFileSync(path.join(RAIZ, "lib/ofertas/servidor.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.match(src, /valorEnLaEscalaDeVenta\(/, "ofertas dejó de usar la puerta de escala");
  assert.match(src, /escalaDeVentaDe\(/, "ofertas dejó de preguntar en qué escala se vende");
  assert.ok(
    !/factor_pack\s*\)?\s*\|\|\s*1[\s\S]{0,80}\/\s*factor/.test(src),
    "apareció una división por factor propia en ofertas: esa regla vive en un solo lugar"
  );
  // Y no vuelve a devolver el valor crudo como precio normal.
  assert.ok(
    !/precioNormal:\s*Number\(precioDeLaUbicacion/.test(src),
    "volvió el precio crudo como precio normal, sin pasar por la escala"
  );
});
