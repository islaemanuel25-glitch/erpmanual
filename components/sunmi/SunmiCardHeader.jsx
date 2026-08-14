"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiCardHeader({
  title = "",
  /**
   * La línea de abajo del título. Antes NO EXISTÍA y siete pantallas se lo
   * pasaban igual: React descarta un prop de más sin decir nada, así que esos
   * textos estaban escritos y no los veía nadie.
   *
   * Se muestran los que dicen algo que el título no dice, y los que lo repiten
   * se borran de la pantalla. El criterio salió de `arqueo-caja` y está en el
   * roadmap: no alcanza con preguntar si el texto está vivo, hay que preguntar
   * si repite lo que la pantalla ya dice.
   */
  subtitle = "",
  children, // botones opcionales
}) {
  const { theme } = useSunmiTheme();

  // El `h2` se arma UNA vez y se reusa en las dos ramas. Sin subtítulo, lo que
  // sale es exactamente el mismo nodo que salía antes —ni un div de más—, y por
  // eso las pantallas que no lo pasan tienen que dar cero píxeles.
  const encabezado = (
    <h2 className={`text-[15px] font-semibold ${theme.layout.split(' ')[1] || 'text-slate-200'} tracking-wide`}>
      {title}
    </h2>
  );

  return (
    <div
      className="
        flex items-center justify-between
        mb-3 px-1
      "
    >
      {subtitle ? (
        <div className="flex flex-col gap-0.5">
          {encabezado}
          <p className="text-[11px] sunmi-section-subtitle">{subtitle}</p>
        </div>
      ) : (
        encabezado
      )}

      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}
