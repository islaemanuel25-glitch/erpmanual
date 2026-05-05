"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

function getModalMaxWidth(count) {
  if (count <= 2) return 380;
  if (count === 3) return 480;
  if (count <= 6) return 500;
  return 640;
}

function getRows(items) {
  const count = items.length;

  if (count <= 4) return [items];

  if (count === 5) return [items.slice(0, 3), items.slice(3)];
  if (count === 6) return [items.slice(0, 3), items.slice(3)];
  if (count === 7) return [items.slice(0, 4), items.slice(4)];
  if (count === 8) return [items.slice(0, 4), items.slice(4)];
  if (count === 9) return [items.slice(0, 3), items.slice(3, 6), items.slice(6)];
  if (count === 10) return [items.slice(0, 4), items.slice(4, 7), items.slice(7)];
  if (count === 11) return [items.slice(0, 4), items.slice(4, 8), items.slice(8)];
  if (count === 12) return [items.slice(0, 4), items.slice(4, 8), items.slice(8)];

  const rows = [];
  for (let i = 0; i < items.length; i += 4) {
    rows.push(items.slice(i, i + 4));
  }
  return rows;
}

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
  const count = items.length;
  const modalMax = getModalMaxWidth(count);
  const isScrollable = count > 12;
  const rows = getRows(items);

  const renderTile = (item) => {
    const ItemIcon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        className="flex flex-col items-center gap-2 p-2.5 rounded-xl hover:bg-[color:var(--hover-bg)] transition w-28"
      >
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center"
          style={{
            background: `rgb(var(--module-${color}) / 0.18)`,
            color: `rgb(var(--module-${color}))`,
          }}
        >
          {ItemIcon && <ItemIcon size={22} />}
        </div>
        <span className="text-[13px] font-medium text-[color:var(--app-fg)] text-center leading-tight">
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color:var(--pos-overlay)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--card-bg)] border border-[color:var(--card-border)] rounded-3xl p-6 shadow-2xl w-full sm:w-auto"
        style={{ maxWidth: `min(${modalMax}px, 90vw)` }}
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
              <div className="text-[15px] font-semibold text-[color:var(--app-fg)] leading-tight">
                {group.label}
              </div>
              <div className="text-[12px] sunmi-text-muted">
                {count} {count === 1 ? "herramienta disponible" : "herramientas disponibles"}
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

        <div className={isScrollable ? "max-h-[60vh] overflow-y-auto pr-1" : ""}>
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div key={index} className="flex justify-center gap-4">
                {row.map(renderTile)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
