"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ColumnManager({ allColumns, visibleKeys, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  // Cerrar si clickea afuera
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (key) => {
    const next = visibleKeys.includes(key)
      ? visibleKeys.filter((k) => k !== key)
      : [...visibleKeys, key];
    onChange(next);
  };

  const filtered = allColumns.filter(
    (c) =>
      c.label.toLowerCase().includes(q.toLowerCase()) ||
      c.key.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      {/* BOTÓN MINI SUNMI V2 */}
      <SunmiButton
        variant="icon"
        color="slate"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 flex items-center justify-center rounded-xl"
      >
        <Settings2 size={16} />
      </SunmiButton>

      {open && (
        <div
          className="
            absolute right-0 mt-2 w-72 z-[9999]
            bg-slate-900 border border-slate-700
            rounded-xl p-3
          "
        >
          {/* BUSCADOR */}
          <SunmiInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar columna…"
            icon="search"
          />

          <p className="text-[12px] text-slate-400 mt-3 mb-2 px-1">
            Columnas visibles
          </p>

          {/* LISTADO */}
          <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
            {filtered.map((c) => (
              <label
                key={c.key}
                className="
                  flex items-center justify-between
                  px-2 py-2 rounded-lg
                  bg-slate-800 hover:bg-slate-700
                  cursor-pointer
                  text-sm text-slate-200
                "
              >
                <span className="truncate">{c.label}</span>

                <input
                  type="checkbox"
                  checked={visibleKeys.includes(c.key)}
                  onChange={() => toggle(c.key)}
                  className="
                    w-4 h-4 cursor-pointer accent-amber-300
                  "
                />
              </label>
            ))}

            {filtered.length === 0 && (
              <div className="text-xs text-slate-500 px-2 py-1">
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
