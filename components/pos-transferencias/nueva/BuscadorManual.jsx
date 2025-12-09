"use client";

import { useState, useEffect, useRef } from "react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function BuscadorManual({
  texto,
  onTextoChange,
  onBuscar,
  loading,
  resultados,
  onAgregar,
}) {
  const { ui } = useUIConfig();
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
    <div
      className="relative w-full"
      style={{
        marginBottom: ui.helpers.spacing("md"),
      }}
    >
      <div
        className="uppercase tracking-wide"
        style={{
          color: "#22d3ee", // cyan-400
          fontSize: ui.helpers.font("xs"),
          marginBottom: ui.helpers.spacing("xs"),
          paddingLeft: ui.helpers.spacing("xs"),
        }}
      >
        Buscar · Escanear · Hablar
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={iniciarVoz}
          className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center active:scale-95 transition"
          style={{
            backgroundColor: "var(--sunmi-table-row-bg)",
            borderColor: "#06b6d4", // cyan-500
            borderWidth: "1px",
            color: "#67e8f9", // cyan-300
            boxShadow: "0 0 8px rgba(34,211,238,0.35)",
            right: ui.helpers.spacing("sm"),
            height: parseInt(ui.helpers.controlHeight()),
            width: parseInt(ui.helpers.controlHeight()),
            borderRadius: ui.helpers.radius("full"),
            fontSize: ui.helpers.font("lg"),
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "brightness(1)";
          }}
        >
          🎤
        </button>

        <input
          type="text"
          placeholder="Buscar producto o decirlo..."
          className="w-full shadow-inner focus:outline-none transition-all"
          style={{
            backgroundColor: "var(--sunmi-card-bg)",
            color: "var(--sunmi-text)",
            borderColor: "rgba(6,182,212,0.4)", // cyan-500/40
            borderWidth: "1px",
            paddingLeft: parseInt(ui.helpers.spacing("lg")) * 2.5,
            paddingRight: parseInt(ui.helpers.spacing("lg")) * 3,
            paddingTop: ui.helpers.spacing("sm"),
            paddingBottom: ui.helpers.spacing("sm"),
            borderRadius: ui.helpers.radius("xl"),
            fontSize: ui.helpers.font("sm"),
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#22d3ee"; // cyan-400
            e.target.style.boxShadow = "0 0 0 2px rgba(34,211,238,0.2)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(6,182,212,0.4)";
            e.target.style.boxShadow = "none";
          }}
          value={texto}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />

        <span
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            color: "#22d3ee", // cyan-400
            left: ui.helpers.spacing("md"),
            fontSize: ui.helpers.font("lg"),
          }}
        >
          🔍
        </span>
      </div>

      {loading && (
        <div
          className="animate-pulse"
          style={{
            color: "#67e8f9", // cyan-300
            fontSize: ui.helpers.font("xs"),
            marginTop: ui.helpers.spacing("xs"),
          }}
        >
          Buscando...
        </div>
      )}

      {!loading && resultados.length > 0 && texto.trim() !== "" && (
        <div
          className="absolute left-0 right-0 border shadow-xl overflow-auto z-50 animate-[fadeIn_0.2s_ease]"
          style={{
            backgroundColor: "var(--sunmi-card-bg)",
            borderColor: "rgba(6,182,212,0.4)", // cyan-500/40
            borderWidth: "1px",
            top: parseInt(ui.helpers.controlHeight()) * 2.5,
            borderRadius: ui.helpers.radius("xl"),
            maxHeight: parseInt(ui.helpers.controlHeight()) * 8,
          }}
        >
          {resultados.slice(0, 30).map((p, idx) => (
            <div
              key={p.productoLocalId}
              className="cursor-pointer transition-all"
              style={{
                backgroundColor: idx === focusIndex ? "rgba(8,145,178,0.2)" : "transparent", // cyan-600/20
                borderLeftWidth: idx === focusIndex ? "4px" : "0px",
                borderLeftColor: idx === focusIndex ? "#22d3ee" : "transparent", // cyan-400
                paddingLeft: ui.helpers.spacing("md"),
                paddingRight: ui.helpers.spacing("md"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                fontSize: ui.helpers.font("sm"),
              }}
              onMouseEnter={() => {
                setFocusIndex(idx);
              }}
              onMouseLeave={() => {
                if (idx === focusIndex) {
                  // Mantener el estilo si está enfocado
                }
              }}
              onClick={() => {
                beep();
                onAgregar(p);
                onTextoChange("");
                setFocusIndex(-1);
              }}
            >
              <div
                className="font-medium"
                style={{
                  color: "var(--sunmi-text)",
                }}
              >
                {p.nombre}
              </div>

              {p.codigoBarra && (
                <div
                  style={{
                    color: "var(--sunmi-text)",
                    opacity: 0.7,
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  Código: {p.codigoBarra}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && texto.trim() !== "" && resultados.length === 0 && (
        <div
          style={{
            color: "var(--sunmi-text)",
            opacity: 0.7,
            fontSize: ui.helpers.font("xs"),
            marginTop: ui.helpers.spacing("xs"),
          }}
        >
          No se encontraron productos.
        </div>
      )}
    </div>
  );
}
