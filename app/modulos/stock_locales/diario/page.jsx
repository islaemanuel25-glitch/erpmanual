// app/modulos/stock_locales/diario/page.jsx
//
// DONDE VIVÍA EL STOCK DIARIO: HOY SOLO REDIRIGE.
//
// La pantalla se mudó a Finanzas —`/modulos/finanzas/stock-diario`— y dejó de
// aparecer en el grupo Stock. La ruta vieja se conserva para que un enlace
// guardado, un historial o un atajo no caigan en un 404: llevan a la nueva, con
// el mismo local, período y búsqueda que traían en la dirección.
//
// No dibuja nada propio: una segunda copia de la pantalla es lo que este
// archivo existe para evitar. `redirect` corre en el servidor antes de dibujar,
// así que no hay parpadeo. Mismo patrón que `transferencias/corte-de-semana`.

import { redirect } from "next/navigation";

import { RUTA_STOCK_DIARIO } from "@/lib/stock/libro/rutasStockDiario";

export default async function StockDiarioAnteriorRedirige({ searchParams }) {
  const sp = (await searchParams) || {};
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(sp)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) {
      if (v != null) qs.append(clave, String(v));
    }
  }
  const s = qs.toString();
  redirect(s ? `${RUTA_STOCK_DIARIO}?${s}` : RUTA_STOCK_DIARIO);
}
