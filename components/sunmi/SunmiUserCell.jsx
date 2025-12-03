"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiUserCell({ nombre = "", email = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.userCell;

  const inicial = nombre?.[0]?.toUpperCase() ?? "?";

  return (
    <div
      className="flex items-center"
      style={{
        gap: ui.spacing.sm,
        transform: `scale(${ui.scale})`,
      }}
    >
      {/* AVATAR */}
      <div
        className={cn(
          `
          flex items-center justify-center
          font-bold
        `,
          t.avatarBg,
          t.avatarText
        )}
        style={{
          width: ui.density.avatarSize,
          height: ui.density.avatarSize,
          borderRadius: ui.rounded.full,
          fontSize: ui.font.base * ui.font.scaleMd,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {inicial}
      </div>

      {/* TEXTO */}
      <div className="flex flex-col min-w-0">
        <span
          className={cn("truncate font-medium", theme.layout)}
          style={{
            fontSize: ui.font.base * ui.font.scaleMd,
            lineHeight: ui.font.lineHeight,
          }}
        >
          {nombre || "Sin nombre"}
        </span>

        <span
          className={cn("truncate", t.email)}
          style={{
            fontSize: ui.font.base * ui.font.scaleSm,
            opacity: 0.85,
          }}
        >
          {email || "Sin email"}
        </span>
      </div>
    </div>
  );
}
