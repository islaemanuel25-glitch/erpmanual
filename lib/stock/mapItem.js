// lib/stock/mapItem.js
//
// Armado del objeto "item" del listado de Stock Locales. Centraliza lo que antes
// estaba TRIPLICADO en app/api/stock_locales/listar/route.js (rama local, rama
// depósito y extras por código). El JSON de salida es EXACTAMENTE el mismo:
//   - Local  → incluye precioUnitario / precioVentaUnitario (÷ factor_pack +
//              redondeo_100) además de precioCosto / precioVenta.
//   - Depósito → precioCosto / precioVenta de bulto (sin unitario).
//
// No cambia reglas: StockLocal.cantidad en UNIDADES; faltante = cantidad < min;
// stock 0 y negativo se mantienen (no se filtran acá).

import { redondear100 } from "@/lib/precios/redondeo";
// ── EL `||` SE FUE AL CRITERIO COMPARTIDO ─────────────────────────────────
//
// Acá se escribía `pl.precio_costo || base.precio_costo`, que con un cero cae a
// la base. Era el criterio CORRECTO, pero vivía solo acá: el catálogo usaba un
// `pick` que solo mira nulo, así que las dos pantallas mostraban números
// distintos para el mismo producto. Ahora las dos preguntan en el mismo lugar.
//
// El comportamiento de esta pantalla NO cambia: `precioDeLaUbicacion` hace lo
// mismo que hacía el `||` para un cero, y además descarta la cadena vacía y lo
// que no sea número, que el `||` también descartaba.
import { precioDeLaUbicacion } from "@/lib/precios/precioDeLaUbicacion";

// VISTA LOCAL → precio unitario (÷ factor) + redondeo a 100.
// pl: ProductoLocal (con precio_costo/precio_venta/margen/localId/id)
// base: ProductoBase (con todos los campos seleccionados)
// stock: { cantidad, stockMin, stockMax } | undefined
export function mapStockItemLocal(pl, base, stock) {
  // Sin fila de stock no hay límites configurados: `null`, no 0. Con 0 el
  // producto entraba como "mínimo cero" y quedaba fuera de "Límites sin ajustar",
  // que es justamente donde tiene que estar.
  const s = stock ?? { cantidad: 0, stockMin: null, stockMax: null, limitesConfiguradosAt: null };
  const factor = Number(base.factor_pack || 1);

  // Se resuelven UNA vez y se reusan: antes cada expresión repetía el `||`, así
  // que el mismo criterio estaba escrito seis veces en este archivo.
  const costoVigente = Number(precioDeLaUbicacion(base.precio_costo, pl.precio_costo));
  const ventaVigente = Number(precioDeLaUbicacion(base.precio_venta, pl.precio_venta));

  const costoUnit = factor > 1 ? costoVigente / factor : costoVigente;

  let ventaUnit = factor > 1 ? ventaVigente / factor : ventaVigente;

  if (base.redondeo_100 === true) {
    ventaUnit = redondear100(ventaUnit);
  }

  return {
    id: pl.id,
    localId: pl.localId,
    baseId: base.id,

    nombre: base.nombre,
    codigoBarra: base.codigo_barra,
    categoriaId: base.categoria_id,
    proveedorId: base.proveedor_id,
    areaFisicaId: base.area_fisica_id,
    unidadMedida: base.unidad_medida,
    factorPack: factor,

    precioUnitario: costoUnit,
    precioCosto: costoVigente,

    precioVentaUnitario: ventaUnit,
    precioVenta: ventaVigente,

    margen: pl.margen,
    stock: Number(s.cantidad || 0),
    // ── EL null SOBREVIVE HASTA LA PANTALLA ─────────────────────────────
    //
    // Acá decía `Number(s.stockMin || 0)`, así que un límite sin configurar
    // llegaba al frontend como un 0 perfectamente creíble: la ficha mostraba
    // "mínimo 0" sobre un producto que nunca tuvo mínimo. Y como el 0 ahora ES
    // un valor válido, no había forma de distinguirlos aguas abajo.
    stockMin: s.stockMin === null || s.stockMin === undefined ? null : Number(s.stockMin),
    stockMax: s.stockMax === null || s.stockMax === undefined ? null : Number(s.stockMax),
    limitesConfigurados: s.limitesConfiguradosAt != null,
    // `faltante` conserva su significado —cantidad por debajo del mínimo— pero
    // deja de dispararse cuando no hay mínimo. Antes, con el null aplanado a 0,
    // esto era `cantidad < 0`: solo marcaba los negativos, y por eso el filtro
    // "faltantes" venía mostrando de menos sin que nadie lo notara.
    faltante:
      s.limitesConfiguradosAt != null &&
      s.stockMin !== null &&
      s.stockMin !== undefined &&
      Number(s.cantidad || 0) < Number(s.stockMin),
    modoCompraProveedor: base.modoCompraProveedor,
    pesoReferenciaKg: base.pesoReferenciaKg ? Number(base.pesoReferenciaKg) : null,
    pesoEsFijo: base.pesoEsFijo === true,
    modoVentaDeposito: base.modoVentaDeposito || "PESO",
  };
}

// VISTA DEPÓSITO → precio de bulto. Sirve tanto para la rama principal como
// para los extras por código (en ambas pl.base y base son la misma ProductoBase).
// localId se pasa explícito (la rama depósito usa la variable del request).
export function mapStockItemDeposito(pl, base, stock, localId) {
  // Sin fila de stock no hay límites configurados: `null`, no 0. Con 0 el
  // producto entraba como "mínimo cero" y quedaba fuera de "Límites sin ajustar",
  // que es justamente donde tiene que estar.
  const s = stock ?? { cantidad: 0, stockMin: null, stockMax: null, limitesConfiguradosAt: null };

  return {
    id: pl.id,
    localId,
    baseId: base.id,
    nombre: base.nombre,
    codigoBarra: base.codigo_barra,
    categoriaId: base.categoria_id,
    proveedorId: base.proveedor_id,
    areaFisicaId: base.area_fisica_id,
    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
    precioCosto: Number(pl.precio_costo ?? base.precio_costo),
    precioVenta: Number(pl.precio_venta ?? base.precio_venta),
    margen: pl.margen ?? base.margen,
    stock: Number(s.cantidad || 0),
    // ── EL null SOBREVIVE HASTA LA PANTALLA ─────────────────────────────
    //
    // Acá decía `Number(s.stockMin || 0)`, así que un límite sin configurar
    // llegaba al frontend como un 0 perfectamente creíble: la ficha mostraba
    // "mínimo 0" sobre un producto que nunca tuvo mínimo. Y como el 0 ahora ES
    // un valor válido, no había forma de distinguirlos aguas abajo.
    stockMin: s.stockMin === null || s.stockMin === undefined ? null : Number(s.stockMin),
    stockMax: s.stockMax === null || s.stockMax === undefined ? null : Number(s.stockMax),
    limitesConfigurados: s.limitesConfiguradosAt != null,
    // `faltante` conserva su significado —cantidad por debajo del mínimo— pero
    // deja de dispararse cuando no hay mínimo. Antes, con el null aplanado a 0,
    // esto era `cantidad < 0`: solo marcaba los negativos, y por eso el filtro
    // "faltantes" venía mostrando de menos sin que nadie lo notara.
    faltante:
      s.limitesConfiguradosAt != null &&
      s.stockMin !== null &&
      s.stockMin !== undefined &&
      Number(s.cantidad || 0) < Number(s.stockMin),
    modoCompraProveedor: base.modoCompraProveedor,
    pesoReferenciaKg: base.pesoReferenciaKg ? Number(base.pesoReferenciaKg) : null,
    pesoEsFijo: base.pesoEsFijo === true,
    modoVentaDeposito: base.modoVentaDeposito || "PESO",
  };
}
