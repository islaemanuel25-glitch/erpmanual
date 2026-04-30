"use client";

import Link from "next/link";

const TXT = "text-[color:var(--app-fg)]";
const ICON_BLOCK = "bg-[color:var(--pos-accent)] text-[color:var(--pos-tab-active-fg)]";
const BADGE = "bg-[color:var(--hover-bg)]";
const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pos-accent)]";

export default function AppLauncherTile({ group }) {
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
        group flex flex-col items-center gap-2
        rounded-xl p-1
        transition cursor-pointer
        ${FOCUS_RING}
      `}
    >
      <div className="relative">
        <div
          className={`
            flex items-center justify-center
            w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl
            shadow-sm
            transition
            group-hover:-translate-y-1 group-hover:shadow-md
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
        className={`text-xs sm:text-[13px] font-medium text-center truncate max-w-[8rem] ${TXT}`}
      >
        {group.label}
      </span>
    </Link>
  );
}
