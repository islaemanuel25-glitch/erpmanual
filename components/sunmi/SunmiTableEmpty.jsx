"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTableEmpty({
  message = "Sin datos disponibles",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const color =
    theme.layout
      .split(" ")
      .find((c) => c.startsWith("text-")) || "text-slate-500";

  return (
    <tr style={{ transform: `scale(${ui.scale})` }}>
      <td
        colSpan={999}
        className={color}
        style={{
          textAlign: "center",
          paddingTop: ui.spacingScale.sm,
          paddingBottom: ui.spacingScale.sm,
          fontSize: ui.fontSizeSm || ui.fontSize,
          lineHeight: `${ui.fontLineHeight}px`,
          opacity: 0.8,
          fontStyle: "italic",
        }}
      >
        {message}
      </td>
    </tr>
  );
}
