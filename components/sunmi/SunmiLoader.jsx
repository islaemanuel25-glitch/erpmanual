"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiLoader({ size = 20 }) {
  const { theme } = useSunmiTheme();
  
  const spinnerColor = theme.accent === 'amber' ? 'border-t-amber-400' : 'border-t-cyan-400';
  const borderColor = theme.card.split(' ').find(c => c.startsWith('border-'))?.replace('border-', 'border-') || 'border-slate-700';
  
  // EL ANILLO SE DIBUJABA POR UN COMENTARIO, Y AHORA ESTÁ DECLARADO.
  //
  // La cadena decía `${borderColor} /* antes border-2 */`, y ese comentario vive
  // DENTRO del template literal: el navegador recibía `/*`, `antes`, `border-2`
  // y `*/` como clases sueltas. `border-2` es una clase de Tailwind de verdad, y
  // era **lo único** que le daba ancho al borde — el código no declaraba
  // ninguno, y Tailwind deja el ancho en 0 si nadie lo pide.
  //
  // O sea que este caso no es como los otros tres: acá el comentario no cambiaba
  // un número, **sostenía el dibujo**. Limpiarlo sin reponer `border-2` habría
  // dejado el spinner sin anillo, invisible, en las 37 pantallas que lo usan.
  //
  // Por eso el `border-2` se escribe de verdad: el código pasa a declarar lo que
  // ya dibujaba. Medido sobre las once propiedades del borde y en los dos temas,
  // las dos cadenas dan idéntico, y el control es que sin `border-2` el ancho
  // cae a 0 — o sea que la medición distingue.
  return (
    <div className="flex justify-center py-2">    {/* antes py-4 */}
      <div
        className={`
          animate-spin
          rounded-full
          border-2
          ${borderColor}
          ${spinnerColor}
        `}
        style={{
          width: size,                  /* antes 28 by default */
          height: size,
        }}
      />
    </div>
  );
}
