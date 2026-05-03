"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export default function SubmenuPanel({ group, isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !group) return null;

  const color = group.color || "gray";
  const items = group.items || [];
  const Icon = group.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color:var(--pos-overlay)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--card-bg)] border border-[color:var(--card-border)] rounded-3xl p-6 shadow-2xl w-full sm:w-auto sm:min-w-[460px]"
        style={{ maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `rgb(var(--module-${color}) / 0.18)`,
                color: `rgb(var(--module-${color}))`,
              }}
            >
              {Icon && <Icon size={20} />}
            </div>
            <div>
              <div className="text-[15px] font-medium text-[color:var(--app-fg)]">
                {group.label}
              </div>
              <div className="text-[12px] sunmi-text-muted">
                {items.length} {items.length === 1 ? "herramienta disponible" : "herramientas disponibles"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[color:var(--hover-bg)] text-[color:var(--app-fg)]"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex flex-col items-center gap-2 p-2.5 rounded-xl hover:bg-[color:var(--hover-bg)] transition"
              >
                <div
                  className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
                  style={{
                    background: `rgb(var(--module-${color}) / 0.18)`,
                    color: `rgb(var(--module-${color}))`,
                  }}
                >
                  {ItemIcon && <ItemIcon size={26} />}
                </div>
                <span className="text-[12px] font-medium text-[color:var(--app-fg)] text-center">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
