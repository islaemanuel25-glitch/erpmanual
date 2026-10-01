"use client";

// components/stock_diario/CapitalEnMercaderia.jsx
//
// LA TARJETA DEL CAPITAL (Figma EVJ2KvVCrY0oVSowfboymQ, 329-624): cuánto vale la
// mercadería ahora —o al cierre, si el período terminó—, cuánto cambió y su %
// sobre la apertura, la apertura, la evolución en un gráfico y el tránsito
// aparte. Todo a costo: lo dice la píldora. Tiene la caja de
// `ResumenConImporte`; no lo usa porque su cifra va en otra escala y lleva la
// píldora y el gráfico, que esa pieza no tiene.

import SunmiPill from "@/components/sunmi/SunmiPill";
import { textosDelCapital } from "@/lib/stock/libro/stockDiarioPantalla";

import GraficoDeEvolucion from "./GraficoDeEvolucion";

export default function CapitalEnMercaderia({ respuesta }) {
  const t = textosDelCapital(respuesta);
  if (!t) return null;
  return (
    <section className="sunmi-bg-card border sunmi-border rounded-xl2 p-4 space-y-3" data-capital>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs sunmi-text-muted">Capital en mercadería</div>
        <SunmiPill color="slate">A COSTO</SunmiPill>
      </div>

      <div>
        <div className="text-sm2 sunmi-text-muted">{t.rotuloFinal}</div>
        <div className="text-xl3 font-semibold sunmi-text-strong tabular-nums">{t.final}</div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-base2 font-semibold sunmi-text-strong tabular-nums">{t.cambio}</span>
        {t.porcentaje && <SunmiPill color="amber">{t.porcentaje}</SunmiPill>}
      </div>

      <div className="text-sm2 sunmi-text-muted tabular-nums">{t.apertura}</div>

      <GraficoDeEvolucion valor={respuesta.valor} />

      {t.transito && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <div className="text-sm2 sunmi-text-muted">{t.transito}</div>
        </>
      )}
    </section>
  );
}
