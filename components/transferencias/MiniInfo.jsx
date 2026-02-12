"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR");
};

export default function MiniInfo({ t }) {
  return (
    <SunmiCard className="p-4 mt-1 mb-2 animate-fade text-[13px] text-slate-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">

        {/* Fecha envío */}
        <div className="flex items-start gap-2">
          <span className="font-semibold">Fecha envío:</span>
          <span>{formatDateTime(t.fechaEnvio)}</span>
        </div>

        {/* Fecha recepción */}
        <div className="flex items-start gap-2">
          <span className="font-semibold">Fecha recepción:</span>
          <span>{formatDateTime(t.fechaRecepcion)}</span>
        </div>

        {/* Ítems */}
        <div className="flex items-start gap-2">
          <span className="font-semibold">Ítems:</span>
          <span>{t.cantidadItems}</span>
        </div>

        {/* Costo total */}
        <div className="flex items-start gap-2">
          <span className="font-semibold">Costo total:</span>
          <span className="text-amber-200 font-semibold">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </span>
        </div>

        {/* Diferencias */}
        <div className="flex items-start gap-2 sm:col-span-2">
          <span className="font-semibold">Diferencias:</span>
          {t.tieneDiferencias ? (
            <span className="text-red-400 font-semibold">Sí</span>
          ) : (
            <span className="text-emerald-400 font-semibold">No</span>
          )}
        </div>
      </div>
    </SunmiCard>
  );
}
