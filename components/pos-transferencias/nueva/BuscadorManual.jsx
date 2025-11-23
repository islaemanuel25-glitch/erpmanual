"use client";

import { useState, useEffect, useRef } from "react";

export default function BuscadorManual({
  texto,
  onTextoChange,
  onBuscar,
  loading,
  resultados,
  onAgregar,
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

      <div className="text-[11px] uppercase tracking-wide text-cyan-400 mb-1 pl-1">
        Buscar · Escanear · Hablar
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={iniciarVoz}
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            h-8 w-8 rounded-full
            bg-slate-800
            border border-cyan-500
            flex items-center justify-center
            text-cyan-300 text-[16px]
            hover:bg-slate-700 
            active:scale-95
            transition
            shadow-[0_0_8px_rgba(34,211,238,0.35)]
          "
        >
          🎤
        </button>

        <input
          type="text"
          placeholder="Buscar producto o decirlo..."
          className="
            pl-10 pr-12 py-2 w-full
            bg-slate-900 text-slate-100
            border border-cyan-500/40
            rounded-xl shadow-inner
            text-[13px]
            focus:outline-none 
            focus:ring-2 focus:ring-cyan-400 
            focus:border-cyan-400
            transition-all
          "
          value={texto}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />

        <span className="
          absolute left-3 top-1/2 -translate-y-1/2 
          text-[15px] text-cyan-400
        ">
          🔍
        </span>
      </div>

      {loading && (
        <div className="text-[12px] text-cyan-300 mt-1 animate-pulse">
          Buscando...
        </div>
      )}

      {!loading && resultados.length > 0 && texto.trim() !== "" && (
        <div
          className="
            absolute top-[60px] left-0 right-0 
            bg-slate-900 
            border border-cyan-500/40 
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
                    ? "bg-cyan-600/20 border-l-4 border-cyan-400"
                    : "hover:bg-cyan-500/10"
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
              <div className="text-slate-100 font-medium">{p.nombre}</div>

              {p.codigoBarra && (
                <div className="text-[11px] text-slate-400">
                  Código: {p.codigoBarra}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && texto.trim() !== "" && resultados.length === 0 && (
        <div className="text-[12px] text-slate-400 mt-1">
          No se encontraron productos.
        </div>
      )}
    </div>
  );
}
