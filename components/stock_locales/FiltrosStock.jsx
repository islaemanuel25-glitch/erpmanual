"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
        q: q.trim() || undefined,
        categoria,
        proveedor,
        area,
        conStock,
        sinStock,
        faltantes,
      });
    }, 300);

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

  // Búsqueda por voz
  const [escuchando, setEscuchando] = useState(false);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const iniciarVoz = useCallback(() => {
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
      setQ(transcript);
      setEscuchando(false);
    };
    recognition.onerror = () => setEscuchando(false);
    recognition.onend = () => setEscuchando(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [escuchando]);

  // Detección de scanner: teclas rápidas + Enter
  const lastKeyTime = useRef(0);
  const scanBuffer = useRef("");

  const handleKeyDown = (e) => {
    const now = Date.now();
    const diff = now - lastKeyTime.current;
    lastKeyTime.current = now;

    if (e.key === "Escape") {
      setQ("");
      inputRef.current?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // Scanner: caracteres rápidos + Enter
      if (diff < 200 && scanBuffer.current.length > 3) {
        setQ(scanBuffer.current);
        scanBuffer.current = "";
        return;
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

  const hayFiltrosActivos = q || categoria || proveedor || area || conStock || sinStock || faltantes;

  const contenido = (
    <div className="flex flex-col gap-3">
      {/* Buscador por nombre/código con voz y scanner */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SunmiInput
            ref={inputRef}
            type="text"
            placeholder="Buscar por nombre o codigo..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`w-full ${soportaVoz ? "!pr-12" : ""}`}
          />
          {soportaVoz && (
            <button
              onClick={iniciarVoz}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-transparent border-0 shadow-none transition-all hover:opacity-70 hover:scale-110 ${
                escuchando
                  ? "text-red-500 animate-pulse"
                  : "sunmi-text-muted"
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
        {hayFiltrosActivos && (
          <button
            onClick={resetFiltros}
            className="sunmi-btn sunmi-btn-red text-[11px] px-2 py-1 h-[38px] shrink-0"
            title="Limpiar filtros"
          >
            ✕
          </button>
        )}
      </div>
      {escuchando && (
        <div className="text-xs sunmi-text-danger animate-pulse">
          Escuchando...
        </div>
      )}

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
