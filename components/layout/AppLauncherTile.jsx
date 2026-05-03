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

  const circleStyle = {
    background: `rgb(var(--module-${color}) / 0.18)`,
    color: `rgb(var(--module-${color}))`,
    transition: "transform 0.18s ease",
  };

  const badgeStyle = {
    background: `rgb(var(--module-${color}))`,
    color: "#ffffff",
    border: "2px solid #ffffff",
  };

  const wrapperClasses = `
    group relative
    flex flex-col items-center
    bg-transparent border-0 p-0
    cursor-pointer text-center
    ${FOCUS_RING}
  `;

  const tileContent = (
    <>
      <div className="relative">
        <div
          className="
            flex items-center justify-center
            w-20 h-20 sm:w-24 sm:h-24 rounded-full shrink-0
            group-hover:-translate-y-[3px]
          "
          style={circleStyle}
        >
          {Icon && (
            <Icon
              aria-hidden
              strokeWidth={2}
              className="w-9 h-9 sm:w-10 sm:h-10"
            />
          )}
        </div>
        {hasSubmenu && (
          <span
            className="
              absolute top-0 right-0
              min-w-[22px] h-[22px] px-1.5
              rounded-full text-[11px] font-bold leading-none
              flex items-center justify-center shadow-sm
              group-hover:-translate-y-[3px]
            "
            style={{ ...badgeStyle, transition: "transform 0.18s ease" }}
            aria-hidden
          >
            {count}
          </span>
        )}
      </div>
      <span
        className="
          mt-3 text-[13px] font-medium
          text-[color:var(--app-fg)]
          truncate max-w-[112px]
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
          className={wrapperClasses}
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
    <Link href={primer.href} aria-label={group.label} className={wrapperClasses}>
      {tileContent}
    </Link>
  );
}
