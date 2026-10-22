"use client";

// lib/layout/useEsEscritorio.js
//
// ¿LA VENTANA ES DE COMPUTADORA? Desde 1024 px, el `lg` de Tailwind.
//
// Salió del reparto de `app/modulos/pedidos/page.jsx` (e0d17ef) el 2026-10-22,
// cuando el historial de pedidos necesitó el mismo reparto: una página que
// monta UNA versión según el ancho real, no las dos escondiendo una por CSS.
//
// Devuelve `null` mientras no se sabe —en el servidor y en el primer render—:
// la página no monta ninguna versión hasta saberlo, así nunca aparece la
// equivocada para después cambiarla. Después, `true` o `false`, y cambia si
// la ventana cruza el corte.

import { useEffect, useState } from "react";

export const CORTE_ESCRITORIO = "(min-width: 1024px)"; // `lg` de Tailwind

export function useEsEscritorio() {
  const [esEscritorio, setEsEscritorio] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia(CORTE_ESCRITORIO);
    const alCambiar = () => setEsEscritorio(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  return esEscritorio;
}
