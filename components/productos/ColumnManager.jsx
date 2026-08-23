"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, RotateCcw, Settings2 } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCheckbox from "@/components/sunmi/SunmiCheckbox";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ColumnManager({
  allColumns,
  visibleKeys,
  onChange,
  lockedKeys = [],
  defaultKeys = [],
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (key) => {
    if (lockedKeys.includes(key)) return;
    const next = visibleKeys.includes(key)
      ? visibleKeys.filter((item) => item !== key)
      : [...visibleKeys, key];
    onChange(next);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("es");
    if (!term) return allColumns;
    return allColumns.filter(
      (column) =>
        column.label.toLocaleLowerCase("es").includes(term) ||
        column.key.toLocaleLowerCase("es").includes(term)
    );
  }, [allColumns, q]);

  const puedeRestablecer =
    defaultKeys.length > 0 &&
    (defaultKeys.length !== visibleKeys.length ||
      defaultKeys.some((key) => !visibleKeys.includes(key)));

  return (
    <div className="relative" ref={ref}>
      <SunmiButton
        color="slate"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Columnas
        </span>
      </SunmiButton>

      {open && (
        <div
          className="sunmi-card absolute right-0 z-[9999] mt-2 mb-0 min-w-64"
          role="dialog"
          aria-label="Configurar columnas visibles"
        >
          <SunmiInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar columna..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            icon="search"
          />

          <p className="text-xs sunmi-text-muted mt-3 mb-2">
            Columnas visibles
          </p>

          <div className="max-h-56 overflow-y-auto space-y-1">
            {filtered.map((column) => {
              const isLocked = lockedKeys.includes(column.key);
              const checked = visibleKeys.includes(column.key);

              return (
                <label
                  key={column.key}
                  className={`
                    sunmi-control flex items-center justify-between gap-3
                    rounded-lg px-2 py-2 text-sm
                    ${isLocked ? "opacity-60" : "cursor-pointer"}
                  `.trim()}
                >
                  <span className="truncate">{column.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {isLocked && (
                      <LockKeyhole
                        className="h-3.5 w-3.5 sunmi-text-muted"
                        aria-label="Columna fija"
                      />
                    )}
                    <SunmiCheckbox
                      checked={checked}
                      disabled={isLocked}
                      onChange={() => toggle(column.key)}
                      ariaLabel={`${column.label}: ${checked ? "visible" : "oculta"}`}
                    />
                  </span>
                </label>
              );
            })}

            {filtered.length === 0 && (
              <div className="text-xs sunmi-text-muted px-2 py-1">
                Sin resultados
              </div>
            )}
          </div>

          {puedeRestablecer && (
            <SunmiButton
              color="slate"
              onClick={() => onChange([...defaultKeys])}
              className="w-full mt-3"
            >
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Restablecer columnas
              </span>
            </SunmiButton>
          )}

          <p className="text-xs sunmi-text-muted mt-3">
            Se aplica al instante y se guarda en este navegador.
          </p>
        </div>
      )}
    </div>
  );
}
