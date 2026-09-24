"use client";

// components/periodo/FilaConImporte.jsx
//
// UNA FILA ADENTRO DE UN DÍA: lo que es a la izquierda, y a la derecha el
// importe arriba y la acción abajo.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De la fila privada de `components/transferencias/DiaDeTransferencias.jsx`,
// tal cual estaba: el mismo alto, el mismo padding, el separador arriba y la
// misma columna derecha. Se sacó cuando Pagos a proveedores necesitó la misma
// fila para sus cuentas. Lo que se quedó allá es qué dice cada lado.
//
// ── LAS DOS FORMAS, Y POR QUÉ NO SE MEZCLAN ──────────────────────────────
//
// Con `onAbrir`, la fila ENTERA es el botón y el "Ver ›" de la derecha es la
// señal de que se puede tocar, no el objetivo: en un teléfono, acertarle a dos
// palabras es difícil.
//
// Con `accion` y sin `onAbrir`, la fila no se toca y el control es el que vino
// —en transferencias, "Recibir"—. Dos destinos en la misma fila, uno al tocar el
// botón y otro al tocar al lado, es la ambigüedad que se descubre tocando mal.
//
// ── EL SEPARADOR VA ARRIBA DE CADA FILA ──────────────────────────────────
//
// La banda del día queda encima de la primera, así que la línea también la
// separa de ella y la tarjeta no termina en una línea colgando.

import SunmiButton from "@/components/sunmi/SunmiButton";

const SEPARADOR = "border-t sunmi-divider";

/**
 * @param {object} props
 * @param {React.ReactNode} props.children  lo de la izquierda.
 * @param {React.ReactNode} props.importe   YA FORMATEADO.
 * @param {() => void} [props.onAbrir]      la fila entera abre; a la derecha va "Ver ›".
 * @param {React.ReactNode} [props.accion]  el control de la derecha cuando la fila no abre.
 * @param {string} [props.etiqueta]         el `aria-label` de la fila tocable.
 */
export default function FilaConImporte({ children, importe, onAbrir, accion = null, etiqueta }) {
  const contenido = (
    <>
      <div className="min-w-0 flex-1 text-left">{children}</div>

      {/* LA COLUMNA DE LA DERECHA: el importe arriba y la acción abajo, las dos
          alineadas al borde. `items-end` y no `text-right`: el botón es un
          bloque y `text-right` no lo mueve. */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">{importe}</div>
        {onAbrir ? <div className="text-sm2 font-medium sunmi-text-accent">Ver ›</div> : accion}
      </div>
    </>
  );

  if (!onAbrir) {
    return <div className={`px-4 py-3.5 flex items-center justify-between gap-3 ${SEPARADOR}`}>{contenido}</div>;
  }

  // Tocable: va como `ghost` —la variante sin relleno del kit— con las clases
  // que cancelan los ejes que el botón cede, para que se vea como una fila y se
  // comporte como un control.
  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={onAbrir}
      aria-label={etiqueta}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 min-h-0 rounded-none text-left ${SEPARADOR}`}
    >
      {contenido}
    </SunmiButton>
  );
}
