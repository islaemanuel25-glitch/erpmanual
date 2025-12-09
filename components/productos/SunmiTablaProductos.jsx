"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";

import { Pencil, Trash2 } from "lucide-react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTablaProductos({
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
  const CAT = Object.fromEntries(
    (catalogos?.CATEGORIAS ?? []).map((c) => [String(c.id), c.nombre])
  );
  const PROV = Object.fromEntries(
    (catalogos?.PROVEEDORES ?? []).map((p) => [String(p.id), p.nombre])
  );
  const AREA = Object.fromEntries(
    (catalogos?.AREAS ?? []).map((a) => [String(a.id), a.nombre])
  );

  const money = (v) => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (isNaN(n)) return "-";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(n);
  };

  const DEFINICIONES = {
    imagenUrl: {
      titulo: "Img",
      className: "w-16",
      render: (_, row) => {
        const imageSize = parseInt(ui.helpers.icon(3));
        return row.imagenUrl ? (
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
        );
      },
    },

    codigoBarra: { titulo: "Código" },
    sku: { titulo: "SKU" },
    nombre: { titulo: "Nombre" },

    categoriaId: {
      titulo: "Categoría",
      render: (v) =>
        CAT[String(v)] ? (
          <SunmiPill color="amber">{CAT[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    proveedorId: {
      titulo: "Proveedor",
      render: (v) =>
        PROV[String(v)] ? (
          <SunmiPill color="cyan">{PROV[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    areaFisicaId: {
      titulo: "Área",
      render: (v) =>
        AREA[String(v)] ? (
          <SunmiPill color="slate">{AREA[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    unidadMedida: {
      titulo: "Unidad",
      render: (v) => <SunmiPill color="amber">{v}</SunmiPill>,
    },

    factorPack: { titulo: "Pack" },
    pesoKg: { titulo: "Peso" },
    volumenMl: { titulo: "Vol" },

    precioCosto: {
      titulo: "Costo",
      render: money,
    },

    margen: {
      titulo: "Margen %",
      render: (v) => (v != null ? `${Number(v).toFixed(2)}%` : "-"),
    },

    precioVenta: {
      titulo: "Venta",
      render: money,
    },

    ivaPorcentaje: {
      titulo: "IVA %",
      render: (v) => (v != null ? `${v}%` : "-"),
    },

    fechaVencimiento: {
      titulo: "Vencimiento",
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "-"),
    },

    esCombo: {
      titulo: "Combo",
      render: (v) =>
        v ? (
          <SunmiPill color="cyan">Sí</SunmiPill>
        ) : (
          <SunmiPill color="slate">No</SunmiPill>
        ),
    },

    activo: {
      titulo: "Estado",
      render: (v) => <SunmiBadgeEstado value={v} />,
    },
  };

  const columnas = columns
    .map((c) => {
      if (!DEFINICIONES[c.key]) return null;
      return {
        key: c.key,
        titulo: DEFINICIONES[c.key].titulo,
        className: DEFINICIONES[c.key].className,
        render: DEFINICIONES[c.key].render,
      };
    })
    .filter(Boolean);

  const buttonSize = parseInt(ui.helpers.icon(1.5));
  const iconSize = parseInt(ui.helpers.icon(0.875));

  return (
    <div
      className="overflow-hidden border"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("xl"),
      }}
    >
      <SunmiTable headers={[...columnas.map((c) => c.titulo), "Acciones"]}>
        {rows.length === 0 ? (
          <SunmiTableEmpty label="No hay productos disponibles" />
        ) : (
          rows.map((row) => (
            <SunmiTableRow key={row.id}>
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className="whitespace-nowrap"
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                    fontSize: ui.helpers.font("sm"),
                  }}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "-"}
                </td>
              ))}

              {/* ⭐ ACCIONES COMPACTAS */}
              <td
                className="text-right flex justify-end"
                style={{
                  paddingLeft: ui.helpers.spacing("md"),
                  paddingRight: ui.helpers.spacing("md"),
                  paddingTop: ui.helpers.spacing("xs"),
                  paddingBottom: ui.helpers.spacing("xs"),
                  gap: ui.helpers.spacing("xs"),
                }}
              >
                {/* EDITAR */}
                <button
                  onClick={() => onEditar(row.id)}
                  className="flex items-center justify-center transition"
                  style={{
                    backgroundColor: "#fbbf24", // amber-400
                    color: "#0f172a", // slate-900
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: ui.helpers.radius("md"),
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#fcd34d"; // amber-300
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#fbbf24"; // amber-400
                  }}
                >
                  <Pencil size={iconSize} />
                </button>

                {/* ELIMINAR */}
                <button
                  onClick={() => onEliminar(row.id)}
                  className="flex items-center justify-center transition"
                  style={{
                    backgroundColor: "#ef4444", // red-500
                    color: "#ffffff", // white
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: ui.helpers.radius("md"),
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f87171"; // red-400
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ef4444"; // red-500
                  }}
                >
                  <Trash2 size={iconSize} />
                </button>

              </td>
            </SunmiTableRow>
          ))
        )}
      </SunmiTable>

      {/* PAGINACIÓN */}
      <div
        className="flex items-center justify-between"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          paddingLeft: ui.helpers.spacing("md"),
          paddingRight: ui.helpers.spacing("md"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
        }}
      >
        <SunmiButton color="slate" disabled={page <= 1} onClick={onPrev}>
          « Anterior
        </SunmiButton>

        <span
          style={{
            color: "var(--sunmi-text)",
            opacity: 0.8,
            fontSize: ui.helpers.font("sm"),
          }}
        >
          Página {page} / {totalPages}
        </span>

        <SunmiButton color="slate" disabled={page >= totalPages} onClick={onNext}>
          Siguiente »
        </SunmiButton>
      </div>
    </div>
  );
}
