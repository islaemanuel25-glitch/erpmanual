"use client";

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR");
};

export default function MiniInfo({ t }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 mt-1 mb-2 animate-fade text-[13px] text-slate-200 shadow-inner">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">

        {/* Fecha envío */}
        <div className="flex items-start gap-2">
          <span className="font-semibold text-slate-100">Fecha envío:</span>
          <span className="text-slate-200">{formatDateTime(t.fechaEnvio)}</span>
        </div>

        {/* Fecha recepción */}
        <div className="flex items-start gap-2">
          <span className="font-semibold text-slate-100">Fecha recepción:</span>
          <span className="text-slate-200">{formatDateTime(t.fechaRecepcion)}</span>
        </div>

        {/* Ítems */}
        <div className="flex items-start gap-2">
          <span className="font-semibold text-slate-100">Ítems:</span>
          <span className="text-slate-200">{t.cantidadItems}</span>
        </div>

        {/* Costo total */}
        <div className="flex items-start gap-2">
          <span className="font-semibold text-slate-100">Costo total:</span>
          <span className="text-amber-200 font-semibold">
            ${Number(t.totalCosto || 0).toFixed(2)}
          </span>
        </div>

        {/* Diferencias */}
        <div className="flex items-start gap-2 sm:col-span-2">
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
