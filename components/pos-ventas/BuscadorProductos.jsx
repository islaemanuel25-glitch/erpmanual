"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

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
    <SunmiCard className="p-3">
      <SunmiSeparator label="Buscar producto" className="!mt-0 !mb-2" />

      <SunmiInput
        ref={inputRef}
        type="text"
        placeholder="Escanear codigo o buscar por nombre..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="!text-base !py-2.5"
      />

      {loading && (
        <div className="text-xs text-slate-400 mt-2">Buscando...</div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
          {resultados.map((p) => (
            <div
              key={p.productoBaseId}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition"
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
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-amber-400">
                  ${Number(p.precioVenta).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <SunmiButton
                  color="cyan"
                  onClick={() => handleAgregar(p)}
                  className="!text-xs !py-0.5 !px-2 mt-1"
                >
                  + Agregar
                </SunmiButton>
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
