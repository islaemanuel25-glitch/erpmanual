"use client";

// components/transferencias/DiaDeTransferencias.jsx
//
// UN DÍA DE TRABAJO: la banda con su total, y debajo las transferencias de ese
// día en UNA tarjeta.
//
// ── POR QUÉ EL DÍA Y NO EL NÚMERO ─────────────────────────────────────────
//
// La lista decía "#200", "#204". Ese número es interno: no dice qué día salió,
// ni qué traía, ni si hubo diferencia. El día sí, y es como se piensa el
// trabajo — "lo del sábado". El "#N" sigue existiendo adentro del detalle, que
// es donde sirve para nombrarla por teléfono.
//
// ── LA BANDA SE PINTA PAREJA DE LADO A LADO ──────────────────────────────
//
// Y eso no es un detalle de estilo: es el defecto que hay que no repetir. El
// fondo va en UN solo nodo —el de la banda— y ninguno de sus hijos declara
// fondo propio. Un contenedor interno con su propio `bg` tapa la franja y deja
// un rectángulo del color de la tarjeta en el medio, que se lee como un bloque
// en blanco.
//
// Por eso los dos lados de la banda son `div` sin fondo, y el candado afirma
// que adentro de la banda no hay ninguna clase de superficie.
//
// ── UNA TARJETA POR DÍA, NO UNA POR TRANSFERENCIA ────────────────────────
//
// Las filas van separadas por una línea de 1 px. Con una tarjeta por
// transferencia, tres envíos del mismo día se leen como tres cosas sueltas; en
// una sola tarjeta se leen como lo que son, el trabajo de ese día.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { rotuloDelDia } from "@/lib/transferencias/diasDeTransferencias";
import { estadoEnPalabras, rotuloDeItems } from "@/lib/transferencias/rotulosDeTransferencia";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaMostrada } from "@/lib/transferencias/rotulosDeTransferencia";

export default function DiaDeTransferencias({ dia, onRecibir, onVer, money }) {
  return (
    <section className="space-y-2">
      {/* LA BANDA. Único nodo con fondo; sus hijos no declaran ninguno. */}
      <div className="sunmi-surface-soft rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base2 font-semibold sunmi-text-strong truncate">{dia?.titulo}</div>
          <div className="text-sm2 sunmi-text-muted">{rotuloDelDia(dia)}</div>
        </div>
        <div className="shrink-0 text-base font-semibold sunmi-text-strong tabular-nums">
          {money ? money(dia?.importe) : dia?.importe}
        </div>
      </div>

      {/* `sunmi-bg-card` y no `sunmi-surface`: aquélla pinta `--app-bg`, el fondo
          de la APLICACIÓN, así que la tarjeta del día salía del mismo color que
          la página. La banda de adentro sigue en `sunmi-surface-soft`, que es
          otro token y contrasta contra ésta. */}
      <div className="sunmi-bg-card rounded-xl2 border sunmi-border overflow-hidden">
        {(dia?.transferencias || []).map((t, i) => (
          <FilaDelDia
            key={t.id}
            t={t}
            primera={i === 0}
            onRecibir={onRecibir}
            onVer={onVer}
            money={money}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * UNA TRANSFERENCIA, SIN SU NÚMERO.
 *
 * ── LA RECIBIDA SE PUEDE ABRIR, Y ÉSE ERA EL DEFECTO PRINCIPAL ───────────
 *
 * Antes el único control era "Recibir", que es para las pendientes: una
 * transferencia ya recibida no tenía forma de abrirse desde acá. Ahora la fila
 * ENTERA es tocable y lleva al detalle que ya existe.
 *
 * El "Ver ›" de la derecha no es el botón: es la señal de que se puede tocar.
 * Si fuera el único objetivo, en un teléfono habría que acertarle a dos
 * palabras.
 *
 * La PENDIENTE no es tocable entera y eso es a propósito: su acción es
 * "Recibir", que abre otra cosa. Dos destinos en la misma fila —uno al tocar el
 * botón y otro al tocar al lado— es el tipo de ambigüedad que se descubre
 * tocando mal.
 */
function FilaDelDia({ t, primera, onRecibir, onVer, money }) {
  const estado = estadoEnPalabras(t);
  const pendiente = !t?.recibida;

  // El separador va ARRIBA de cada fila menos la primera. Así la tarjeta no
  // termina en una línea colgando.
  const separador = primera ? "" : "border-t sunmi-divider";

  const contenido = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-base font-semibold sunmi-text-strong tabular-nums">
            {horaAR(fechaMostrada(t), { vacio: "—" })}
          </span>
          <span className="text-sm3 sunmi-text-muted">· {rotuloDeItems(t?.cantidadItems)}</span>
        </div>
        <div
          className={`text-sm2 ${
            estado.tono === "warning" ? "sunmi-text-warning" : "sunmi-text-muted"
          }`}
        >
          {estado.texto}
        </div>
      </div>

      {pendiente ? null : (
        <div className="shrink-0 text-right">
          <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">
            {money ? money(t?.importe) : t?.importe}
          </div>
          <div className="text-sm2 font-medium sunmi-text-accent">Ver ›</div>
        </div>
      )}
    </>
  );

  if (pendiente) {
    return (
      <div className={`px-4 py-3 flex items-center justify-between gap-3 ${separador}`}>
        {contenido}
        <SunmiButton
          type="button"
          color="primary"
          onClick={() => onRecibir?.(t)}
          className="shrink-0 px-3.5 py-2 rounded-lg text-sm3 font-semibold"
        >
          Recibir
        </SunmiButton>
      </div>
    );
  }

  // Recibida: la fila entera abre el detalle. Va como `ghost` —la variante sin
  // relleno del kit— con las clases que cancelan los ejes que el botón cede,
  // para que se vea como una fila y se comporte como un control.
  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={() => onVer?.(t)}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3 min-h-0 rounded-none text-left ${separador}`}
    >
      {contenido}
    </SunmiButton>
  );
}
