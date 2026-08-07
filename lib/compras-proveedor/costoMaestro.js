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
// El margen NO se toca nunca desde compras. El precio de venta SÍ se recalcula, en
// la ficha y en TODAS las ubicaciones donde se usa el producto, siempre a partir del
// margen configurado de cada una. Un costo que sube sin arrastrar los precios deja
// locales vendiendo por debajo del costo.

// Ruta relativa (no alias "@/") porque este archivo se importa en tests node.
import { esComboBase } from "../combos/guards.js";
import { puedeEditarCosto } from "../productos/propiedadCosto.js";
import { precioDesdeMargen, hayReglaAutomatica } from "../precios/precioDesdeMargen.js";
import { propagarCostoALocales } from "../precios/propagarCostoALocales.js";

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

// Recalcula precio_venta desde costo + margen CONFIGURADO, con la única fórmula del
// ERP (lib/precios/precioDesdeMargen.js), la misma que usan el editor de productos y
// la propagación depósito→locales.
//
// El margen configurado NO se toca nunca: entra como dato y sale igual. El margen
// efectivo que produce el redondeo es informativo y no se persiste — persistirlo era
// lo que hacía subir el margen un escalón en cada edición.
//
// Devuelve undefined cuando NO hay regla automática (margen ausente o <= 0): en ese
// caso NO se toca precio_venta, para no pisar un precio manual (el ERP no tiene flag
// de "precio manual"; la presencia de margen es el único indicador de regla automática).
function ventaDesdeCostoMargen(costo, margenRaw, redondeo) {
  if (!hayReglaAutomatica(margenRaw)) return undefined;
  const { aplica, precioFinal } = precioDesdeMargen({
    costo,
    margenConfigurado: margenRaw,
    redondeo100: redondeo,
  });
  return aplica ? precioFinal : undefined;
}

// Actualiza el costo real del producto y, si corresponde, su precio_venta:
//   - ProductoBase.precio_costo (+ precio_venta si hay margen)            (maestro)
//   - ProductoLocal.precio_costo del local comprado (+ precio_venta si hay margen)
// No toca `margen` ni `redondeo_100`. `db` = cliente Prisma o tx de transacción.
//
// PROPIEDAD DEL COSTO: si el llamador indica `operadoDesdeLocalId` (la ubicación
// dueña de la operación) + `depositoLocalId`, solo se escribe el costo cuando esa
// ubicación es DUEÑA del producto (depósito para productos de depósito; el local
// creador para exclusivos). Un local que compra un producto del DEPÓSITO NO toca
// ningún costo (ni maestro ni override) — decisión de negocio. Omitir esos
// parámetros preserva el comportamiento previo (compat).
export async function actualizarCostoRealProducto(
  db,
  { productoLocalId, costoMaestro, operadoDesdeLocalId, depositoLocalId } = {}
) {
  const costo = Number(costoMaestro);
  if (!Number.isFinite(costo) || costo <= 0) return;

  const pl = await db.productoLocal.findUnique({
    where: { id: Number(productoLocalId) },
    select: {
      id: true,
      baseId: true,
      margen: true,
      base: { select: { es_combo: true, creadoEnLocalId: true } },
    },
  });
  if (!pl) return;
  // Chokepoint central: los combos no tienen costo físico que propagar.
  if (esComboBase(pl.base)) return;

  // Regla de propiedad: solo el dueño del producto puede mover su costo.
  if (operadoDesdeLocalId !== undefined && operadoDesdeLocalId !== null) {
    const permitido = puedeEditarCosto(
      operadoDesdeLocalId,
      pl.base?.creadoEnLocalId ?? null,
      depositoLocalId ?? null
    );
    if (!permitido) return; // p. ej. local comprando un producto del depósito → no tocar costo
  }

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

  // TODAS las ubicaciones donde se usa el producto, cada una con SU margen.
  //
  // Antes acá solo se actualizaba el ProductoLocal de quien compraba (`pl.id`). Como
  // las compras del depósito son el camino por el que realmente se mueve el costo
  // maestro en producción, los locales quedaban con el costo y el precio viejos:
  // costo 10 → 20 y la venta del local seguía en 13, vendiendo bajo costo sin aviso.
  const propagacion = await propagarCostoALocales(db, {
    baseId: pl.baseId,
    costo,
    margenBase: base.margen,
    redondeo100: redondeo,
  });

  // Sin margen configurado no hay regla automática y el precio no se toca, para no
  // pisar uno puesto a mano. Pero que no se toque no puede ser silencioso cuando
  // quedó por debajo del costo: eso es exactamente vender perdiendo.
  const enRiesgo = propagacion.sinMargen.filter((x) => x.bajoCosto);
  if (enRiesgo.length > 0) {
    console.warn(
      `[costoMaestro] producto ${pl.baseId}: costo nuevo ${costo} y ${enRiesgo.length} ubicación(es) ` +
        `sin margen configurado quedaron con precio por debajo del costo: ` +
        enRiesgo.map((x) => `local ${x.localId} ($${x.precioVenta})`).join(", ")
    );
  }

  return propagacion;
}
