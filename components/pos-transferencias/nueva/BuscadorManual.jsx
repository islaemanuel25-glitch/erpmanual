"use client";

import { useState, useEffect, useRef } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function BuscadorManual({
  texto,
  onTextoChange,
  onBuscar,
  loading,
  resultados,
  onAgregar,
  modo,
  onModoChange,
}) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const [escuchando, setEscuchando] = useState(false);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastTimeRef = useRef(Date.now());
  const beepRef = useRef(null);
  const voiceTriggerRef = useRef(false);

  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Audio beep
  useEffect(() => {
    const audio = new Audio("/beep.wav");
    audio.addEventListener("canplaythrough", () => { beepRef.current = audio; });
    audio.addEventListener("error", () => {});
    return () => { beepRef.current = null; };
  }, []);

  const beep = () => {
    if (beepRef.current) {
      beepRef.current.currentTime = 0;
      beepRef.current.play();
    }
  };

  // Autofocus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Scanner + input
  const handleInputChange = (e) => {
    const now = Date.now();
    const delta = now - lastTimeRef.current;
    lastTimeRef.current = now;

    const value = e.target.value;
    onTextoChange(value);

    if (delta < 40 && value.length >= 4) {
      onBuscar();
      beep();
    }
  };

  useEffect(() => {
    if (texto.trim() === "") return;
    const fromVoice = voiceTriggerRef.current;
    voiceTriggerRef.current = false;
    onBuscar({ fromVoice });
  }, [texto]);

  // Keyboard
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultados.length) setFocusIndex((i) => (i + 1 < resultados.length ? i + 1 : 0));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (resultados.length) setFocusIndex((i) => (i - 1 >= 0 ? i - 1 : resultados.length - 1));
    }
    if (e.key === "Escape") {
      onTextoChange("");
      setFocusIndex(-1);
      inputRef.current?.focus();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (focusIndex >= 0 && resultados[focusIndex]) {
        beep();
        onAgregar(resultados[focusIndex]);
        onTextoChange("");
        setFocusIndex(-1);
      }
    }
  };

  // Auto-agregar si 1 solo resultado
  useEffect(() => {
    if (resultados.length === 1 && texto.length > 0) {
      beep();
      onAgregar(resultados[0]);
      onTextoChange("");
      setFocusIndex(-1);
    }
  }, [resultados]);

  // Voz
  const iniciarVoz = () => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;

    if (escuchando && recognitionRef.current) {
      recognitionRef.current.stop();
      setEscuchando(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setEscuchando(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      voiceTriggerRef.current = true;
      onTextoChange(transcript);
      onBuscar({ fromVoice: true });
      beep();
      setEscuchando(false);
    };
    recognition.onerror = () => setEscuchando(false);
    recognition.onend = () => setEscuchando(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="relative w-full mb-3">
      {/* Modo manual / rotura */}
      {onModoChange && (
        <div className="flex items-center justify-end gap-1 mb-1.5">
          <button
            type="button"
            onClick={() => onModoChange("manual")}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition ${
              modo === "manual"
                ? "sunmi-btn-primary"
                : "sunmi-control sunmi-text-muted"
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => onModoChange("rotura")}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition ${
              modo === "rotura"
                ? "sunmi-btn sunmi-btn-red"
                : "sunmi-control sunmi-text-muted"
            }`}
          >
            Rotura
          </button>
        </div>
      )}

      {/* Input con mic */}
      <div className="relative">
        <SunmiInput
          ref={inputRef}
          type="text"
          placeholder="Buscar producto, escanear o hablar..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={texto}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={`w-full text-base min-h-12 lg:min-h-10 !py-2 ${soportaVoz ? "!pr-12" : ""}`}
          autoFocus
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

      {/* Estado */}
      {loading && (
        <div className="text-xs sunmi-text-muted mt-2 animate-pulse">Buscando...</div>
      )}
      {escuchando && (
        <div className="text-xs text-red-400 mt-2 animate-pulse">Escuchando...</div>
      )}

      {/* Resultados */}
      {!loading && resultados.length > 0 && texto.trim() !== "" && (
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-lg">
          {resultados.slice(0, 30).map((p, idx) => (
            <div
              key={p.productoLocalId}
              className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-all ${
                idx === focusIndex
                  ? "sunmi-select-item-active"
                  : "sunmi-row-hover"
              }`}
              onMouseEnter={() => setFocusIndex(idx)}
              onClick={() => {
                beep();
                onAgregar(p);
                onTextoChange("");
                setFocusIndex(-1);
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.nombre}</div>
                <div className="text-[11px] sunmi-text-muted">
                  {p.codigoBarra && <span className="mr-3">Cod: {p.codigoBarra}</span>}
                  {p.stockActual != null && <span>Stock: {Number(p.stockActual).toLocaleString("es-AR")}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !escuchando && texto.trim() !== "" && resultados.length === 0 && (
        <div className="text-xs sunmi-text-muted mt-2">No se encontraron productos.</div>
      )}
    </div>
  );
}
