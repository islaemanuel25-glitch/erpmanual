"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

export default function AppLauncherTile({ group }) {
  const { theme } = useSunmiTheme();

  const visibles = group?.items || [];
  const primer = visibles[0];
  if (!primer) return null;

  const href =
    group.href && visibles.some((i) => i.href === group.href)
      ? group.href
      : primer.href;

  const Icon = group.icon;
  const count = visibles.length;

  return (
    <Link
      href={href}
      className={`
        group flex flex-col items-center justify-center
        gap-2 p-4
        rounded-2xl border
        min-h-[120px]
        transition-all duration-200
        cursor-pointer
        shadow-md hover:shadow-lg hover:-translate-y-0.5
        ${theme.card}
        ${theme.sidebar.border}
      `}
      aria-label={group.label}
    >
      <div
        className={`
          flex items-center justify-center
          w-12 h-12 rounded-xl
          transition
          ${theme.sidebar.iconActive}
          group-hover:scale-110
        `}
      >
        {Icon && <Icon size={26} aria-hidden />}
      </div>
      <div className="flex flex-col items-center text-center">
        <span className={`text-sm font-semibold ${theme.sidebar.icon}`}>
          {group.label}
        </span>
        {count > 1 && (
          <span className="text-[11px] sunmi-text-muted mt-0.5">
            {count} accesos
          </span>
        )}
      </div>
    </Link>
  );
}
