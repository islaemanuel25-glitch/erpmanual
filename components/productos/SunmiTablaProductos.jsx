"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";

import { Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

// Campos que se pueden ordenar desde el backend
const SORTABLE_KEYS = [
  "nombre", "codigoBarra", "precioCosto", "precioVenta",
  "margen", "categoriaId", "proveedorId", "activo",
];

const PAGE_SIZES = [25, 50, 100];

export default function SunmiTablaProductos({
  rows,
  columns,
  page,
  pageSize = 25,
  totalPages,
  totalItems = 0,
  onNext,
  onPrev,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSort,
  onEditar,
  onEliminar,
  catalogos,
}) {
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
      thClass: "w-[56px]",
      render: (_, row) =>
        row.imagenUrl ? (
          <img
            src={row.imagenUrl}
            className="w-12 h-12 rounded-md object-cover border sunmi-border"
            alt=""
          />
        ) : (
          <div className="w-12 h-12 sunmi-control border sunmi-border rounded-md flex items-center justify-center text-xs sunmi-text-muted">
            -
          </div>
        ),
    },

    codigoBarra: { titulo: "Código", thClass: "w-[140px]", tdClass: "truncate overflow-hidden sunmi-text-muted", titleKey: "codigoBarra" },
    sku: { titulo: "SKU", thClass: "w-[90px]" },
    nombre: {
      titulo: "Nombre",
      thClass: "min-w-[160px]",
      tdClass: "whitespace-normal break-words line-clamp-2 overflow-hidden leading-tight",
      titleKey: "nombre",
      render: (v, row) => (
        <span>
          {v}
          {row.modoCompraProveedor === "UNIDAD" && (
            <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-red-600 text-white leading-none align-middle">
              Fiambre
            </span>
          )}
        </span>
      ),
    },

    categoriaId: {
      titulo: "Categoría",
      thClass: "w-[100px]",
      render: (v) =>
        CAT[String(v)] ? (
          <SunmiPill color="amber">{CAT[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    proveedorId: {
      titulo: "Proveedor",
      thClass: "w-[100px]",
      render: (v) =>
        PROV[String(v)] ? (
          <SunmiPill color="cyan">{PROV[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    areaFisicaId: {
      titulo: "Área",
      thClass: "w-[100px]",
      render: (v) =>
        AREA[String(v)] ? (
          <SunmiPill color="slate">{AREA[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    unidadMedida: {
      titulo: "Unidad",
      thClass: "w-[80px]",
      render: (v) => <SunmiPill color="amber">{v}</SunmiPill>,
    },

    factorPack: { titulo: "Pack", thClass: "w-[56px]", tdClass: "text-center" },
    pesoKg: { titulo: "Peso", thClass: "w-[56px]", tdClass: "text-center" },
    volumenMl: { titulo: "Vol", thClass: "w-[56px]", tdClass: "text-center" },

    precioCosto: {
      titulo: "Costo",
      thClass: "w-[90px]",
      tdClass: "text-right",
      render: money,
    },

    margen: {
      titulo: "Margen",
      thClass: "w-[70px]",
      tdClass: "text-right",
      render: (v) => (v != null ? `${Number(v).toFixed(1)}%` : "-"),
    },

    precioVenta: {
      titulo: "Venta",
      thClass: "w-[90px]",
      tdClass: "text-right",
      render: money,
    },

    ivaPorcentaje: {
      titulo: "IVA %",
      thClass: "w-[80px]",
      render: (v) => (v != null ? `${v}%` : "-"),
    },

    fechaVencimiento: {
      titulo: "Vencimiento",
      thClass: "w-[100px]",
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "-"),
    },

    esCombo: {
      titulo: "Combo",
      thClass: "w-[70px]",
      render: (v) =>
        v ? (
          <SunmiPill color="cyan">Sí</SunmiPill>
        ) : (
          <SunmiPill color="slate">No</SunmiPill>
        ),
    },

    activo: {
      titulo: "Estado",
      thClass: "w-[80px]",
      render: (v) => <SunmiBadgeEstado value={v} />,
    },
  };

  const columnas = columns
    .map((c) => {
      if (!DEFINICIONES[c.key]) return null;
      return {
        key: c.key,
        titulo: DEFINICIONES[c.key].titulo,
        thClass: DEFINICIONES[c.key].thClass,
        tdClass: DEFINICIONES[c.key].tdClass,
        titleKey: DEFINICIONES[c.key].titleKey,
        render: DEFINICIONES[c.key].render,
      };
    })
    .filter(Boolean);

  const headers = [
    ...columnas.map((c) => {
      const isSortable = SORTABLE_KEYS.includes(c.key);
      const isActive = sortKey === c.key;

      const sortIcon = isSortable
        ? isActive
          ? sortDir === "asc"
            ? <ArrowUp size={11} className="inline ml-0.5" />
            : <ArrowDown size={11} className="inline ml-0.5" />
          : <ArrowUpDown size={11} className="inline ml-0.5 opacity-30" />
        : null;

      const label = (
        <span
          className={isSortable ? "cursor-pointer select-none hover:text-[var(--pos-accent)] transition-colors" : ""}
          onClick={isSortable ? () => onSort?.(c.key) : undefined}
        >
          {c.titulo}
          {sortIcon}
        </span>
      );

      // Siempre devolver { label, className } para que SunmiTable renderice el encabezado (si no hay thClass, h.label era undefined)
      return { label, className: c.thClass || "" };
    }),
    { label: "Acciones", className: "w-[80px]" },
  ];
  const colSpan = headers.length;

  return (
    <div className="overflow-x-auto sm:overflow-hidden rounded-xl border sunmi-border">
      <SunmiTable headers={headers}>
        {rows.length === 0 ? (
          <SunmiTableEmpty message="No hay productos disponibles" colSpan={colSpan} />
        ) : (
          rows.map((row) => (
            <SunmiTableRow key={row.id}>
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 text-[12px] ${c.tdClass || "whitespace-nowrap"}`}
                  title={c.titleKey ? String(row[c.titleKey] ?? "") : undefined}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "-"}
                </td>
              ))}

              <td className="px-3 py-1.5 w-[80px] text-right flex gap-1 justify-end">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onEditar && row.id) onEditar(row.id);
                  }}
                  className="
                    w-[26px] h-[26px]
                    flex items-center justify-center
                    rounded-md
                    sunmi-btn-secondary
                    transition
                    cursor-pointer
                  "
                  type="button"
                  aria-label="Editar"
                >
                  <Pencil size={14} />
                </button>

                <button
                  onClick={() => onEliminar(row.id)}
                  className="
                    w-[26px] h-[26px]
                    flex items-center justify-center
                    rounded-md
                    sunmi-btn-red
                    transition
                  "
                  type="button"
                  aria-label="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </SunmiTableRow>
          ))
        )}
      </SunmiTable>

      <div className="flex items-center justify-between px-3 py-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <SunmiButton color="slate" disabled={page <= 1} onClick={onPrev}>
            « Anterior
          </SunmiButton>

          <span className="sunmi-text-muted text-[11px]">
            Página {page} / {totalPages}
            {totalItems > 0 && <span className="ml-1 opacity-70">({totalItems} items)</span>}
          </span>

          <SunmiButton color="slate" disabled={page >= totalPages} onClick={onNext}>
            Siguiente »
          </SunmiButton>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="sunmi-text-muted text-[11px]">Mostrar</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onPageSizeChange?.(size)}
              className={`
                px-2 py-0.5 rounded text-[11px] font-medium transition
                ${pageSize === size
                  ? "sunmi-badge-accent"
                  : "sunmi-control"
                }
              `}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
