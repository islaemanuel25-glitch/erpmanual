"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function TablaDepositos({ depositos, onQuitar }) {
  const { ui } = useUIConfig();

  if (!depositos || depositos.length === 0) {
    return (
      <div
        className="bg-gray-50 text-gray-500 border text-center"
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
      className="overflow-x-auto bg-white shadow-sm border"
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
        <thead className="bg-gray-100 text-gray-700">
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
              className="border-t hover:bg-blue-50 transition-colors"
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
                className="font-medium text-gray-800"
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
