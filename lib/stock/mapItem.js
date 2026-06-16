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

// VISTA LOCAL → precio unitario (÷ factor) + redondeo a 100.
// pl: ProductoLocal (con precio_costo/precio_venta/margen/localId/id)
// base: ProductoBase (con todos los campos seleccionados)
// stock: { cantidad, stockMin, stockMax } | undefined
export function mapStockItemLocal(pl, base, stock) {
  const s = stock ?? { cantidad: 0, stockMin: 0, stockMax: 0 };
  const factor = Number(base.factor_pack || 1);

  const costoUnit =
    factor > 1
      ? Number(pl.precio_costo || base.precio_costo) / factor
      : Number(pl.precio_costo || base.precio_costo);

  let ventaUnit =
    factor > 1
      ? Number(pl.precio_venta || base.precio_venta) / factor
      : Number(pl.precio_venta || base.precio_venta);

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
    precioCosto: Number(pl.precio_costo || base.precio_costo),

    precioVentaUnitario: ventaUnit,
    precioVenta: Number(pl.precio_venta || base.precio_venta),

    margen: pl.margen,
    stock: Number(s.cantidad || 0),
    stockMin: Number(s.stockMin || 0),
    stockMax: Number(s.stockMax || 0),
    faltante: Number(s.cantidad || 0) < Number(s.stockMin || 0),
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
  const s = stock ?? { cantidad: 0, stockMin: 0, stockMax: 0 };

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
    stockMin: Number(s.stockMin || 0),
    stockMax: Number(s.stockMax || 0),
    faltante: Number(s.cantidad || 0) < Number(s.stockMin || 0),
    modoCompraProveedor: base.modoCompraProveedor,
    pesoReferenciaKg: base.pesoReferenciaKg ? Number(base.pesoReferenciaKg) : null,
    pesoEsFijo: base.pesoEsFijo === true,
    modoVentaDeposito: base.modoVentaDeposito || "PESO",
  };
}
