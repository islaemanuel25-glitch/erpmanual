"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiHeader({ title, color = "amber", children }) {
  const { theme } = useSunmiTheme();
  
  const bgClass = color === "cyan" 
    ? (theme.header.bg.includes('cyan') ? theme.header.bg : theme.header.bg.replace('amber', 'cyan'))
    : theme.header.bg;
  
  return (
    <div
      className={`
        bg-gradient-to-r ${bgClass}
        ${theme.header.border}
        ${theme.header.text}
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
