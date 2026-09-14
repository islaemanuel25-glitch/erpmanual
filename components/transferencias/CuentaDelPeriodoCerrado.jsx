"use client";

// components/transferencias/CuentaDelPeriodoCerrado.jsx
//
// LO QUE HAY QUE COBRARLE A ESTE LOCAL, y debajo lo que se está armando.
//
// ── EL PERÍODO CERRADO ES EL ANTERIOR, NO EL EN CURSO ────────────────────
//
// La pregunta es "cuánto me tienen que pagar", y ésa se contesta con el período
// TERMINADO. El domingo 2026-09-13 lo dejó a la vista: con corte domingo, la
// semana en curso arrancaba ese día, así que la pantalla mostraba cuatro
// transferencias que todavía no se cobran y escondía la semana que sí.
//
// La regla está en `rangoDelPeriodoCerrado` y es de una línea: el período que
// contiene al día ANTERIOR al inicio del que está en curso.
//
// ── Y LA SEMANA EN CURSO NO DESAPARECE: BAJA DE JERARQUÍA ────────────────
//
// Sigue haciendo falta —es lo que se está juntando— pero es contexto, no la
// respuesta. Por eso va en una línea compacta debajo y no en una tarjeta:
// mirarlas con el mismo peso es lo que hacía que se confundieran.

import { rotuloDelRango } from "@/lib/transferencias/periodoDePago";
import { avisoDeTotalAbierto } from "@/lib/transferencias/rotulosDeTransferencia";

/** "3 transferencias" / "1 transferencia". */
function cuantas(n) {
  const c = Number(n || 0);
  return `${c} ${c === 1 ? "transferencia" : "transferencias"}`;
}

export default function CuentaDelPeriodoCerrado({ cerrado, enCurso, unidadNombre, money }) {
  const aviso = avisoDeTotalAbierto(cerrado || {});
  const abierta = !cerrado?.totalCerrado;
  const vacio = Number(cerrado?.cantidad || 0) === 0;

  return (
    <div className="space-y-2">
      <section
        // `sunmi-bg-card` y no `sunmi-surface`: aquélla se llama "surface" pero
        // pinta `--app-bg`, el fondo de la APLICACIÓN, así que la tarjeta salía
        // del mismo color que la página. Medido en el navegador: esta tarjeta y
        // el fondo daban los dos `rgb(15, 23, 42)`.
        className={`sunmi-bg-card rounded-xl2 p-4 space-y-3 ${
          abierta ? "border-1.5 sunmi-border-warning" : "border sunmi-border"
        }`}
      >
        <div>
          <div className="text-xs sunmi-text-muted">Para cobrar</div>
          <div className="text-xl2 font-semibold sunmi-text-strong tabular-nums">
            {money ? money(cerrado?.aPagar) : cerrado?.aPagar}
          </div>
          <div className="text-sm2 sunmi-text-muted">
            {unidadNombre} cerrada · {rotuloDelRango(cerrado?.rango)}
          </div>
        </div>

        {/* ── EL PERÍODO CERRADO SIN MOVIMIENTO ─────────────────────────
            Pasa con un local recién vinculado, o con una semana en la que no se
            le mandó nada. El rango EXISTE igual —siempre hay una semana
            anterior— así que se muestra con su importe en cero y una frase que
            dice qué pasó. Decir "no hay período" sería falso: lo hay, y está
            vacío, que es una respuesta distinta y es la verdadera. */}
        {vacio && (
          <div className="text-sm2 sunmi-text-muted">
            No se le envió nada en ese período.
          </div>
        )}

        {aviso && (
          <>
            <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
            <div className="text-sm2 font-medium sunmi-text-warning">{aviso}</div>
          </>
        )}
      </section>

      {/* LA SEMANA EN CURSO, en una línea. Es lo que se está juntando y todavía
          no se cobra. */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm3 font-medium sunmi-text-strong">{unidadNombre} en curso</div>
          <div className="text-sm2 sunmi-text-muted">
            {rotuloDelRango(enCurso?.rango)} · {cuantas(enCurso?.cantidad)}
          </div>
        </div>
        <div className="shrink-0 text-base2 font-semibold sunmi-text-strong tabular-nums">
          {money ? money(enCurso?.aPagar) : enCurso?.aPagar}
        </div>
      </div>
    </div>
  );
}
