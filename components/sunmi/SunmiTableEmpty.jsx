"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiTableEmpty({
  message = "Sin datos disponibles",
  colSpan = 50,
}) {
  const { theme } = useSunmiTheme();

  const textColor =
    theme.layout
      .split(" ")
      .find((c) => c.startsWith("text-"))
      ?.replace("text-slate-50", "text-slate-500") || "text-slate-500";

  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`
          text-center
          py-3
          ${textColor}
          text-[12px]
          italic
        `}
      >
        {message}
      </td>
    </tr>
  );
}
