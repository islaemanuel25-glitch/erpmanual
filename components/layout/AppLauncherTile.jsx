"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const PREVIEW_COUNT = 3;

// Tokens semánticos del launcher: cada uno apunta a una CSS var ya definida
// por theme en app/globals.css. No hardcodeamos colores en el componente.
const TXT = "text-[color:var(--app-fg)]";
const HOVER = "hover:bg-[color:var(--hover-bg)]";
const ICON_BLOCK = "bg-[color:var(--pos-accent)] text-[color:var(--pos-tab-active-fg)]";
const DIVIDER = "border-[color:var(--card-border)]";
const RING_OPEN = "ring-2 ring-[color:var(--pos-accent)]";

export default function AppLauncherTile({ group, isOpen, onToggle, onItemClick }) {
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

  const preview = visibles
    .slice(0, PREVIEW_COUNT)
    .map((i) => i.label)
    .join(" · ");

  // Caso: un solo subitem visible → tile es link directo
  if (isSingle) {
    return (
      <Link
        href={groupHref}
        className={`
          flex items-center gap-3 p-4
          rounded-2xl shadow-sm
          transition cursor-pointer
          hover:shadow-md hover:-translate-y-0.5
          ${theme.card}
          ${HOVER}
        `}
        aria-label={group.label}
      >
        <div
          className={`
            flex items-center justify-center w-11 h-11 rounded-xl shrink-0
            ${ICON_BLOCK}
          `}
        >
          {Icon && <Icon size={22} aria-hidden />}
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className={`text-sm font-semibold truncate ${TXT}`}>
            {group.label}
          </span>
          <span className="text-[11px] sunmi-text-muted truncate">
            {primer.label}
          </span>
        </div>
      </Link>
    );
  }

  // Caso: múltiples subitems → toggle de panel inline con todos los accesos
  return (
    <div
      className={`
        rounded-2xl shadow-sm overflow-hidden
        transition
        ${theme.card}
        ${isOpen ? RING_OPEN : ""}
      `}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`launcher-panel-${group.key}`}
        className={`
          w-full flex items-center gap-3 p-4 text-left
          cursor-pointer transition
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
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-semibold truncate ${TXT}`}>
              {group.label}
            </span>
            <span className="text-[11px] sunmi-text-muted shrink-0">
              {count} accesos
            </span>
          </div>
          <span className="text-[11px] sunmi-text-muted truncate mt-0.5">
            {preview}
          </span>
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={`
            shrink-0 transition-transform
            ${TXT}
            ${isOpen ? "rotate-180" : ""}
          `}
        />
      </button>

      {isOpen && (
        <ul
          id={`launcher-panel-${group.key}`}
          className={`flex flex-col border-t ${DIVIDER}`}
        >
          {visibles.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onItemClick}
                className={`
                  flex items-center min-h-[40px] px-4 py-2
                  text-[13px] font-medium transition
                  ${TXT}
                  ${HOVER}
                `}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
