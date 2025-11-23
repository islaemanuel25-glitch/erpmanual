"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

export default function FiltrosProductos({ onChange, catalogos, initial }) {
  const [search, setSearch] = useState(initial.search || "");
  const [categoria, setCategoria] = useState(initial.categoria || "");
  const [proveedor, setProveedor] = useState(initial.proveedor || "");
  const [area, setArea] = useState(initial.area || "");

  // ✅ ESTE ERA EL PROBLEMA — AHORA ESTÁ 100% CORRECTO
  const [activo, setActivo] = useState(initial.activo ?? "");

  const [open, setOpen] = useState(false);

  // ✅ debounce 250ms
  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange({ search, categoria, proveedor, area, activo });
    }, 250);

    return () => clearTimeout(timeout);
  }, [search, categoria, proveedor, area, activo]);

  const limpiar = () => {
    setSearch("");
    setCategoria("");
    setProveedor("");
    setArea("");
    setActivo("");
  };

  return (
    <div className="flex flex-col gap-3">

      {/* ✅ BARRA SUPERIOR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">

        {/* ✅ BUSCADOR */}
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto, código o categoría..."
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

        {/* ✅ BOTÓN MÁS FILTROS */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-[38px] px-4 rounded-lg border bg-white text-gray-700 flex items-center gap-2 text-[14px]"
        >
          Más filtros
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ✅ PANEL AVANZADO */}
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded-lg border bg-gray-50 shadow-sm animate-filters">

          {/* CATEGORÍA */}
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="h-[36px] px-3 rounded-md border bg-white text-[13px]"
          >
            <option value="">Categoría...</option>
            {catalogos.CATEGORIAS?.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>

          {/* PROVEEDOR */}
          <select
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="h-[36px] px-3 rounded-md border bg-white text-[13px]"
          >
            <option value="">Proveedor...</option>
            {catalogos.PROVEEDORES?.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>

          {/* ÁREA FÍSICA */}
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="h-[36px] px-3 rounded-md border bg-white text-[13px]"
          >
            <option value="">Área física...</option>
            {catalogos.AREAS?.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>

          {/* ✅ ESTADO (CORREGIDO) */}
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
