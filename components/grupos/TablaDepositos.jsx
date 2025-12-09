"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function TablaDepositos({ depositos, onQuitar }) {
  const { ui } = useUIConfig();

  if (!depositos || depositos.length === 0) {
    return (
      <div
        className="border text-center"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          color: "var(--sunmi-text)",
          opacity: 0.6,
          borderColor: "var(--sunmi-card-border)",
          borderWidth: "1px",
        }}
        style={{
          borderRadius: ui.helpers.radius("md"),
          padding: ui.helpers.spacing("lg"),
        }}
      >
        No hay depósitos asignados al grupo.
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto shadow-sm border"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
      }}
      style={{
        borderRadius: ui.helpers.radius("lg"),
      }}
    >
      <table
        className="w-full"
        style={{
          fontSize: ui.helpers.font("sm"),
        }}
      >
        <thead
          style={{
            backgroundColor: "var(--sunmi-table-header-bg)",
            color: "var(--sunmi-text)",
          }}
        >
          <tr>
            <th
              className="text-left"
              style={{
                paddingLeft: ui.helpers.spacing("lg"),
                paddingRight: ui.helpers.spacing("lg"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
              }}
            >
              #ID
            </th>
            <th
              className="text-left"
              style={{
                paddingLeft: ui.helpers.spacing("lg"),
                paddingRight: ui.helpers.spacing("lg"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
              }}
            >
              Nombre del Depósito
            </th>
            <th
              className="text-center"
              style={{
                paddingLeft: ui.helpers.spacing("lg"),
                paddingRight: ui.helpers.spacing("lg"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                width: parseInt(ui.helpers.controlHeight()) * 4,
              }}
            >
              Acción
            </th>
          </tr>
        </thead>
        <tbody>
          {depositos.map((d) => (
            <tr
              key={d.localId}
              className="border-t transition-colors"
              style={{
                borderTopColor: "var(--sunmi-card-border)",
                borderTopWidth: "1px",
                backgroundColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <td
                style={{
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                {d.local.id}
              </td>
              <td
                className="font-medium"
                style={{
                  color: "var(--sunmi-text)",
                }}
                style={{
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                {d.local.nombre}
              </td>
              <td
                className="text-center"
                style={{
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                <SunmiButton
                  color="red"
                  onClick={() => onQuitar(d.localId)}
                  style={{
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  Quitar
                </SunmiButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
