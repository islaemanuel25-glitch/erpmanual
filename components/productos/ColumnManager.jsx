"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ColumnManager({ allColumns, visibleKeys, onChange, lockedKeys = [] }) {
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
    if (lockedKeys.includes(key)) return;
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
      <SunmiButton
        color="slate"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 flex items-center justify-center rounded-xl"
      >
        <Settings2 size={16} />
      </SunmiButton>

      {open && (
        <div
          className="absolute right-0 mt-2 w-56 z-[9999] rounded-xl p-3 shadow-xl"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--app-border)",
          }}
        >
          <SunmiInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar columna..."
            icon="search"
          />

          <p className="text-[12px] sunmi-text-muted mt-3 mb-2 px-1">
            Columnas visibles
          </p>

          <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
            {filtered.map((c) => {
              const isLocked = lockedKeys.includes(c.key);
              const checked = visibleKeys.includes(c.key);
              return (
                <label
                  key={c.key}
                  className={`
                    flex items-center justify-between
                    px-2 py-2 rounded-lg text-sm
                    ${isLocked ? "opacity-60" : "cursor-pointer"}
                  `}
                  style={{
                    background: "var(--app-input-bg)",
                    color: "var(--app-fg)",
                  }}
                  onMouseEnter={(e) => { if (!isLocked) e.currentTarget.style.background = "var(--hover-bg, var(--app-input-bg))"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--app-input-bg)"; }}
                >
                  <span className="truncate">{c.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.key)}
                    disabled={isLocked}
                    className={`w-4 h-4 ${isLocked ? "opacity-50" : "cursor-pointer"}`}
                    style={{ accentColor: "var(--pos-accent)" }}
                  />
                </label>
              );
            })}

            {filtered.length === 0 && (
              <div className="text-xs sunmi-text-muted px-2 py-1">
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
