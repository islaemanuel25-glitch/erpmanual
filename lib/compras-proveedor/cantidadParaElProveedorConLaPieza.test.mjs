// `cantidadParaElProveedor` CUENTA CON LA PIEZA ÚNICA DE UNIDADES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/cantidadParaElProveedorConLaPieza.test.mjs
//
// ── TANDA 11: NINGÚN NÚMERO CAMBIÓ ─────────────────────────────────────────
//
// La multiplicación pasó a `cantidadEnUnidades` y la grilla dio idéntica al
// código anterior.
//
// ── TANDA 12: EL QUE SE COMPRA POR PIEZA SE PIDE EN PIEZAS ─────────────────
//
// El fiambre por pieza y el MANI CON CASCARA X2KG dicen "kg" en la ficha, y el
// texto le decía al proveedor "3 kg" por 3 piezas o 3 bolsas de 2 kg. Desde la
// tanda 12 la lectora de la pieza decide: si la ficha es de fiambre (se compra
// por UNIDAD) dice piezas; si es kilo de verdad, kg. La huella de la grilla se
// volvió a sacar con eso: cambian solo las 42 claves del fiambre por pieza y
// del maní con unidad de medida kg; el resto es idéntico a la tanda 11.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { cantidadesParaElProveedor, huella } from "../unidades/tanda11Arnes.mjs";
import { cantidadParaElProveedor } from "./cantidadParaElProveedor.js";
import { textoParaElProveedor, textoDeLaPrefactura } from "./textoPedido.js";

test("la grilla del texto para el proveedor (tanda 12: el fiambre por pieza y el maní en piezas)", () => {
  assert.equal(huella(cantidadesParaElProveedor()), "44ee6cb3349ae4082b7513d76673e8e31c18a83aca2019bc6873befdad8ded11");
});

test("los casos de la tanda 11, que no cambian: packs, unidad suelta y kilo", () => {
  const c = cantidadesParaElProveedor();
  assert.equal(c["pack12|BULTO|3"], "3 × 12 = 36 unidades");
  assert.equal(c["pack24|BULTO|2.5"], "2,5 × 24 = 60 unidades");
  assert.equal(c["pack12|UNIDAD|3"], "3 unidades");
  assert.equal(c["cajon6|BULTO|-2"], "-2 × 6 = -12 unidades", "la cuenta conserva el signo, como antes");
  assert.equal(c["unidad12|BULTO|3"], "3 unidades");
  assert.equal(c["kilo|BULTO|3"], "3 kg");
});

// Las fichas reales, con los campos que el texto y el PDF le pasan.
const MANI_1881 = { unidadMedida: "kg", factorPack: 2, modoCompraProveedor: "UNIDAD" };
const FIAMBRE_POR_PIEZA = { unidadMedida: "kg", factorPack: 1, modoCompraProveedor: "UNIDAD" };
const KILO = { unidadMedida: "kg", factorPack: 1, modoCompraProveedor: "BULTO" };
const PACK_12 = { unidadMedida: "pack", factorPack: 12, modoCompraProveedor: "BULTO" };

test("TANDA 12 — el maní 1881 se le pide al proveedor en piezas, no en kilos", () => {
  assert.equal(cantidadParaElProveedor({ cantidad: 3, unidad: "UNIDAD", ...MANI_1881 }), "3 piezas");
  assert.equal(cantidadParaElProveedor({ cantidad: 1, unidad: "UNIDAD", ...MANI_1881 }), "1 pieza");
});

test("TANDA 12 — el fiambre por pieza también", () => {
  assert.equal(cantidadParaElProveedor({ cantidad: 3, unidad: "UNIDAD", ...FIAMBRE_POR_PIEZA }), "3 piezas");
});

test("TANDA 12 — contraprueba: el kilo de verdad sigue en kg y el pack de 12 sigue convertido", () => {
  assert.equal(cantidadParaElProveedor({ cantidad: 3, unidad: "UNIDAD", ...KILO }), "3 kg");
  assert.equal(cantidadParaElProveedor({ cantidad: 2.5, unidad: "BULTO", ...KILO }), "2,5 kg");
  assert.equal(cantidadParaElProveedor({ cantidad: 3, unidad: "BULTO", ...PACK_12 }), "3 × 12 = 36 unidades");
});

test("TANDA 12 — el texto que se copia, con el pedido como lo trae compras-proveedor/obtener", () => {
  const linea = (nombre, base, cantidad, unidad) => ({
    cantidad, unidad, precioCosto: 1000,
    producto: { base: { nombre, sku: null, unidad_medida: base.unidadMedida, factor_pack: base.factorPack, modoCompraProveedor: base.modoCompraProveedor } },
  });
  const pedido = {
    id: 7, createdAt: "2026-11-05T12:00:00.000Z", proveedor: { nombre: "Proveedor" },
    detalles: [
      linea("MANI CON CASCARA X2KG", MANI_1881, 3, "UNIDAD"),
      linea("Jamón pieza", FIAMBRE_POR_PIEZA, 2, "UNIDAD"),
      linea("Queso por kilo", KILO, 4.5, "UNIDAD"),
      linea("Gaseosa x12", PACK_12, 3, "BULTO"),
    ],
  };
  const texto = textoParaElProveedor(pedido);
  assert.match(texto, /MANI CON CASCARA X2KG: 3 piezas/);
  assert.match(texto, /Jamón pieza: 2 piezas/);
  assert.match(texto, /Queso por kilo: 4,5 kg/);
  assert.match(texto, /Gaseosa x12: 3 × 12 = 36 unidades/);
  // La prefactura es para adentro y sigue en la unidad del pedido.
  assert.match(textoDeLaPrefactura(pedido), /MANI CON CASCARA X2KG: 3 UNIDAD/);
});

test("el texto y el PDF le pasan modoCompraProveedor, y el PDF lo pide en su select", () => {
  const sinComentarios = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const modulo = sinComentarios("./cantidadParaElProveedor.js");
  assert.match(modulo, /import \{ cantidadEnUnidades, comoViene \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/cant \* factor/.test(modulo), "volvió a multiplicar a mano");
  assert.match(sinComentarios("./textoPedido.js"), /cantidadParaElProveedor\(\{ cantidad, unidad, unidadMedida, factorPack, modoCompraProveedor \}\)/);
  const pdf = sinComentarios("../../app/api/compras-proveedor/exportar-pdf/[id]/route.js");
  assert.match(pdf, /factor_pack: true,\s*modoCompraProveedor: true,/);
  assert.match(pdf, /modoCompraProveedor: d\.producto\?\.base\?\.modoCompraProveedor \?\? null,/);
});
