"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { paginarHerramientas, llevaPuntitos } from "@/lib/menu/grillaSubmenu";

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

// Abajo de `md`: tres por fila, doce por página. Con una sola página es una
// grilla quieta; con más, carrusel que encaja página por página. El alto no
// cambia al pasar de página porque las páginas son hijas de la misma pista
// flex: se estiran a la más alta —la primera, que siempre está llena— y cada
// una reparte ese alto en cuatro filas iguales, aunque tenga una herramienta.
function GrillaMovil({ items, renderTile }) {
  const [paginaVisible, setPaginaVisible] = useState(0);
  const paginas = paginarHerramientas(items);

  if (!llevaPuntitos(paginas)) {
    return (
      <div className="grid grid-cols-3 gap-x-1 gap-y-2">
        {paginas[0].map(renderTile)}
      </div>
    );
  }

  const alDesplazar = (e) => {
    const ancho = e.currentTarget.clientWidth || 1;
    const indice = Math.round(e.currentTarget.scrollLeft / ancho);
    if (indice !== paginaVisible) setPaginaVisible(indice);
  };

  return (
    <div>
      <div
        onScroll={alDesplazar}
        className="flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paginas.map((pagina, i) => (
          <div
            key={i}
            className="grid grid-cols-3 grid-rows-4 gap-x-1 gap-y-2 shrink-0 w-full snap-start snap-always"
          >
            {pagina.map(renderTile)}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 mt-3" aria-hidden="true">
        {paginas.map((_, i) => (
          <span
            key={i}
            className={`block w-1.5 h-1.5 rounded-full ${
              i === paginaVisible ? "sunmi-bg-accent" : "sunmi-bg-borde"
            }`}
          />
        ))}
      </div>
    </div>
  );
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

  // `enGrilla`: la celda ocupa su columna de la grilla móvil y el nombre
  // reserva dos renglones. En escritorio la celda tiene su ancho fijo de antes.
  const renderTile = (item, enGrilla) => {
    const ItemIcon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        className={`flex flex-col items-center gap-2 rounded-xl hover:bg-[color:var(--hover-bg)] transition ${
          enGrilla ? "w-full min-w-0 py-2.5" : "p-2.5 w-28"
        }`}
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
        <span
          className={`text-sm3 font-medium text-[color:var(--app-fg)] text-center leading-tight ${
            enGrilla ? "w-full line-clamp-2 min-h-dosRenglones break-words" : ""
          }`}
        >
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
        className="bg-[color:var(--card-bg)] border border-[color:var(--card-border)] rounded-3xl p-6 shadow-2xl w-full md:w-auto"
        style={{ maxWidth: `min(${modalMax}px, 100%)` }}
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

        <div className="md:hidden">
          <GrillaMovil items={items} renderTile={(item) => renderTile(item, true)} />
        </div>

        <div className={`hidden md:block ${isScrollable ? "max-h-[60vh] overflow-y-auto pr-1" : ""}`}>
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div key={index} className="flex justify-center gap-4">
                {row.map((item) => renderTile(item, false))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
