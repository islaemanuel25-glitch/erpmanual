"use client";

// Piezas de presentación del detalle de transferencia.
//
// Son duplicados deliberados de los helpers que viven DENTRO de
// components/reportes-ventas/VentaDetalleAdmin.jsx (SectionHead, Campo,
// TotalTile). Allá no se exportan, y extraerlos a un módulo compartido
// obligaría a modificar Ventas, que está fuera de alcance. Son ~20 líneas de
// presentación pura: mismas clases, mismos tamaños, mismos tonos.

import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import { signoDeDiferencia } from "@/lib/transferencias/recepcionUI";
import {
  PRESENTACION,
  agrupa,
  descriptorDeEnvio,
} from "@/lib/transferencias/presentacionEnvio";

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

// ── LA DIFERENCIA SE LEE CON SIGNO ──────────────────────────────────────────
//
// Enviado 10, recibido 15: la pantalla dice "+5". Sin el más, un 5 en la columna
// Diferencia se lee igual que un faltante de 5, que es exactamente lo contrario.
//
// El menos ya lo trae el número formateado; el más hay que ponerlo. Por eso el
// signo sale de `signoDeDiferencia` —una sola función para las dos
// presentaciones— y el número sigue saliendo de `fmtCantidad`, sin una segunda
// copia del formateo de cantidades.
export function fmtDiferencia(diff) {
  if (diff === null || diff === undefined) return "—";
  return `${signoDeDiferencia(diff)}${fmtCantidad(diff)}`;
}

// Badge de una línea que no estaba en el remito.
//
// No es decoración: una línea con "Enviado 0" y "Recibido 2" es indistinguible a
// simple vista de un renglón mal cargado. El badge dice que ese 0 es correcto y
// que alguien la agregó a propósito.
//
// Usa `BasePildora`, la misma forma que `BadgePresentacion`: si tuviera su propio
// tamaño y su propio redondeo, los dos badges que van uno al lado del otro se
// verían distintos el día que alguien toque uno solo.
export function BadgeAgregado({ d }) {
  if (!d?.agregadoEnRecepcion) return null;
  return (
    <BasePildora tono="sunmi-state-warning-soft sunmi-text-warning">
      Agregado en recepción
    </BasePildora>
  );
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

  // ── LA PRESENTACIÓN SALE DEL DESCRIPTOR, NO DE LA FICHA NI DE LA COLUMNA ──
  //
  // Acá se preguntaba primero `unidadMedida` —cómo se COMPRA el producto— y
  // después `unidadEnviada` crudo. Las dos mienten sobre cómo salió la línea, y
  // es el error que `unidad-medida-es-como-se-compra.md` describe: en la
  // transferencia #204 la píldora decía **Unidad** sobre una línea despachada
  // como 4 CAJÓN x8, porque "cajon" no matcheaba ninguna de las ramas de arriba
  // y `unidadEnviada` dice UNIDAD —la venta interna consolida a físicas—.
  //
  // El descriptor contesta con el snapshot cuando la línea lo tiene y reconstruye
  // del catálogo cuando es anterior, que es lo que hacía esta función pero bien.
  //
  // **El vocabulario de la píldora NO cambia** —Bulto, Unidad, Kg, Pieza— y por
  // eso tampoco cambia el color, que se decide con `label === "Bulto"`. Lo único
  // que cambia es cuál de los cuatro le toca a cada línea.
  const envio = descriptorDeEnvio(d);
  if (envio.presentacion === PRESENTACION.PIEZA) return "Pieza";
  if (envio.presentacion === PRESENTACION.KG) return "Kg";
  if (agrupa(envio.presentacion)) return "Bulto";
  if (envio.presentacion === PRESENTACION.UNIDAD) return "Unidad";

  // Fallback legible: nunca "undefined" en pantalla.
  return "—";
}

// La forma de las píldoras de esta pantalla, en un solo lugar.
//
// Se extrajo de `BadgePresentacion` sin cambiarle una clase —mismo tamaño, mismo
// redondeo, mismo peso— cuando apareció el segundo badge. Con dos copias, el día
// que alguien ajuste una los dos que van pegados dejan de emparejar, y eso se ve.
//
// El tamaño es `text-xs2`, el token de 10px de `tailwind.config.js`: vale
// exactamente lo mismo que el `text-[10px]` que había y no le suma una medida
// mágica al trinquete.
function BasePildora({ tono, children }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-xs2 font-medium whitespace-nowrap ${tono}`}>
      {children}
    </span>
  );
}

// Badge de presentación, con el mismo tamaño y forma que BadgeModo en Ventas.
export function BadgePresentacion({ d }) {
  const label = presentacionDeLinea(d);
  if (label === "—") return null;
  const destacado = label === "Bulto";
  return (
    <BasePildora
      tono={destacado ? "sunmi-state-success sunmi-text-success" : "sunmi-surface-soft sunmi-text-link"}
    >
      {label}
    </BasePildora>
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
