"use client";

// components/transferencias/AccionDePantalla.jsx
//
// LA ACCIÓN DE LA PANTALLA CUANDO EL SHELL NO LA PUEDE LLEVAR.
//
// ── PRIMERO: POR QUÉ CASI NUNCA SE USA ESTO ───────────────────────────────
//
// El shell ya tiene el slot. `LayoutBase` dibuja una fila con el título de la
// pantalla y, si la pantalla registró una acción con `useAccionDePagina`, la
// pone a la derecha de ese mismo título. O sea que en un teléfono el botón
// "Reporte" viaja gratis, en el renglón que ya existe, sin que la pantalla gaste
// uno propio ni repita el título — que es exactamente lo que se pedía.
//
// Escribir acá una barra propia con el título al lado del botón habría sido la
// excepción que ese mecanismo vino a evitar.
//
// ── Y ENTONCES POR QUÉ ESTE ARCHIVO EXISTE ───────────────────────────────
//
// Porque esa fila del shell es `md:hidden`: desde 768 px para arriba no se
// dibuja. Y las pantallas de esta tanda no terminan en 768 —la lista de trabajo
// llega hasta 1024, y la de corte de semana no tiene tope—, así que en esa
// franja el botón registrado no estaría en ninguna parte y la pantalla quedaría
// sin salida.
//
// Esta fila es ESE repuesto y nada más: aparece justo donde la del shell se
// apaga. Las dos dibujan el MISMO nodo —el que devuelve `useAccionDePagina`—,
// así que no pueden decir cosas distintas; lo único que las separa es el ancho.

export default function AccionDePantalla({ children }) {
  return <div className="hidden md:flex items-center justify-end">{children}</div>;
}

/**
 * La forma del botón de acción, con la que piden los tres frames: padding 12/7
 * ajustado a la escala del proyecto, radio 8 → 7 y letra 13 Medium.
 *
 * Vive acá porque lo usan las dos pantallas y las dos filas —la del shell y el
 * repuesto—, y un botón de acción que en una mida distinto que en la de al lado
 * es la deriva que el kit existe para impedir. Son los ejes que `SunmiButton`
 * cede cuando la pantalla los declara.
 */
export const CLASE_ACCION_DE_PANTALLA = "px-3.5 py-2 rounded-lg text-sm3 font-medium shrink-0";
