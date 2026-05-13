"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function FiltrosProductos({ onChange, catalogos, initial }) {
  const [search, setSearch] = useState(initial.search || "");
  const [categoria, setCategoria] = useState(initial.categoria || "");
  const [proveedor, setProveedor] = useState(initial.proveedor || "");
  const [area, setArea] = useState(initial.area || "");
  // estado: activos | inactivos | todos. Por defecto solo activos.
  const [estado, setEstado] = useState(initial.estado || "activos");

  const [open, setOpen] = useState(false);

  // Refs para voz y scanner
  const inputRef = useRef(null);
  const [escuchando, setEscuchando] = useState(false);
  const recognitionRef = useRef(null);
  const lastKeyTime = useRef(0);
  const scanBuffer = useRef("");
  const debounceRef = useRef(null);

  // Soporte de voz
  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ============================
  // Debounce 250ms para cambios de texto
  // ============================
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      onChange({ search, categoria, proveedor, area, estado });
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [search, categoria, proveedor, area, estado]);

  // Busqueda inmediata (bypass debounce) — para Enter, scanner y voz
  const buscarInmediato = useCallback(
    (texto) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      onChange({ search: texto, categoria, proveedor, area, estado });
    },
    [onChange, categoria, proveedor, area, estado]
  );

  // ============================
  // Busqueda por voz
  // ============================
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
      setSearch(transcript);
      buscarInmediato(transcript);
      setEscuchando(false);
    };
    recognition.onerror = () => setEscuchando(false);
    recognition.onend = () => setEscuchando(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  // ============================
  // Deteccion de scanner + Enter + Escape
  // ============================
  const handleKeyDown = (e) => {
    const now = Date.now();
    const diff = now - lastKeyTime.current;
    lastKeyTime.current = now;

    if (e.key === "Escape") {
      setSearch("");
      buscarInmediato("");
      inputRef.current?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Scanner: caracteres rapidos + Enter
      if (diff < 200 && scanBuffer.current.length > 3) {
        setSearch(scanBuffer.current);
        buscarInmediato(scanBuffer.current);
        scanBuffer.current = "";
        return;
      }

      // Enter normal: buscar inmediatamente
      if (search.trim()) {
        buscarInmediato(search);
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

  const limpiar = () => {
    setSearch("");
    setCategoria("");
    setProveedor("");
    setArea("");
    setEstado("activos");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ================================= */}
      {/* BARRA PRINCIPAL */}
      {/* ================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* BUSCADOR CON VOZ */}
        <div className="flex-1 relative">
          <SunmiInput
            ref={inputRef}
            placeholder="Buscar producto, código o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className={soportaVoz ? "!pr-12" : ""}
            icon="search"
          />
          {soportaVoz && (
            <button
              onClick={iniciarVoz}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded transition-colors ${
                escuchando
                  ? "bg-red-600 text-white animate-pulse"
                  : "sunmi-text-muted hover:text-[var(--app-fg)] hover:bg-[var(--pos-control-bg)]"
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

        {/* INDICADOR DE VOZ */}
        {escuchando && (
          <span className="text-xs text-red-400 animate-pulse md:shrink-0">
            Escuchando...
          </span>
        )}

        {/* SELECT ESTADO (activos / inactivos / todos) */}
        <div className="w-full md:w-44 md:shrink-0">
          <SunmiSelectAdv
            value={estado}
            onChange={setEstado}
            placeholder="Estado..."
          >
            <SunmiSelectOption value="activos">Activos</SunmiSelectOption>
            <SunmiSelectOption value="inactivos">Inactivos</SunmiSelectOption>
            <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
          </SunmiSelectAdv>
        </div>

        {/* BOTON MAS FILTROS */}
        <SunmiButton
          color="slate"
          className="w-full md:w-auto"
          onClick={() => setOpen(!open)}
        >
          {open ? "Ocultar filtros" : "Más filtros"}
        </SunmiButton>
      </div>

      {/* ================================= */}
      {/* PANEL DE FILTROS AVANZADOS */}
      {/* ================================= */}
      {open && (
        <div
          className="
            rounded-2xl p-4
            border border-[var(--app-border)]
            bg-[var(--app-input-bg)]
            shadow-md
            animate-fadeIn
          "
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* CATEGORIA */}
            <SunmiSelectAdv
              value={categoria}
              onChange={setCategoria}
              placeholder="Categoría..."
              searchable
            >
              <SunmiSelectOption value="">Categoría...</SunmiSelectOption>
              {catalogos.CATEGORIAS?.map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            {/* PROVEEDOR */}
            <SunmiSelectAdv
              value={proveedor}
              onChange={setProveedor}
              placeholder="Proveedor..."
              searchable
            >
              <SunmiSelectOption value="">Proveedor...</SunmiSelectOption>
              {catalogos.PROVEEDORES?.map((p) => (
                <SunmiSelectOption key={p.id} value={String(p.id)}>
                  {p.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            {/* AREA FISICA */}
            <SunmiSelectAdv
              value={area}
              onChange={setArea}
              placeholder="Área física..."
              searchable
            >
              <SunmiSelectOption value="">Área física...</SunmiSelectOption>
              {catalogos.AREAS?.map((a) => (
                <SunmiSelectOption key={a.id} value={String(a.id)}>
                  {a.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            {/* LIMPIAR */}
            <SunmiButton color="cyan" onClick={limpiar}>
              Limpiar
            </SunmiButton>
          </div>
        </div>
      )}
    </div>
  );
}
