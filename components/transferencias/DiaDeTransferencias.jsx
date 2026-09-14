"use client";

// components/transferencias/DiaDeTransferencias.jsx
//
// UN DÍA DE TRABAJO: la banda con su total y las transferencias de ese día,
// TODO ADENTRO DEL MISMO MARCO.
//
// ── POR QUÉ EL DÍA ES EL ENCABEZADO ───────────────────────────────────────
//
// La lista decía "#200", "#204". Ese número solo no dice qué día salió, ni qué
// traía, ni si hubo diferencia. El día sí, y es como se piensa el trabajo — "lo
// del sábado".
//
// ── UN SOLO CONTENEDOR, Y ESO CAMBIÓ EN LA V41 ───────────────────────────
//
// Antes la banda y las filas eran dos bloques separados con aire en el medio, y
// no se leía que iban juntos: parecía un encabezado suelto arriba de una tarjeta
// cualquiera. Ahora hay UN marco con `overflow-hidden`, la banda adentro y las
// filas debajo, separadas por una línea de 1 px.
//
// El `overflow-hidden` no es adorno: sin él la banda —que se pinta de lado a
// lado— se come las esquinas redondeadas del marco.
//
// ── LA BANDA SE PINTA PAREJA DE LADO A LADO ──────────────────────────────
//
// Es el defecto que hay que no repetir. El fondo va en UN solo nodo —el de la
// banda— y ninguno de sus hijos declara fondo propio. Un contenedor interno con
// su propio `bg` tapa la franja y deja un rectángulo del color de la tarjeta en
// el medio, que se lee como un bloque en blanco.
//
// Y el marco va en `sunmi-bg-card` y no en `sunmi-surface`: aquélla pinta
// `--app-bg`, el fondo de la APLICACIÓN, así que la tarjeta salía del color de
// la página. Medido en los catorce temas.
//
// ── EL NÚMERO VUELVE A LA FILA, SIN ALMOHADILLA ──────────────────────────
//
// "211", no "#211". El símbolo no aporta nada: el número ya se lee como número
// por su contexto, y la almohadilla es ruido en un renglón que además lleva la
// hora y los ítems. Sirve para nombrarla por teléfono, y para eso alcanza con
// que esté.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { rotuloDelDia } from "@/lib/transferencias/diasDeTransferencias";
import {
  estadoEnPalabras,
  fechaMostrada,
  rotuloDeItems,
} from "@/lib/transferencias/rotulosDeTransferencia";
import { horaAR } from "@/lib/fechas/formatearFechaHora";

export default function DiaDeTransferencias({ dia, onRecibir, onVer, money }) {
  return (
    <div className="sunmi-bg-card rounded-xl2 border sunmi-border overflow-hidden">
      {/* LA BANDA. Único nodo con fondo; sus hijos no declaran ninguno. */}
      <div className="sunmi-surface-soft px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base2 font-semibold sunmi-text-strong truncate">{dia?.titulo}</div>
          <div className="text-sm2 sunmi-text-muted">{rotuloDelDia(dia)}</div>
        </div>
        <div className="shrink-0 text-base2 font-semibold sunmi-text-strong tabular-nums">
          {money ? money(dia?.importe) : dia?.importe}
        </div>
      </div>

      {(dia?.transferencias || []).map((t) => (
        <FilaDelDia key={t.id} t={t} onRecibir={onRecibir} onVer={onVer} money={money} />
      ))}
    </div>
  );
}

/**
 * UNA TRANSFERENCIA DEL DÍA.
 *
 * ── LA RECIBIDA SE PUEDE ABRIR, Y ÉSE ERA EL DEFECTO DE LA V32 ───────────
 *
 * Antes el único control era "Recibir", que es para las pendientes: una
 * transferencia ya recibida no tenía forma de abrirse. Ahora la fila ENTERA es
 * tocable y lleva al detalle que ya existe.
 *
 * El "Ver ›" de la derecha no es el botón: es la señal de que se puede tocar. Si
 * fuera el único objetivo, en un teléfono habría que acertarle a dos palabras.
 *
 * La PENDIENTE no es tocable entera y eso es a propósito: su acción es
 * "Recibir", que abre otra cosa. Dos destinos en la misma fila —uno al tocar el
 * botón y otro al tocar al lado— es el tipo de ambigüedad que se descubre
 * tocando mal.
 *
 * ── EL IMPORTE VA EN LAS DOS, PENDIENTE Y RECIBIDA ───────────────────────
 *
 * Antes solo lo mostraba la recibida, y eso dejaba la pregunta más obvia sin
 * responder justo en la fila que importa: cuánto vale lo que todavía no conté.
 * Una transferencia despachada y sin contar se debe entera —es el contrato de
 * `importeRecibidoDeDetalle`— así que el número existe y se puede mostrar.
 */
function FilaDelDia({ t, onRecibir, onVer, money }) {
  const estado = estadoEnPalabras(t);
  const pendiente = !t?.recibida;

  const contenido = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {/* El número, sin almohadilla. `tabular-nums` para que dos filas
              seguidas no bailen de ancho. */}
          <span className="text-base font-semibold sunmi-text-strong tabular-nums">{t?.id}</span>
          <span className="text-sm3 sunmi-text-muted">
            · {horaAR(fechaMostrada(t), { vacio: "—" })}
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

      {/* LA COLUMNA DE LA DERECHA: el importe arriba y la acción abajo, las dos
          alineadas al borde. `items-end` y no `text-right`: el botón es un
          bloque y `text-right` no lo mueve. */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">
          {money ? money(t?.importe) : t?.importe}
        </div>
        {pendiente ? (
          <SunmiButton
            type="button"
            color="primary"
            onClick={() => onRecibir?.(t)}
            className="px-3.5 py-2 min-h-0 rounded-lg text-sm3 font-semibold"
          >
            Recibir
          </SunmiButton>
        ) : (
          <div className="text-sm2 font-medium sunmi-text-accent">Ver ›</div>
        )}
      </div>
    </>
  );

  // El separador va ARRIBA de cada fila. La banda queda encima de la primera,
  // así que la línea también la separa de ella y la tarjeta no termina en una
  // línea colgando.
  const separador = "border-t sunmi-divider";

  if (pendiente) {
    return (
      <div className={`px-4 py-3.5 flex items-center justify-between gap-3 ${separador}`}>
        {contenido}
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
      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 min-h-0 rounded-none text-left ${separador}`}
    >
      {contenido}
    </SunmiButton>
  );
}
