"use client";

// components/stock_diario/FilaStockDiario.jsx
//
// UN PRODUCTO EN EL VALOR DEL STOCK: nombre, "Apertura X → Cierre Y" en la
// presentación de Stock Locales, los avisos que correspondan, y a la derecha
// cuánto cambió su valor en pesos —o "Sin costo", nunca $0—.
//
// Es `FilaConImporte` CON `onAbrir`: tocarla despliega, debajo, el detalle que
// explica el cambio —cantidades, costos congelados, valores, movimiento físico
// y revalorización—. No navega: todo el detalle ya vino con la fila, así que
// abrirlo no pide nada al servidor. El detalle va AFUERA del botón de la fila,
// porque adentro de un botón no puede ir otro bloque interactivo ni texto
// seleccionable.

import { useState } from "react";

import FilaConImporte from "@/components/periodo/FilaConImporte";
import { renglonDeValor } from "@/lib/stock/libro/stockDiarioPantalla";

export default function FilaStockDiario({ item, respuesta }) {
  const [abierto, setAbierto] = useState(false);
  const r = renglonDeValor(item, respuesta);
  return (
    <>
      <FilaConImporte
        importe={r.importe}
        onAbrir={r.detalle.length ? () => setAbierto((x) => !x) : undefined}
        etiqueta={`${abierto ? "Cerrar" : "Ver"} el detalle de ${r.nombre}`}
      >
        <div className="text-base font-semibold sunmi-text-strong">{r.nombre}</div>
        <div className="text-sm2 sunmi-text-muted">{r.linea}</div>
        {r.avisos.length > 0 && <div className="text-sm2 font-medium sunmi-text-muted">{r.avisos.join(" · ")}</div>}
      </FilaConImporte>
      {abierto && (
        <div className="px-4 pb-3.5 grid grid-cols-2 gap-3" data-detalle-valor="">
          {r.detalle.map((d) => (
            <div key={d.rotulo} className="min-w-0">
              <div className="text-sm2 sunmi-text-muted">{d.rotulo}</div>
              <div className="text-sm3 font-semibold sunmi-text-strong tabular-nums">{d.valor}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
