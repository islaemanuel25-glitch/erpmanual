"use client";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiSection({
  title,
  description,
  children,
  footer = null,
  noSeparator = false,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const textColor =
    theme.layout.split(" ").find((c) => c.startsWith("text-")) ||
    "text-slate-100";

  return (
    <section
      className={`flex flex-col ${className}`}
      style={{
        gap: ui.spacing.md,
        transform: `scale(${ui.scale})`,
      }}
    >
      {title && (
        <div
          className="flex flex-col"
          style={{
            gap: ui.spacing.xs,
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ gap: ui.spacing.sm }}
          >
            <h3
              className={`font-semibold ${textColor}`}
              style={{
                fontSize: ui.font.base * ui.font.scaleMd,
                lineHeight: ui.font.lineHeight,
              }}
            >
              {title}
            </h3>
          </div>

          {description && (
            <p
              className="text-slate-400"
              style={{
                fontSize: ui.font.base * ui.font.scaleSm,
                lineHeight: ui.font.lineHeight,
              }}
            >
              {description}
            </p>
          )}
        </div>
      )}

      {!noSeparator && <SunmiSeparator />}

      <div
        className="flex flex-col"
        style={{ gap: ui.spacing.sm }}
      >
        {children}
      </div>

      {footer && (
        <div
          style={{
            marginTop: ui.spacing.sm,
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}
