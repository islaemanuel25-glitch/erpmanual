// lib/compras-proveedor/costoMaestro.js
//
// Persistencia del "costo real/maestro" del producto cuando se edita o confirma
// el costo en un pedido a proveedor. Reutilizable por editar-item, crear y recibir.
//
// El costo maestro (ProductoBase.precio_costo / ProductoLocal.precio_costo) se
// almacena POR BULTO cuando factor_pack > 1 — misma convención que el editor de
// productos y el reporte valorizado, que dividen por factor_pack para el unitario.
// Fiambre (modoCompraProveedor === "UNIDAD") y KG se guardan por kg (sin factor).
//
// Solo se actualiza el COSTO: no se tocan precio_venta ni margen (no se cambian
// precios de venta desde el flujo de compras).

// Ruta relativa (no alias "@/") porque este archivo se importa en tests node.
import { esComboBase } from "../combos/guards.js";

// Convierte el costo de la línea (en su unidad) al costo maestro almacenado.
// Devuelve null si el costo no es un número válido > 0 (no se propaga).
export function costoLineaAMaestro({
  precioCosto,
  unidad,
  factorPack,
  modoCompraProveedor,
  unidadMedida,
} = {}) {
  const costo = Number(precioCosto);
  if (!Number.isFinite(costo) || costo <= 0) return null;

  // El costo de línea puede venir con alta precisión (hasta 6 decimales), p.ej. el
  // unitario derivado de un pack con factor no divisor (1480/18 = 82,222222…).
  // Se multiplica a precisión completa y recién el costo maestro FINAL se redondea
  // a 2 decimales (moneda). Así 82,222222 × 18 = 1.479,999996 → $1.480,00 (no 1.479,96).
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Fiambre o KG: el costo ya está en la unidad almacenada (por kg).
  if (modoCompraProveedor === "UNIDAD" || unidadMedida === "kg") return round2(costo);

  const factor = Math.max(1, Number(factorPack) || 1);

  // Línea comprada por UNIDAD en producto PACK → convertir a costo por bulto.
  if (unidad === "UNIDAD" && factor > 1) return round2(costo * factor);

  // BULTO (ya por bulto) o producto sin pack.
  return round2(costo);
}

// Recalcula precio_venta desde costo + margen, con la misma fórmula de margen que el
// editor de productos:
//   venta = costo * (1 + margen/100); si redondeo_100 → Math.ceil(venta/100)*100.
// Redondeo COMERCIAL hacia arriba (Math.ceil): el redondeo no debe bajar el precio ni
// reducir el margen.
// PENDIENTE (no ahora): Productos servidor (syncFromBaseToLocales) usa Math.round y el
// form usa Math.ceil — inconsistencia global a unificar en una corrección aparte.
// Devuelve undefined cuando NO hay regla automática (margen ausente o <= 0): en ese
// caso NO se toca precio_venta, para no pisar un precio manual (el ERP no tiene flag
// de "precio manual"; la presencia de margen es el único indicador de regla automática).
function ventaDesdeCostoMargen(costo, margenRaw, redondeo) {
  const m = Number(margenRaw);
  if (!Number.isFinite(m) || m <= 0) return undefined;
  let venta = costo * (1 + m / 100);
  if (redondeo) venta = Math.ceil(venta / 100) * 100;
  return venta;
}

// Actualiza el costo real del producto y, si corresponde, su precio_venta:
//   - ProductoBase.precio_costo (+ precio_venta si hay margen)            (maestro)
//   - ProductoLocal.precio_costo del local comprado (+ precio_venta si hay margen)
// No toca `margen` ni `redondeo_100`. `db` = cliente Prisma o tx de transacción.
export async function actualizarCostoRealProducto(db, { productoLocalId, costoMaestro } = {}) {
  const costo = Number(costoMaestro);
  if (!Number.isFinite(costo) || costo <= 0) return;

  const pl = await db.productoLocal.findUnique({
    where: { id: Number(productoLocalId) },
    select: { id: true, baseId: true, margen: true, base: { select: { es_combo: true } } },
  });
  if (!pl) return;
  // Chokepoint central: los combos no tienen costo físico que propagar.
  if (esComboBase(pl.base)) return;

  const base = await db.productoBase.findUnique({
    where: { id: pl.baseId },
    select: { margen: true, redondeo_100: true },
  });
  if (!base) return;

  const redondeo = base.redondeo_100 === true;

  // ProductoBase: venta desde el margen de la base.
  const dataBase = { precio_costo: costo };
  const ventaBase = ventaDesdeCostoMargen(costo, base.margen, redondeo);
  if (ventaBase !== undefined) dataBase.precio_venta = ventaBase;
  await db.productoBase.update({ where: { id: pl.baseId }, data: dataBase });

  // ProductoLocal comprado: venta desde el margen del local (fallback a base).
  const dataLocal = { precio_costo: costo };
  const margenLocal = pl.margen != null ? pl.margen : base.margen;
  const ventaLocal = ventaDesdeCostoMargen(costo, margenLocal, redondeo);
  if (ventaLocal !== undefined) dataLocal.precio_venta = ventaLocal;
  await db.productoLocal.update({ where: { id: pl.id }, data: dataLocal });
}
