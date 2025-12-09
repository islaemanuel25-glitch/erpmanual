"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function FiltrosStock({
  localSeleccionado,
  onFiltroChange,
  onReset,
}) {
  const { ui } = useUIConfig();
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
  }, [
    q,
    categoria,
    proveedor,
    area,
    conStock,
    sinStock,
    faltantes,
    onFiltroChange,
  ]);

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

      <div
        className="flex flex-col"
        style={{
          marginTop: ui.helpers.spacing("md"),
          gap: ui.helpers.spacing("md"),
        }}
      >
        {/* 🔍 Buscador */}
        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <div
            className="flex items-center bg-slate-900 border border-slate-700 w-full"
            style={{
              borderRadius: ui.helpers.radius("lg"),
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              height: parseInt(ui.helpers.controlHeight()) * 1.2,
            }}
          >
            <Search
              size={parseInt(ui.helpers.icon(1))}
              className="text-slate-400"
            />

            <input
              type="text"
              placeholder="Buscar por nombre o código…"
              className="bg-transparent w-full outline-none text-slate-100"
              style={{
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("xs"),
                paddingBottom: ui.helpers.spacing("xs"),
                fontSize: ui.helpers.font("sm"),
              }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <button
            onClick={resetFiltros}
            className="sunmi-btn sunmi-btn-red"
            style={{
              height: parseInt(ui.helpers.controlHeight()) * 1.2,
            }}
          >
            Limpiar
          </button>
        </div>

        {/* 🧩 Selectores */}
        <div
          className="grid grid-cols-3"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <select
            className="sunmi-input"
            style={{
              fontSize: ui.helpers.font("xs"),
              height: parseInt(ui.helpers.controlHeight()) * 1.1,
            }}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">Categoría</option>
          </select>

          <select
            className="sunmi-input"
            style={{
              fontSize: ui.helpers.font("xs"),
              height: parseInt(ui.helpers.controlHeight()) * 1.1,
            }}
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
          >
            <option value="">Proveedor</option>
          </select>

          <select
            className="sunmi-input"
            style={{
              fontSize: ui.helpers.font("xs"),
              height: parseInt(ui.helpers.controlHeight()) * 1.1,
            }}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">Área física</option>
          </select>
        </div>

        {/* ✔ Checkboxes */}
        <div
          className="grid grid-cols-3 text-slate-300"
          style={{
            gap: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <label
            className="flex items-center"
            style={{
              gap: ui.helpers.spacing("xs"),
            }}
          >
            <input
              type="checkbox"
              checked={conStock}
              onChange={(e) => setConStock(e.target.checked)}
              className="scale-90"
            />
            Con stock
          </label>

          <label
            className="flex items-center"
            style={{
              gap: ui.helpers.spacing("xs"),
            }}
          >
            <input
              type="checkbox"
              checked={sinStock}
              onChange={(e) => setSinStock(e.target.checked)}
              className="scale-90"
            />
            Sin stock
          </label>

          <label
            className="flex items-center"
            style={{
              gap: ui.helpers.spacing("xs"),
            }}
          >
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
