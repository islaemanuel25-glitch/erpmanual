"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function BuscadorProductos({ localId, onAgregar }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const lastKeyTime = useRef(0);
  const scanBuffer = useRef("");

  // Autofocus al montar
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Buscar productos
  const buscar = useCallback(
    async (texto) => {
      if (!texto.trim() || !localId) {
        setResultados([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/pos-ventas/buscar-producto?q=${encodeURIComponent(texto)}&localId=${localId}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) {
          setResultados(data.items || []);
        }
      } catch (err) {
        console.error("Error buscando:", err);
      } finally {
        setLoading(false);
      }
    },
    [localId]
  );

  // Deteccion de scanner: Enter rapido (<200ms entre teclas)
  const handleKeyDown = (e) => {
    const now = Date.now();
    const diff = now - lastKeyTime.current;
    lastKeyTime.current = now;

    if (e.key === "Escape") {
      setQuery("");
      setResultados([]);
      inputRef.current?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Scanner: caracteres rapidos + Enter
      if (diff < 200 && scanBuffer.current.length > 3) {
        buscar(scanBuffer.current);
        scanBuffer.current = "";
        return;
      }

      // Enter normal: agregar primer resultado o buscar
      if (resultados.length > 0) {
        onAgregar(resultados[0]);
        setQuery("");
        setResultados([]);
        inputRef.current?.focus();
      } else if (query.trim()) {
        buscar(query);
      }
      scanBuffer.current = "";
      return;
    }

    // Acumular buffer del scanner
    if (e.key.length === 1) {
      if (diff > 500) scanBuffer.current = "";
      scanBuffer.current += e.key;
    }
  };

  // Debounce en escritura manual
  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      buscar(val);
    }, 300);
  };

  // Agregar producto y limpiar
  const handleAgregar = (producto) => {
    onAgregar(producto);
    setQuery("");
    setResultados([]);
    inputRef.current?.focus();
  };

  return (
    <SunmiCard className="p-2 lg:p-3">
      <SunmiInput
        ref={inputRef}
        type="text"
        placeholder="Codigo o nombre del producto..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full text-base min-h-12 lg:min-h-10 !py-2"
        autoFocus
      />

      {loading && (
        <div className="text-xs text-slate-400 mt-2">Buscando...</div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
          {resultados.map((p) => (
            <div
              key={p.productoBaseId}
              onClick={() => handleAgregar(p)}
              className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 active:bg-slate-600/60 transition cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.nombre}</div>
                <div className="text-[11px] text-slate-400">
                  {p.codigoBarra && (
                    <span className="mr-3">Cod: {p.codigoBarra}</span>
                  )}
                  <span>Stock: {p.stock}</span>
                </div>
              </div>
              <div className="text-sm font-semibold text-amber-400 shrink-0">
                ${Number(p.precioVenta).toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && query.trim() && resultados.length === 0 && (
        <div className="text-xs text-slate-500 mt-2">
          No se encontraron productos.
        </div>
      )}
    </SunmiCard>
  );
}
