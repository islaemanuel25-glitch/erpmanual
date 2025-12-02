"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiLoader({ size = 20, className = "" }) {
  const { theme } = useSunmiTheme();
  const t = theme.loader;

  return (
    <div className="flex justify-center py-2">
      <div
        className={cn(
          `
          animate-spin
          rounded-full
          border-2
        `,
          t.border,
          t.accent,
          className
        )}
        style={{
          width: size,
          height: size,
        }}
      />
    </div>
  );
}
