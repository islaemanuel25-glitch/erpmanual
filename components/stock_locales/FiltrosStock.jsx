"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export default function FiltrosStock({
  localSeleccionado,
  onFiltroChange,
  onReset,
}) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [area, setArea] = useState("");

  const [conStock, setConStock] = useState(false);
  const [sinStock, setSinStock] = useState(false);
  const [faltantes, setFaltantes] = useState(false);

  const debounceRef = useRef(null);

  // 🔄 Debounce filtros (200ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      onFiltroChange({
        q,
        categoria,
        proveedor,
        area,
        conStock,
        sinStock,
        faltantes,
      });
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [q, categoria, proveedor, area, conStock, sinStock, faltantes, onFiltroChange]);

  // 🔄 Reset filtros
  const resetFiltros = () => {
    setQ("");
    setCategoria("");
    setProveedor("");
    setArea("");
    setConStock(false);
    setSinStock(false);
    setFaltantes(false);
    onReset?.();
  };

  return (
    <div className="sunmi-card">

      {/* HEADER */}
      <div className="sunmi-header-cyan">Filtros</div>

      <div className="mt-3 flex flex-col gap-3">

        {/* 🔍 Buscador */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 w-full h-[38px]">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o código…"
              className="bg-transparent px-2 py-1 w-full outline-none text-[13px] text-slate-100"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <button
            onClick={resetFiltros}
            className="sunmi-btn sunmi-btn-red h-[38px]"
          >
            Limpiar
          </button>
        </div>

        {/* 🧩 Selectores */}
        <div className="grid grid-cols-3 gap-2">
          <select
            className="sunmi-input text-[12px] h-[34px]"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">Categoría</option>
          </select>

          <select
            className="sunmi-input text-[12px] h-[34px]"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
          >
            <option value="">Proveedor</option>
          </select>

          <select
            className="sunmi-input text-[12px] h-[34px]"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">Área física</option>
          </select>
        </div>

        {/* ✔ Checkboxes */}
        <div className="grid grid-cols-3 gap-2 text-[12px] text-slate-300">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={conStock}
              onChange={(e) => setConStock(e.target.checked)}
              className="scale-90"
            />
            Con stock
          </label>

          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={sinStock}
              onChange={(e) => setSinStock(e.target.checked)}
              className="scale-90"
            />
            Sin stock
          </label>

          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={faltantes}
              onChange={(e) => setFaltantes(e.target.checked)}
              className="scale-90"
            />
            Faltantes
          </label>
        </div>
      </div>
    </div>
  );
}
