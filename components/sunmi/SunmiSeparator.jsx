"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiSeparator({ label, className = "" }) {
  const { theme } = useSunmiTheme();
  const t = theme.separator;

  return (
    <div
      className={cn(
        `
        flex items-center gap-2
        text-[12px]
        my-2
        ${t.text}
      `,
        className
      )}
    >
      <div className={cn("flex-1 h-px", t.line)} />

      {label && (
        <span className="whitespace-nowrap">
          {label}
        </span>
      )}

      <div className={cn("flex-1 h-px", t.line)} />
    </div>
  );
}
