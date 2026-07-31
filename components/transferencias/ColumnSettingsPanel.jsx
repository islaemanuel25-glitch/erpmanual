"use client";

// Panel de configuración de columnas INTEGRADO en la página. Reemplaza al modal
// anterior: no hay overlay, backdrop, portal ni dialog — es un bloque que se
// despliega dentro de la sección del listado y no bloquea la pantalla. El
// usuario puede seguir leyendo la tabla mientras elige qué columnas ver.
//
// Solo afecta a la tabla desktop: en cards la composición es fija, porque
// esconder campos ahí dejaría tarjetas incompletas sin que se note por qué. Por
// eso la página monta este panel únicamente desde lg.

import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ColumnSettingsPanel({ open, onClose, columns, setColumns, labels }) {
  if (!open) return null;

  const toggle = (key) => setColumns((prev) => ({ ...prev, [key]: !prev[key] }));

  const entradas = Object.keys(labels).filter((k) => k in columns);

  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold sunmi-text-strong leading-tight">
            Columnas de la tabla
          </div>
          <p className="text-[11px] sunmi-text-muted leading-tight">
            Solo afecta a la vista de escritorio. En pantallas chicas el listado
            usa tarjetas de composición fija.
          </p>
        </div>
        <SunmiButton color="slate" size="sm" onClick={onClose} className="shrink-0">
          Cerrar
        </SunmiButton>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
        {entradas.map((key) => (
          <label
            key={key}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg sunmi-surface sunmi-border cursor-pointer"
          >
            <span className="text-[12px] sunmi-text-strong truncate">{labels[key]}</span>
            <input
              type="checkbox"
              checked={columns[key] === true}
              onChange={() => toggle(key)}
              className="w-4 h-4 cursor-pointer shrink-0"
              style={{ accentColor: "var(--pos-accent)" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
