"use client";

export default function ColumnSettingsModal({
  open,
  onClose,
  columns,
  setColumns,
}) {
  if (!open) return null;

  const toggle = (key) => {
    setColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade px-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-slate-100 text-lg font-semibold">
              Configurar columnas
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              Mostrá u ocultá columnas de la tabla de transferencias.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-300 hover:text-amber-300 text-lg leading-none px-2"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* LISTA DE CHECKBOXES */}
        <div className="flex flex-col gap-2 pr-1 max-h-[55vh] overflow-y-auto custom-scrollbar">
          {Object.entries(columns).map(([key, value]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 hover:border-amber-400/70 transition"
            >
              <span className="text-slate-200 text-sm">
                {(() => {
                  switch (key) {
                    case "id": return "ID";
                    case "origen": return "Origen";
                    case "destino": return "Destino";
                    case "estado": return "Estado";
                    case "recepcion": return "Recepción";
                    case "items": return "Ítems";
                    case "importe": return "Importe";
                    case "fechaEnvio": return "Fecha envío";
                    case "fechaRecepcion": return "Fecha recepción";
                    case "acciones": return "Acciones";
                    default: return key;
                  }
                })()}
              </span>

              <input
                type="checkbox"
                checked={value}
                onChange={() => toggle(key)}
                className="w-4 h-4 accent-amber-400 cursor-pointer"
              />
            </label>
          ))}
        </div>

        {/* FOOTER */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
