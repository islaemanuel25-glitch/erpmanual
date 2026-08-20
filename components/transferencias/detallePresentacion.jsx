"use client";

// Piezas de presentación del detalle de transferencia.
//
// Son duplicados deliberados de los helpers que viven DENTRO de
// components/reportes-ventas/VentaDetalleAdmin.jsx (SectionHead, Campo,
// TotalTile). Allá no se exportan, y extraerlos a un módulo compartido
// obligaría a modificar Ventas, que está fuera de alcance. Son ~20 líneas de
// presentación pura: mismas clases, mismos tamaños, mismos tonos.

import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";

export function fmtMoneda(n) {
  if (n == null) return "—";
  return `$ ${Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Cantidades: enteros sin decimales, fraccionarios con hasta 3 útiles (la
// escala física de StockLocal).
export function fmtCantidad(n) {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  if (Number.isInteger(num)) return num.toLocaleString("es-AR");
  return num.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

// `null` = el dato no existe todavía → "—". `0` = existe y vale cero → "0".
// Los dos casos NO se colapsan.
export function cantidadOGuion(n) {
  if (n === null || n === undefined) return "—";
  return fmtCantidad(n);
}

export function fmtFechaHoraAR(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  // Ya declaraba la zona; le faltaba `hour12: false`. Del helper único.
  return fechaHoraAR(d);
}

// ── PRESENTACIÓN DE LA LÍNEA ────────────────────────────────────────────────
//
// Etiqueta derivada en el front con lo que el endpoint YA devuelve. No se toca
// la API por una etiqueta visual, y no se inventan equivalencias ni factores de
// pack: esta función solo NOMBRA cómo se envió la línea.
//
// El orden de las reglas importa: un fiambre fijo se envía en piezas aunque su
// unidad de medida sea kg, así que se resuelve primero.
export function presentacionDeLinea(d = {}) {
  if (d.esFiambreFijo) return "Fiambre";

  const unidadMedida = typeof d.unidadMedida === "string" ? d.unidadMedida.toLowerCase() : "";
  const unidadEnviada = typeof d.unidadEnviada === "string" ? d.unidadEnviada.toUpperCase() : "";

  if (unidadMedida === "pieza" || unidadMedida === "piezas") return "Pieza";
  if (unidadMedida === "kg" || unidadMedida === "kilo" || unidadMedida === "kilogramo") return "Kg";

  if (unidadEnviada === "BULTO") return "Bulto";
  if (unidadEnviada === "UNIDAD") return "Unidad";

  // Fallback legible: nunca "undefined" en pantalla.
  return "—";
}

// Badge de presentación, con el mismo tamaño y forma que BadgeModo en Ventas.
export function BadgePresentacion({ d }) {
  const label = presentacionDeLinea(d);
  if (label === "—") return null;
  const destacado = label === "Bulto";
  return (
    <span
      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
        destacado ? "sunmi-state-success sunmi-text-success" : "sunmi-surface-soft sunmi-text-link"
      }`}
    >
      {label}
    </span>
  );
}

// ── Bloques de layout ───────────────────────────────────────────────────────

// Título de sección alineado a la izquierda.
export function SectionHead({ title, subtitle }) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{title}</h2>
      {subtitle && <p className="text-[11px] sunmi-text-muted leading-tight">{subtitle}</p>}
    </div>
  );
}

// Campo de la grilla de información general: label muted + valor.
export function Campo({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
      <div className="text-sm font-medium sunmi-text-strong leading-snug break-words">
        {children}
      </div>
    </div>
  );
}

// Tile de la grilla de totales. `tone` colorea el valor; `highlight` le pone
// fondo de estado.
export function TotalTile({ label, value, tone = "neutral", highlight = false }) {
  const toneColor = {
    neutral: "sunmi-text-strong",
    accent: "sunmi-text-accent",
    success: "sunmi-text-success",
    muted: "sunmi-text-muted",
  }[tone] || "sunmi-text-strong";
  const box = highlight ? "sunmi-state-success" : "sunmi-surface-soft sunmi-border";
  return (
    <div className={`${box} rounded-lg px-3 py-2 min-w-0`}>
      <div className="text-[11px] sunmi-text-muted leading-tight truncate">{label}</div>
      <div className={`text-sm sm:text-base font-bold font-mono tabular-nums leading-tight ${toneColor}`}>
        {value}
      </div>
    </div>
  );
}
