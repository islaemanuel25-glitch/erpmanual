"use client";

// Badge de estado de una transferencia, equivalente visual al EstadoBadge de
// Ventas (que vive dentro de su page.jsx y no se puede reutilizar sin tocar ese
// módulo).
//
// Vive en su propio archivo —y no duplicado en la fila y en la card— para que el
// mapeo estado→color exista UNA sola vez: si divergiera, la misma transferencia
// se vería de un color en la tabla y de otro en el celular.
//
// Los estados son los REALES que escribe el código; no se inventa ninguno y no
// existe "CON_DIFERENCIA". `Confirmando` y `Cancelando` son transitorios (viven
// dentro de una transacción): no deberían verse nunca, pero si aparecen se
// muestran como "En proceso" en vez de romper la UI o filtrar el string crudo.

const MAPA = {
  Pendiente:   { label: "Pendiente",  clase: "sunmi-badge-muted" },
  Enviada:     { label: "Enviada",    clase: "sunmi-state-warning sunmi-text-accent" },
  Recibiendo:  { label: "Recibiendo", clase: "sunmi-state-warning-soft sunmi-text-accent" },
  Confirmando: { label: "En proceso", clase: "sunmi-badge-muted" },
  Recibida:    { label: "Recibida",   clase: "sunmi-state-success sunmi-text-success" },
  Cancelando:  { label: "En proceso", clase: "sunmi-badge-muted" },
  Cancelada:   { label: "Cancelada",  clase: "sunmi-state-danger sunmi-text-danger" },
};

const BASE = "px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap";

export default function EstadoTransferenciaBadge({ estado }) {
  // Estado desconocido (dato viejo o futuro): se muestra tal cual en muted en
  // lugar de no renderizar nada.
  const conf = MAPA[estado] || { label: estado || "—", clase: "sunmi-badge-muted" };
  return <span className={`${BASE} ${conf.clase}`}>{conf.label}</span>;
}

/**
 * Badge secundario de diferencias. Equivalente al "✎ Corregida" de Ventas.
 * Solo se muestra con la recepción ya confirmada: antes de eso el faltante
 * todavía no es un hecho.
 */
export function DiferenciasBadge({ estado, tieneDiferencias }) {
  if (estado !== "Recibida" || tieneDiferencias !== true) return null;
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium sunmi-state-warning sunmi-text-accent whitespace-nowrap">
      ⚠ Con diferencias
    </span>
  );
}
