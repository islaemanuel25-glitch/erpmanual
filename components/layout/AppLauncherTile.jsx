"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const PREVIEW_COUNT = 3;

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
          rounded-2xl border shadow-sm
          transition cursor-pointer
          hover:shadow-md hover:-translate-y-0.5
          ${theme.card}
          ${theme.sidebar.border}
        `}
        aria-label={group.label}
      >
        <div
          className={`
            flex items-center justify-center w-11 h-11 rounded-xl shrink-0
            ${theme.sidebar.iconActive}
          `}
        >
          {Icon && <Icon size={22} aria-hidden />}
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className={`text-sm font-semibold truncate ${theme.sidebar.icon}`}>
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
        rounded-2xl border shadow-sm overflow-hidden
        transition
        ${theme.card}
        ${theme.sidebar.border}
        ${isOpen ? "ring-2 ring-amber-400/40" : ""}
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
          ${theme.sidebar.hover}
        `}
      >
        <div
          className={`
            flex items-center justify-center w-11 h-11 rounded-xl shrink-0
            ${theme.sidebar.iconActive}
          `}
        >
          {Icon && <Icon size={22} aria-hidden />}
        </div>
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-semibold truncate ${theme.sidebar.icon}`}>
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
            ${theme.sidebar.icon}
            ${isOpen ? "rotate-180" : ""}
          `}
        />
      </button>

      {isOpen && (
        <ul
          id={`launcher-panel-${group.key}`}
          className={`flex flex-col border-t ${theme.sidebar.border}`}
        >
          {visibles.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onItemClick}
                className={`
                  flex items-center min-h-[40px] px-4 py-2
                  text-[13px] font-medium transition
                  ${theme.sidebar.icon}
                  ${theme.sidebar.hover}
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
