"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";

function getBadge(modo, posEstado) {
  if (modo === "manual" && posEstado === "Solicitado") {
    return { label: "Pedido solicitado", cls: "sunmi-state-warning sunmi-text-warning" };
  }
  if (modo === "manual") {
    return { label: "Pedido manual", cls: "sunmi-badge-link" };
  }
  return { label: "POS activa", cls: "sunmi-state-success sunmi-text-success" };
}

export default function Encabezado({ origen, destino, me, modo, posEstado }) {
  const badge = getBadge(modo, posEstado);

  return (
    <SunmiCard className="p-4 text-[12px] mb-4">

      {/* =============================== */}
      {/* TITULO POS */}
      {/* =============================== */}
      <div className="flex items-center justify-between mb-4">

        {/* ICONO POS */}
        <div className="flex items-center gap-3">
          <div
            className="
              h-11 w-11
              rounded-2xl
              sunmi-badge-accent
              flex items-center justify-center
              font-black text-[13px]
              shadow-md
            "
          >
            POS
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide sunmi-text-muted">
              {modo === "manual" ? "Pedido de mercadería" : "Sesión de preparación"}
            </div>
            <div className="text-[15px] font-semibold">
              {modo === "manual" ? "Pedido al depósito" : "Transferencia de mercadería"}
            </div>
          </div>
        </div>

        {/* ESTADO */}
        <span
          className={`
            px-3 py-1
            text-[10px] font-semibold
            rounded-full
            ${badge.cls}
          `}
        >
          ● {badge.label}
        </span>
      </div>

      {/* =============================== */}
      {/* ORIGEN → DESTINO */}
      {/* =============================== */}
      <div className="flex items-center justify-center mb-4">
        <span className="text-[13px] font-semibold">
          {origen?.nombre || "-"}
        </span>

        <div className="mx-3 flex items-center">
          <div className="w-10 h-[2px] relative overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--pos-accent) 40%, transparent)' }}>
            <div className="absolute inset-0 animate-[pulseLine_1.4s_linear_infinite]" style={{ background: 'var(--pos-accent)' }}></div>
          </div>

          <span className="ml-2 sunmi-text-accent text-[16px]">→</span>
        </div>

        <span className="text-[13px] font-semibold">
          {destino?.nombre || "-"}
        </span>
      </div>

      {/* =============================== */}
      {/* TARJETAS RESUMEN */}
      {/* =============================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* ORIGEN */}
        <div
          className="
            sunmi-surface-soft
            rounded-xl
            px-4 py-3
            shadow-inner
            sunmi-border
          "
        >
          <span className="text-[11px] uppercase tracking-wide sunmi-text-muted">
            {modo === "manual" ? "Depósito" : "Origen"}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[13px] font-medium truncate">
              {origen?.nombre || "-"}
            </span>
          </div>
        </div>

        {/* DESTINO */}
        <div
          className="
            sunmi-surface-soft
            rounded-xl
            px-4 py-3
            shadow-inner
            sunmi-border
          "
        >
          <span className="text-[11px] uppercase tracking-wide sunmi-text-muted">
            {modo === "manual" ? "Mi local" : "Destino"}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[13px] font-medium truncate">
              {destino?.nombre || "-"}
            </span>
          </div>
        </div>

        {/* USUARIO */}
        <div
          className="
            sunmi-surface-soft
            rounded-xl
            px-4 py-3
            shadow-inner
            sunmi-border
          "
        >
          <span className="text-[11px] uppercase tracking-wide sunmi-text-muted">
            Usuario
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[13px] font-medium truncate">
              {me?.nombre || "Usuario"}
            </span>
          </div>
        </div>
      </div>

      {/* =============================== */}
      {/* ANIMACIONES */}
      {/* =============================== */}
      <style>{`
        @keyframes pulseLine {
          0% { transform: translateX(-100%); opacity: 0.3; }
          50% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0.3; }
        }
      `}</style>
    </SunmiCard>
  );
}
