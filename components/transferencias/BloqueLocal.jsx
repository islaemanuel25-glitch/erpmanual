"use client";

// components/transferencias/BloqueLocal.jsx
//
// UN LOCAL, UN PERÍODO, UNA CUENTA. Es la unidad de trabajo de la vista del
// depósito (V28).
//
// ── EL RANGO VA ADENTRO DEL BLOQUE, Y NO ARRIBA DE LA PANTALLA ─────────────
//
// Porque el corte de semana es un ACUERDO por relación depósito–local: si con
// mini el 7 se corta domingo y con Casiano lunes, "esta semana" es un rango
// distinto para cada uno. Un solo rango arriba sería mentira para al menos uno
// de los dos. Por eso `bloquesPorLocal` lo calcula por bloque y viaja adentro,
// y por eso acá se dibuja adentro.
//
// ── EL BORDE EN WARNING SIGNIFICA ALGO ────────────────────────────────────
//
// Que el total está ABIERTO: quedan transferencias sin recibir y se paga lo
// recibido, así que el número de arriba todavía puede cambiar. No es
// decoración, y por eso el mismo hecho —`totalCerrado`— decide el borde y el
// tono de la línea de conteo.
//
// ── LA PÍLDORA "SIN CORTE" ────────────────────────────────────────────────
//
// Una relación sin acuerdo cargado cae al domingo para poder mostrar algo, pero
// NUNCA en silencio: ese domingo se leería como una decisión que alguien tomó y
// no lo es. La píldora va en el mismo renglón del nombre del local, con el tono
// de advertencia del kit.
//
// Es un `span` y no un enlace A PROPÓSITO: el renglón entero ya es el botón que
// abre el bloque, y meter un enlace adentro de un botón es un interactivo
// adentro de otro. El camino para configurarlo está en la pantalla, arriba, con
// el aviso que cuenta cuántas faltan.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { rotuloDelRango } from "@/lib/transferencias/periodoDePago";
import {
  rotuloDeBloque,
  subtituloConEstado,
  tituloDeTransferencia,
} from "@/lib/transferencias/rotulosDeTransferencia";

export default function BloqueLocal({ bloque, abierto = false, onAlternar, onRecibir, money }) {
  const abierta = !bloque?.totalCerrado;

  return (
    <section
      // Radio 14 (`rounded-xl2`, que ya estaba en el config) y padding 16/14
      // ajustados a la escala del proyecto: los dos caen en `p-4` = 14 px.
      className={`sunmi-surface rounded-xl2 px-4 py-4 ${
        abierta ? "border-1.5 sunmi-border-warning" : "border sunmi-border"
      }`}
    >
      {/* ── EL RENGLÓN ENTERO ES EL BOTÓN QUE ABRE ────────────────────────
          Decidido sin diseño: en un teléfono, un objetivo del ancho de la
          tarjeta se acierta con el pulgar y un control chico al costado no.

          Va con `color="ghost"` —la variante SIN relleno del kit— y las seis
          clases que siguen no son decoración: son los seis ejes que
          `SunmiButton` CEDE cuando la pantalla los declara —display, alineación,
          padding, radio y alto mínimo—. Lo que queda del kit es lo que acá sí
          hace falta: el cursor, la transición y el contrato de foco. Un
          `<button>` escrito a mano tendría la misma pinta y ninguna de esas
          tres cosas — y el trinquete lo contaría, con razón. */}
      <SunmiButton
        type="button"
        color="ghost"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="flex w-full items-start justify-between gap-3 p-0 min-h-0 rounded-none text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-lg2 font-semibold sunmi-text-strong truncate">
              {bloque?.nombre || "—"}
            </span>
            {bloque?.sinConfigurar && (
              <span className="shrink-0 rounded-lg border sunmi-border-warning sunmi-state-warning-soft sunmi-text-warning text-xs2 font-semibold px-1.5 py-1 leading-none">
                Sin corte
              </span>
            )}
          </div>

          <div className={`text-xs ${abierta ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
            {rotuloDeBloque(bloque)}
          </div>

          {/* El rango de ESTE local. */}
          <div className="text-sm2 sunmi-text-muted">{rotuloDelRango(bloque?.rango)}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs2 sunmi-text-muted">A pagar</div>
          <div className="text-lg3 font-semibold sunmi-text-strong tabular-nums">
            {money ? money(bloque?.aPagar) : bloque?.aPagar}
          </div>
        </div>
      </SunmiButton>

      {abierto && (
        <div className="mt-3.5">
          {/* El separador de la especificación: 1 px al 70 %. */}
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

          {(bloque?.transferencias || []).map((t) => {
            const pendiente = !t?.recibida;
            return (
              <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium sunmi-text-strong truncate">
                    {tituloDeTransferencia(t)}
                  </div>
                  <div
                    className={`text-sm2 ${pendiente ? "sunmi-text-warning" : "sunmi-text-muted"}`}
                  >
                    {subtituloConEstado(t)}
                  </div>
                </div>

                {pendiente ? (
                  <SunmiButton
                    type="button"
                    color="primary"
                    onClick={() => onRecibir?.(t)}
                    className="shrink-0 px-3.5 py-2 rounded-lg text-sm3 font-semibold"
                  >
                    Recibir
                  </SunmiButton>
                ) : (
                  <div className="shrink-0 text-base font-semibold sunmi-text-strong tabular-nums">
                    {money ? money(t?.importe) : t?.importe}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
