"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

export default function FiltrosRoles({ onChange, initial }) {
  const [search, setSearch] = useState(initial.search || "");
  const [activo, setActivo] = useState(initial.activo ?? "");
  const [open, setOpen] = useState(false);

  // ✅ debounce 250ms
  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange({ search, activo });
    }, 250);

    return () => clearTimeout(timeout);
  }, [search, activo]);

  const limpiar = () => {
    setSearch("");
    setActivo("");
  };

  return (
    <div className="flex flex-col gap-3">

      {/* BARRA SUPERIOR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">

        {/* BUSCADOR */}
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar rol..."
            className="w-full h-[38px] pl-10 pr-9 rounded-lg border border-gray-300 bg-white text-gray-700 text-[14px] focus:border-blue-500"
          />

          {search.trim() !== "" && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* BOTÓN MÁS FILTROS */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-[38px] px-4 rounded-lg border bg-white text-gray-700 flex items-center gap-2 text-[14px]"
        >
          Más filtros
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* PANEL AVANZADO */}
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg border bg-gray-50 shadow-sm animate-filters">
          
          {/* ESTADO */}
          <select
            value={activo}
            onChange={(e) => setActivo(e.target.value)}
            className="h-[36px] px-3 rounded-md border bg-white text-[13px]"
          >
            <option value="">Estado...</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>

          {/* LIMPIAR */}
          <button
            onClick={limpiar}
            className="h-[36px] px-3 rounded-md border bg-white text-[13px] text-gray-700"
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}
