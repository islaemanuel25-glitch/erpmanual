"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";

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

  const LABELS = {
    id: "ID",
    origen: "Origen",
    destino: "Destino",
    estado: "Estado",
    recepcion: "Recepción",
    items: "Ítems",
    importe: "Importe",
    fechaEnvio: "Fecha envío",
    fechaRecepcion: "Fecha recepción",
    acciones: "Acciones",
  };

  return (
    <div
      className="fixed inset-0 sunmi-overlay flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[80vh] overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--app-border)",
          color: "var(--app-fg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Configurar columnas</h2>
            <p className="sunmi-text-muted text-xs mt-1">
              Mostrá u ocultá columnas de la tabla de transferencias.
            </p>
          </div>
          <button
            onClick={onClose}
            className="sunmi-text-muted hover:text-[var(--app-fg)] text-lg leading-none px-2 transition-colors"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* LISTA DE CHECKBOXES */}
        <div className="flex flex-col gap-2 pr-1 max-h-[55vh] overflow-y-auto">
          {Object.entries(columns).map(([key, value]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition cursor-pointer"
              style={{
                background: "var(--app-input-bg)",
                border: "1px solid var(--app-input-border)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--pos-accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--app-input-border)"; }}
            >
              <span className="text-sm">{LABELS[key] || key}</span>
              <input
                type="checkbox"
                checked={value}
                onChange={() => toggle(key)}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: "var(--pos-accent)" }}
              />
            </label>
          ))}
        </div>

        {/* FOOTER */}
        <div className="mt-5 flex justify-end">
          <SunmiButton color="slate" onClick={onClose}>
            Cerrar
          </SunmiButton>
        </div>
      </div>
    </div>
  );
}
