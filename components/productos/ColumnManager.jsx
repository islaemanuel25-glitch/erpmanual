"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, Search } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ColumnManager({ allColumns, visibleKeys, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  // Cerrar al click afuera
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
      {/* BOTÓN SUNMI */}
      <SunmiButton
        color="slate"
        className="flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 size={16} />
        Columnas
      </SunmiButton>

      {open && (
        <div
          className="
            absolute right-0 mt-2 w-80 z-[9999]
            bg-slate-900 border border-slate-700
            rounded-2xl shadow-xl p-3
            animate-fadeIn
          "
        >
          {/* BUSCADOR */}
          <div className="mb-3">
            <SunmiInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar columna…"
              icon="search"
            />
          </div>

          <p className="text-[12px] text-slate-400 px-1 mb-1">
            Columnas visibles
          </p>

          {/* LISTA */}
          <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
            {filtered.map((c) => (
              <label
                key={c.key}
                className="
                  flex items-center justify-between gap-2
                  px-2 py-2 rounded-lg
                  bg-slate-800 hover:bg-slate-700
                  cursor-pointer text-sm text-slate-200
                "
              >
                <span className="truncate">{c.label}</span>

                <input
                  type="checkbox"
                  className="w-4 h-4 accent-amber-400 cursor-pointer"
                  checked={visibleKeys.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
              </label>
            ))}

            {filtered.length === 0 && (
              <div className="text-xs text-slate-500 px-2 py-1">
                Sin resultados
              </div>
            )}
          </div>

          {/* BOTÓN CERRAR */}
          <div className="mt-4 flex justify-end">
            <SunmiButton
              color="cyan"
              onClick={() => setOpen(false)}
              className="px-4 py-1"
            >
              Cerrar
            </SunmiButton>
          </div>
        </div>
      )}
    </div>
  );
}
