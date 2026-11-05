// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `costoMaestro` CONVIERTE CON LA PIEZA
// Y ESCRIBE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/costoMaestroConLaPieza.test.mjs
//
// Las huellas son de las grillas corridas con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { costosMaestros, huella, PRODUCTOS } from "../unidades/tanda11Arnes.mjs";
import { costoLineaAMaestro, actualizarCostoRealProducto } from "./costoMaestro.js";

/**
 * Un pedido de varias líneas: el costo maestro que escribe cada una y el precio
 * de venta recalculado en cada ubicación, antes y después de editar el costo de
 * la línea del pack de 12. La base es un doble que anota lo que se escribe.
 * Vive en el candado y no en el arnés porque llama a `actualizarCostoRealProducto`,
 * y el censo de escritores (`lib/precios/origenDeCosto.test.mjs`) no cuenta candados.
 */
async function pedidoQueRecalcula() {
  const lineas = [
    ["pack12", "UNIDAD", 3200], ["pack24", "BULTO", 45600], ["kilo", "UNIDAD", 8000], ["fiambrePieza", "UNIDAD", 9000], ["mani1881", "UNIDAD", 3000],
  ];
  const escribir = async (ls) => {
    const escrito = [];
    for (const [k, unidad, precioCosto] of ls) {
      const p = PRODUCTOS[k];
      const costoMaestro = costoLineaAMaestro({ precioCosto, unidad, factorPack: p.factor_pack, modoCompraProveedor: p.modoCompra, unidadMedida: p.unidad_medida });
      const db = {
        productoLocal: {
          findUnique: async () => ({ id: p.productoLocalId, baseId: p.baseId, margen: null, base: { es_combo: false, creadoEnLocalId: null } }),
          findMany: async () => [
            { id: p.productoLocalId, localId: 1, margen: 25, precio_venta: 1, reglaPrecio: "MARGEN_PORCENTUAL", recargoFijoUnidad: null },
            { id: p.productoLocalId + 1, localId: 2, margen: null, precio_venta: 1, reglaPrecio: "MARGEN_PORCENTUAL", recargoFijoUnidad: null },
          ],
          update: async (a) => escrito.push(["productoLocal", a.where.id, a.data]),
        },
        productoBase: {
          findUnique: async () => ({ margen: 40, redondeo_100: true, unidad_medida: p.unidad_medida, factor_pack: p.factor_pack }),
          update: async (a) => escrito.push(["productoBase", a.where.id, a.data]),
        },
      };
      const avisar = console.warn;
      console.warn = () => {};
      try {
        await actualizarCostoRealProducto(db, { productoLocalId: p.productoLocalId, costoMaestro });
      } finally {
        console.warn = avisar;
      }
      escrito.push(["costoMaestro", k, costoMaestro]);
    }
    return escrito;
  };
  const antes = await escribir(lineas);
  const editadas = lineas.map((l) => (l[0] === "pack12" ? ["pack12", "UNIDAD", 3350] : l));
  return { antes, despuesDeEditarPack12: await escribir(editadas) };
}

test("el costo maestro de cada línea es el mismo que antes de la tanda 11 (grilla completa)", () => {
  assert.equal(huella(costosMaestros()), "6695838f021532a9726e39f6b0e3c89c90b1a774c4fc4435007964131ab6cf9c");
});

test("los casos de la tanda: pack de 12 y de 24 por bulto y por unidad, kilo, fiambre y el maní 1881", () => {
  const c = costosMaestros();
  assert.equal(c["pack12|UNIDAD|3200"], 38400, "3.200 la unidad de un pack de 12 son 38.400 el bulto");
  assert.equal(c["pack12|BULTO|38400"], 38400);
  assert.equal(c["pack24|UNIDAD|3200"], 76800);
  assert.equal(c["pack12|UNIDAD|82.222222"], 986.67, "se multiplica a precisión completa y recién al final se redondea");
  assert.equal(c["kilo|UNIDAD|3200"], 3200);
  assert.equal(c["fiambrePieza|UNIDAD|3200"], 3200);
  assert.equal(c["mani1881|UNIDAD|3200"], 3200, "el maní guarda el costo por kilo: no se multiplica por 2");
  assert.equal(c["mani1881|BULTO|3200"], 3200);
});

test("un pedido de varias líneas: editar una recalcula su costo maestro y el precio en cada ubicación, igual que antes", async () => {
  const r = await pedidoQueRecalcula();
  assert.equal(huella(r), "e047d1082a193edef93634440e2c55ac6e9d6560f62276606e611d504f2aa338");
  // La línea del pack de 12 pasa de 3.200 a 3.350 la unidad: el maestro de 38.400 a 40.200.
  const de = (escrito, k) => escrito.filter(([t, id]) => t === "costoMaestro" ? id === k : false).map(([, , v]) => v);
  assert.deepEqual([de(r.antes, "pack12"), de(r.despuesDeEditarPack12, "pack12")], [[38400], [40200]]);
  assert.deepEqual(r.despuesDeEditarPack12.slice(0, 3), [
    ["productoBase", 31, { precio_costo: 40200, precio_venta: 56300 }],
    ["productoLocal", 301, { precio_costo: 40200, precio_venta: 50300 }],
    ["productoLocal", 302, { precio_costo: 40200, precio_venta: 56300 }],
  ]);
  // Las otras líneas escriben lo mismo antes y después.
  const sinPack12 = (escrito) => escrito.filter((x) => !(x[0] === "costoMaestro" && x[1] === "pack12") && x[1] !== 31 && x[1] !== 301 && x[1] !== 302);
  assert.deepEqual(sinPack12(r.despuesDeEditarPack12), sinPack12(r.antes));
});

test("costoMaestro lleva la unidad al bulto con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./costoMaestro.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /costoEnLaUnidad\(\{ costo, de: "UNIDAD", a: "BULTO", base: ficha \}\)/);
  assert.ok(!/costo \* factor/.test(fuente), "volvió a multiplicar a mano");
});
