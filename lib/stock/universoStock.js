// lib/stock/universoStock.js
//
// QUÉ PRODUCTOS LISTA STOCK LOCALES EN UNA UBICACIÓN: los `ProductoLocal`
// activos, de una ficha activa, que no son combo, y en el depósito los que el
// depósito ve (`productoVisibleWhere`).
//
// Vivía escrito dos veces adentro de `app/api/stock_locales/listar/route.js`
// —una en la rama del local y otra en la del depósito— y lo necesitó el Control
// de stock para que "contados de N" sea el mismo N que el listado de Stock. Una
// tercera copia al lado habría sido el mismo universo escrito tres veces.
//
// Los filtros de la pantalla (texto, categoría, área, estado) se agregan ENCIMA:
// esto es solo la base.

import { productoVisibleWhere } from "@/lib/visibilidad";

/** El `where` de `ProductoLocal` del universo de Stock en esta ubicación. */
export function whereUniversoStock(localId, esDeposito) {
  return {
    localId,
    activo: true,
    base: {
      activo: true,
      es_combo: false,
      ...(esDeposito ? productoVisibleWhere(localId) : {}),
    },
  };
}
