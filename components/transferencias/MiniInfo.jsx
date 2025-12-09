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
      className="border animate-fade shadow-inner"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        opacity: 0.9,
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        color: "var(--sunmi-text)",
      }}
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
          <span
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Fecha envío:
          </span>
          <span style={{ color: "var(--sunmi-text)", opacity: 0.9 }}>
            {formatDateTime(t.fechaEnvio)}
          </span>
        </div>

        {/* Fecha recepción */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Fecha recepción:
          </span>
          <span style={{ color: "var(--sunmi-text)", opacity: 0.9 }}>
            {formatDateTime(t.fechaRecepcion)}
          </span>
        </div>

        {/* Ítems */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Ítems:
          </span>
          <span style={{ color: "var(--sunmi-text)", opacity: 0.9 }}>
            {t.cantidadItems}
          </span>
        </div>

        {/* Costo total */}
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <span
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Costo total:
          </span>
          <span
            className="font-semibold"
            style={{
              color: "#fde047", // amber-200
            }}
          >
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
          <span
            className="font-semibold"
            style={{
              color: "var(--sunmi-text)",
            }}
          >
            Diferencias:
          </span>
          {t.tieneDiferencias ? (
            <span
              className="font-semibold"
              style={{
                color: "#f87171", // red-400
              }}
            >
              Sí
            </span>
          ) : (
            <span
              className="font-semibold"
              style={{
                color: "#34d399", // emerald-400
              }}
            >
              No
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
