"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiHeader({ title, color = "amber", subtitle = "", children }) {
  const { theme } = useSunmiTheme();
  const ribbon = theme.titleRibbon || theme.header;

  // Override por color="cyan" en themes con accent amber: refleja la intención antigua
  const bgClass = color === "cyan" && theme.accent === "amber"
    ? ribbon.bg.replace(/amber/g, "cyan")
    : ribbon.bg;

  const cinta = (
    <div
      className={`
        bg-gradient-to-r ${bgClass}
        ${ribbon.border}
        ${ribbon.text}
        rounded-xl
        px-4 py-2
        text-[13px]
        font-bold
        tracking-wide
        uppercase
        shadow-md
        mb-2
        border
      `}
    >
      {title}
      {children}
    </div>
  );

  // EL SUBTÍTULO VA DEBAJO DE LA CINTA, NO ADENTRO.
  //
  // Adentro heredaría `uppercase`, `font-bold` y `tracking-wide`, que son de un
  // rótulo de dos palabras: una frase entera con eso se lee como un grito y
  // ocupa el doble. Afuera queda como lo que es, una línea de contexto.
  //
  // Sin subtítulo devuelve LA CINTA SOLA, el mismo nodo de siempre. Un fragmento
  // con un solo hijo no agrega nada al DOM, así que las pantallas que no lo
  // pasan tienen que dar cero píxeles.
  if (!subtitle) return cinta;

  return (
    <>
      {cinta}
      <p className="text-[11px] sunmi-section-subtitle -mt-1 mb-3 px-1">{subtitle}</p>
    </>
  );
}
