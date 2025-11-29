"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function UiTable({
  columnas = [],
  datos = [],
  page = 1,
  totalPages = 1,
  onNext,
  onPrev,
  accionesPersonalizadas,
  onSortChange,
}) {
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  // ================================
  // ORDENAMIENTO
  // ================================
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

  const renderSortIcon = (col) => {
    if (sortBy !== col.key)
      return <ChevronUp size={14} className="opacity-30 -mb-1" />;

    if (sortDir === "asc")
      return <ChevronUp size={14} className="text-amber-400 -mb-1" />;

    return <ChevronDown size={14} className="text-amber-400 -mb-1" />;
  };

  // ================================
  // RENDER SEGURO
  // ================================
  const safeRender = (col, row) => {
    try {
      const valor = row[col.key];

      if (col.render) {
        const out = col.render(valor, row);
        if (out === null || out === undefined || out === "")
          return <span className="text-slate-500">-</span>;

        return out;
      }

      if (valor === null || valor === undefined || valor === "")
        return <span className="text-slate-500">-</span>;

      return valor;
    } catch {
      return <span className="text-slate-500">-</span>;
    }
  };

  // ================================
  // UI SUNMI V2
  // ================================
  return (
    <div className="flex flex-col h-full w-full border border-slate-800 rounded-2xl overflow-hidden bg-slate-900 text-slate-200 text-[13px]">
      
      {/* SCROLL */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full">
          
          {/* HEADER AMARILLO */}
          <thead className="sticky top-0 z-10 bg-amber-400 text-slate-900 shadow">
            <tr>
              {columnas.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1">
                    {col.titulo}
                    {renderSortIcon(col)}
                  </div>
                </th>
              ))}

              {accionesPersonalizadas && (
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide">
                  Acciones
                </th>
              )}
            </tr>
          </thead>

          {/* FILAS */}
          <tbody>
            {datos.length === 0 ? (
              <tr>
                <td
                  colSpan={columnas.length + (accionesPersonalizadas ? 1 : 0)}
                  className="text-center text-slate-400 py-6"
                >
                  Sin resultados
                </td>
              </tr>
            ) : (
              datos.map((row, idx) => (
                <tr
                  key={idx}
                  className={`
                    border-b border-slate-800
                    ${idx % 2 === 0 ? "bg-slate-950" : "bg-slate-900"}
                    hover:bg-amber-300 hover:text-slate-900 transition
                  `}
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

      {/* PAGINACIÓN SUNMI */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-t border-slate-800 text-[13px]">
        <SunmiButton
          color="slate"
          disabled={page <= 1}
          onClick={onPrev}
        >
          « Anterior
        </SunmiButton>

        <span className="text-slate-300">
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
