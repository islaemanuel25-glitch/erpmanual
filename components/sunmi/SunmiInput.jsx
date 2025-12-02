"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiInput({ className = "", ...props }) {
  const { theme } = useSunmiTheme();
  const t = theme.input; // shortcut

  return (
    <input
      {...props}
      className={cn(
        `
        px-2 py-1.5              /* tamaño compacto */
        w-full rounded-md
        text-[13px]
        outline-none
        transition-all
        ${t.bg}
        ${t.text}
        ${t.border}
        ${t.placeholder}
        ${t.focus}
      `,
        className
      )}
    />
  );
}
