"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiHeader({ title, color = "amber", children }) {
  const { theme } = useSunmiTheme();
  const ribbon = theme.titleRibbon || theme.header;

  // Override por color="cyan" en themes con accent amber: refleja la intención antigua
  const bgClass = color === "cyan" && theme.accent === "amber"
    ? ribbon.bg.replace(/amber/g, "cyan")
    : ribbon.bg;

  return (
    <div
      className={`
        bg-gradient-to-r ${bgClass}
        ${ribbon.border}
        ${ribbon.text}
        rounded-xl
        px-4 py-2
        text-[13px]
        font-bold
        tracking-wide
        uppercase
        shadow-md
        mb-2
        border
      `}
    >
      {title}
      {children}
    </div>
  );
}
