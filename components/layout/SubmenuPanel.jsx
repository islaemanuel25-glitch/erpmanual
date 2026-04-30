"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export default function SubmenuPanel({ group, isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !group) return null;

  const items = group.items || [];
  const color = group.color || "gray";
  const Icon = group.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={group.label}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="
          relative z-10 w-full max-w-md
          rounded-2xl overflow-hidden shadow-xl
          bg-[color:var(--card-bg)]
          border border-[color:var(--card-border)]
        "
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--card-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
              style={{
                background: `rgb(var(--module-${color}) / 0.15)`,
                color: `rgb(var(--module-${color}))`,
              }}
            >
              {Icon && <Icon size={20} aria-hidden strokeWidth={2} />}
            </div>
            <h3 className="text-sm font-semibold text-[color:var(--app-fg)] truncate">
              {group.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="
              p-1 rounded-md
              text-[color:var(--app-fg)] opacity-70
              hover:opacity-100 hover:bg-[color:var(--hover-bg)]
              transition cursor-pointer
            "
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-2 max-h-[70vh] overflow-y-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="
                flex items-center gap-3 px-3 py-2 rounded-lg
                hover:bg-[color:var(--hover-bg)]
                transition
              "
            >
              {item.icon && (
                <item.icon
                  size={18}
                  className="text-[color:var(--app-fg)] opacity-70"
                />
              )}
              <span className="text-sm text-[color:var(--app-fg)]">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
