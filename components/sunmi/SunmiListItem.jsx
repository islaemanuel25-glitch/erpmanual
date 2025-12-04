"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiListItem({
  label,
  description,
  left = null,
  right = null,
  onClick,
  clickable = false,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { hover } = useSunmiAnimation();
  const t = theme.list;

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={cn(
        "flex items-center justify-between transition-all",
        clickable && "cursor-pointer",
        clickable && t.itemHover,
        className
      )}
      style={{
        gap: ui.gap,
        paddingTop: ui.gap,
        paddingBottom: ui.gap,
        transform: `scale(${ui.scale})`,
        transitionDuration: `${hover.duration}ms`,
        transitionTimingFunction: hover.easing,
      }}
      onMouseEnter={(e) => {
        if (clickable)
          e.currentTarget.style.transform = `scale(${ui.scale * hover.scale})`;
      }}
      onMouseLeave={(e) => {
        if (clickable) e.currentTarget.style.transform = `scale(${ui.scale})`;
      }}
    >
      <div className="flex items-start min-w-0" style={{ gap: ui.gap }}>
        {left && <div style={{ marginTop: ui.gap * 0.2 }}>{left}</div>}

        <div className="flex flex-col min-w-0">
          <span
            className={cn("truncate font-medium", theme.layout)}
            style={{
              fontSize: ui.fontSize,
              lineHeight: `${ui.fontLineHeight}px`,
            }}
          >
            {label}
          </span>

          {description && (
            <span
              className={cn("truncate", t.description)}
              style={{
                fontSize: ui.fontSizeSm,
                opacity: 0.8,
              }}
            >
              {description}
            </span>
          )}
        </div>
      </div>

      {right && (
        <div className="flex items-center shrink-0" style={{ gap: ui.gap }}>
          {right}
        </div>
      )}
    </div>
  );
}
