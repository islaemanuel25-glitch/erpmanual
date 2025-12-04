"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
  variant = "sunmi",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { focus } = useSunmiAnimation();

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

  const calc = (() => {
    const h = ui.inputHeight;

    if (variant === "compact") {
      const trackWidth = h * 1.6;
      const trackHeight = h * 0.6;
      const thumb = h * 0.55;
      const offset = trackWidth - thumb - ui.gap * 0.5;
      return { trackWidth, trackHeight, thumb, offset };
    }

    const trackWidth = h * 1.8;
    const trackHeight = h * 0.7;
    const thumb = h * 0.65;
    const offset = trackWidth - thumb - ui.gap;
    return { trackWidth, trackHeight, thumb, offset };
  })();

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      onClick={toggle}
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
        transitionDuration: `${ui.animations.duration}ms`,
        transitionTimingFunction: ui.animations.easing,
      }}
    >
      <div
        className={cn("rounded-full transition-all", normalized ? t.on : t.off)}
        style={{
          width: calc.trackWidth,
          height: calc.trackHeight,
          borderRadius: calc.trackHeight,
        }}
      >
        <div
          className={cn("shadow transition-all", t.thumb)}
          style={{
            width: calc.thumb,
            height: calc.thumb,
            borderRadius: calc.thumb,
            transform: normalized
              ? `translateX(${calc.offset}px)`
              : "translateX(0px)",
          }}
        />
      </div>

      <span
        className={
          normalized
            ? badgeOn.split(" ").find((c) => c.startsWith("text-"))
            : badgeOff.split(" ").find((c) => c.startsWith("text-"))
        }
        style={{
          fontSize: ui.fontSize,
          lineHeight: `${ui.fontLineHeight}px`,
        }}
      >
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
