"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const TXT = "text-[color:var(--app-fg)]";
const HOVER = "hover:bg-[color:var(--hover-bg)]";
const ICON_BLOCK = "bg-[color:var(--pos-accent)] text-[color:var(--pos-tab-active-fg)]";
const DIVIDER = "border-[color:var(--card-border)]";
const BADGE = "bg-[color:var(--hover-bg)]";

export default function AppLauncherTile({ group }) {
  const { theme } = useSunmiTheme();

  const visibles = group?.items || [];
  const primer = visibles[0];
  if (!primer) return null;

  const Icon = group.icon;
  const count = visibles.length;
  const isSingle = count === 1;

  // Href RBAC-safe del grupo (usado solo cuando hay un único item visible)
  const groupHref =
    group.href && visibles.some((i) => i.href === group.href)
      ? group.href
      : primer.href;

  // Caso: un solo subitem visible → tile compacto con link directo
  if (isSingle) {
    return (
      <Link
        href={groupHref}
        aria-label={group.label}
        className={`
          flex items-center gap-3 p-3
          rounded-2xl shadow-sm h-full
          transition cursor-pointer
          hover:shadow-md hover:-translate-y-0.5
          ${theme.card}
          ${HOVER}
        `}
      >
        <div
          className={`
            flex items-center justify-center w-11 h-11 rounded-xl shrink-0
            ${ICON_BLOCK}
          `}
        >
          {Icon && <Icon size={22} aria-hidden />}
        </div>
        <span className={`text-sm font-semibold truncate ${TXT}`}>
          {group.label}
        </span>
      </Link>
    );
  }

  // Caso: múltiples subitems → tarjeta compacta con submenús siempre visibles
  return (
    <div
      className={`
        flex gap-3 p-3
        rounded-2xl shadow-sm h-full
        ${theme.card}
      `}
    >
      {/* Columna izquierda: icono */}
      <div
        className={`
          flex items-center justify-center w-11 h-11 rounded-xl shrink-0
          ${ICON_BLOCK}
        `}
      >
        {Icon && <Icon size={22} aria-hidden />}
      </div>

      {/* Columna derecha: header (nombre + badge) + lista de subitems */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className={`flex items-center justify-between gap-2 pb-2 mb-1 border-b ${DIVIDER}`}>
          <span className={`text-sm font-semibold truncate ${TXT}`}>
            {group.label}
          </span>
          <span
            className={`
              text-[10px] font-bold leading-none
              px-1.5 py-0.5 rounded-full shrink-0
              ${BADGE} ${TXT}
            `}
            aria-label={`${count} accesos`}
          >
            {count}
          </span>
        </div>
        <ul className="flex flex-col">
          {visibles.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`
                  block py-1 px-1.5 -mx-1.5
                  rounded text-[12px] truncate transition
                  ${TXT} ${HOVER}
                `}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
