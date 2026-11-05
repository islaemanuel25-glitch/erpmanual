// LOS CASOS DE LA TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: COMPRAS A PROVEEDOR E
// IMPORTACIÓN DEL PEDIDO DESDE UN ARCHIVO.
//
// Lo comparten los candados de `costoMaestro`, `cantidadParaElProveedor`,
// `importacion/cantidad`, `importacion/merge`, `importacion/payload` y
// `CarritoPedido`. Cada grilla se corrió con el código ANTERIOR a la tanda 11
// (2026-11-05), dos veces seguidas e idénticas, y cada candado guarda la huella
// SHA-256 de su grilla: un solo número distinto la cambia. Los casos que pidió
// la tanda van además con sus números escritos a la vista.
//
// ── DE DÓNDE SALE LA FORMA DE CADA PRODUCTO ────────────────────────────────
//
// `PRODUCTOS` tiene la forma de lo que devuelve `compras-proveedor/productos`
// (el catálogo del pedido): `unidad_medida`, `factor_pack`, `modoCompra`,
// `precio_costo`, `pesoRefKg`. Es la que reciben el importador y la página del
// pedido. Los ítems del carrito se arman como los arma
// `app/modulos/compras-proveedor/nueva/page.jsx` (`nuevoItemBase`).

import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { costoLineaAMaestro } from "../compras-proveedor/costoMaestro.js";
import { cantidadParaElProveedor } from "../compras-proveedor/cantidadParaElProveedor.js";
import { proponerCantidadPedido } from "../compras-proveedor/importacion/cantidad.js";
import { sumarCantidadesImportadas } from "../compras-proveedor/importacion/merge.js";
import { consolidarLineasImportadas } from "../compras-proveedor/importacion/payload.js";
import CarritoPedido from "../../components/compras-proveedor/CarritoPedido.jsx";

export const huella = (valor) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");

export const PRODUCTOS = {
  pack12: { productoLocalId: 301, baseId: 31, nombre: "Gaseosa x12", unidad_medida: "pack", factor_pack: 12, modoCompra: "BULTO", precio_costo: 38400, pesoRefKg: null },
  pack24: { productoLocalId: 302, baseId: 32, nombre: "Cerveza x24", unidad_medida: "pack", factor_pack: 24, modoCompra: "BULTO", precio_costo: 45600, pesoRefKg: null },
  unidad12: { productoLocalId: 303, baseId: 33, nombre: "Alfajor unidad x12", unidad_medida: "unidad", factor_pack: 12, modoCompra: "BULTO", precio_costo: 6000, pesoRefKg: null },
  cajon6: { productoLocalId: 304, baseId: 34, nombre: "Vino cajon x6", unidad_medida: "cajon", factor_pack: 6, modoCompra: "BULTO", precio_costo: 30000, pesoRefKg: null },
  kilo: { productoLocalId: 305, baseId: 35, nombre: "Queso por kilo", unidad_medida: "kg", factor_pack: 1, modoCompra: "BULTO", precio_costo: 8000, pesoRefKg: null },
  fiambrePieza: { productoLocalId: 306, baseId: 36, nombre: "Jamon pieza", unidad_medida: "kg", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 9000, pesoRefKg: 3.5 },
  // La ficha real del maní, leída en producción el 2026-11-05.
  mani1881: { productoLocalId: 18811, baseId: 1881, nombre: "MANI CON CASCARA X2KG", unidad_medida: "kg", factor_pack: 2, modoCompra: "UNIDAD", precio_costo: 3000, pesoRefKg: 2 },
};
const UNIDADES = ["BULTO", "UNIDAD"];

export function costosMaestros() {
  const out = {};
  for (const [k, p] of Object.entries(PRODUCTOS)) for (const unidad of UNIDADES) for (const precioCosto of [3200, 38400, 82.222222, 1480 / 18, 0, -5, "abc", null]) {
    out[`${k}|${unidad}|${precioCosto}`] = costoLineaAMaestro({ precioCosto, unidad, factorPack: p.factor_pack, modoCompraProveedor: p.modoCompra, unidadMedida: p.unidad_medida }) ?? "null";
  }
  return out;
}

export function cantidadesParaElProveedor() {
  const out = {};
  for (const [k, p] of Object.entries(PRODUCTOS)) for (const unidad of [...UNIDADES, null]) for (const cantidad of [0, 1, 3, 2.5, -2, "4", null]) {
    out[`${k}|${unidad}|${cantidad}`] = cantidadParaElProveedor({ cantidad, unidad, unidadMedida: p.unidad_medida, factorPack: p.factor_pack });
  }
  return out;
}

export function propuestas() {
  const out = {};
  for (const [k, p] of Object.entries(PRODUCTOS)) for (const unidadFuente of ["UNIDAD", "BULTO", null, "un", "caja", "kg"]) for (const cantidadEn of [null, "UNIDAD", "BULTO"]) for (const cantidad of [24, 25, 36, 3, 0, 12.5, 12.0004, -12]) {
    out[`${k}|${unidadFuente}|${cantidadEn}|${cantidad}`] = proponerCantidadPedido({ cantidad, unidadFuente, producto: p, cantidadEn });
  }
  return out;
}

export function sumas() {
  const out = {};
  for (const [k, p] of Object.entries(PRODUCTOS)) for (const ua of UNIDADES) for (const ui of UNIDADES) for (const [ca, ci] of [[2, 1], [5, 24], [5, 25], [0, 12], [3, 0], [-1, 12]]) for (const usarCostoImportado of [false, true]) {
    out[`${k}|${ua}${ca}+${ui}${ci}|${usarCostoImportado}`] = sumarCantidadesImportadas({
      actual: { cantidad: ca, unidad: ua, precioCosto: ua === "BULTO" ? 38400 : 3200 },
      importada: { cantidad: ci, unidad: ui, precioCosto: ui === "BULTO" ? 39000 : 3300 },
      factorPack: p.factor_pack, producto: p, costoMaestro: p.precio_costo, usarCostoImportado,
    });
  }
  return out;
}

export function consolidaciones() {
  const out = {};
  const porId = new Map(Object.values(PRODUCTOS).map((p) => [String(p.productoLocalId), p]));
  for (const [k, p] of Object.entries(PRODUCTOS)) for (const [u1, c1, u2, c2] of [["BULTO", 2, "UNIDAD", 5], ["UNIDAD", 5, "BULTO", 2], ["BULTO", 1, "BULTO", 3], ["UNIDAD", 7, "UNIDAD", 0]]) {
    const linea = (u, c, precio) => ({ productoLocalId: p.productoLocalId, unidadPedido: u, cantidadPedido: c, origenPrecio: "SISTEMA", precioSistema: precio, codigoProveedor: `C${c}`, descripcionProveedor: `D${u}` });
    out[`${k}|${u1}${c1}+${u2}${c2}`] = consolidarLineasImportadas({ lineas: [linea(u1, c1, u1 === "BULTO" ? 38400 : 3200), linea(u2, c2, u2 === "BULTO" ? 39000 : 3300)], productosPorId: porId });
  }
  return out;
}

/** Un ítem del carrito, como lo arma `compras-proveedor/nueva/page.jsx` (`nuevoItemBase`). */
export function itemDelCarrito(k, unidadPedido, cantidad, precioCosto) {
  const prod = PRODUCTOS[k];
  return {
    productoLocalId: prod.productoLocalId, baseId: prod.baseId, costoCatalogo: Number(prod.precio_costo) || 0, nombre: prod.nombre, sku: null,
    modoCompra: prod.modoCompra || "BULTO", unidadPedido, unidad_medida: prod.unidad_medida, cantidad, precioCosto,
    factorPack: Number(prod.factor_pack) || 1, sugerido: 0, sinParametros: true, pesoRefKg: prod.pesoRefKg,
  };
}

/** Los números que se leen en el carrito, en sus dos variantes. */
export function carrito() {
  const items = [
    itemDelCarrito("pack12", "BULTO", 3, 38400), itemDelCarrito("pack12", "UNIDAD", 5, 3200), itemDelCarrito("pack24", "BULTO", 2, 45600),
    itemDelCarrito("unidad12", "BULTO", 2, 6000), itemDelCarrito("cajon6", "BULTO", 0, 30000), itemDelCarrito("kilo", "UNIDAD", 2.5, 8000),
    itemDelCarrito("fiambrePieza", "UNIDAD", 2, 9000), itemDelCarrito("mani1881", "UNIDAD", 3, 3000),
  ];
  const out = {};
  for (const variant of ["aside", "sheet"]) {
    const html = renderToStaticMarkup(createElement(CarritoPedido, {
      variant, proveedorNombre: "Proveedor", items: items.map((i, n) => ({ ...i, productoLocalId: i.productoLocalId * 10 + n })), total: 0, notas: "", setNotas() {},
      onCantidad() {}, onBlurCantidad() {}, onSetCantidad() {}, onCosto() {}, onBlurCosto() {}, onQuitar() {}, onGuardar() {}, onConfirmar() {},
    }));
    out[variant] = html.replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean).filter((s) => /\d/.test(s));
  }
  return out;
}

// El pedido de varias líneas que escribe el costo maestro vive en el candado de
// `costoMaestro`, no acá: llama a `actualizarCostoRealProducto`, y el censo de
// escritores de `lib/precios/origenDeCosto.test.mjs` cuenta a todo archivo que
// no sea un candado.
