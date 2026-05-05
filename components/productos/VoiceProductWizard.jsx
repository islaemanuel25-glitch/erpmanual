"use client";

import { useEffect, useRef, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

const FIELDS = [
  { key: "nombre", label: "Nombre del producto", hint: "Decí el nombre completo." },
  { key: "unidad_medida", label: "Tipo de venta", hint: "Decí: unidad, pack, cajón o kilo." },
  { key: "factor_pack", label: "Factor del pack", hint: "Cuántas unidades trae. Ej: 6, 12, 24." },
  { key: "precio_costo", label: "Precio de costo", hint: "Solo el número. Ej: mil doscientos no, decí 1200." },
  { key: "precio_venta", label: "Precio de venta", hint: "Solo el número." },
  { key: "categoria_id", label: "Categoría", hint: "Decí el nombre de la categoría." },
  { key: "proveedor_id", label: "Proveedor", hint: "Decí el nombre del proveedor." },
  { key: "codigo_barra", label: "Código de barras (opcional)", hint: "Decí los dígitos o tocá Omitir." },
];

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUnidad(text) {
  const t = normalize(text);
  if (!t) return null;
  if (/\b(unidad|unidades)\b/.test(t)) return "unidad";
  if (/\b(pack|paquete|paquetes)\b/.test(t)) return "pack";
  if (/\b(cajon|cajones)\b/.test(t)) return "cajon";
  if (/\b(kg|kilo|kilos|kilogramo|kilogramos)\b/.test(t)) return "kg";
  return null;
}

function parseNumber(text) {
  if (text === null || text === undefined) return null;
  const cleaned = String(text)
    .replace(/[^\d,.\-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseCodigoBarra(text) {
  return String(text || "").replace(/\D+/g, "");
}

function matchCatalogo(text, list) {
  if (!text || !Array.isArray(list) || list.length === 0) return null;
  const t = normalize(text);
  if (!t) return null;
  let found = list.find((it) => normalize(it.nombre) === t);
  if (found) return found;
  found = list.find((it) => {
    const n = normalize(it.nombre);
    return n.length >= 3 && (t.includes(n) || n.includes(t));
  });
  return found || null;
}

export default function VoiceProductWizard({
  categorias = [],
  proveedores = [],
  onApply,
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState({});
  const [listening, setListening] = useState(false);
  const [stepNotice, setStepNotice] = useState("");
  const [skipNotices, setSkipNotices] = useState([]);
  const [done, setDone] = useState(false);
  const [applied, setApplied] = useState(false);
  const recognitionRef = useRef(null);

  const soportaVoz =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
  }, []);

  const isFieldActive = (idx, data = partial) => {
    const f = FIELDS[idx];
    if (!f) return false;
    if (f.key === "factor_pack" && !["pack", "cajon"].includes(data.unidad_medida)) return false;
    return true;
  };

  const totalActiveSteps = () => {
    let n = 0;
    for (let i = 0; i < FIELDS.length; i++) if (isFieldActive(i)) n++;
    return n;
  };

  const currentDisplayIndex = () => {
    let n = 0;
    for (let i = 0; i <= step; i++) if (isFieldActive(i)) n++;
    return n;
  };

  const advanceFrom = (idx, data) => {
    let i = idx + 1;
    while (i < FIELDS.length && !isFieldActive(i, data)) i++;
    setTranscript("");
    setStepNotice("");
    setListening(false);
    if (i >= FIELDS.length) setDone(true);
    else setStep(i);
  };

  const startListening = () => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript || "";
      setTranscript(text);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setStepNotice("");
    setTranscript("");
    recognition.start();
  };

  const useValue = () => {
    const field = FIELDS[step];
    const raw = transcript;
    const next = { ...partial };

    if (field.key === "nombre") {
      const v = String(raw || "").trim();
      if (!v) { setStepNotice("No detecté texto. Volvé a hablar."); return; }
      next.nombre = v;
      setPartial(next); advanceFrom(step, next); return;
    }
    if (field.key === "codigo_barra") {
      const v = parseCodigoBarra(raw);
      if (v) next.codigo_barra = v;
      setPartial(next); advanceFrom(step, next); return;
    }
    if (field.key === "unidad_medida") {
      const v = parseUnidad(raw);
      if (!v) { setStepNotice("No reconocí la unidad. Repetí: unidad, pack, cajón o kilo."); return; }
      next.unidad_medida = v;
      setPartial(next); advanceFrom(step, next); return;
    }
    if (["factor_pack", "precio_costo", "precio_venta"].includes(field.key)) {
      const n = parseNumber(raw);
      if (n === null || n < 0) {
        setStepNotice("No detecté un número claro. Probá decir solo el número.");
        return;
      }
      next[field.key] = n;
      setPartial(next); advanceFrom(step, next); return;
    }
    if (field.key === "categoria_id") {
      const m = matchCatalogo(raw, categorias);
      if (m) next.categoria_id = m.id;
      else setSkipNotices((prev) => [
        ...prev,
        "Categoría: no encontré coincidencia clara. Podés elegirla manualmente en el formulario.",
      ]);
      setPartial(next); advanceFrom(step, next); return;
    }
    if (field.key === "proveedor_id") {
      const m = matchCatalogo(raw, proveedores);
      if (m) next.proveedor_id = m.id;
      else setSkipNotices((prev) => [
        ...prev,
        "Proveedor: no encontré coincidencia clara. Podés elegirlo manualmente en el formulario.",
      ]);
      setPartial(next); advanceFrom(step, next); return;
    }
  };

  const omit = () => advanceFrom(step, partial);

  const apply = () => {
    if (typeof onApply === "function") onApply(partial);
    setApplied(true);
    setOpen(false);
  };

  const restart = () => {
    setStep(0);
    setPartial({});
    setTranscript("");
    setStepNotice("");
    setSkipNotices([]);
    setDone(false);
    setApplied(false);
    setListening(false);
  };

  const inputStyle = {
    background: "var(--card-bg)",
    borderColor: "var(--card-border)",
    color: "var(--app-fg)",
  };
  const noticeStyle = { background: "var(--hover-bg)", color: "var(--app-fg)" };
  const fgStyle = { color: "var(--app-fg)" };

  if (!soportaVoz) {
    return (
      <SunmiCard className="mb-3">
        <div className="text-sm" style={fgStyle}>
          Tu navegador no soporta carga por voz.
        </div>
      </SunmiCard>
    );
  }

  if (!open) {
    return (
      <SunmiCard className="mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={fgStyle}>
              Cargar por voz (MVP)
            </div>
            <div className="text-xs opacity-70" style={fgStyle}>
              Asistente paso a paso. Vos revisás antes de guardar.
              {applied && <span className="ml-2">Datos aplicados al formulario.</span>}
            </div>
          </div>
          <SunmiButton onClick={() => { restart(); setOpen(true); }}>
            {applied ? "Cargar otro" : "Cargar por voz"}
          </SunmiButton>
        </div>
      </SunmiCard>
    );
  }

  if (done) {
    const entries = Object.entries(partial);
    return (
      <SunmiCard className="mb-3">
        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold" style={fgStyle}>Resumen</div>
          {entries.length === 0 ? (
            <div className="text-xs opacity-70" style={fgStyle}>
              No se recolectó ningún dato.
            </div>
          ) : (
            <ul className="text-sm space-y-1" style={fgStyle}>
              {entries.map(([k, v]) => {
                let display = String(v);
                if (k === "categoria_id") {
                  const c = categorias.find((it) => it.id === v);
                  display = c ? `${c.nombre} (#${v})` : `#${v}`;
                } else if (k === "proveedor_id") {
                  const p = proveedores.find((it) => it.id === v);
                  display = p ? `${p.nombre} (#${v})` : `#${v}`;
                }
                return (
                  <li key={k}>
                    <span className="opacity-70">{k}:</span> {display}
                  </li>
                );
              })}
            </ul>
          )}
          {skipNotices.length > 0 && (
            <ul className="text-xs space-y-1 px-2 py-1.5 rounded-md" style={noticeStyle}>
              {skipNotices.map((m, i) => <li key={i}>• {m}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 justify-end">
            <SunmiButton color="cyan" onClick={restart}>Reiniciar</SunmiButton>
            <SunmiButton onClick={apply}>Aplicar al formulario</SunmiButton>
          </div>
        </div>
      </SunmiCard>
    );
  }

  const field = FIELDS[step];
  return (
    <SunmiCard className="mb-3">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs opacity-70" style={fgStyle}>
            Campo {currentDisplayIndex()} de {totalActiveSteps()}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs px-2 py-1 rounded-md"
            style={{ ...fgStyle, background: "var(--hover-bg)" }}
          >
            Cerrar
          </button>
        </div>

        <div>
          <div className="text-sm font-semibold" style={fgStyle}>{field.label}</div>
          <div className="text-xs opacity-70" style={fgStyle}>{field.hint}</div>
        </div>

        <div className="px-3 py-2 rounded-md border" style={inputStyle}>
          <span className="text-xs opacity-70">Detectado:</span>{" "}
          <span className="text-sm">
            {transcript || (listening ? "Escuchando…" : "—")}
          </span>
        </div>

        {stepNotice && (
          <div className="text-xs px-2 py-1.5 rounded-md" style={noticeStyle}>
            {stepNotice}
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          <SunmiButton color="cyan" onClick={omit} disabled={listening}>
            Omitir
          </SunmiButton>
          <SunmiButton
            color="cyan"
            onClick={startListening}
            disabled={listening || (!transcript && !stepNotice)}
          >
            Repetir
          </SunmiButton>
          <SunmiButton onClick={startListening}>
            {listening ? "Detener" : "Hablar"}
          </SunmiButton>
          <SunmiButton onClick={useValue} disabled={!transcript || listening}>
            Usar valor
          </SunmiButton>
        </div>
      </div>
    </SunmiCard>
  );
}
