"use client";

// UNA FILA DE TABLA.
//
// ── EL TONO Y EL HOVER NO COMPITEN ──────────────────────────────────────────
//
// Antes el hover se aplicaba siempre como `background-color`, y cualquier
// pantalla que quisiera pintar una fila según su estado —guardada, con error,
// editada, seleccionada— tenía que ganarle a esa clase. La única forma era
// `!important`, y el precio era perder el hover en esa fila y escribir un color
// fijo fuera del sistema de themes.
//
// Ahora el tono va en `background-color` y el hover en `background-image`. Son
// dos propiedades distintas: el hover se pinta ENCIMA del tono en vez de
// reemplazarlo. Nadie necesita `!important` y la fila teñida sigue reaccionando
// al mouse. Los colores salen de `--pos-*`, así que acompañan al theme.
//
// ── COMPATIBILIDAD ──────────────────────────────────────────────────────────
//
// Sin `tono` la fila produce exactamente las mismas clases que antes. Las
// pantallas que ya existen no cambian ni un píxel.

export default function SunmiTableRow({
  children,
  selected = false,
  onClick,
  className = "",
  /** "ok" | "alerta" | "atencion" | "apagado" | null */
  tono = null,
}) {
  const fondo = tono
    ? `sunmi-fila sunmi-fila-${tono}${selected ? " sunmi-fila-seleccionada" : ""}`
    : selected
      ? "bg-[var(--table-row-hover)]"
      : "hover:bg-[var(--table-row-hover)]";

  return (
    <tr
      onClick={onClick}
      className={`
        text-[12px]
        ${onClick ? "cursor-pointer" : ""}
        ${fondo}
        ${className}
      `}
    >
      {children}
    </tr>
  );
}
