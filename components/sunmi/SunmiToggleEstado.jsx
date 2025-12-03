"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const t = theme.toggle;
  const badgeOn = theme.badgeActivo;
  const badgeOff = theme.badgeInactivo;

  const normalized =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo";

  const toggle = () => onChange(!normalized);

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      onClick={toggle}
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      {/* TRACK */}
      <div
        className={cn(
          `rounded-full transition-all`,
          normalized ? t.on : t.off
        )}
        style={{
          width: ui.density.inputHeight * 1.6,
          height: ui.density.inputHeight * 0.7,
        }}
      >
        {/* THUMB */}
        <div
          className={cn(
            `rounded-full shadow transition-all`,
            t.thumb
          )}
          style={{
            width: ui.density.inputHeight * 0.7,
            height: ui.density.inputHeight * 0.7,
            transform: normalized
              ? `translateX(${ui.density.inputHeight * 0.9}px)`
              : "translateX(0px)",
          }}
        />
      </div>

      {/* LABEL */}
      <span
        className={
          normalized
            ? badgeOn.split(" ").find((c) => c.startsWith("text-"))
            : badgeOff.split(" ").find((c) => c.startsWith("text-"))
        }
        style={{
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
