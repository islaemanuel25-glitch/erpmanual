"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, Search } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

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
      {/* BOTÓN PRINCIPAL SUNMI */}
      <SunmiButton
        size="sm"
        color="slate"
        onClick={() => setOpen((v) => !v)}
        icon={<Settings2 size={16} />}
        label="Columnas"
      />

      {/* PANEL */}
      {open && (
        <div
          className="
            absolute right-0 mt-2 w-72 
            bg-slate-900/95 
            border border-slate-700
            rounded-2xl 
            shadow-xl 
            z-[9999] 
            p-3 
            backdrop-blur-md
          "
        >
          {/* BUSCADOR */}
          <div className="mb-3">
            <SunmiInput
              label="Buscar columna"
              placeholder="Nombre…"
              value={q}
              onChange={setQ}
            />
          </div>

          {/* LISTA */}
          <p className="text-[11px] text-slate-400 uppercase mb-2 tracking-wide">
            Columnas visibles
          </p>

          <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
            {filtered.map((c) => (
              <label
                key={c.key}
                className="
                  flex items-center justify-between
                  gap-2 px-2 py-1
                  rounded-md
                  hover:bg-slate-800/60
                  cursor-pointer
                  text-[12px]
                  text-slate-200
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
              <div className="text-[11px] text-slate-500 px-2 py-1">
                Sin resultados
              </div>
            )}
          </div>

          {/* CERRAR */}
          <div className="mt-3 flex justify-end">
            <SunmiButton
              size="sm"
              color="slate"
              label="Cerrar"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
