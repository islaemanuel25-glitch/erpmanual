"use client";

import { useEffect, useRef, useState } from "react";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

export default function FiltrosStock({
  localSeleccionado,
  onFiltroChange,
  onReset,
  compact = false,
}) {
  const [categoria, setCategoria] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [area, setArea] = useState("");

  const [conStock, setConStock] = useState(false);
  const [sinStock, setSinStock] = useState(false);
  const [faltantes, setFaltantes] = useState(false);

  const [categorias, setCategorias] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [areas, setAreas] = useState([]);

  const debounceRef = useRef(null);

  // Cargar catálogos al montar
  useEffect(() => {
    const cargar = async () => {
      try {
        const [catRes, provRes, areaRes] = await Promise.all([
          fetch("/api/catalogos/categorias", { credentials: "include" }),
          fetch("/api/catalogos/proveedores", { credentials: "include" }),
          fetch("/api/catalogos/areas-fisicas", { credentials: "include" }),
        ]);

        const [cat, prov, ar] = await Promise.all([
          catRes.ok ? catRes.json() : { items: [] },
          provRes.ok ? provRes.json() : { items: [] },
          areaRes.ok ? areaRes.json() : { items: [] },
        ]);

        setCategorias(cat.items ?? []);
        setProveedores(prov.items ?? []);
        setAreas(ar.items ?? []);
      } catch (err) {
        console.error("Error cargando catálogos para filtros:", err);
      }
    };
    cargar();
  }, []);

  // Debounce filtros
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      onFiltroChange({
        categoria,
        proveedor,
        area,
        conStock,
        sinStock,
        faltantes,
      });
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [categoria, proveedor, area, conStock, sinStock, faltantes, onFiltroChange]);

  const resetFiltros = () => {
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
      <div className="flex items-center gap-2">
        <button
          onClick={resetFiltros}
          className="sunmi-btn sunmi-btn-red h-[38px]"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Selectores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <SunmiSelectAdv
          value={categoria}
          onChange={(val) => setCategoria(val)}
          searchable
        >
          <option value="">Categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.nombre}</option>
          ))}
        </SunmiSelectAdv>

        <SunmiSelectAdv
          value={proveedor}
          onChange={(val) => setProveedor(val)}
          searchable
        >
          <option value="">Proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={String(p.id)}>{p.nombre}</option>
          ))}
        </SunmiSelectAdv>

        <SunmiSelectAdv
          value={area}
          onChange={(val) => setArea(val)}
          searchable
        >
          <option value="">Área física</option>
          {areas.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.nombre}</option>
          ))}
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
