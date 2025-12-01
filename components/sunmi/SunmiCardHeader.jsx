"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiCardHeader({
  title = "",
  children, // botones opcionales
}) {
  const { theme } = useSunmiTheme();
  
  return (
    <div
      className="
        flex items-center justify-between
        mb-3 px-1
      "
    >
      <h2 className={`text-[15px] font-semibold ${theme.layout.split(' ')[1] || 'text-slate-200'} tracking-wide`}>
        {title}
      </h2>

      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}
