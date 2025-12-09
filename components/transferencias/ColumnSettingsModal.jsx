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
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 animate-fade"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: ui.helpers.spacing("lg"),
      }}
      onClick={onClose}
    >
      <div
        className="border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          borderColor: "var(--sunmi-card-border)",
          borderWidth: "1px",
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
              className="font-semibold"
              style={{
                color: "var(--sunmi-text)",
                fontSize: ui.helpers.font("lg"),
              }}
            >
              Configurar columnas
            </h2>
            <p
              style={{
                color: "var(--sunmi-text)",
                opacity: 0.7,
                fontSize: ui.helpers.font("xs"),
                marginTop: ui.helpers.spacing("xs"),
              }}
            >
              Mostrá u ocultá columnas de la tabla de transferencias.
            </p>
          </div>

          <button
            onClick={onClose}
            className="leading-none"
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.8,
              fontSize: ui.helpers.font("lg"),
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#fcd34d"; // amber-300
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--sunmi-text)";
              e.currentTarget.style.opacity = "0.8";
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
              className="flex items-center justify-between border transition"
              style={{
                backgroundColor: "var(--sunmi-table-row-bg)",
                borderColor: "var(--sunmi-card-border)",
                borderWidth: "1px",
                gap: ui.helpers.spacing("md"),
                paddingLeft: ui.helpers.spacing("md"),
                paddingRight: ui.helpers.spacing("md"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                borderRadius: ui.helpers.radius("lg"),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(251,191,36,0.7)"; // amber-400/70
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--sunmi-card-border)";
              }}
            >
              <span
                style={{
                  color: "var(--sunmi-text)",
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
            className="border"
            style={{
              backgroundColor: "var(--sunmi-table-row-bg)",
              color: "var(--sunmi-text)",
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
              paddingLeft: ui.helpers.spacing("lg"),
              paddingRight: ui.helpers.spacing("lg"),
              paddingTop: ui.helpers.spacing("sm"),
              paddingBottom: ui.helpers.spacing("sm"),
              borderRadius: ui.helpers.radius("lg"),
              fontSize: ui.helpers.font("sm"),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
