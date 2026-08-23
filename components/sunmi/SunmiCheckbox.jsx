"use client";

import { Check } from "lucide-react";

/**
 * Selector binario del kit Sunmi.
 *
 * La pantalla decide el significado; esta pieza concentra tamaño, foco,
 * estados y color para que no se repitan inputs nativos con estilos locales.
 */
export default function SunmiCheckbox({
  checked = false,
  onChange = () => {},
  disabled = false,
  ariaLabel,
  className = "",
  ...props
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${disabled ? "opacity-50" : ""} ${className}`.trim()}>
      <input
        {...props}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`
          inline-flex h-4 w-4 items-center justify-center rounded
          transition peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--pos-link)]
          ${checked ? "sunmi-badge-accent" : "sunmi-control sunmi-border"}
        `.trim()}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
    </span>
  );
}
