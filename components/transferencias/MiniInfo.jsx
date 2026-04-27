"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR");
};

export default function MiniInfo({ t }) {
  return (
    <SunmiCard className="p-4 mt-1 mb-2 text-[13px]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
        <div className="flex items-start gap-2">
          <span className="font-semibold">Fecha envío:</span>
          <span className="sunmi-text-muted">{formatDateTime(t.fechaEnvio)}</span>
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold">Fecha recepción:</span>
          <span className="sunmi-text-muted">{formatDateTime(t.fechaRecepcion)}</span>
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold">Ítems:</span>
          <span>{t.cantidadItems}</span>
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold">Costo total:</span>
          <span className="sunmi-text-accent font-semibold">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </span>
        </div>

        <div className="flex items-start gap-2 sm:col-span-2">
          <span className="font-semibold">Diferencias:</span>
          {t.tieneDiferencias ? (
            <span className="sunmi-text-danger font-semibold">Sí</span>
          ) : (
            <span className="sunmi-text-success font-semibold">No</span>
          )}
        </div>
      </div>
    </SunmiCard>
  );
}
