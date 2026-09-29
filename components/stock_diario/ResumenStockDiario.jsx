"use client";

// components/stock_diario/ResumenStockDiario.jsx
//
// EL BLOQUE DE ACTIVIDAD DEL STOCK DIARIO (Figma 300:478, "Actividad de hoy").
//
// El dibujo es `ResumenConImporte`, el de Transferencias, Pagos y Gastos: el
// rótulo chico, la cifra grande, y el aviso que enciende el borde cuando el
// período está en curso o es parcial. Las tres columnas —Entradas, Salidas, En
// tránsito— van en su `detalle`.
//
// Son CONTEOS: movimientos de entrada, de salida, y productos que terminan el
// período con tránsito. Nunca cantidades sumadas: sumar UNIDAD con KG no dice
// nada. Un conteo que la API no mandó se escribe "—", no 0.

import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import { columnasDelResumen, textosDelResumen } from "@/lib/stock/libro/stockDiarioPantalla";

export default function ResumenStockDiario({ respuesta }) {
  const { rotulo, aviso } = textosDelResumen(respuesta);
  const conMovimientos = respuesta.conteos?.conMovimientos;

  return (
    <ResumenConImporte
      rotulo={rotulo}
      importe={
        <>
          {typeof conMovimientos === "number" ? conMovimientos : "—"}{" "}
          <span className="text-sm3 font-normal sunmi-text-muted">productos con movimientos</span>
        </>
      }
      subtitulo={null}
      detalle={
        <div className="grid grid-cols-3 gap-3">
          {columnasDelResumen(respuesta).map((c) => (
            <div key={c.clave} className="min-w-0">
              <div className="text-sm2 sunmi-text-muted">{c.rotulo}</div>
              <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">{c.valor ?? "—"}</div>
              <div className="text-sm2 sunmi-text-muted">{c.unidad}</div>
            </div>
          ))}
        </div>
      }
      aviso={aviso}
    />
  );
}
