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
// ── QUÉ COLOR Y CUÁNTO SON DOS PREGUNTAS ────────────────────────────────────
//
// `tono` dice qué estado tiene la fila y `intensidad` cuánto se nota. Están
// separados porque son decisiones independientes: la misma fila "con cambios sin
// guardar" se pinta suave en una pantalla que muestra veinte a la vez y fuerte
// en la que el usuario acaba de elegir. Con un solo eje habría que inventar un
// valor por combinación —"atencion-fuerte", "ok-fuerte", …— y cada pantalla
// nueva agregaría el suyo.
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
  /** "ambiente" | "fuerte". Ambiente es lo de siempre. */
  intensidad = "ambiente",
}) {
  const fondo = tono
    ? `sunmi-fila sunmi-fila-${tono} sunmi-fila-${intensidad}${selected ? " sunmi-fila-seleccionada" : ""}`
    : selected
      ? "bg-[var(--table-row-hover)]"
      : "hover:bg-[var(--table-row-hover)]";

  return (
    <tr
      // MARCA INERTE PARA EL ARNÉS. No dibuja nada: deja recortar fila por fila
      // en vez de fotografiar pantallas enteras. Con 29 archivos consumidores es
      // lo único que vuelve manejable la verificación.
      //
      // No puede ser una clase: la migración toca justamente las clases, y el
      // selector tiene que encontrar la misma cosa antes y después. Es el mismo
      // recurso que `data-sunmi-panel` y `data-sunmi-modal="tarjeta"`.
      data-sunmi-row=""
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
