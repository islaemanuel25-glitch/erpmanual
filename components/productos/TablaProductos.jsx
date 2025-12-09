"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function TablaProductos({
  rows,
  columns,
  page,
  totalPages,
  onNext,
  onPrev,
  onEditar,
  onEliminar,
  catalogos,
}) {
  const { ui } = useUIConfig();
  
  // Diccionarios
  const CAT = Object.fromEntries(
    (catalogos?.CATEGORIAS ?? []).map((c) => [String(c.id), c.nombre])
  );
  const PROV = Object.fromEntries(
    (catalogos?.PROVEEDORES ?? []).map((p) => [String(p.id), p.nombre])
  );
  const AREA = Object.fromEntries(
    (catalogos?.AREAS ?? []).map((a) => [String(a.id), a.nombre])
  );

  const money = (value) => {
    if (value === null || value === undefined) return "-";
    const n = Number(value);
    if (isNaN(n)) return "-";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(n);
  };

  // Definiciones Sunmi V2 (camelCase)
  const imageSize = parseInt(ui.helpers.icon(3));
  const DEFINICIONES = {
    imagenUrl: {
      titulo: "Imagen",
      render: (v, row) =>
        row.imagenUrl ? (
          <img
            src={row.imagenUrl}
            className="object-cover border"
            style={{
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
              width: imageSize,
              height: imageSize,
              borderRadius: ui.helpers.radius("md"),
            }}
          />
        ) : (
          <div
            className="border flex items-center justify-center"
            style={{
              backgroundColor: "var(--sunmi-table-row-bg)",
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
              color: "var(--sunmi-text)",
              opacity: 0.5,
              width: imageSize,
              height: imageSize,
              borderRadius: ui.helpers.radius("md"),
              fontSize: ui.helpers.font("xs"),
            }}
          >
            -
          </div>
        ),
    },

    codigoBarra: { titulo: "Código" },
    sku: { titulo: "SKU" },
    nombre: { titulo: "Nombre" },

    categoriaId: {
      titulo: "Categoría",
      render: (v) =>
        v ? <SunmiPill color="cyan">{CAT[String(v)]}</SunmiPill> : "-",
    },

    proveedorId: {
      titulo: "Proveedor",
      render: (v) =>
        v ? <SunmiPill color="amber">{PROV[String(v)]}</SunmiPill> : "-",
    },

    areaFisicaId: {
      titulo: "Área",
      render: (v) =>
        v ? <SunmiPill color="slate">{AREA[String(v)]}</SunmiPill> : "-",
    },

    unidadMedida: {
      titulo: "Unidad",
      render: (v) => <SunmiPill color="cyan">{v}</SunmiPill>,
    },

    factorPack: { titulo: "Pack" },
    pesoKg: { titulo: "Peso (kg)" },
    volumenMl: { titulo: "Vol (ml)" },

    precioCosto: {
      titulo: "Costo",
      render: (v) => money(v),
    },

    margen: {
      titulo: "Margen %",
      render: (v) => (v !== null ? `${v}%` : "-"),
    },

    precioVenta: {
      titulo: "Venta",
      render: (v) => money(v),
    },

    ivaPorcentaje: {
      titulo: "IVA %",
      render: (v) => (v ? `${v}%` : "-"),
    },

    fechaVencimiento: {
      titulo: "Vencimiento",
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "-"),
    },

    esCombo: {
      titulo: "Combo",
      render: (v) =>
        v ? (
          <SunmiPill color="amber">Sí</SunmiPill>
        ) : (
          <SunmiPill color="slate">No</SunmiPill>
        ),
    },

    activo: {
      titulo: "Estado",
      render: (v) => <SunmiBadgeEstado value={v} />,
    },
  };

  const colsVisibles = columns
    .map((c) => {
      const def = DEFINICIONES[c.key];
      if (!def) return null;
      return {
        key: c.key,
        titulo: def.titulo,
        render: def.render,
      };
    })
    .filter(Boolean);

  return (
    <div
      className="border overflow-hidden"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("xl"),
      }}
    >
      <SunmiTable
        headers={[...colsVisibles.map((c) => c.titulo), "Acciones"]}
      >
        {rows.length === 0 ? (
          <SunmiTableEmpty label="Sin productos" />
        ) : (
          rows.map((row) => (
            <SunmiTableRow key={row.id}>
              {colsVisibles.map((c) => (
                <td
                  key={c.key}
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("sm"),
                  }}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "-"}
                </td>
              ))}

              {/* ACCIONES */}
              <td
                className="text-right"
                style={{
                  paddingLeft: ui.helpers.spacing("md"),
                  paddingRight: ui.helpers.spacing("md"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                <div
                  className="flex justify-end"
                  style={{
                    gap: ui.helpers.spacing("md"),
                  }}
                >
                  <button
                    onClick={() => onEditar(row.id)}
                    style={{
                      color: "#fcd34d", // amber-300
                      fontSize: ui.helpers.font("lg"),
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fde047"; // amber-200
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#fcd34d"; // amber-300
                    }}
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => onEliminar(row.id)}
                    style={{
                      color: "#f87171", // red-400
                      fontSize: ui.helpers.font("lg"),
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fca5a5"; // red-300
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#f87171"; // red-400
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </SunmiTableRow>
          ))
        )}
      </SunmiTable>

      {/* PAGINACIÓN */}
      <div
        className="flex justify-between border-t"
        style={{
          borderTopColor: "var(--sunmi-card-border)",
          borderTopWidth: "1px",
          padding: ui.helpers.spacing("md"),
        }}
      >
        <SunmiButton
          color="slate"
          disabled={page <= 1}
          onClick={onPrev}
        >
          « Anterior
        </SunmiButton>

        <SunmiButton
          color="slate"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Siguiente »
        </SunmiButton>
      </div>
    </div>
  );
}
