// lib/precios/reglaPropuesta.js
//
// LA GANANCIA QUE SE LE PROPONE A UN PRODUCTO NUEVO.
//
// ── EL CASO (Emanuel, 2026-11-18) ───────────────────────────────────────────
//
// "GIGANTE CITRONELA 900cc" se creó desde la recepción y Emanuel lo vio con el
// precio de venta igual al costo. Decisión: el alta no guarda un producto con
// venta menor o igual al costo; si no se elige regla, se propone la de la
// categoría, precargada; si no hay de dónde proponer, se pide elegir.
//
// ── "LA DE LA CATEGORÍA" SE MIDE, PORQUE NO ESTÁ GUARDADA ──────────────────
//
// `Categoria` no tiene ganancia: solo nombre. La regla vive en cada producto.
// Así que la de la categoría es la que USAN sus productos: el margen más común,
// primero entre los del mismo proveedor —la misma pregunta con la que se
// corrigió el Citronela: "los productos de Dab de esa misma categoría, la más
// común"— y si el proveedor no tiene ninguno ahí, entre todos los de la
// categoría. Sin categoría cuenta la del proveedor sin categoría, igual que
// para el Citronela. Sin nada que contar: null, y el alta pide elegir.
//
// Solo cuentan márgenes mayores que cero: un 0 es "vendé al costo", que es
// justo lo que el alta ya no deja guardar, y proponerlo sería proponer el
// rechazo.

import { seVendeSinGanancia } from "./precioDesdeMargen.js";

export const TEXTO_ALTA_SIN_GANANCIA = "El precio de venta tiene que ser mayor que el costo: así el producto se vendería sin ganancia.";
export const TEXTO_ALTA_SIN_REGLA = "Elegí la ganancia antes de guardar: el producto no tiene regla de precio.";

/**
 * ¿POR QUÉ NO SE PUEDE GUARDAR ESTE ALTA? null si se puede.
 *
 * La misma pregunta en el formulario y en `POST /api/productos/crear`, que es
 * la ruta de las tres altas —la común, desde la lista y desde el papel—. Un
 * servicio de importe variable no tiene precio fijo y queda afuera. Sin costo
 * cargado no se sabe si hay ganancia: no se frena por esto (`seVendeSinGanancia`).
 */
export function motivoDeAltaSinGanancia({ precioCosto, precioVenta, margen, modalidad = "NORMAL" } = {}) {
  if (modalidad === "IMPORTE_VARIABLE") return null;
  if (margen === null || margen === undefined || margen === "" || !Number.isFinite(Number(margen))) {
    return { campo: "margen", error: TEXTO_ALTA_SIN_REGLA };
  }
  if (seVendeSinGanancia({ costo: precioCosto, venta: precioVenta })) {
    return { campo: "precio_venta", error: TEXTO_ALTA_SIN_GANANCIA };
  }
  return null;
}

/** El margen más usado de una lista, o null. Empate: el más alto. */
export function margenMasUsado(margenes = []) {
  const cuenta = new Map();
  for (const m of margenes ?? []) {
    if (m === null || m === undefined || m === "") continue;
    const n = Number(m);
    if (!Number.isFinite(n) || n <= 0) continue;
    cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  }
  let mejor = null;
  for (const [margen, veces] of cuenta) {
    if (!mejor || veces > mejor.veces || (veces === mejor.veces && margen > mejor.margen)) mejor = { margen, veces };
  }
  return mejor;
}

/** De dónde salió la propuesta, para decirlo en el formulario. */
export const ORIGEN_PROPUESTA = Object.freeze({
  PROVEEDOR_Y_CATEGORIA: "PROVEEDOR_Y_CATEGORIA",
  CATEGORIA: "CATEGORIA",
});

/** Lo que dice el formulario debajo del margen. */
export function textoDeLaPropuesta(propuesta) {
  if (!propuesta) return "No hay una ganancia para proponer en esta categoría: elegila antes de guardar.";
  const n = propuesta.margen.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const donde =
    propuesta.origen === ORIGEN_PROPUESTA.PROVEEDOR_Y_CATEGORIA
      ? "entre los productos de este proveedor en esta categoría"
      : "entre los productos de esta categoría";
  return `Propuesta: ${n} %, la más usada ${donde} (${propuesta.veces} de ${propuesta.total}).`;
}

/**
 * LA GANANCIA PROPUESTA PARA UN ALTA, o null.
 *
 * @param prisma  el cliente
 * @returns `{ margen, veces, total, origen }` o null
 */
export async function reglaPropuestaParaElAlta(prisma, { grupoId, categoriaId = null, proveedorId = null } = {}) {
  if (!grupoId) return null;
  const categoria = categoriaId ? Number(categoriaId) : null;
  const comun = { grupoId: Number(grupoId), activo: true, es_combo: false, modalidad: "NORMAL", categoria_id: categoria };
  const contar = async (where, origen) => {
    const filas = await prisma.productoBase.findMany({ where, select: { margen: true } });
    const mejor = margenMasUsado(filas.map((f) => f.margen));
    return mejor ? { margen: mejor.margen, veces: mejor.veces, total: filas.length, origen } : null;
  };
  if (proveedorId) {
    const p = Number(proveedorId);
    const delProveedor = await contar(
      { ...comun, OR: [{ proveedor_id: p }, { proveedor2_id: p }, { proveedor3_id: p }] },
      ORIGEN_PROPUESTA.PROVEEDOR_Y_CATEGORIA
    );
    if (delProveedor) return delProveedor;
  }
  if (categoria === null) return null;
  return contar(comun, ORIGEN_PROPUESTA.CATEGORIA);
}
