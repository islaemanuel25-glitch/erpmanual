"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiSeparator({ label, className = "" }) {
  const { theme } = useSunmiTheme();
  
  // Usar color de borde del card para el separador
  const separatorColor = theme.card.split(' ').find(c => c.startsWith('border-'))?.replace('border-', 'bg-') || 'bg-slate-700/60';
  
  // ACÁ HABÍA UN COMENTARIO ADENTRO DE LA CADENA, Y NO ERA UN COMENTARIO.
  //
  // Decía `my-2 /* antes my-4 o my-6 */`, y como eso vive DENTRO del template
  // literal del `className`, el navegador recibía `/*`, `antes`, `my-4`, `o`,
  // `my-6` y `*/` como clases sueltas. `my-4` y `my-6` son clases de Tailwind de
  // verdad, tienen la misma especificidad que `my-2`, y gana la que la hoja
  // escriba última: `my-6`, que son 21 px.
  //
  // O sea que el separador dibujaba 21 px arriba y 21 abajo cuando el código
  // decía 7 y 7. Medido, no deducido: `my-2` sola da 7 px, `my-6` sola da 21, y
  // la cadena entera daba 21.
  //
  // Al sacar el comentario el separador pasa de 42 px de aire a 14. Es la
  // diferencia esperada de la tanda y se ve, sobre todo en las tarjetas donde el
  // separador va entre un título y una tabla.
  //
  // El comentario no se pierde: vive acá, que es donde el navegador no lo lee.
  return (
    <div
      className={`
        flex items-center gap-2
        text-[12px] text-slate-400
        my-2
        ${className}
      `}
    >
      <div className={`flex-1 h-px ${separatorColor}`} />
      {label && <span className="whitespace-nowrap">{label}</span>}
      <div className={`flex-1 h-px ${separatorColor}`} />
    </div>
  );
}
