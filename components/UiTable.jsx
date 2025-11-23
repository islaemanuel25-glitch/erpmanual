"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export default function UiTable({
  columnas = [],
  datos = [],
  page = 1,
  totalPages = 1,
  onNext,
  onPrev,
  accionesPersonalizadas,
  onSortChange
}) {
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  // ✅ Manejar click en encabezado
  const handleSort = (col) => {
    if (!onSortChange) return;

    let newDir = "asc";

    if (sortBy === col.key && sortDir === "asc") {
      newDir = "desc";
    } else if (sortBy === col.key && sortDir === "desc") {
      setSortBy(null);
      setSortDir(null);
      onSortChange(null, null);
      return;
    }

    setSortBy(col.key);
    setSortDir(newDir);
    onSortChange(col.key, newDir);
  };

  // ✅ Iconos de orden
  const renderSortIcon = (col) => {
    if (sortBy !== col.key) {
      return <ChevronUp size={14} className="opacity-30 inline-block -mb-1" />;
    }
    if (sortDir === "asc") {
      return <ChevronUp size={14} className="inline-block -mb-1" />;
    }
    if (sortDir === "desc") {
      return <ChevronDown size={14} className="inline-block -mb-1" />;
    }
  };

  // ✅ Normaliza los valores nulos o vacíos
  const safeRender = (col, row) => {
    try {
      const valor = row[col.key];
      if (col.render) {
        const out = col.render(valor, row);
        // Si el render devuelve null o undefined → mostramos “-”
        if (out === null || out === undefined || out === "") {
          return <span className="text-gray-400">-</span>;
        }
        return out;
      }
      // Si no hay render personalizado
      if (valor === null || valor === undefined || valor === "") {
        return <span className="text-gray-400">-</span>;
      }
      return valor;
    } catch {
      return <span className="text-gray-400">-</span>;
    }
  };

  return (
    <div className="flex flex-col h-full w-full border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* ✅ CONTENEDOR SCROLL */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-[13px] text-gray-800">
          {/* ✅ ENCABEZADO */}
          <thead className="sticky top-0 z-10 bg-[#eef2f6]">
            <tr className="border-b border-[#c7d0dd]">
              {columnas.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-[12px] font-semibold text-gray-700 uppercase tracking-wide cursor-pointer select-none"
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {col.titulo}
                    {renderSortIcon(col)}
                  </div>
                </th>
              ))}

              {accionesPersonalizadas && (
                <th className="px-3 py-2 text-left text-[12px] font-semibold text-gray-700 uppercase tracking-wide">
                  Acciones
                </th>
              )}
            </tr>
          </thead>

          {/* ✅ FILAS */}
          <tbody>
            {datos.length === 0 ? (
              <tr>
                <td
                  colSpan={columnas.length + (accionesPersonalizadas ? 1 : 0)}
                  className="text-center text-gray-500 py-6"
                >
                  No hay registros para mostrar
                </td>
              </tr>
            ) : (
              datos.map((row, idx) => (
                <tr
                  key={idx}
                  className="h-[34px] border-b border-gray-200 hover:bg-gray-50 transition"
                >
                  {columnas.map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      {safeRender(col, row)}
                    </td>
                  ))}

                  {accionesPersonalizadas && (
                    <td className="px-3 py-2">
                      {accionesPersonalizadas(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ PAGINACIÓN */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-[13px]">
        <button
          disabled={page <= 1}
          onClick={onPrev}
          className="px-3 py-1 rounded border bg-white disabled:opacity-40 hover:bg-gray-100"
        >
          Anterior
        </button>

        <span className="text-gray-600">
          Página {page} / {totalPages}
        </span>

        <button
          disabled={page >= totalPages}
          onClick={onNext}
          className="px-3 py-1 rounded border bg-white disabled:opacity-40 hover:bg-gray-100"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
