"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

// EL PADDING DICE p-6 PORQUE p-6 ES LO QUE EL NAVEGADOR DIBUJA.
//
// Acá decía `p-3 /* antes p-4 / p-6 */`, y ese comentario NO era un comentario:
// vive adentro de la cadena del `className`, así que el navegador leía `p-3`,
// `p-4` y `p-6` como tres clases de verdad. Las tres existen en la hoja de
// estilos porque el repo las usa en otro lado y tienen la misma especificidad,
// así que ganaba la última que hubiera escrito Tailwind: `p-6`. Con la raíz en
// 14 px eso da 21 px, y son los 21 px que tiene hoy CADA tarjeta del sistema.
//
// El defecto no era el número, era la mentira: el código decía 12 px y el
// navegador dibujaba 21. Cualquiera que midiera algo contra una tarjeta iba a
// tropezar con eso, y de hecho pasó — el `p-0 overflow-hidden` de tres modales
// nunca se aplicó y nadie lo sabía.
//
// Por eso queda `p-6` y NO `p-3`: esto fija lo que hoy se dibuja, no lo aprieta.
// Bajar las tarjetas de 21 a 10.5 px es una decisión de aspecto, se toma
// mirando pantallas y nadie la pidió. Verificado con capturas de una tarjeta de
// modal, una de lista y una de detalle: cero píxeles de diferencia.
export default function SunmiCard({ children, className = "" }) {
  const { theme } = useSunmiTheme();

  return (
    <div
      className={`
        ${theme.card}
        rounded-xl
        shadow-md
        p-6
        backdrop-blur-sm
        ${className}
      `}
    >
      {children}
    </div>
  );
}
