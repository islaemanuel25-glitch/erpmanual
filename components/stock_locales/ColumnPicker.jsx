"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

// Botón "Columnas" + dropdown para elegir columnas visibles. Extraído de
// TablaStock.jsx sin cambiar comportamiento. Recibe la API del hook
// useColumnasVisibles (columnDefs, isVisible, toggleCol).
export default function ColumnPicker({ columnDefs, isVisible, toggleCol }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!show) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [show]);

  return (
    <div className="flex items-center justify-end mb-2 relative" ref={ref}>
      <button
        onClick={() => setShow((v) => !v)}
        className="sunmi-btn sunmi-control text-[11px] px-2 py-1 flex items-center gap-1"
        title="Columnas visibles"
      >
        <Settings2 size={14} />
        Columnas
      </button>

      {show && (
        <div className="absolute right-0 top-full mt-1 z-40 sunmi-card p-2 shadow-lg min-w-[180px]">
          <p className="text-[11px] sunmi-text-muted mb-2 font-medium">Columnas visibles</p>
          {columnDefs.map((col) => (
            <label
              key={col.key}
              className={`flex items-center gap-2 text-[12px] py-1 cursor-pointer ${
                col.required ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={isVisible(col.key)}
                disabled={col.required}
                onChange={() => toggleCol(col.key)}
                className="accent-cyan-500 scale-90"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
