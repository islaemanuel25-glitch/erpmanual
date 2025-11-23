"use client";

import UiTable from "@/components/UiTable";
import { Pencil, Trash2 } from "lucide-react";

export default function TablaRoles({
  rows,
  columns,
  page,
  totalPages,
  onNext,
  onPrev,
  onEditar,
  onEliminar,
}) {
  
  const DEFINICIONES = {
    nombre: {
      titulo: "Nombre",
      width: "min-w-40",
    },

    permisos: {
      titulo: "Permisos",
      width: "min-w-96",
      render: (arr) =>
        Array.isArray(arr)
          ? arr.join(", ")
          : "-",
    },
  };

  const columnas = columns
    .map((c) => {
      const def = DEFINICIONES[c.key];
      if (!def) return null;
      return {
        key: c.key,
        titulo: def.titulo,
        width: def.width,
        render: def.render,
      };
    })
    .filter(Boolean);

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
