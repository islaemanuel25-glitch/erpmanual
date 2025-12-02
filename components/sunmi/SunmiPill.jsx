"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiPill({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const t = theme.pill;

  return (
    <span
      className={cn(
        `
        inline-block
        px-1.5 py-[1px]
        rounded-md
        text-[10.5px]
        font-semibold
        leading-none
        whitespace-nowrap
        ${t.bg}
        ${t.text}
      `,
        className
      )}
    >
      {children}
    </span>
  );
}
