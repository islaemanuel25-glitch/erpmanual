"use client";

import { useEffect, useRef, useState } from "react";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function FiltrosStock({
  localSeleccionado,
  onFiltroChange,
  onReset,
  compact = false,
}) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [area, setArea] = useState("");

  const [conStock, setConStock] = useState(false);
  const [sinStock, setSinStock] = useState(false);
  const [faltantes, setFaltantes] = useState(false);

  const debounceRef = useRef(null);

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

  const contenido = (
    <div className="flex flex-col gap-3">
      {/* Buscador */}
      <div className="flex items-center gap-2">
        <SunmiInput
          type="text"
          placeholder="Buscar por nombre o código…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <button
          onClick={resetFiltros}
          className="sunmi-btn sunmi-btn-red h-[38px]"
        >
          Limpiar
        </button>
      </div>

      {/* Selectores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <SunmiSelectAdv
          value={categoria}
          onChange={(val) => setCategoria(val)}
        >
          <option value="">Categoría</option>
        </SunmiSelectAdv>

        <SunmiSelectAdv
          value={proveedor}
          onChange={(val) => setProveedor(val)}
        >
          <option value="">Proveedor</option>
        </SunmiSelectAdv>

        <SunmiSelectAdv
          value={area}
          onChange={(val) => setArea(val)}
        >
          <option value="">Área física</option>
        </SunmiSelectAdv>
      </div>

      {/* Checkboxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px] sunmi-label">
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
  );

  if (compact) return contenido;

  return (
    <div className="sunmi-card">
      <div className="sunmi-header-accent">Filtros</div>
      <div className="mt-3">{contenido}</div>
    </div>
  );
}
