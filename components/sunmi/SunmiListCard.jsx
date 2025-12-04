"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiListCard({ children, className = "" }) {
  const { ui } = useUIConfig();

  return (
    <div
      className={cn("flex flex-col", className)}
      style={{
        gap: ui.spacingScale[ui.spacing],
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
