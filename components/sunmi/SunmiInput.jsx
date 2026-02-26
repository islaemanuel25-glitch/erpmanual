"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiInput({ className = "", ...props }) {
  const { theme } = useSunmiTheme();

  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-')) || 'text-slate-100';

  return (
    <input
      {...props}
      className={`
        px-2 py-1.5
        w-full rounded-md
        bg-slate-950/40 ${textColor}
        placeholder:text-slate-500
        border-2 border-slate-500/60
        text-[13px]
        hover:border-slate-400/70
        focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/60
        disabled:opacity-60 disabled:cursor-not-allowed
        ${className}
      `}
    />
  );
}
