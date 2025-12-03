"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTableEmpty({ message = "Sin datos disponibles" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const textColor =
    theme.layout
      .split(" ")
      .find((c) => c.startsWith("text-"))
      ?.replace("text-slate-50", "text-slate-500") || "text-slate-500";

  return (
    <tr style={{ transform: `scale(${ui.scale})` }}>
      <td
        colSpan={50}
        className={textColor}
        style={{
          textAlign: "center",
          paddingTop: ui.gap,
          paddingBottom: ui.gap,
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
          fontStyle: "italic",
        }}
      >
        {message}
      </td>
    </tr>
  );
}
