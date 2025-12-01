"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiCard({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  
  return (
    <div
      className={`
        ${theme.card}
        rounded-xl
        shadow-md
        p-3           /* antes p-4 / p-6 */
        backdrop-blur-sm
        ${className}
      `}
    >
      {children}
    </div>
  );
}
