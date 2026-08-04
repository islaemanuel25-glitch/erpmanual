"use client";

// Cifras del retiro, en un solo lugar para que los tres pasos y el resumen
// final digan exactamente lo mismo.
//
// Todo el color sale de roles semánticos (`sunmi-text-*`, `sunmi-state-*`), no
// de clases de color fijas: la pantalla tiene que verse bien en cualquier tema.

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Tono de una diferencia: 0 es neutro, positivo sobra, negativo falta. */
export function tonoDiferencia(dif) {
  const c = Math.round(Number(dif || 0) * 100);
  if (c === 0) return "sunmi-text-strong";
  return c > 0 ? "sunmi-text-warning" : "sunmi-text-danger";
}

export function Cifra({ label, valor, clase = "sunmi-text-strong", nota, destacado = false }) {
  return (
    <div
      className={`${destacado ? "sunmi-surface" : "sunmi-surface-soft"} sunmi-border rounded-lg px-3 py-2 min-w-0`}
    >
      <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
      <div className={`text-base font-bold font-mono tabular-nums leading-tight break-words ${clase}`}>
        {typeof valor === "number" ? money(valor) : valor}
      </div>
      {nota && <div className="text-[10px] sunmi-text-muted leading-tight mt-0.5">{nota}</div>}
    </div>
  );
}

export function Fila({ label, valor, clase = "sunmi-text-strong", fuerte = false }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${fuerte ? "pt-2 mt-1 border-t sunmi-border" : ""}`}>
      <span className={`text-[12px] ${fuerte ? "font-semibold sunmi-text-strong" : "sunmi-text-muted"}`}>
        {label}
      </span>
      <span className={`text-[13px] font-mono tabular-nums shrink-0 ${fuerte ? "font-bold" : ""} ${clase}`}>
        {typeof valor === "number" ? money(valor) : valor}
      </span>
    </div>
  );
}

export { money };
