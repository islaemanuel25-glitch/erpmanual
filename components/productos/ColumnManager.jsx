"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ColumnManager({ allColumns, visibleKeys, onChange }) {
  const { ui } = useUIConfig();
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

  const buttonSize = parseInt(ui.helpers.controlHeight());
  const iconSize = parseInt(ui.helpers.icon(1));
  const dropdownWidth = parseInt(ui.helpers.controlHeight()) * 9;

  return (
    <div className="relative" ref={ref}>
      {/* BOTÓN MINI SUNMI V2 */}
      <SunmiButton
        variant="icon"
        color="slate"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center"
        style={{
          height: buttonSize,
          width: buttonSize,
          borderRadius: ui.helpers.radius("xl"),
        }}
      >
        <Settings2 size={iconSize} />
      </SunmiButton>

      {open && (
        <div
          className="absolute right-0 z-[9999] border"
          style={{
            backgroundColor: "var(--sunmi-card-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
            marginTop: ui.helpers.spacing("sm"),
            width: dropdownWidth,
            borderRadius: ui.helpers.radius("xl"),
            padding: ui.helpers.spacing("md"),
          }}
        >
          {/* BUSCADOR */}
          <SunmiInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar columna…"
            icon="search"
          />

          <p
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.7,
              fontSize: ui.helpers.font("xs"),
              marginTop: ui.helpers.spacing("md"),
              marginBottom: ui.helpers.spacing("sm"),
              paddingLeft: ui.helpers.spacing("xs"),
              paddingRight: ui.helpers.spacing("xs"),
            }}
          >
            Columnas visibles
          </p>

          {/* LISTADO */}
          <div
            className="overflow-y-auto"
            style={{
              maxHeight: parseInt(ui.helpers.controlHeight()) * 3.5,
              paddingRight: ui.helpers.spacing("xs"),
              gap: ui.helpers.spacing("xs"),
            }}
          >
            {filtered.map((c) => (
              <label
                key={c.key}
                className="flex items-center justify-between cursor-pointer"
                style={{
                  backgroundColor: "var(--sunmi-table-row-bg)",
                  color: "var(--sunmi-text)",
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  borderRadius: ui.helpers.radius("lg"),
                  fontSize: ui.helpers.font("sm"),
                  marginBottom: ui.helpers.spacing("xs"),
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = "brightness(1.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "brightness(1)";
                }}
              >
                <span className="truncate">{c.label}</span>

                <input
                  type="checkbox"
                  checked={visibleKeys.includes(c.key)}
                  onChange={() => toggle(c.key)}
                  className="cursor-pointer accent-amber-300"
                  style={{
                    width: parseInt(ui.helpers.icon(1)),
                    height: parseInt(ui.helpers.icon(1)),
                  }}
                />
              </label>
            ))}

            {filtered.length === 0 && (
              <div
                style={{
                  color: "var(--sunmi-text)",
                  opacity: 0.5,
                  fontSize: ui.helpers.font("xs"),
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("xs"),
                  paddingBottom: ui.helpers.spacing("xs"),
                }}
              >
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
