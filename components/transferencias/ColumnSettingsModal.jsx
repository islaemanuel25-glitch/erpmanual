"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ColumnSettingsModal({
  open,
  onClose,
  columns,
  setColumns,
}) {
  const { ui } = useUIConfig();
  
  if (!open) return null;

  const toggle = (key) => {
    setColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade"
      style={{
        padding: ui.helpers.spacing("lg"),
      }}
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden"
        style={{
          borderRadius: ui.helpers.radius("xl"),
          padding: parseInt(ui.helpers.spacing("lg")) * 1.25,
          width: "100%",
          maxWidth: parseInt(ui.helpers.controlHeight()) * 10,
          maxHeight: parseInt(ui.helpers.controlHeight()) * 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          className="flex items-start justify-between"
          style={{
            marginBottom: ui.helpers.spacing("lg"),
          }}
        >
          <div>
            <h2
              className="text-slate-100 font-semibold"
              style={{
                fontSize: ui.helpers.font("lg"),
              }}
            >
              Configurar columnas
            </h2>
            <p
              className="text-slate-400"
              style={{
                fontSize: ui.helpers.font("xs"),
                marginTop: ui.helpers.spacing("xs"),
              }}
            >
              Mostrá u ocultá columnas de la tabla de transferencias.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-300 hover:text-amber-300 leading-none"
            style={{
              fontSize: ui.helpers.font("lg"),
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* LISTA DE CHECKBOXES */}
        <div
          className="flex flex-col overflow-y-auto custom-scrollbar"
          style={{
            gap: ui.helpers.spacing("sm"),
            paddingRight: ui.helpers.spacing("xs"),
            maxHeight: parseInt(ui.helpers.controlHeight()) * 14,
          }}
        >
          {Object.entries(columns).map(([key, value]) => (
            <label
              key={key}
              className="flex items-center justify-between bg-slate-800 border border-slate-700 hover:border-amber-400/70 transition"
              style={{
                gap: ui.helpers.spacing("md"),
                paddingLeft: ui.helpers.spacing("md"),
                paddingRight: ui.helpers.spacing("md"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                borderRadius: ui.helpers.radius("lg"),
              }}
            >
              <span
                className="text-slate-200"
                style={{
                  fontSize: ui.helpers.font("sm"),
                }}
              >
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
                className="accent-amber-400 cursor-pointer"
                style={{
                  width: parseInt(ui.helpers.controlHeight()) * 0.5,
                  height: parseInt(ui.helpers.controlHeight()) * 0.5,
                }}
              />
            </label>
          ))}
        </div>

        {/* FOOTER */}
        <div
          className="flex justify-end"
          style={{
            marginTop: parseInt(ui.helpers.spacing("lg")) * 1.25,
          }}
        >
          <button
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600"
            style={{
              paddingLeft: ui.helpers.spacing("lg"),
              paddingRight: ui.helpers.spacing("lg"),
              paddingTop: ui.helpers.spacing("sm"),
              paddingBottom: ui.helpers.spacing("sm"),
              borderRadius: ui.helpers.radius("lg"),
              fontSize: ui.helpers.font("sm"),
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
