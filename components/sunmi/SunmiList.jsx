"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiList({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const dividerColor =
    theme.card.split(" ").find((c) => c.startsWith("border-"))?.replace("border-", "divide-") ||
    "divide-slate-800/80";

  return (
    <div
      className={`
        flex flex-col 
        divide-y ${dividerColor}
        ${className}
      `}
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
