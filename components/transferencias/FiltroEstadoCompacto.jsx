"use client";

// components/transferencias/FiltroEstadoCompacto.jsx
//
// LOS CUATRO FILTROS DE LA RECEPCIÓN, EN FILA, PARA LA COMPUTADORA.
//
// Es una VARIANTE PROPIA de `SunmiFiltroEstado` (`components/sunmi/`), no una
// pieza nueva del kit ni un cambio a la del kit. La del kit la usa el teléfono
// y no se toca —ni con una prop de tamaño con valor por defecto—, así que
// la computadora tiene su copia: los mismos botones, el mismo `aria-pressed`,
// la misma elegida en `primary` y el mismo conteo adentro, pero en un
// segmentado de una fila de ~33 px (Figma EVJ2KvVCrY0oVSowfboymQ, 384:514) en
// vez de la grilla 2×2.
//
// Paddings de la escala de 3,5: `px-3` da 10,5 donde el diseño pide 14, `p-1`
// da 3,5 donde pide 3.

import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * @param {object} props
 * @param {Array<{clave:string, texto:string, cantidad?:number}>} props.opciones
 * @param {string|null} props.valor
 * @param {(clave:string) => void} props.onCambiar
 * @param {string} [props.ariaLabel]
 */
export default function FiltroEstadoCompacto({ opciones = [], valor = null, onCambiar, ariaLabel = undefined }) {
  if (!Array.isArray(opciones) || opciones.length === 0) return null;
  const elegida = valor == null ? null : String(valor);
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex shrink-0 gap-0.5 rounded-control sunmi-surface-soft p-1">
      {opciones.map((o) => {
        const clave = String(o.clave);
        const activa = clave === elegida;
        return (
          <SunmiButton
            key={clave}
            type="button"
            color={activa ? "primary" : "ghost"}
            aria-pressed={activa}
            onClick={() => onCambiar?.(o.clave)}
            // `gap-1` separa el rótulo del número: el botón del kit es
            // `inline-flex` y un espacio suelto no genera caja. Ver el mismo
            // caso anotado en `SunmiFiltroEstado`.
            className="justify-center gap-1 min-h-0 py-1.5 px-3 rounded-md text-sm3 whitespace-nowrap"
          >
            {o.texto}
            {o.cantidad != null && <span className="sunmi-text-muted">{o.cantidad}</span>}
          </SunmiButton>
        );
      })}
    </div>
  );
}
