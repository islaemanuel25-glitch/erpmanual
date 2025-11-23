// components/transferencias/MiniInfo.jsx
"use client";

export default function MiniInfo({ t }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-3 mt-1 mb-2 animate-fade text-[13px] text-slate-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">

        <div>
          <span className="font-semibold">Fecha envío:</span>{" "}
          {t.fechaEnvio ? new Date(t.fechaEnvio).toLocaleString() : "-"}
        </div>

        <div>
          <span className="font-semibold">Fecha recepción:</span>{" "}
          {t.fechaRecepcion ? new Date(t.fechaRecepcion).toLocaleString() : "-"}
        </div>

        <div>
          <span className="font-semibold">Ítems:</span> {t.cantidadItems}
        </div>

        <div>
          <span className="font-semibold">Costo total:</span>{" "}
          ${Number(t.totalCosto || 0).toFixed(2)}
        </div>

        <div>
          <span className="font-semibold">Diferencias:</span>{" "}
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
