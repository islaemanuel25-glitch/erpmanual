// components/pos-transferencias/nueva/FiltrosDeposito.jsx
"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function FiltrosDeposito({
  areaId,
  categoriaId,
  areasFisicas,
  categorias,
  onAreaChange,
  onCategoriaChange,
  onLimpiar,
}) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className="border shadow-sm"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("md"),
        padding: ui.helpers.spacing("md"),
      }}
    >
      <h2
        className="font-semibold"
        style={{
          fontSize: ui.helpers.font("lg"),
          marginBottom: ui.helpers.spacing("sm"),
          color: "var(--sunmi-text)",
        }}
      >
        Filtros del depósito (ordenan sugeridos)
      </h2>

      <div
        className="flex flex-wrap"
        style={{
          gap: ui.helpers.spacing("md"),
          marginBottom: ui.helpers.spacing("md"),
        }}
      >
        {/* Área física */}
        <select
          className="border"
          style={{
            height: ui.helpers.controlHeight(),
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
            borderRadius: ui.helpers.radius("md"),
            paddingLeft: ui.helpers.spacing("sm"),
            paddingRight: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("sm"),
            backgroundColor: "var(--sunmi-card-bg)",
            color: "var(--sunmi-text)",
          }}
          value={areaId}
          onChange={(e) => onAreaChange(Number(e.target.value))}
        >
          <option value={0}>Área física</option>
          {areasFisicas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>

        {/* Categoría */}
        <select
          className="border"
          style={{
            height: ui.helpers.controlHeight(),
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
            borderRadius: ui.helpers.radius("md"),
            paddingLeft: ui.helpers.spacing("sm"),
            paddingRight: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("sm"),
            backgroundColor: "var(--sunmi-card-bg)",
            color: "var(--sunmi-text)",
          }}
          value={categoriaId}
          onChange={(e) => onCategoriaChange(Number(e.target.value))}
        >
          <option value={0}>Categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        {/* Limpiar */}
        <button
          className="border"
          style={{
            height: ui.helpers.controlHeight(),
            paddingLeft: ui.helpers.spacing("md"),
            paddingRight: ui.helpers.spacing("md"),
            backgroundColor: "var(--sunmi-table-row-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
            borderRadius: ui.helpers.radius("md"),
            fontSize: ui.helpers.font("xs"),
            color: "var(--sunmi-text)",
          }}
          onClick={onLimpiar}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "brightness(1)";
          }}
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
