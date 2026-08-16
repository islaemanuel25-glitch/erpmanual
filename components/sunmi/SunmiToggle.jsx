"use client";

import { useState } from "react";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiToggle({
  value = false,
  onChange = () => {},
  label = "",
}) {
  const { theme } = useSunmiTheme();
  const [checked, setChecked] = useState(value);

  const toggle = () => {
    const newVal = !checked;
    setChecked(newVal);
    onChange(newVal);
  };

  // Extraer color de texto del layout
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-'))?.replace('text-slate-50', 'text-slate-300') || 'text-slate-300';

  // LOS DOS COMENTARIOS QUE ESTABAN ADENTRO DE LAS CADENAS, Y QUÉ DIBUJABAN.
  //
  // La pista decía `w-8 h-4 /* antes w-10 h-5 */` y la perilla `w-4 h-4 /* antes
  // w-5 h-5 */`. Como el comentario vive DENTRO del template literal, el
  // navegador recibía `w-10`, `h-5` y `w-5` como clases de verdad.
  //
  // Lo medido, con las clases sueltas como control:
  //
  //   · pista, ancho:  el código dice `w-8` (28 px), se filtra `w-10` (35 px),
  //     y GANABA `w-8`. Acá el comentario no cambiaba nada.
  //   · pista, alto:   el código dice `h-4` (14 px), se filtra `h-5` (17,5), y
  //     GANABA `h-5`.
  //   · perilla:       el código dice `w-4 h-4` (14 × 14), se filtran `w-5 h-5`,
  //     y GANABAN LAS DOS: 17,5 × 17,5.
  //
  // O sea que la perilla quedaba EXACTAMENTE del alto de la pista y la llenaba
  // entera: el interruptor se veía como una píldora maciza y no como una perilla
  // adentro de un riel. Ésa es la diferencia que se ve al sacar los comentarios.
  //
  // Que en la misma cadena una familia gane la del código y la otra la del
  // comentario es lo que hace que esto no se pueda deducir leyendo: hay que
  // medirlo.

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* TRACK — acá había un comentario adentro de la cadena. Ver abajo. */}
      <div
        className={`
          w-8 h-4
          rounded-full
          transition-all
          ${checked ? "bg-amber-400" : "bg-slate-600"}
        `}
      >
        {/* THUMB */}
        <div
          className={`
            w-4 h-4
            bg-white rounded-full
            shadow
            transform transition-all
            ${checked ? "translate-x-4" : "translate-x-0"}
          `}
        />
      </div>

      {label && (
        <span className={`text-[12px] ${textColor}`}>{label}</span>
      )}
    </div>
  );
}
