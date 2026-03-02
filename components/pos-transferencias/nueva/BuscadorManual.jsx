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

  const lastTimeRef = useRef(Date.now());
  const beepRef = useRef(null);

  // ===================================================
  // 🔊 CARGA DE AUDIO — FIX "NotSupportedError"
  // ===================================================
  useEffect(() => {
    const audio = new Audio("/beep.wav");

    const handleLoad = () => {
      beepRef.current = audio;
      console.log("✅ Beep cargado correctamente");
    };

    const handleError = () => {
      console.error("❌ Error cargando beep.wav");
    };

    audio.addEventListener("canplaythrough", handleLoad);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("canplaythrough", handleLoad);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const beep = () => {
    if (beepRef.current) {
      beepRef.current.currentTime = 0;
      beepRef.current.play();
    }
  };

  // ===================================================
  // SCANNER + INPUT
  // ===================================================
  const handleInputChange = (e) => {
    const now = Date.now();
    const delta = now - lastTimeRef.current;
    lastTimeRef.current = now;

    const value = e.target.value;
    onTextoChange(value);

    const esScanner = delta < 40 && value.length >= 4;
    if (esScanner) {
      onBuscar();
      beep();
    }
  };

  useEffect(() => {
    if (texto.trim() === "") return;
    onBuscar();
  }, [texto]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultados.length)
        setFocusIndex((i) => (i + 1 < resultados.length ? i + 1 : 0));
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (resultados.length)
        setFocusIndex((i) => (i - 1 >= 0 ? i - 1 : resultados.length - 1));
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (focusIndex >= 0 && resultados[focusIndex]) {
        const p = resultados[focusIndex];
        beep();
        onAgregar(p);
        onTextoChange("");
        setFocusIndex(-1);
      }
    }
  };

  // Auto agregar si hay 1 solo
  useEffect(() => {
    if (resultados.length === 1 && texto.length > 0) {
      beep();
      onAgregar(resultados[0]);
      onTextoChange("");
      setFocusIndex(-1);
    }
  }, [resultados]);

  // ===================================================
  // 🎤 MIC — RECONOCIMIENTO DE VOZ
  // ===================================================
  const iniciarVoz = () => {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      alert("Este dispositivo no soporta reconocimiento de voz");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recog = new SpeechRecognition();
    recog.lang = "es-AR";
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onresult = (event) => {
      const voiceText = event.results[0][0].transcript;
      onTextoChange(voiceText);
      onBuscar();
      beep();
    };

    recog.start();
  };

  // ===================================================
  // RENDER SUNMI
  // ===================================================
  return (
    <div className="relative w-full mb-3">

      <div className="flex items-center justify-between mb-1 pl-1">
        <span className="text-[11px] uppercase tracking-wide sunmi-text-link">
          Buscar · Escanear · Hablar
        </span>

        {onModoChange && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onModoChange("manual")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
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
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
                modo === "rotura"
                  ? "sunmi-btn sunmi-btn-red"
                  : "sunmi-control sunmi-text-muted"
              }`}
            >
              Rotura
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={iniciarVoz}
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            h-8 w-8 rounded-full
            sunmi-surface-soft sunmi-text-link
            flex items-center justify-center
            text-[16px]
            active:scale-95
            transition
            shadow-md
          "
          style={{ border: '1px solid var(--pos-link)' }}
        >
          🎤
        </button>

        <SunmiInput
          type="text"
          placeholder="Buscar producto o decirlo..."
          value={texto}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />

        <span className="
          absolute left-3 top-1/2 -translate-y-1/2
          text-[15px] sunmi-text-link
        ">
          🔍
        </span>
      </div>

      {loading && (
        <div className="text-[12px] sunmi-text-link mt-1 animate-pulse">
          Buscando...
        </div>
      )}

      {!loading && resultados.length > 0 && texto.trim() !== "" && (
        <div
          className="
            absolute top-[60px] left-0 right-0
            sunmi-surface sunmi-border
            rounded-xl shadow-xl
            max-h-64 overflow-auto z-50
            animate-[fadeIn_0.2s_ease]
          "
        >
          {resultados.slice(0, 30).map((p, idx) => (
            <div
              key={p.productoLocalId}
              className={`
                px-3 py-2 cursor-pointer text-[13px]
                ${
                  idx === focusIndex
                    ? "sunmi-select-item-active"
                    : "sunmi-row-hover"
                }
                transition-all
              `}
              onMouseEnter={() => setFocusIndex(idx)}
              onClick={() => {
                beep();
                onAgregar(p);
                onTextoChange("");
                setFocusIndex(-1);
              }}
            >
              <div className="font-medium">{p.nombre}</div>

              {p.codigoBarra && (
                <div className="text-[11px] sunmi-text-muted">
                  Código: {p.codigoBarra}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && texto.trim() !== "" && resultados.length === 0 && (
        <div className="text-[12px] sunmi-text-muted mt-1">
          No se encontraron productos.
        </div>
      )}
    </div>
  );
}
