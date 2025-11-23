"use client";

import UiTable from "@/components/UiTable";
import { Pencil, Trash2 } from "lucide-react";

export default function TablaProductos({
  rows,
  columns,        // columnas visibles (camelCase)
  page,
  totalPages,
  onNext,
  onPrev,
  onEditar,
  onEliminar,
  catalogos,
}) {
  // ✅ Diccionarios desde catálogos
  const CAT  = Object.fromEntries((catalogos?.CATEGORIAS ?? []).map(c => [String(c.id), c.nombre]));
  const PROV = Object.fromEntries((catalogos?.PROVEEDORES ?? []).map(p => [String(p.id), p.nombre]));
  const AREA = Object.fromEntries((catalogos?.AREAS ?? []).map(a => [String(a.id), a.nombre]));

  const money = (value) => {
    if (value === null || value === undefined) return "-";
    const n = Number(value);
    if (isNaN(n)) return "-";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0
    }).format(n);
  };

  // 🔑 Definiciones en **camelCase** (coinciden con lo que devuelve tu API)
  const DEFINICIONES = {
    imagenUrl: {
      titulo: "Imagen",
      width: "w-16",
      render: (_, row) =>
        row.imagenUrl ? (
          <img src={row.imagenUrl} className="w-12 h-12 rounded-md object-cover border" />
        ) : (
          <div className="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center text-xs text-gray-500">
            -
          </div>
        ),
    },

    codigoBarra: { titulo: "Código", width: "w-28" },
    sku: { titulo: "SKU", width: "w-20" },
    nombre: { titulo: "Nombre", width: "min-w-64" },

    categoriaId: {
      titulo: "Categoría",
      width: "w-32",
      render: (v) => CAT[String(v)] ?? "-",
    },

    proveedorId: {
      titulo: "Proveedor",
      width: "w-32",
      render: (v) => PROV[String(v)] ?? "-",
    },

    areaFisicaId: {
      titulo: "Área física",
      width: "w-28",
      render: (v) => AREA[String(v)] ?? "-",
    },

    unidadMedida: {
      titulo: "Unidad",
      width: "w-20",
      render: (v) => (
        <span className="px-2 py-[2px] rounded-full bg-blue-100 text-blue-700 text-xs">
          {v}
        </span>
      ),
    },

    factorPack: { titulo: "Pack", width: "w-20" },
    pesoKg: { titulo: "Peso (kg)", width: "w-20" },
    volumenMl: { titulo: "Vol (ml)", width: "w-20" },

    precioCosto: {
      titulo: "Costo",
      width: "w-24",
      render: (v) => money(v),
    },

    margen: {
      titulo: "Margen %",
      width: "w-20",
      render: (v) => (v !== null && v !== undefined ? `${Number(v).toFixed(2)}%` : "-"),
    },

    precioVenta: {
      titulo: "Venta",
      width: "w-24",
      render: (v) => money(v),
    },

    ivaPorcentaje: {
      titulo: "IVA %",
      width: "w-20",
      render: (v) => (v !== null && v !== undefined ? `${v}%` : "-"),
    },

    fechaVencimiento: {
      titulo: "Vencimiento",
      width: "w-28",
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "-"),
    },

    esCombo: {
      titulo: "Combo",
      width: "w-20",
      render: (v) => (v ? "Sí" : "No"),
    },

    activo: {
      titulo: "Estado",
      width: "w-20",
      render: (v) => (v ? "Activo" : "Inactivo"),
    },
  };

  // ✅ Columnas visibles (vienen en camelCase desde ColumnManager)
  const columnas = columns.map(c => {
    const def = DEFINICIONES[c.key];
    if (!def) return null;
    return {
      key: c.key,
      titulo: def.titulo,
      width: def.width,
      render: def.render,
    };
  }).filter(Boolean);

  const acciones = (row) => (
    <div className="flex gap-2">
      <button onClick={() => onEditar(row.id)} className="text-blue-600">
        <Pencil size={16} />
      </button>
      <button onClick={() => onEliminar(row.id)} className="text-red-600">
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-lg border">
      <UiTable
        columnas={columnas}
        datos={rows}
        page={page}
        totalPages={totalPages}
        onNext={onNext}
        onPrev={onPrev}
        accionesPersonalizadas={acciones}
      />
    </div>
  );
}
