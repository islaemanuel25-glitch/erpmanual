"use client";

// components/stock_diario/FilaStockDiario.jsx
//
// UN PRODUCTO EN EL STOCK DIARIO: nombre, "Apertura X → Ahora Y" (o "→ Cierre
// Y"), los avisos que correspondan, y a la derecha la variación con su unidad.
//
// Es `FilaConImporte` SIN `onAbrir`: el diseño dibuja "Ver ›", pero el detalle
// del producto todavía no está diseñado en Figma, y un "Ver" que no lleva a
// ningún lado es un botón roto. Sin `onAbrir` la pieza no dibuja el "Ver" ni
// se vuelve tocable. Cuando el detalle exista, se le pasa `onAbrir` y listo.
//
// Sin variación —falta la apertura, o una punta no existe— la columna de la
// derecha queda vacía: no se escribe un 0 que el libro no dijo.

import FilaConImporte from "@/components/periodo/FilaConImporte";
import { renglonDeProducto } from "@/lib/stock/libro/stockDiarioPantalla";

export default function FilaStockDiario({ item, respuesta }) {
  const r = renglonDeProducto(item, respuesta);
  return (
    <FilaConImporte importe={r.variacion}>
      <div className="text-base font-semibold sunmi-text-strong">{r.nombre}</div>
      <div className="text-sm2 sunmi-text-muted">{r.linea}</div>
      {r.avisos.length > 0 && <div className="text-sm2 font-medium sunmi-text-muted">{r.avisos.join(" · ")}</div>}
    </FilaConImporte>
  );
}
