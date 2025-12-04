"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiCardHeader({
  title,
  subtitle = "",
  color = "amber",
  className = "",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { slide } = useSunmiAnimation();

  return (
    <div
      className={cn(
        `
        border 
        bg-gradient-to-r 
        ${theme.header.bg}
        ${theme.header.border}
        ${theme.header.text}
      `,
        className
      )}
      style={{
        padding: ui.spacingScale[ui.spacing],
        marginBottom: ui.gap,
        borderRadius: ui.roundedScale[ui.rounded],
        fontSize: ui.fontSize,
        lineHeight: `${ui.fontLineHeight}px`,
        letterSpacing: `${ui.fontLetterSpacing}em`,
        fontWeight: ui.fontWeightBold,
        textTransform: "uppercase",
        transform: `translateY(${ui.animations.slideOffsetY}px)`,
        animation: `headerSlide ${ui.animations.slideDuration}ms ${ui.animations.easing} forwards`,
      }}
    >
      <style>{`
        @keyframes headerSlide {
          from {
            opacity: ${ui.animations.fadeFrom};
            transform: translateY(${ui.animations.slideOffsetY}px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div>{title}</div>

      {subtitle && (
        <div
          className={theme.header.text}
          style={{
            opacity: 0.85,
            fontSize: ui.fontSizeSm,
            lineHeight: `${ui.fontLineHeight}px`,
            marginTop: ui.gap / 2,
            textTransform: "none",
            fontWeight: 400,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
