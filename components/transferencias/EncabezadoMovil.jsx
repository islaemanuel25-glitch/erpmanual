"use client";

// components/transferencias/EncabezadoMovil.jsx
//
// LA BARRA DE ARRIBA de las tres pantallas del rediseño: título a la izquierda,
// una acción a la derecha.
//
// ── POR QUÉ NO ES `SunmiHeader` ───────────────────────────────────────────
//
// Aquél es la CINTA: degradado, borde, mayúsculas, negrita y tracking. Es un
// rótulo de sección y se ve como tal. Acá la especificación pide una barra de
// pantalla —fondo plano, título en 18 Semi Bold tal como se escribe, y un botón
// a la derecha—, que es otra cosa. Usar aquél y taparle el degradado, las
// mayúsculas y la negrita sería quedarse con el nombre y ninguna de sus
// decisiones.
//
// ── EL ALTO ───────────────────────────────────────────────────────────────
//
// La especificación pide 52 px y la barra mide 49 (`h-14`). Es el escalón de la
// escala del proyecto —1rem = 14 px— que le queda más cerca; el de arriba es
// 56. Tres píxeles en una barra que no lleva nada más que una línea de texto.
//
// ── LO QUE NO SABE ────────────────────────────────────────────────────────
//
// Qué hace la acción. Recibe el nodo ya armado, así que una pantalla puede
// poner un botón, otra un enlace de volver, y ninguna tiene que pedirle permiso
// a esta pieza.

export default function EncabezadoMovil({ titulo, accion = null }) {
  return (
    <div className="sunmi-surface h-14 flex items-center justify-between gap-3">
      <h1 className="text-lg font-semibold sunmi-text-strong truncate">{titulo}</h1>
      {accion}
    </div>
  );
}

/**
 * El botón de la derecha del encabezado, con la forma que piden los tres
 * frames: padding 12/7 ajustado a la escala, radio 8 → 7, letra 13 Medium y
 * fondo neutro.
 *
 * Está acá y no suelto en cada pantalla porque son tres, y un botón de barra
 * que en una pantalla mide distinto que en la de al lado es exactamente el tipo
 * de deriva que el kit existe para impedir. Se arma sobre `SunmiButton`, que es
 * el que negocia padding, radio y letra con la clase de la pantalla.
 */
export const CLASE_ACCION_ENCABEZADO = "px-3.5 py-2 rounded-lg text-sm3 font-medium shrink-0";
