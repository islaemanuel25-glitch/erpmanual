"use client";

import { useState } from "react";
import Link from "next/link";
import SubmenuPanel from "./SubmenuPanel";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pos-accent)]";

export default function AppLauncherTile({ group }) {
  const [panelOpen, setPanelOpen] = useState(false);

  const visibles = group?.items || [];
  const primer = visibles[0];
  if (!primer) return null;

  const Icon = group.icon;
  const count = visibles.length;
  const color = group.color || "gray";
  const hasSubmenu = count > 1;

  const iconBoxStyle = {
    background: `rgb(var(--module-${color}) / 0.15)`,
    color: `rgb(var(--module-${color}))`,
  };

  const badgeStyle = {
    background: `rgb(var(--module-${color}))`,
    color: "#ffffff",
  };

  const tileClasses = `
    group relative w-full
    flex flex-col items-center justify-center gap-2
    lg:flex-row lg:justify-start lg:gap-3
    p-2 lg:p-3 rounded-xl
    transition cursor-pointer text-left
    hover:-translate-y-0.5
    ${FOCUS_RING}
  `;

  const tileContent = (
    <>
      {hasSubmenu && (
        <span
          className="
            absolute top-1.5 right-1.5
            min-w-[18px] h-[18px] px-1
            rounded-full text-[10px] font-bold leading-none
            flex items-center justify-center shadow-sm
          "
          style={badgeStyle}
          aria-hidden
        >
          {count}
        </span>
      )}
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
      <span
        className="
          text-xs lg:text-sm font-medium
          text-[color:var(--app-fg)]
          truncate max-w-full
        "
      >
        {group.label}
      </span>
    </>
  );

  if (hasSubmenu) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label={`${group.label}, ${count} accesos`}
          className={tileClasses}
        >
          {tileContent}
        </button>
        <SubmenuPanel
          group={group}
          isOpen={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      </>
    );
  }

  return (
    <Link href={primer.href} aria-label={group.label} className={tileClasses}>
      {tileContent}
    </Link>
  );
}
