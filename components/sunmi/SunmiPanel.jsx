"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const { theme } = useSunmiTheme();
  const padding = noPadding ? "" : "p-4";
  
  return (
    <div
      // MARCA INERTE PARA EL ARNÉS DE CAPTURAS. No dibuja nada: es un atributo
      // para que `--elemento` pueda recortar a cada panel y comparar antes contra
      // después panel por panel.
      //
      // ── POR QUÉ HIZO FALTA ────────────────────────────────────────────────
      //
      // Tres de las cinco pantallas que usan la pieza tienen un SCROLLER INTERNO:
      // la página mide 900 px y el contenido scrollea adentro, así que subir
      // `--alto-captura` no captura más —se comprobó con 1800 y el recorte siguió
      // en 900—. `ganancia` se corta 726 px y `reportes-stock` 51.680. Y son
      // justo las que más paneles tienen: 7 y 12.
      //
      // Sin esto, "cero píxeles" solo podría afirmarse sobre la banda visible.
      //
      // El selector NO puede ser posicional ni depender de una clase que la
      // migración vaya a cambiar —`sunmi-surface` se va a sacar de las 28
      // declaraciones—, así que tiene que ser un atributo propio que valga igual
      // antes y después. Es el mismo recurso que `data-sunmi-modal="tarjeta"`.
      data-sunmi-panel=""
      className={`
        ${theme.card}
        rounded-2xl
        ${padding}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
