"use client";

// EL VOLVER DEL KIT.
//
// ── QUÉ CAMBIÓ Y POR QUÉ LAS 32 PANTALLAS QUE YA LO USAN NO SE MUEVEN ───────
//
// Tenía dos límites que el módulo de listas encontró usándolo:
//
//   1. **Decía "Volver" y nada más.** No hay forma de nombrar el destino, y en
//      un módulo de seis pantallas encadenadas —listado, subir, resultado, se
//      actualizan, revisar, no cambian— "Volver" no dice a cuál de las cinco
//      anteriores lleva. Ahora acepta `texto`, y el default sigue siendo
//      "Volver": las 32 que no lo pasan dicen exactamente lo de antes.
//
//   2. **Medía 36 px y no había forma de subirlo.** Escribía `sunmi-btn-base` a
//      mano y CONCATENABA el `className`, así que un `min-h-toque` de la
//      pantalla quedaba empatado en especificidad con el `min-height: 36px` de
//      la base y ganaba el que la hoja de estilos quisiera. Es el defecto que
//      `baseDeBoton` vino a terminar, y esta pieza era uno de los catorce
//      lugares que todavía escribían la base a mano.
//
// Se resuelve REUSANDO `SunmiButton` en vez de emitir el `<button>` acá: esa
// pieza ya negocia por eje. Con `className` vacío —que es como la llaman las 32—
// `baseDeBoton("")` emite el núcleo más las nueve sub-clases, que es byte a byte
// lo mismo que `sunmi-btn-base`; está medido y anotado en `styles/sunmi.css`.
// Lo que cambia es solo el caso que antes no se podía pedir.
//
// ── DÓNDE VA, QUE ES LA MITAD DEL ASUNTO ───────────────────────────────────
//
// En el SLOT DEL SHELL, con `useAccionDePagina`, que es como lo usan las 32.
// Esa fila vive AFUERA de `<main>`, y `<main>` es el que scrollea: por eso un
// volver registrado ahí no se puede tapar ni se puede ir de pantalla.
//
// Dibujarlo adentro del contenido —como lo hacía el módulo de listas— lo deja
// scrolleando con el resto, y en el resultado, que es largo, desaparecía apenas
// se bajaba. No es un problema de z-index ni de sticky: es de en qué caja está.

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import SunmiButton from "./SunmiButton";

/**
 * @param href     a dónde vuelve. Sin `href` ni `onVolver`, usa el historial.
 * @param onVolver alternativa a `href` para quien ya tiene su propio router o
 *                 necesita hacer algo antes de irse.
 * @param texto    qué dice. El default es "Volver", que es lo que decía siempre.
 */
export default function SunmiBackButton({ href, onVolver, texto = "Volver", className = "" }) {
  const router = useRouter();

  const volver = () => {
    if (onVolver) return onVolver();
    return href ? router.push(href) : router.back();
  };

  return (
    <SunmiButton
      color="slate"
      type="button"
      onClick={volver}
      // Con el texto por defecto el nombre accesible ya es "Volver" y una
      // etiqueta diría "Volver a Volver". Con un destino, en cambio, el texto
      // solo dice a dónde va y no que sea una vuelta.
      aria-label={texto === "Volver" ? undefined : `Volver a ${texto}`}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {texto}
    </SunmiButton>
  );
}
