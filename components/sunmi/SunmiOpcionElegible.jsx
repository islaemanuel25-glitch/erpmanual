"use client";

// components/sunmi/SunmiOpcionElegible.jsx
//
// UNA OPCIÓN TOCABLE DE UNA PREGUNTA DE UNA SOLA RESPUESTA: CÍRCULO, TÍTULO Y
// SUBTÍTULO, ELEGIDA O NO.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `TarjetaDeLectura` en `components/proveedores/listas/HojaRevisarPrecio.jsx`,
// que hoy funciona: el mismo `SunmiButton` fantasma a todo el ancho, el mismo
// `text-left block rounded-xl p-3 min-h-toque`, y los mismos dos estados del
// kit —elegida: `sunmi-opcion-elegida`, fondo de acento suave y borde de
// acento de 2 px; no elegida: `border sunmi-border sunmi-card-surface`
// (`CLASE_OPCION` de `PiezasPantallas`)—. Lo que agrega es lo que pidió el
// diseño de Emanuel para la pregunta "¿por caja o por unidad?" del alta desde
// una lista (2026-11-06): el círculo de selección a la izquierda, vacío o lleno
// de acento, y el subtítulo gris abajo del título.
//
// ── QUÉ LA DISTINGUE DE LAS OTRAS ─────────────────────────────────────────
//
//   · `SunmiSelectorDeOpciones` reparte el ancho entre opciones cortas, una
//     siempre elegida. Ésta va una abajo de la otra, cada una a todo el ancho,
//     con dos renglones, y puede no haber ninguna elegida.
//   · `SunmiSelectorUnidad` pone el rótulo y los botones en un mismo renglón:
//     en un teléfono de 360 "Por la caja de 10" se partía en cinco líneas.
//
// ── LO QUE NO HACE ────────────────────────────────────────────────────────
//
// No envía formularios (`type="button"`): va adentro del alta de producto. No
// recibe `className`: la única pantalla que la usa no le pasa uno, y una pieza
// del kit que recibe clases tiene que negociarlas (CLAUDE.md, "Cómo negocia una
// pieza") — sin consumidor no hay contra qué probarlo.

import SunmiButton from "@/components/sunmi/SunmiButton";

/** Los dos estados, del kit. Ver el encabezado. */
export const CLASE_OPCION_NO_ELEGIDA = "border sunmi-border sunmi-card-surface";
export const CLASE_OPCION_ELEGIDA = "sunmi-opcion-elegida";
/** El círculo: vacío con el borde del tema, lleno con el acento. */
export const CLASE_CIRCULO_VACIO = "sunmi-border";
export const CLASE_CIRCULO_LLENO = "sunmi-bg-accent";

/**
 * @param {object} props
 * @param {string} props.titulo      en semibold; se parte por palabras si no entra, nunca se corta
 * @param {string} [props.subtitulo] en gris chico, en un solo renglón
 * @param {boolean} props.elegida
 * @param {() => void} props.onElegir
 * @param {boolean} [props.disabled]
 */
export default function SunmiOpcionElegible({ titulo, subtitulo = null, elegida = false, onElegir, disabled = false }) {
  return (
    <SunmiButton
      type="button"
      color="ghost"
      role="radio"
      aria-checked={elegida}
      onClick={onElegir}
      disabled={disabled}
      className={`w-full text-left block rounded-xl p-3 min-h-toque ${elegida ? CLASE_OPCION_ELEGIDA : CLASE_OPCION_NO_ELEGIDA}`}
    >
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`shrink-0 size-5 rounded-full ${elegida ? CLASE_CIRCULO_LLENO : CLASE_CIRCULO_VACIO}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm3 font-semibold sunmi-text-strong break-words">{titulo}</span>
          {subtitulo && (
            <span className="block text-xs2 sunmi-text-muted tabular-nums whitespace-nowrap">{subtitulo}</span>
          )}
        </span>
      </span>
    </SunmiButton>
  );
}
