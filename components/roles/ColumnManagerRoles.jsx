"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, Search } from "lucide-react";

export default function ColumnManagerRoles({ allColumns, visibleKeys, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

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
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-[36px] px-3 rounded-md border bg-white text-gray-700 flex items-center gap-2 text-[14px] hover:bg-gray-50"
      >
        <Settings2 size={16} />
        Columnas
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border rounded-xl shadow-xl z-[9999] p-3">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar columna…"
              className="w-full h-8 pl-8 pr-2 rounded-md border text-[13px] focus:border-blue-500"
            />
          </div>

          <p className="text-[12px] font-semibold text-gray-600 mb-2">Columnas visibles</p>

          <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
            {filtered.map((c) => (
              <label
                key={c.key}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-gray-100 cursor-pointer text-sm"
              >
                <span className="truncate">{c.label}</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                  checked={visibleKeys.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="text-xs text-gray-500 px-2 py-1">Sin resultados</div>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-md border bg-gray-50 text-[13px]"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
