// LA HOJA Y EL CIERRE USAN LA MISMA VERIFICACIÓN, Y EL PAPEL DICE SU CONTENIDO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/contenidoDelBulto.test.mjs
//
// ── EL CASO, MEDIDO EN PRODUCCIÓN EL 2026-09-22 ──────────────────────────
//
// Arcor #245, "MOGUL x 500Gs MORAS (83u)", bolsa de 83. La hoja mostraba bien
// "Bultos de 83: 12 · Entra al stock 996 unidades" y arriba un cartel naranja
// que decía "$5.759,12 por unidad daría $5.736.083,52 y el papel cobra
// $69.109,44". Era falso: 12 bolsas × $5.759,12 dan exactamente $69.109,44.
//
// La hoja valuaba lo que entra al stock al precio del BULTO. El arreglo del
// cierre —66cc426e, mirar la igualdad en las dos escalas posibles— ya existía;
// lo que faltaba era que la hoja le pasara el `factorPack`. Medido: los QUINCE
// renglones vinculados del 245 tenían el aviso falso.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  contenidoDelBulto,
  contenidoQueDiceElPapel,
  textoDelContenido,
} from "@/lib/compras-proveedor/contenidoDelBulto";
import { laCantidadCuadraConElPrecio } from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("LAS MORAS NO SE ACUSAN MÁS, Y EL NÚMERO ES EL DEL PAPEL", () => {
  // 12 bolsas de 83 entran como 996 unidades, y el papel cobra $5.759,12 LA
  // BOLSA por $69.109,44 en total.
  const moras = { subtotal: 69109.44, cantidad: 12, fisicas: 996, factorPack: 83 };
  const r = laCantidadCuadraConElPrecio(moras);
  assert.equal(r.aplica, true);
  assert.equal(r.cuadra, true, "sigue acusando un renglón perfecto");
  assert.equal(r.esperado, 996);

  // CONTRAPRUEBA: sin el factor —como llamaba la hoja— se acusa, y con el
  // número exacto que mostraba el cartel.
  const { factorPack, ...sinFactor } = moras;
  const viejo = laCantidadCuadraConElPrecio(sinFactor);
  assert.equal(viejo.cuadra, false);
  assert.equal(Math.round(viejo.valuado * 100) / 100, 5736083.52);
  assert.equal(viejo.esperado, 12);
});

test("Y LA HOJA LE PASA EL FACTOR, QUE ES LO QUE FALTABA", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  const i = hoja.indexOf("laCantidadCuadraConElPrecio({");
  assert.ok(i > 0);
  assert.match(hoja.slice(i, i + 400), /factorPack: fila\?\.factorPack/);
  // Y es LA MISMA función que usa el cierre: una sola respuesta a si la escala
  // cuadra, no dos parecidas.
  const cierre = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(cierre, /laCantidadCuadraConElPrecio\({/);
  assert.match(cierre, /factorPack,/);
});

test("EL CONTENIDO QUE DICE EL PAPEL, CON LOS TEXTOS REALES DEL 245", () => {
  // Las dos formas que se reconocen, y las dos están en este papel.
  assert.equal(contenidoQueDiceElPapel("MOGUL x 500Gs MORAS (83u)"), 83);
  assert.equal(contenidoQueDiceElPapel("B. TOFFEES x822g CAFE (137u)"), 137);
  assert.equal(contenidoQueDiceElPapel("MOGUL x1 Kg JELLY BUTTONS (210u)"), 210);
  assert.equal(contenidoQueDiceElPapel("CRISTAL FRESH 90u x405g"), 90);
  assert.equal(contenidoQueDiceElPapel("MOGUL. OSITOS 12X30G"), 12);
  assert.equal(contenidoQueDiceElPapel("HW MOGUL COLMILLOS 12x30g"), 12);
});

test("Y EL PESO SOLO NO SE CONFUNDE CON UNA CANTIDAD", () => {
  // Tomar cualquier número daría un aviso falso en casi todos los renglones,
  // que es peor que no avisar. Estos tres traen peso y NADA de cantidad.
  assert.equal(contenidoQueDiceElPapel("CARAM ARCOR CHERRY x800g"), null);
  assert.equal(contenidoQueDiceElPapel("MOGUL x 500grs LADRILLOS ACIDOs"), null);
  assert.equal(contenidoQueDiceElPapel("MOGUL x 500GS JELLY BEANS"), null);
  assert.equal(contenidoQueDiceElPapel(""), null);
  assert.equal(contenidoQueDiceElPapel(null), null);
});

test("SI NO COINCIDE SE AVISA EN UNA LÍNEA, Y NO SE CAMBIA NADA", () => {
  // Los dos casos reales del 245.
  const jelly = contenidoDelBulto({ texto: "MOGUL x1 Kg JELLY BUTTONS (210u)", factorPack: 208 });
  assert.equal(jelly.loDice, true);
  assert.equal(jelly.coincide, false);
  const t = textoDelContenido(jelly);
  assert.match(t, /El papel dice 210 por bolsa y el producto tiene 208/);
  // Y dice con cuál se calcula, que es lo que la persona necesita saber.
  assert.match(t, /se calculan con 208/);

  const cristal = contenidoDelBulto({ texto: "CRISTAL FRESH 90u x405g", factorPack: 86 });
  assert.equal(cristal.coincide, false);
  assert.match(textoDelContenido(cristal), /dice 90 por bolsa y el producto tiene 86/);
});

test("CUANDO COINCIDE, O CUANDO EL PAPEL NO LO DICE, NO SE AVISA NADA", () => {
  assert.equal(textoDelContenido(contenidoDelBulto({ texto: "MOGUL x 500Gs MORAS (83u)", factorPack: 83 })), null);
  assert.equal(textoDelContenido(contenidoDelBulto({ texto: "CARAM ARCOR CHERRY x800g", factorPack: 400 })), null);
  // Y sin producto vinculado tampoco: no hay contra qué comparar.
  assert.equal(textoDelContenido(contenidoDelBulto({ texto: "MOGUL. OSITOS 12X30G", factorPack: null })), null);
  assert.equal(textoDelContenido(null), null);
});

test("LA HOJA LO DIBUJA, Y NO TOCA EL FACTOR DEL PRODUCTO", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /contenidoDelBulto\({ texto: fila\?\.textoCrudo, factorPack: fila\?\.factorPack }\)/);
  assert.match(hoja, /\{avisoDelContenido && \(/);
  // Y no escribe el factor en ningún lado: es una decisión sobre el producto.
  assert.ok(!/factor_pack:\s/.test(hoja), "la hoja está escribiendo el factor del producto");
});
