"use client";

// components/transferencias/CuentaDelPeriodoCerrado.jsx
//
// LO QUE HAY QUE COBRARLE A ESTE LOCAL EN EL PERÍODO QUE SE ESTÁ MIRANDO.
//
// ── EL DEFECTO QUE CERRÓ LA V41, Y ERA UN TEXTO FALSO ────────────────────
//
// Este componente escribía **"Semana cerrada" a mano**, en el JSX, aunque el
// chip estuviera en Mes. El título decía una cosa y el rango de abajo decía
// otra, en la pantalla que dice cuánta plata hay que cobrar.
//
// Ahora el título, el rango y el rótulo del importe vienen los TRES de
// `descripcionDelPeriodo`, del lado del servidor y de los mismos datos con los
// que se consultó. No pueden contradecirse entre ellos porque salen del mismo
// lugar, y el componente no tiene ningún nombre de período escrito adentro.
//
// ── "PARA COBRAR" vs "VA ACUMULADO" ES UNA REGLA DE NEGOCIO ──────────────
//
// Si el período terminó, el número es una deuda cerrada. Si sigue abierto, va a
// crecer. Poner "Para cobrar" sobre un período abierto es pedirle a alguien que
// cobre un número que mañana es otro — que es exactamente lo que pasaba el
// domingo 2026-09-13 y lo que abrió esta línea de trabajo.
//
// El nombre del archivo quedó de cuando solo mostraba el período cerrado. No se
// renombra en esta tanda para no mezclar un movimiento de archivos con un cambio
// de comportamiento; queda anotado.

import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { avisoDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";

export default function CuentaDelPeriodoCerrado({
  periodo,
  money,
  puedeConfigurarCorte = false,
  onConfigurarCorte,
}) {
  const d = periodo?.descripcion || {};
  const aviso = avisoDelPeriodo({
    sinRecibir: periodo?.sinRecibir,
    enCurso: d.enCurso,
    unidad: d.unidad,
  });
  // El borde de aviso se enciende por lo mismo que el aviso de abajo: el total
  // todavía se puede mover. Así el marco y la frase no pueden discrepar.
  const abierta = Boolean(aviso);
  const vacio = Number(periodo?.cantidad || 0) === 0;

  return (
    <section
      className={`sunmi-bg-card rounded-xl2 p-4 space-y-3 ${
        abierta ? "border-1.5 sunmi-border-warning" : "border sunmi-border"
      }`}
    >
      <div>
        <div className="text-xs sunmi-text-muted">{d.rotuloDelImporte || "Para cobrar"}</div>
        <div className="text-xl2 font-semibold sunmi-text-strong tabular-nums">
          {money ? money(periodo?.aPagar) : periodo?.aPagar}
        </div>
        <div className="text-sm2 sunmi-text-muted">
          {d.titulo}
          {d.subtitulo ? ` · ${d.subtitulo}` : ""}
        </div>
      </div>

      {/* ── EL PERÍODO SIN MOVIMIENTO ─────────────────────────────────────
          Pasa con un local recién vinculado, con una semana en la que no se le
          mandó nada, y ahora también al caminar hacia atrás con las flechas. El
          rango EXISTE igual —es una cuenta de calendario, no de datos— así que
          se muestra con su importe en cero y una frase que dice qué pasó. Decir
          "no hay período" sería falso: lo hay, y está vacío, que es una
          respuesta distinta y es la verdadera. */}
      {vacio && (
        <div className="text-sm2 sunmi-text-muted">No se le envió nada en ese período.</div>
      )}

      {(aviso || puedeConfigurarCorte) && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm2 font-medium sunmi-text-warning">{aviso}</div>
            {/* ── EL ATAJO AL CORTE VIVE ACÁ Y SOLO CON SEMANA ──────────────
                Es donde la pregunta surge: el rango de una semana depende del
                corte, y el del mes no. Ofrecerlo con el chip en Mes llevaría a
                una pantalla que no cambia nada de lo que se está mirando.

                Y solo a quien puede usarlo: un atajo a una pantalla donde no se
                puede configurar nada es peor que no ofrecerlo. */}
            {puedeConfigurarCorte && (
              <div className="shrink-0">
                <SunmiLinkButton onClick={onConfigurarCorte}>Corte de semana ›</SunmiLinkButton>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
