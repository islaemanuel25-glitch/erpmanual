// components/transferencias/ColumnSettingsModal.jsx
"use client";

export default function ColumnSettingsModal({ open, onClose, columns, setColumns }) {
  if (!open) return null;

  const toggle = (key) => {
    setColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div
      className="
        fixed inset-0 bg-black/50 backdrop-blur-sm
        flex items-center justify-center
        z-50 animate-fade
      "
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-[320px] shadow-xl">
        <h2 className="text-slate-100 text-lg font-semibold mb-4">
          Configurar columnas
        </h2>

        <div className="flex flex-col gap-3 max-h-[350px] overflow-auto pr-2">
          {Object.entries(columns).map(([key, value]) => (
            <label
              key={key}
              className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded-lg border border-slate-700"
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

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="
              px-4 py-2 text-sm rounded-lg
              bg-slate-700 hover:bg-slate-600
              text-slate-200 border border-slate-600
            "
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
