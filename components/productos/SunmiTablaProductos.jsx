"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";

import { Pencil, Trash2 } from "lucide-react";

export default function SunmiTablaProductos({
  rows,
  columns,       // columnas visibles (camelCase)
  page,
  totalPages,
  onNext,
  onPrev,
  onEditar,
  onEliminar,
  catalogos,
}) {
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

  // Formato ARS
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

  // Definiciones en camelCase igual que tu API
  const DEFINICIONES = {
    imagenUrl: {
      titulo: "Img",
      className: "w-16",
      render: (_, row) =>
        row.imagenUrl ? (
          <img
            src={row.imagenUrl}
            className="w-12 h-12 rounded-md object-cover border border-slate-700"
          />
        ) : (
          <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-md flex items-center justify-center text-xs text-slate-500">
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

  // Columnas visibles
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

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800">
      {/* Header amarillo Sunmi */}
      <div className="bg-[#FACC15] text-slate-900 font-semibold px-4 py-2 flex justify-between">
        <span>Listado de productos</span>
      </div>

      {/* TABLA */}
      <SunmiTable headers={[...columnas.map((c) => c.titulo), "Acciones"]}>
        {rows.length === 0 ? (
          <SunmiTableEmpty label="No hay productos" />
        ) : (
          rows.map((row) => (
            <SunmiTableRow key={row.id}>
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className="px-3 py-2 whitespace-nowrap text-[13px]"
                >
                  {c.render
                    ? c.render(row[c.key], row)
                    : row[c.key] ?? "-"}
                </td>
              ))}

              {/* Acciones */}
              <td className="px-3 py-2 flex gap-3 text-right">
                <button
                  onClick={() => onEditar(row.id)}
                  className="text-amber-300 hover:text-amber-200"
                >
                  <Pencil size={16} />
                </button>

                <button
                  onClick={() => onEliminar(row.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </SunmiTableRow>
          ))
        )}
      </SunmiTable>

      {/* Paginación SUNMI */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-t border-slate-800">
        <SunmiButton
          color="slate"
          disabled={page <= 1}
          onClick={onPrev}
        >
          « Anterior
        </SunmiButton>

        <span className="text-slate-300 text-sm">
          Página {page} / {totalPages}
        </span>

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
