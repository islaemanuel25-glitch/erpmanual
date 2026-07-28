"use client";

import { useRef, useState, useEffect, useCallback, memo } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { showError } from "@/components/sunmi/SunmiToast";
import { Search } from "lucide-react";
import { fromUnidades } from "@/lib/conversiones/stock";
import { rankearProductos } from "@/lib/pos-ventas/rankearProductos";
const DEFAULT_SEARCH_API = "/api/pos-ventas/buscar-producto";
const SIN_STOCK_MSG = "Producto sin stock disponible";

// Etiqueta del formato según unidad de medida (solo display de stock en depósito)
function labelFormato(unidad) {
  switch (unidad) {
    case "cajon": return "cajones";
    case "pack": return "packs";
    case "caja": return "cajas";
    case "carton": return "cartones";
    default: return "formatos";
  }
}

function BuscadorProductos({ localId, clienteId = null, onAgregar, apiPath, esDeposito = false, wrapCard = true }) {
  const searchApi = apiPath || DEFAULT_SEARCH_API;
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [queryInterpretada, setQueryInterpretada] = useState(null);
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
    async (texto, autoAdd = false, fromVoice = false) => {
      if (!texto.trim() || !localId) {
        setResultados([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", texto);
        params.set("localId", String(localId));
        if (clienteId != null) params.set("clienteId", String(clienteId));
        if (fromVoice) params.set("fromVoice", "true");
        const res = await fetch(`${searchApi}?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          const items = rankearProductos(data.items || [], texto);
          // El backend devuelve queryInterpretada solo en fromVoice cuando la
          // transcripción no coincide con ninguna palabra real del catálogo.
          setQueryInterpretada(
            fromVoice && data.queryInterpretada ? data.queryInterpretada : null
          );

          // Auto-agregar si match exacto por código de barras: código PROPIO de esta
          // ubicación, principal o secundario global. Los tres habilitan el auto-scan.
          const queryLower = texto.trim().toLowerCase();
          const matchCodigoExacto =
            items.length >= 1 &&
            ((items[0].codigoBarra &&
              items[0].codigoBarra.toLowerCase() === queryLower) ||
              (items[0].codigoBarraSecundario &&
                items[0].codigoBarraSecundario.toLowerCase() === queryLower) ||
              (items[0].codigoBarraPropio &&
                items[0].codigoBarraPropio.toLowerCase() === queryLower));
          if (matchCodigoExacto) {
            if (items[0].disponibleParaVenta === false) {
              showError(SIN_STOCK_MSG);
              setResultados(items);
              return;
            }
            onAgregar(items[0]);
            setQuery("");
            setResultados([]);
            setQueryInterpretada(null);
            inputRef.current?.focus();
            return;
          }

          // Auto-agregar si se pidió (scanner Enter) y hay resultado único
          if (autoAdd && items.length === 1) {
            if (items[0].disponibleParaVenta === false) {
              showError(SIN_STOCK_MSG);
              setResultados(items);
              return;
            }
            onAgregar(items[0]);
            setQuery("");
            setResultados([]);
            setQueryInterpretada(null);
            inputRef.current?.focus();
            return;
          }

          setResultados(items);
        }
      } catch (err) {
        console.error("Error buscando:", err);
      } finally {
        setLoading(false);
      }
    },
    [localId, clienteId, onAgregar, searchApi]
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
      buscar(transcript, false, true);
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
      setQueryInterpretada(null);
      inputRef.current?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Cancelar debounce pendiente para evitar doble agregado
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      // Scanner: caracteres rapidos + Enter
      if (diff < 200 && scanBuffer.current.length > 3) {
        setQuery(scanBuffer.current);
        buscar(scanBuffer.current, true);
        scanBuffer.current = "";
        return;
      }

      // Enter normal: agregar primer resultado o buscar
      if (resultados.length > 0) {
        if (resultados[0].disponibleParaVenta === false) {
          showError(SIN_STOCK_MSG);
          scanBuffer.current = "";
          return;
        }
        onAgregar(resultados[0]);
        setQuery("");
        setResultados([]);
        setQueryInterpretada(null);
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
    // Escritura manual descarta la interpretación previa de voz.
    setQueryInterpretada(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Si vacío, limpiar resultados al instante
    if (!val.trim()) {
      setResultados([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      buscar(val);
    }, 300);
  };

  // Agregar producto y limpiar
  const handleAgregar = (producto) => {
    if (producto?.disponibleParaVenta === false) {
      showError(SIN_STOCK_MSG);
      return;
    }
    onAgregar(producto);
    setQuery("");
    setResultados([]);
    setQueryInterpretada(null);
    inputRef.current?.focus();
  };

  // Verificar soporte de voz
  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const contenido = (
    <>
      {/* Input con boton de voz */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
          style={{ color: "var(--pos-link)" }}
        />
        <SunmiInput
          ref={inputRef}
          id="buscar-producto"
          type="text"
          placeholder="Codigo o nombre del producto..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`w-full text-base min-h-12 lg:min-h-10 !py-2 !pl-9 !border-2 pulse-neon ${soportaVoz ? "!pr-12" : ""}`}
          style={{ borderColor: "var(--pos-link)" }}
          autoFocus
          // Sin historial/autocompletado nativo del navegador (no afecta el
          // desplegable de productos del ERP, que es propio).
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
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

      {!loading && !escuchando && queryInterpretada && resultados.length > 0 && (
        <div className="text-[11px] pos-text-muted mt-2 italic">
          Interpretado como: <span className="font-semibold not-italic">{queryInterpretada.toUpperCase()}</span>
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
          {resultados.map((p) => {
            const noDisponible = p.disponibleParaVenta === false;
            // Desglose de stock "X formatos x{factor} + Y uds": solo en depósito,
            // para productos con pack real (factorPack > 1), excluyendo kg/fiambre.
            // Usa el stock real en unidades que ya viene de la API (no recalcula).
            const factorPack = Number(p.factorPack) || 1;
            const mostrarDesglose =
              esDeposito && factorPack > 1 && p.unidadMedida !== "kg" && !p.esFiambreFijo;
            let stockNode;
            if (p.sinStock && p.disponibleParaVenta === false) {
              stockNode = <span className="pos-text-danger font-semibold">Sin stock</span>;
            } else if (mostrarDesglose) {
              const { bultos, sueltas } = fromUnidades({ unidades: Number(p.stock), factorPack });
              stockNode = (
                <span>Stock: {bultos} {labelFormato(p.unidadMedida)} x{factorPack} + {sueltas} uds</span>
              );
            } else {
              stockNode = (
                <span>Stock: {p.unidadMedida === "kg" ? `${Number(p.stock).toFixed(3)} kg` : p.stock}</span>
              );
            }
            return (
              <div
                key={p.productoBaseId}
                onClick={() => handleAgregar(p)}
                className={`flex items-center justify-between gap-2 px-2 py-2 rounded-lg pos-bg-surface-interactive transition cursor-pointer ${noDisponible ? "opacity-60" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.nombre}</div>
                  <div className="text-[11px] pos-text-muted">
                    {p.codigoBarra && (
                      <span className="mr-3">Cod: {p.codigoBarra}</span>
                    )}
                    {stockNode}
                  </div>
                </div>
                <div className="text-sm font-semibold pos-text-accent shrink-0">
                  {p.esServicioImporteVariable
                    ? "Importe variable"
                    : `$${Number(p.precioVenta).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !escuchando && query.trim() && resultados.length === 0 && (
        <div className="text-xs pos-text-muted mt-2">
          No se encontraron productos.
        </div>
      )}
    </>
  );

  return wrapCard ? <SunmiCard className="p-2 lg:p-3">{contenido}</SunmiCard> : contenido;
}

export default memo(BuscadorProductos);
