"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { Search } from "lucide-react";

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

  // Selector unificado: "todos" | "con_stock" | "sin_stock" | "faltantes"
  const [estadoStock, setEstadoStock] = useState("todos");

  const [openAvanzado, setOpenAvanzado] = useState(false);

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

  // Debounce + mapeo estadoStock -> {conStock, sinStock, faltantes}
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      onFiltroChange({
        q: q.trim() || undefined,
        categoria,
        proveedor,
        area,
        conStock: estadoStock === "con_stock",
        sinStock: estadoStock === "sin_stock",
        faltantes: estadoStock === "faltantes",
      });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [q, categoria, proveedor, area, estadoStock, onFiltroChange]);

  const resetFiltros = () => {
    setQ("");
    setCategoria("");
    setProveedor("");
    setArea("");
    setEstadoStock("todos");
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

  const hayFiltrosActivos =
    q || categoria || proveedor || area || estadoStock !== "todos";

  const contenido = (
    <div className="flex flex-col gap-3">
      {/* ================================= */}
      {/* BARRA PRINCIPAL */}
      {/* ================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* BUSCADOR CON VOZ */}
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--pos-link)" }}
          />
          <SunmiInput
            ref={inputRef}
            type="text"
            placeholder="Buscar por nombre o código..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`w-full !pl-9 !border-2 pulse-neon ${soportaVoz ? "!pr-12" : ""}`}
            style={{ borderColor: "var(--pos-link)" }}
            icon="search"
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}
        </div>

        {/* INDICADOR DE VOZ */}
        {escuchando && (
          <span className="text-xs sunmi-text-danger animate-pulse md:shrink-0">
            Escuchando...
          </span>
        )}

        {/* ESTADO DE STOCK */}
        <div className="w-full md:w-44 md:shrink-0">
          <SunmiSelectAdv
            value={estadoStock}
            onChange={setEstadoStock}
            placeholder="Estado..."
            className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
          >
            <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
            <SunmiSelectOption value="con_stock">Con stock</SunmiSelectOption>
            <SunmiSelectOption value="sin_stock">Sin stock</SunmiSelectOption>
            <SunmiSelectOption value="faltantes">Faltantes</SunmiSelectOption>
          </SunmiSelectAdv>
        </div>

        {/* MÁS FILTROS + LIMPIAR */}
        <div className="flex gap-2 md:shrink-0">
          <SunmiButton
            color="slate"
            className="w-full md:w-auto !border !border-[var(--pos-link)]"
            onClick={() => setOpenAvanzado((v) => !v)}
          >
            {openAvanzado ? "Ocultar filtros" : "Más filtros"}
          </SunmiButton>
          {hayFiltrosActivos && (
            <SunmiButton
              color="cyan"
              className="shrink-0 !border !border-[var(--pos-link)]"
              onClick={resetFiltros}
            >
              Limpiar
            </SunmiButton>
          )}
        </div>
      </div>

      {/* ================================= */}
      {/* PANEL DE FILTROS AVANZADOS */}
      {/* ================================= */}
      {openAvanzado && (
        <div
          className="
            rounded-2xl p-4
            border border-[var(--app-border)]
            bg-[var(--app-input-bg)]
            shadow-md
            animate-fadeIn
          "
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SunmiSelectAdv
              value={categoria}
              onChange={setCategoria}
              placeholder="Categoría..."
              searchable
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <SunmiSelectOption value="">Categoría...</SunmiSelectOption>
              {categorias.map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            <SunmiSelectAdv
              value={proveedor}
              onChange={setProveedor}
              placeholder="Proveedor..."
              searchable
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <SunmiSelectOption value="">Proveedor...</SunmiSelectOption>
              {proveedores.map((p) => (
                <SunmiSelectOption key={p.id} value={String(p.id)}>
                  {p.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            <SunmiSelectAdv
              value={area}
              onChange={setArea}
              placeholder="Área física..."
              searchable
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <SunmiSelectOption value="">Área física...</SunmiSelectOption>
              {areas.map((a) => (
                <SunmiSelectOption key={a.id} value={String(a.id)}>
                  {a.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </div>
        </div>
      )}
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
