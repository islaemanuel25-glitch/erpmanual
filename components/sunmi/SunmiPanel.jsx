"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const { theme } = useSunmiTheme();
  const padding = noPadding ? "" : "p-4";
  
  return (
    <div
      className={`
        ${theme.card}
        rounded-2xl 
        ${padding} 
        ${className}
      `}
    >
      {children}
    </div>
  );
}
