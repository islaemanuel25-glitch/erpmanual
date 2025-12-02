"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
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
  const t = theme.list;

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={cn(
        `
        flex items-center justify-between
        gap-3 py-2
        transition-all
      `,
        clickable && "cursor-pointer",
        clickable && t.itemHover,
        className
      )}
    >
      {/* IZQUIERDA */}
      <div className="flex items-start gap-2 min-w-0">
        {left && <div className="mt-[2px]">{left}</div>}

        <div className="flex flex-col min-w-0">
          <span className={cn("text-[13px] truncate", theme.layout)}>
            {label}
          </span>

          {description && (
            <span className={cn("text-[11px] truncate", t.description)}>
              {description}
            </span>
          )}
        </div>
      </div>

      {/* DERECHA */}
      {right && (
        <div className="flex items-center gap-2 shrink-0">
          {right}
        </div>
      )}
    </div>
  );
}
