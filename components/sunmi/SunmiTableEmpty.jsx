"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTableEmpty({ message = "Sin datos disponibles" }) {
  const { ui } = useUIConfig();
  
  return (
    <tr>
      <td
        colSpan={50}
        className="text-center italic"
        style={{
          color: "#64748b", // slate-500
          paddingTop: ui.helpers.spacing("md"),
          paddingBottom: ui.helpers.spacing("md"),
          fontSize: ui.helpers.font("xs"),
        }}
      >
        {message}
      </td>
    </tr>
  );
}
