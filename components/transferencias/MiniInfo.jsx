"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR");
};

export default function MiniInfo({ t }) {
  const { ui } = useUIConfig();

  return (
    <div
      className="bg-slate-900/80 border border-slate-700 animate-fade text-slate-200 shadow-inner"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        padding: ui.helpers.spacing("lg"),
        marginTop: ui.helpers.spacing("xs"),
        marginBottom: ui.helpers.spacing("sm"),
        fontSize: ui.helpers.font("sm"),
      }}
    >
      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{
          gap: `${ui.helpers.spacing("sm")} ${ui.helpers.spacing("lg")}`,
        }}
      >
        {/* Fecha envío */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span className="font-semibold text-slate-100">Fecha envío:</span>
          <span className="text-slate-200">{formatDateTime(t.fechaEnvio)}</span>
        </div>

        {/* Fecha recepción */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span className="font-semibold text-slate-100">Fecha recepción:</span>
          <span className="text-slate-200">{formatDateTime(t.fechaRecepcion)}</span>
        </div>

        {/* Ítems */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span className="font-semibold text-slate-100">Ítems:</span>
          <span className="text-slate-200">{t.cantidadItems}</span>
        </div>

        {/* Costo total */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span className="font-semibold text-slate-100">Costo total:</span>
          <span className="text-amber-200 font-semibold">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </span>
        </div>

        {/* Diferencias */}
        <div
          className="flex items-start sm:col-span-2"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span className="font-semibold text-slate-100">Diferencias:</span>
          {t.tieneDiferencias ? (
            <span className="text-red-400 font-semibold">Sí</span>
          ) : (
            <span className="text-emerald-400 font-semibold">No</span>
          )}
        </div>
      </div>
    </div>
  );
}
