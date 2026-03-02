"use client";

import { useRef, useState, useEffect, useCallback, memo } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
function BuscadorProductos({ localId, onAgregar }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const debounceRef = useRef(null);
  const lastKeyTime = useRef(0);
  const scanBuffer = useRef("");
  const recognitionRef = useRef(null);

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

  // Busqueda por voz
  const iniciarVoz = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) return;

    if (escuchando && recognitionRef.current) {
      recognitionRef.current.stop();
      setEscuchando(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setEscuchando(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      buscar(transcript);
      setEscuchando(false);
    };
    recognition.onerror = () => setEscuchando(false);
    recognition.onend = () => setEscuchando(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

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

  // Verificar soporte de voz
  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <SunmiCard className="p-2 lg:p-3">
      {/* Input con boton de voz */}
      <div className="relative">
        <SunmiInput
          ref={inputRef}
          id="buscar-producto"
          type="text"
          placeholder="Codigo o nombre del producto..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`w-full text-base min-h-12 lg:min-h-10 !py-2 ${soportaVoz ? "!pr-12" : ""}`}
          autoFocus
        />
        {soportaVoz && (
          <button
            onClick={iniciarVoz}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded transition-colors ${
              escuchando
                ? "sunmi-btn-red animate-pulse"
                : "pos-control"
            }`}
            title="Buscar por voz"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        )}
      </div>

      {loading && (
        <div className="text-xs pos-text-muted mt-2">Buscando...</div>
      )}

      {escuchando && (
        <div className="text-xs pos-text-danger mt-2 animate-pulse">
          Escuchando...
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
          {resultados.map((p) => (
            <div
              key={p.productoBaseId}
              onClick={() => handleAgregar(p)}
              className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg pos-bg-surface-interactive transition cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.nombre}</div>
                <div className="text-[11px] pos-text-muted">
                  {p.codigoBarra && (
                    <span className="mr-3">Cod: {p.codigoBarra}</span>
                  )}
                  <span>Stock: {p.unidadMedida === "kg" ? `${Number(p.stock).toFixed(3)} kg` : p.stock}</span>
                </div>
              </div>
              <div className="text-sm font-semibold pos-text-accent shrink-0">
                ${Number(p.precioVenta).toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !escuchando && query.trim() && resultados.length === 0 && (
        <div className="text-xs pos-text-muted mt-2">
          No se encontraron productos.
        </div>
      )}
    </SunmiCard>
  );
}

export default memo(BuscadorProductos);
