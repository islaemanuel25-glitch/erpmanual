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

  const trackWidth = ui.density.inputHeight * 1.6;
  const trackHeight = ui.density.inputHeight * 0.7;
  const thumbSize = ui.density.inputHeight * 0.7;
  const thumbTranslate = ui.density.inputHeight * 0.9;

  const textColor = normalized
    ? badgeOn.split(" ").find((c) => c.startsWith("text-"))
    : badgeOff.split(" ").find((c) => c.startsWith("text-"));

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      onClick={toggle}
      style={{
        gap: ui.spacing.sm,
        transform: `scale(${ui.scale})`,
      }}
    >
      {/* TRACK */}
      <div
        className={cn(
          `transition-all`,
          normalized ? t.on : t.off
        )}
        style={{
          width: trackWidth,
          height: trackHeight,
          borderRadius: ui.rounded.full,
        }}
      >
        {/* THUMB */}
        <div
          className={cn(
            `shadow transition-all`,
            t.thumb
          )}
          style={{
            width: thumbSize,
            height: thumbSize,
            borderRadius: ui.rounded.full,
            transform: normalized
              ? `translateX(${thumbTranslate}px)`
              : "translateX(0px)",
          }}
        />
      </div>

      {/* LABEL */}
      <span
        className={textColor}
        style={{
          fontSize: ui.font.base * ui.font.scaleMd,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
