// lib/stock/stockAlto.js
//
// EN NEGATIVO Y STOCK ALTO, POR UBICACIÓN. Los lee el Control de stock
// (`lib/stock/control/controlStockServer.js`) y Stock Locales
// (`/api/stock_locales/resumen` y `/api/stock_locales/listar`): una sola
// cuenta, así el número de un filtro y su lista no se separan entre pantallas.
//
// Salió de `controlStockServer.js` el 2026-10-29 tal cual estaba; la regla
// está en `lib/stock/control/controlStock.js` (`estaEnStockAlto`,
// `unidadDeLaCategoria`, `unidadDelMaximo`) y las pruebas de base del control
// la ejercen contra PostgreSQL.

import { unidadFisicaDeStock } from "@/lib/stock/escalaFisica";
import { whereUniversoStock } from "@/lib/stock/universoStock";
import { estaEnStockAlto, unidadDeLaCategoria, unidadDelMaximo } from "@/lib/stock/control/controlStock";

/**
 * El stock de ESTA ubicación por debajo de cero. `StockLocal` es único por
 * (local, producto), así que sin `localId` contaría la fila de otro local.
 */
export const whereEnNegativo = (localId) => ({ stock: { some: { localId, cantidad: { lt: 0 } } } });

// Lo que lee `unidadFisicaDeStock` para saber en qué unidad está el stock.
const SELECT_UNIDAD = Object.freeze({
  unidad_medida: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  modoVentaDeposito: true,
  pesoEsFijo: true,
});

/**
 * Los productos del universo de la ubicación con su categoría, lo que hace
 * falta para saber su unidad y el stock de la fila de ESTA ubicación.
 */
export function productosPorCategoria(db, localId, esDeposito) {
  return db.productoLocal.findMany({
    where: whereUniversoStock(localId, esDeposito),
    select: {
      id: true,
      base: { select: { ...SELECT_UNIDAD, categoria: { select: { id: true, nombre: true } } } },
      stock: { where: { localId }, take: 1, select: { cantidad: true } },
    },
  });
}

/** Los máximos de ESTA ubicación, por categoría. */
export async function maximosDe(db, localId) {
  const filas = await db.maximoStockCategoria.findMany({ where: { localId }, select: { categoriaId: true, maximo: true } });
  return new Map(filas.map((f) => [f.categoriaId, Number(f.maximo)]));
}

/**
 * Con los productos de la ubicación y sus máximos: cada categoría con su unidad
 * —la de la mayoría de sus productos— y su máximo, y los productos en Stock
 * alto, cada uno con `{ maximo, unidad }` para la tarjeta.
 */
export function stockAltoDeLaUbicacion(productos, maximos, esDeposito) {
  const porCategoria = new Map();
  for (const p of productos) {
    const c = p.base?.categoria;
    if (!c) continue;
    const unidad = unidadDelMaximo(unidadFisicaDeStock(p.base, esDeposito));
    const grupo = porCategoria.get(c.id) ?? { id: c.id, nombre: c.nombre, productos: [] };
    grupo.productos.push({ id: p.id, unidad, stock: Number(p.stock?.[0]?.cantidad ?? 0) });
    porCategoria.set(c.id, grupo);
  }
  const categorias = [];
  const stockAlto = new Map();
  for (const g of porCategoria.values()) {
    const unidadCategoria = unidadDeLaCategoria(g.productos.map((p) => p.unidad));
    const maximo = maximos.get(g.id) ?? null;
    categorias.push({ id: g.id, nombre: g.nombre, unidad: unidadCategoria, maximo });
    for (const p of g.productos) {
      if (estaEnStockAlto({ stock: p.stock, unidad: p.unidad, unidadCategoria, maximo })) {
        stockAlto.set(p.id, { maximo, unidad: unidadCategoria });
      }
    }
  }
  categorias.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { categorias, stockAlto };
}

/** Las dos consultas y la cuenta, para quien no necesita los productos aparte. */
export async function stockAltoDeUbicacion(db, localId, esDeposito) {
  const [productos, maximos] = await Promise.all([productosPorCategoria(db, localId, esDeposito), maximosDe(db, localId)]);
  return stockAltoDeLaUbicacion(productos, maximos, esDeposito);
}
