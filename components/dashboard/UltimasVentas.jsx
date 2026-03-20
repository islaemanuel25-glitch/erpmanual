"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { Clock, Receipt } from "lucide-react";
import ModalDetalleVenta from "./ModalDetalleVenta";

function formatHora(fecha) {
  const d = new Date(fecha);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

const FORMA_PAGO = {
  efectivo: { label: "Efectivo", className: "sunmi-state-success sunmi-text-success" },
  digital: { label: "Mercado Pago", className: "sunmi-badge-link" },
  mixto: { label: "Mixto", className: "sunmi-badge-muted" },
  fiado: { label: "Fiado", className: "sunmi-badge-muted" },
};

function getPagoMeta(formaPago) {
  return FORMA_PAGO[formaPago] || {
    label: formaPago || "—",
    className: "sunmi-badge-muted",
  };
}

const CARD_BASE = "flex flex-col border border-current/[0.06] shadow-sm";

export default function UltimasVentas({ ventas = [], cargando = false, fixedHeight = false }) {
  const [ventaIdAbierta, setVentaIdAbierta] = useState(null);
  const wrapClass = fixedHeight ? "h-full min-h-0" : "";
  const cardClass = fixedHeight
    ? `${CARD_BASE} h-full p-5 flex flex-col min-h-0`
    : `${CARD_BASE} p-5 min-h-[280px] flex flex-col`;

  if (cargando) {
    return (
      <div className={wrapClass}>
        <SunmiCard className={cardClass}>
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-sm font-semibold">Últimas ventas</h3>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0 sunmi-text-muted">
            <Clock size={22} className="animate-spin" />
          </div>
        </SunmiCard>
      </div>
    );
  }

  if (!ventas.length) {
    return (
      <div className={wrapClass}>
        <SunmiCard className={cardClass}>
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-sm font-semibold">Últimas ventas</h3>
            <Link
              href="/modulos/pos-ventas"
              className="text-xs font-medium sunmi-text-muted hover:opacity-80 transition"
            >
              Nueva venta
            </Link>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-center min-h-0">
            <div className="w-12 h-12 rounded-full bg-current/[0.05] flex items-center justify-center mb-3">
              <Receipt size={22} className="sunmi-text-muted" />
            </div>
            <p className="text-sm font-medium">Aún no hay ventas</p>
            <p className="text-xs sunmi-text-muted mt-1 max-w-[200px]">
              Las ventas del día aparecerán aquí
            </p>
          </div>
        </SunmiCard>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <SunmiCard className={fixedHeight ? `${CARD_BASE} h-full p-5 overflow-hidden flex flex-col min-h-0` : `${CARD_BASE} p-5 overflow-hidden`}>
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold opacity-80">Últimas ventas</h3>
          <Link
            href="/modulos/reportes-ventas"
            className="text-xs font-medium sunmi-text-muted hover:opacity-85 transition"
          >
            Ver todas
          </Link>
        </div>
        <div className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 ${!fixedHeight ? "max-h-[320px]" : ""}`}>
          {ventas.map((v, i) => {
            const pago = getPagoMeta(v.formaPago);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVentaIdAbierta(v.id)}
                className={`
                  w-full group flex items-center gap-3 py-2.5 px-3 rounded-lg cursor-pointer text-left
                  ${i > 0 ? "border-t border-current/[0.04]" : ""}
                  transition-colors duration-100
                  hover:bg-[var(--pos-surface-hover)]
                `}
              >
                <span className="text-[11px] font-mono sunmi-text-muted w-7 shrink-0">
                  #{v.numero}
                </span>
                <div
                  className="w-7 h-7 rounded-md shrink-0 sunmi-surface-soft"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate leading-tight">
                    {v.cliente}
                  </p>
                  <p className="text-[11px] sunmi-text-muted mt-1 flex items-center gap-1.5">
                    <span>{formatHora(v.fecha)}</span>
                    <span className="opacity-40">·</span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${pago.className}`}
                    >
                      {pago.label}
                    </span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    $
                    {v.total.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 sunmi-text-muted opacity-50 group-hover:opacity-80 transition-opacity" />
              </button>
            );
          })}
        </div>
      </SunmiCard>
      <ModalDetalleVenta
        open={!!ventaIdAbierta}
        ventaId={ventaIdAbierta}
        onClose={() => setVentaIdAbierta(null)}
      />
    </div>
  );
}
