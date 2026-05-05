"use client";

import { useRef, useState } from "react";

export default function VoiceFieldButton({
  fieldName,
  onResult,
  disabled = false,
  label,
}) {
  const [escuchando, setEscuchando] = useState(false);
  const recognitionRef = useRef(null);

  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!soportaVoz) return null;

  const iniciarVoz = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
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
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript && typeof onResult === "function") {
        onResult(transcript);
      }
      setEscuchando(false);
    };
    recognition.onerror = () => setEscuchando(false);
    recognition.onend = () => setEscuchando(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const title = label || (fieldName ? `Dictar ${fieldName}` : "Dictar");

  return (
    <button
      type="button"
      onClick={iniciarVoz}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={escuchando}
      className={`
        inline-flex items-center justify-center
        w-9 h-9 rounded-md shrink-0 transition
        ${escuchando ? "sunmi-btn-red animate-pulse" : "pos-control"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
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
        aria-hidden
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    </button>
  );
}
