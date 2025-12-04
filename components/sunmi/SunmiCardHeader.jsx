"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";

export default function SunmiHeader({ title, color = "amber", children }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { slide } = useSunmiAnimation();

  return (
    <div
      className={`
        bg-gradient-to-r ${theme.header.bg}
        ${theme.header.border}
        ${theme.header.text}
        rounded-xl
        shadow-md
        border
      `}
      style={{
        padding: ui.spacingScale[ui.spacing],
        marginBottom: ui.gap,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontWeight: 700,
        transform: `translateY(${slide.offsetY}px)`,
        animation: `headerSlide ${slide.duration}ms ease forwards`,
      }}
    >
      <style>
        {`
        @keyframes headerSlide {
          from {
            opacity: 0.3;
            transform: translateY(${slide.offsetY}px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}
      </style>

      {title}
      {children}
    </div>
  );
}
