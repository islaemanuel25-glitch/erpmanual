"use client";

import Link from "next/link";

const COLOR_FALLBACK = "gray";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pos-accent)]";

export default function AppLauncherTile({ group }) {
  const visibles = group?.items || [];
  const primer = visibles[0];
  if (!primer) return null;

  const Icon = group.icon;
  const count = visibles.length;
  const color = group.color || COLOR_FALLBACK;

  // Href RBAC-safe: group.href sólo si apunta a un item visible; si no, el primero.
  const href =
    group.href && visibles.some((i) => i.href === group.href)
      ? group.href
      : primer.href;

  // Color del módulo desde :root (constante del producto, no varía por theme).
  const iconBoxStyle = {
    background: `rgb(var(--module-${color}) / 0.15)`,
    color: `rgb(var(--module-${color}))`,
  };
  const badgeStyle = {
    background: `rgb(var(--module-${color}))`,
    color: "#ffffff",
  };

  return (
    <Link
      href={href}
      aria-label={
        count > 1 ? `${group.label}, ${count} accesos` : group.label
      }
      className={`
        group flex flex-col items-center justify-center gap-2
        lg:flex-row lg:justify-start lg:gap-3
        p-2 lg:p-3 rounded-xl
        transition cursor-pointer
        hover:-translate-y-0.5
        ${FOCUS_RING}
      `}
    >
      <div className="relative shrink-0">
        <div
          className="
            flex items-center justify-center
            w-12 h-12 rounded-2xl shrink-0
            transition
          "
          style={iconBoxStyle}
        >
          {Icon && <Icon size={22} aria-hidden strokeWidth={2} />}
        </div>
        {count > 1 && (
          <span
            className="
              absolute -top-1 -right-1
              min-w-[18px] h-[18px] px-1
              rounded-full text-[10px] font-bold leading-none
              flex items-center justify-center
              shadow-sm
            "
            style={badgeStyle}
            aria-hidden
          >
            {count}
          </span>
        )}
      </div>
      <span
        className="
          text-xs lg:text-sm font-medium
          text-[color:var(--app-fg)]
          truncate max-w-full
        "
      >
        {group.label}
      </span>
    </Link>
  );
}
