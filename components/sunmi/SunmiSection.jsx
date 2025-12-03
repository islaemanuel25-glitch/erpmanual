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
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      {title && (
        <div
          className="flex flex-col"
          style={{ gap: ui.gap * 0.5 }}
        >
          <div
            className="flex items-center justify-between"
            style={{ gap: ui.gap }}
          >
            <h3
              className={`font-semibold ${textColor}`}
              style={{
                fontSize: ui.font.fontSize,
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
                fontSize: `calc(${ui.font.fontSize} * 0.9)`,
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
        style={{ gap: ui.gap }}
      >
        {children}
      </div>

      {footer && (
        <div style={{ marginTop: ui.gap }}>
          {footer}
        </div>
      )}
    </section>
  );
}
