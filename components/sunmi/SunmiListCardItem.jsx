"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiListCardItem({
  children,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  const t = theme.list;

  return (
    <div
      className={cn(
        `
        flex items-center justify-between
        py-2
        relative
      `,
        className
      )}
    >
      {/* SEPARADOR TEMÁTICO */}
      <div
        className={cn(
          `
          absolute -bottom-[1px] left-0 right-0
          h-[1px]
        `,
          t.separator
        )}
      />

      {/* CONTENIDO */}
      <div className="flex-1 truncate">
        {children}
      </div>
    </div>
  );
}
