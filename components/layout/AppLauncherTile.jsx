"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const TXT = "text-[color:var(--app-fg)]";
const HOVER = "hover:bg-[color:var(--hover-bg)]";
const ICON_BLOCK = "bg-[color:var(--pos-accent)] text-[color:var(--pos-tab-active-fg)]";
const BADGE = "bg-[color:var(--hover-bg)]";

export default function AppLauncherTile({ group }) {
  const { theme } = useSunmiTheme();

  const visibles = group?.items || [];
  const primer = visibles[0];
  if (!primer) return null;

  const Icon = group.icon;
  const count = visibles.length;

  // Href RBAC-safe: group.href sólo si apunta a un item visible; si no, el primero.
  const href =
    group.href && visibles.some((i) => i.href === group.href)
      ? group.href
      : primer.href;

  return (
    <Link
      href={href}
      aria-label={
        count > 1 ? `${group.label}, ${count} accesos` : group.label
      }
      className={`
        flex flex-col items-center justify-start gap-2
        p-3 sm:p-4 rounded-2xl shadow-sm h-full
        transition cursor-pointer
        hover:shadow-md hover:-translate-y-0.5
        ${theme.card}
        ${HOVER}
      `}
    >
      <div className="relative">
        <div
          className={`
            flex items-center justify-center
            w-16 h-16 sm:w-20 sm:h-20 rounded-2xl
            ${ICON_BLOCK}
          `}
        >
          {Icon && <Icon size={32} aria-hidden />}
        </div>
        {count > 1 && (
          <span
            className={`
              absolute -top-1 -right-1
              min-w-[20px] h-5 px-1.5
              rounded-full text-[10px] font-bold leading-none
              flex items-center justify-center
              shadow-sm
              ${BADGE} ${TXT}
            `}
            aria-hidden
          >
            {count}
          </span>
        )}
      </div>
      <span
        className={`text-xs sm:text-sm font-medium text-center truncate w-full ${TXT}`}
      >
        {group.label}
      </span>
    </Link>
  );
}
