"use client";

// components/stock_diario/ResumenValorDelStock.jsx
//
// EL BLOQUE DE ARRIBA DEL VALOR DEL STOCK: cuánto aumentó o disminuyó el
// capital en mercadería, y debajo el valor inicial, el final —"Ahora" si el
// período sigue—, cuánto fue movimiento físico y cuánto revalorización.
//
// El dibujo es `ResumenConImporte`, el de Transferencias, Pagos y Gastos, con
// sus columnas en `detalle` como las del Stock Diario: las mismas clases. El
// tránsito va DEBAJO de las columnas y dicho aparte, porque no es stock
// disponible. El aviso enciende el borde cuando el número no es completo o
// exacto: costos faltantes, stock negativo, un período que empieza antes del
// historial de costos.
//
// Todo texto sale de `textosDelValor`; acá no se formatea ni se calcula nada.

import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import { textosDelValor } from "@/lib/stock/libro/stockDiarioPantalla";

export default function ResumenValorDelStock({ respuesta }) {
  const t = textosDelValor(respuesta);
  if (!t) return null;
  return (
    <ResumenConImporte
      rotulo={t.rotulo}
      importe={t.importe}
      subtitulo={t.subtitulo}
      nota={t.nota}
      detalle={
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {t.columnas.map((c) => (
              <div key={c.clave} className="min-w-0">
                <div className="text-sm2 sunmi-text-muted">{c.rotulo}</div>
                <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">{c.valor}</div>
              </div>
            ))}
          </div>
          {t.transito && <div className="text-sm2 sunmi-text-muted">{t.transito}</div>}
        </div>
      }
      aviso={t.aviso}
    />
  );
}
