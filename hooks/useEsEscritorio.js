"use client";

// ¿Estamos en una pantalla de escritorio?
//
// POR QUÉ NO SE MIRA EL USER-AGENT
//
// Auditamos el proyecto antes de escribir esto: no existía ninguna utilidad de
// breakpoints. Los dos lugares que leen `window.innerWidth` —TopbarNav y
// SunmiDateRangePicker— lo hacen para posicionar un panel flotante, no para
// decidir comportamiento, y el resto del ERP resuelve lo responsive con las
// clases de Tailwind. Así que hacía falta crear la utilidad, y se hizo con
// `matchMedia` sobre el mismo breakpoint que usa el CSS.
//
// El user-agent miente: una tablet Android con teclado, un Windows táctil o un
// escritorio con la ventana a media pantalla se clasifican mal. Lo que de verdad
// importa para decidir "¿abro una pestaña nueva o navego en la misma?" es si hay
// lugar para dos ventanas y si el usuario puede manejarlas, y eso lo aproxima el
// ancho mucho mejor que el nombre del navegador.
//
// Devuelve `null` en el primer render (servidor y antes de montar) para que
// nadie tome una decisión con un valor inventado. Quien la use debe esperar.

// Se usa `useSyncExternalStore` y no un efecto con `setState`: el ancho de la
// ventana es estado EXTERNO a React, y esta es la herramienta hecha para eso.
// Con un efecto habría un render intermedio con el valor viejo y el lint lo
// marcaría, con razón.
import { useCallback, useSyncExternalStore } from "react";

/** Coincide con el breakpoint `lg` de Tailwind, el que usa el resto del ERP. */
export const CONSULTA_ESCRITORIO = "(min-width: 1024px)";

const soportado = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

export default function useEsEscritorio(consulta = CONSULTA_ESCRITORIO) {
  const suscribir = useCallback(
    (avisar) => {
      if (!soportado()) return () => {};
      const mq = window.matchMedia(consulta);
      // `addEventListener` en MediaQueryList existe desde hace años; el fallback
      // a `addListener` cubre webviews viejas de los Sunmi.
      if (mq.addEventListener) {
        mq.addEventListener("change", avisar);
        return () => mq.removeEventListener("change", avisar);
      }
      mq.addListener(avisar);
      return () => mq.removeListener(avisar);
    },
    [consulta]
  );

  const leer = useCallback(() => (soportado() ? window.matchMedia(consulta).matches : false), [consulta]);

  // En el servidor no hay ancho: `null` para que nadie decida con un valor
  // inventado. Quien la use debe esperar.
  return useSyncExternalStore(suscribir, leer, () => null);
}

/**
 * Nombre de ventana por turno.
 *
 * `window.open` con un nombre REUTILIZA la pestaña que ya tenga ese nombre en
 * vez de abrir otra. Así, tocar "Retirar" tres veces no deja tres pestañas
 * contando la misma caja —que es la forma más fácil de registrar dos retiros
 * sobre el mismo conteo—. No es una garantía absoluta: otra ventana del mismo
 * navegador abierta a mano queda fuera de este mecanismo.
 */
export function nombreVentanaRetiro(turnoId) {
  return `erpazul-retiro-turno-${Number(turnoId) || 0}`;
}

/**
 * Nombre de ventana del CIERRE. Distinto del retiro a propósito: son dos
 * pantallas que pueden convivir sobre el mismo turno —se puede retirar
 * recaudación a media tarde y cerrar a la noche— y compartir nombre haría que
 * abrir una pisara la otra.
 */
export function nombreVentanaCierre(turnoId) {
  return `erpazul-cierre-turno-${Number(turnoId) || 0}`;
}
