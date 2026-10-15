// lib/pos-ventas/mapasDeProductos.js
//
// LO QUE LA VENTA NECESITA SABER DE CADA PRODUCTO PARA ARMAR SUS LÍNEAS Y SU
// CONSUMO DE STOCK: el costo del bulto y su factor, si es combo, y los datos de
// escala que deciden cuánto sale de `StockLocal` (bulto, kilo, pieza).
//
// Estaba escrito adentro de `pos-ventas/crear`. Se sacó acá cuando el consumo
// del personal lo necesitó también: las dos operaciones descuentan stock con
// `construirLineasComerciales` → `aplicarConsumoStock`, y si cada una armara
// estos mapas por su cuenta, el día que una cambie el consumo dejaría de
// descontar lo mismo que la venta.

/**
 * @param {object} db  cliente o transacción
 * @param {number[]} productoBaseIds
 * @returns {Promise<{ costosMap:object, pbMap:object, baseStockMap:object, productosBaseMap:object }>}
 */
export async function cargarMapasDeProductos(db, productoBaseIds) {
  const productosBase = await db.productoBase.findMany({
    where: { id: { in: productoBaseIds } },
    select: {
      id: true, precio_costo: true, factor_pack: true, categoria_id: true,
      modoVentaDeposito: true, pesoReferenciaKg: true, modo_envio: true,
      unidad_medida: true, es_combo: true,
      // ── SIN ESTOS DOS, NINGUNA PIEZA SE CONGELA COMO PIEZA ───────────
      //
      // `baseStockMap` los lee más abajo para armar la entrada que decide la
      // presentación, pero el select no los pedía: llegaban `undefined`, así
      // que `modoCompraProveedor` quedaba en null y `esProductoFiambre` —la
      // puerta de `esFiambreFijo`— daba false SIEMPRE. Un fiambre de pieza
      // fija tiene `unidad_medida = "kg"`, o sea que caía en la rama del kilo
      // y el snapshot lo congelaba como KG: "2 PIEZA" se guardaba como "2 KG",
      // y de ahí sale cuántos kilos acredita `confirmar-recepcion`.
      //
      // El candado del helper pasaba igual porque lo llamaba con un objeto
      // escrito a mano, donde los dos campos estaban. El camino real del POS
      // no los tenía.
      modoCompraProveedor: true, pesoEsFijo: true,
    },
  });
  const costosMap = {};
  const pbMap = {};
  const baseStockMap = {};
  const productosBaseMap = {}; // { es_combo } por productoBaseId (server-authoritative)
  productosBase.forEach((p) => {
    const costoBulto = Number(p.precio_costo) || 0;
    const factorPack = Math.max(1, Number(p.factor_pack) || 1);
    costosMap[p.id] = { costoBulto, factorPack };
    pbMap[p.id] = { categoria_id: p.categoria_id };
    productosBaseMap[p.id] = { es_combo: p.es_combo === true };
    baseStockMap[p.id] = {
      modoVentaDeposito: p.modoVentaDeposito || "PESO",
      pesoReferenciaKg: Number(p.pesoReferenciaKg || 0),
      // Lo exige `esProductoFiambre`, la puerta de `esFiambreFijo`: sin él una
      // pieza fija se lee como producto a granel al congelar la presentación.
      modoCompraProveedor: p.modoCompraProveedor || null,
      pesoEsFijo: p.pesoEsFijo ?? null,
      factorPack,
      modo_envio: p.modo_envio || null,
      unidad_medida: p.unidad_medida || "unidad",
    };
  });
  return { costosMap, pbMap, baseStockMap, productosBaseMap };
}
