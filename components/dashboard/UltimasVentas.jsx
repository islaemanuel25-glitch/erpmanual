"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { Clock } from "lucide-react";

function formatHora(fecha) {
  const d = new Date(fecha);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

const FORMA_PAGO = {
  efectivo: { label: "Efectivo", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  digital: { label: "Mercado Pago", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  mixto: { label: "Mixto", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  fiado: { label: "Fiado", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

const BOX_COLOR = {
  efectivo: "bg-emerald-500/20",
  digital: "bg-blue-500/20",
  mixto: "bg-slate-500/20",
  fiado: "bg-amber-500/20",
};

function getPagoMeta(formaPago) {
  return FORMA_PAGO[formaPago] || {
    label: formaPago || "—",
    className: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  };
}

export default function UltimasVentas({ ventas = [], cargando = false }) {
  const { theme } = useSunmiTheme();

  if (cargando) {
    return (
      <SunmiCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold opacity-80">Últimas ventas</h3>
        </div>
        <div className="flex items-center justify-center py-8 opacity-40">
          <Clock size={20} className="animate-spin" />
        </div>
      </SunmiCard>
    );
  }

  if (!ventas.length) {
    return (
      <SunmiCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold opacity-80">Últimas ventas</h3>
        </div>
        <p className="text-sm opacity-50 py-4 text-center">
          Sin ventas registradas
        </p>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold opacity-80">Últimas ventas</h3>
        <Link
          href="/modulos/reportes-ventas"
          className="text-xs font-medium opacity-60 hover:opacity-90 transition"
        >
          Ver todas
        </Link>
      </div>
      <div className="overflow-y-auto max-h-[320px]">
        {ventas.map((v, i) => {
          const pago = getPagoMeta(v.formaPago);
          const boxColor = BOX_COLOR[v.formaPago] || "bg-slate-500/20";
          return (
            <div
              key={v.id}
              className={`
                flex items-center gap-3 py-2.5 px-1
                ${i > 0 ? "border-t border-current/5" : ""}
                hover:bg-current/[0.03] rounded-lg transition
              `}
            >
              <span className="text-[11px] font-mono opacity-50 w-7 shrink-0">
                #{v.numero}
              </span>
              <div
                className={`w-8 h-8 rounded-md shrink-0 ${boxColor}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate leading-tight">
                  {v.cliente}
                </p>
                <p className="text-[11px] opacity-50 leading-none mt-0.5">
                  {pago.label} · {formatHora(v.fecha)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular-nums">
                  $
                  {v.total.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${pago.className}`}
                >
                  {pago.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SunmiCard>
  );
}
