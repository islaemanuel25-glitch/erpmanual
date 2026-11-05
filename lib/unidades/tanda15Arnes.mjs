// LOS CASOS DE LA TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: COMBOS, STOCK
// VALORIZADO, AVISO DE CAMBIO DE ESCALA Y CANTIDAD EN PEDIDO.
//
// Lo comparten los candados de `combos/costo`, `combos/ventaConsumo`,
// `precios/avisoCambioDeEscala` y `pedidos/cantidadEnPedido`. Cada grilla se
// corrió con el código ANTERIOR a la tanda 15 (2026-11-05), dos veces seguidas e
// idénticas, y cada candado guarda la huella SHA-256 de su grilla.
//
// Las fichas son las de `posVentaConLaPieza.productos.json` (tanda 8) —pack de
// 12, sueltas, kilo, fiambre por pieza, el maní 1881 con su ficha real y el kilo
// con pack— más una ficha "unidad" con factor 12. La base es un doble que
// contesta lo que piden la composición del combo, las líneas de la venta y la
// cantidad en pedido, con sus mismos campos.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { costoUnitarioComponente, costoCombo } from "../combos/costo.js";
import { construirLineasComerciales } from "../combos/ventaConsumo.js";
import { cargarMapasDeProductos } from "../pos-ventas/mapasDeProductos.js";
import { avisoDeCambioDeEscala, factorDeConversion } from "../precios/avisoCambioDeEscala.js";
import { validarCambio } from "../pedidos/cantidadEnPedido.js";

export const huella = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

const P = JSON.parse(readFileSync(new URL("./posVentaConLaPieza.productos.json", import.meta.url), "utf8"));
export const BASES = {
  ...Object.fromEntries(Object.entries(P).filter(([k]) => k.startsWith("base_")).map(([k, v]) => [k.slice(5), { ...v, activo: true }])),
  unidad12: { ...P.base_pack12, id: 106, nombre: "Alfajor unidad x12", unidad_medida: "unidad", factor_pack: 12, precio_costo: 6000, precio_venta: 8000, activo: true },
};

const intentar = async (f) => {
  try {
    const v = await f();
    return v === undefined ? "∅" : v;
  } catch (e) {
    return `LANZA: ${e.message}`;
  }
};

/** El costo de una unidad de stock de cada componente posible de un combo. */
export function costosDeComponente() {
  const out = {};
  for (const [k, base] of Object.entries(BASES)) for (const esDeposito of [false, true]) for (const override of [undefined, null, 1480, 0]) {
    out[`${k}|${esDeposito}|${override}`] = costoUnitarioComponente({ base, productoLocal: override === undefined ? null : { precio_costo: override }, esDeposito });
  }
  return out;
}

// Un combo con un componente de cada ficha, y su doble de base.
const COMBO_ID = 9001;
const COMPONENTES = [["pack12", 2], ["sueltos", 3], ["kilo", 0.5], ["fiambrePieza", 1], ["mani1881", 1], ["kgPack", 1], ["unidad12", 4]];
const plDe = (base, localId) => ({ id: base.id * 10 + localId, baseId: base.id, localId, activo: true, precio_costo: null, precio_venta: null, nombre: null, base, stock: [{ cantidad: 50 }] });
const txDe = (localId) => ({
  comboComponente: { findMany: async () => COMPONENTES.map(([k, cantidad], i) => ({ id: i + 1, comboProductoLocalId: COMBO_ID, componenteProductoLocalId: BASES[k].id * 10 + localId, cantidad })) },
  productoLocal: {
    findMany: async ({ where }) => where.id.in.map((id) => Object.values(BASES).find((b) => b.id * 10 + localId === id)).filter(Boolean).map((b) => plDe(b, localId)),
    findFirst: async ({ where }) => {
      if (where.baseId === 777) return { id: COMBO_ID, activo: true, base: { nombre: "Combo", modalidad: "NORMAL" } };
      const b = Object.values(BASES).find((x) => x.id === where.baseId);
      return b ? { id: b.id * 10 + localId, activo: true, base: { nombre: b.nombre, modalidad: "NORMAL" } } : null;
    },
  },
});

/** Una venta con un combo y una línea suelta de cada ficha, con y sin costo del cliente. */
export async function ventas() {
  const out = {};
  for (const esDeposito of [false, true]) for (const conCosto of [false, true]) {
    const localId = esDeposito ? 1 : 2;
    const items = [{ productoBaseId: 777, nombre: "Combo", precio: 20000, cantidad: 2 }];
    for (const [k, b] of Object.entries(BASES)) {
      items.push({ productoBaseId: b.id, nombre: k, precio: 1000, cantidad: 3, precioCosto: conCosto ? 500 : undefined, modoVentaLinea: "NORMAL" });
    }
    // Los mapas de la venta, con la función real de `pos-ventas/crear` y la base
    // de este doble: el combo (777) y las fichas.
    const fichas = [{ id: 777, precio_costo: 0, factor_pack: 1, es_combo: true }, ...Object.values(BASES)];
    const db = { productoBase: { findMany: async ({ where }) => fichas.filter((f) => where.id.in.includes(f.id)) } };
    const { costosMap, baseStockMap, productosBaseMap } = await cargarMapasDeProductos(db, fichas.map((f) => f.id));
    out[`${esDeposito}|${conCosto}`] = await intentar(() => construirLineasComerciales(txDe(localId), { items, productosBaseMap, costosMap, baseStockMap, localId, esDeposito }));
  }
  return out;
}

/** El aviso al cambiar la escala de una ficha, en las transiciones que sabe nombrar. */
export function avisos() {
  const out = {};
  const ESCALAS = {
    unidad: { unidad_medida: "unidad", factor_pack: 1 },
    unidad12: { unidad_medida: "unidad", factor_pack: 12 },
    pack12: { unidad_medida: "pack", factor_pack: 12 },
    pack24: { unidad_medida: "pack", factor_pack: 24 },
    cajon6: { unidad_medida: "cajon", factor_pack: 6 },
    kilo: { unidad_medida: "kg", factor_pack: 1 },
    pieza3: { unidad_medida: "kg", factor_pack: 1, modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3, pesoEsFijo: true },
    pieza2pack: { unidad_medida: "kg", factor_pack: 2, modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 2, pesoEsFijo: true },
  };
  const ubicaciones = [{ localId: 1, nombre: "Depósito", precioVenta: 36900 }, { localId: 2, nombre: "Local", precioVenta: 0 }, { localId: 3, nombre: "Otro", precioVenta: 1234.56 }];
  for (const [a, antes] of Object.entries(ESCALAS)) for (const [d, despues] of Object.entries(ESCALAS)) {
    out[`${a}->${d}`] = { factor: factorDeConversion(antes, despues), aviso: avisoDeCambioDeEscala({ antes, despues, ubicaciones }) };
  }
  return out;
}

/** La cantidad que el local pide al depósito, validada contra la ficha. */
export async function pedidos() {
  const out = {};
  for (const [k, base0] of Object.entries(BASES)) for (const modo_envio of [null, "SOLO_BULTO", "MIXTO", "SOLO_UNIDAD"]) for (const unidad of ["UNIDAD", "BULTO", undefined]) for (const cantidad of [0, 3, 12, 24, 25, 36, 2.5, -1]) {
    const base = { ...base0, modo_envio };
    const cliente = { productoLocal: { findUnique: async () => ({ id: 5, localId: 1, base }) } };
    out[`${k}|${modo_envio}|${unidad}|${cantidad}`] = await intentar(() => validarCambio(cliente, 1, { productoLocalId: 5, cantidad, unidad }));
  }
  return out;
}

export { costoCombo };
