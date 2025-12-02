"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiUserCell({ nombre = "", email = "" }) {
  const { theme } = useSunmiTheme();
  const t = theme.userCell;

  const inicial = nombre?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-2">
      {/* AVATAR */}
      <div
        className={cn(
          `
          w-8 h-8 rounded-full
          flex items-center justify-center
          text-sm font-bold
        `,
          t.avatarBg,
          t.avatarText
        )}
      >
        {inicial}
      </div>

      {/* TEXTO */}
      <div className="flex flex-col">
        <span className={cn("font-medium", theme.layout)}>
          {nombre || "Sin nombre"}
        </span>

        <span className={cn("text-xs", t.email)}>
          {email || "Sin email"}
        </span>
      </div>
    </div>
  );
}
