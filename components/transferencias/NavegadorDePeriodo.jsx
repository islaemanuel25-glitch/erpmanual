"use client";

// components/transferencias/NavegadorDePeriodo.jsx
//
// MOVERSE ENTRE PERÍODOS: ‹ el título del período ›
//
// ── LO QUE VIENE A RESOLVER ───────────────────────────────────────────────
//
// Hasta la V40 no había forma de ver una semana anterior. La pantalla mostraba
// el período que acababa de cerrar y punto: si alguien preguntaba por lo de hace
// dos semanas, no había a dónde ir.
//
// ── SE MUEVE EN LA UNIDAD DEL CHIP, Y ESO NO SE DECIDE ACÁ ───────────────
//
// Con Día salta de día, con Semana de semana, con Mes de mes. Este componente no
// sabe nada de calendario: manda un número —cuántos períodos atrás— y la cuenta
// la hace `rangoDesplazado`, que es donde ya están resueltos el corte de semana,
// el largo de cada mes y los años bisiestos.
//
// Restar "7 días" o "30 días" habría sido la forma fácil y es falsa: los meses no
// miden lo mismo.
//
// ── LAS DOS FLECHAS SE APAGAN POR MOTIVOS DISTINTOS ──────────────────────
//
//   · la de ADELANTE, cuando ya se está en el período en curso. No hay período
//     futuro que mirar: mostraría cero siempre, y ese cero no se distingue de
//     "no hubo movimiento".
//   · la de ATRÁS, cuando el período que se muestra ya empieza antes de la
//     PRIMERA transferencia de este local. Es un tope de dato, no un número
//     inventado: más atrás está probado que no hay nada.
//
// Las dos las decide el servidor —`puedeAvanzar` y `puedeRetroceder`— y no esta
// pieza. La flecha es una sugerencia; el tope de verdad está en la ruta, porque
// la URL se puede escribir a mano.

import SunmiButton from "@/components/sunmi/SunmiButton";

/** El botón de una flecha. Los dos son la misma pieza con distinto símbolo. */
function Flecha({ simbolo, etiqueta, habilitada, onClick }) {
  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={habilitada ? onClick : undefined}
      disabled={!habilitada}
      aria-label={etiqueta}
      // `opacity-35` y no `hidden`: una flecha que desaparece mueve el título de
      // lugar cada vez que se llega a una punta, y eso se lee como que la
      // pantalla saltó. Atenuada, el navegador conserva su forma.
      className={`shrink-0 min-h-0 rounded-lg px-3.5 py-2.5 text-base2 font-semibold sunmi-surface-soft sunmi-text-strong ${
        habilitada ? "" : "opacity-35"
      }`}
    >
      {simbolo}
    </SunmiButton>
  );
}

export default function NavegadorDePeriodo({
  titulo,
  subtitulo,
  puedeAvanzar = false,
  puedeRetroceder = true,
  onAtras,
  onAdelante,
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border sunmi-border sunmi-bg-card p-2">
      <Flecha
        simbolo="‹"
        etiqueta="Período anterior"
        habilitada={puedeRetroceder}
        onClick={onAtras}
      />

      {/* `min-w-0` y `truncate`: un mes largo —"Septiembre · en curso"— a 390 px
          empuja las flechas afuera si el centro no puede achicarse. */}
      <div className="min-w-0 flex-1 text-center">
        <div className="text-base font-semibold sunmi-text-strong truncate">{titulo}</div>
        {subtitulo ? (
          <div className="text-sm2 sunmi-text-muted truncate">{subtitulo}</div>
        ) : null}
      </div>

      <Flecha
        simbolo="›"
        etiqueta="Período siguiente"
        habilitada={puedeAvanzar}
        onClick={onAdelante}
      />
    </div>
  );
}
