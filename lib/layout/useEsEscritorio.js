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
//
// `useDesdeMd` (2026-10-28) es lo mismo con el corte `md`, 768 px: lo pidió
// Emanuel para preparar un pedido del depósito, que pasa a la computadora
// desde ahí. Los dos son la misma función con otra consulta.

import { useEffect, useState } from "react";

export const CORTE_ESCRITORIO = "(min-width: 1024px)"; // `lg` de Tailwind
export const CORTE_MD = "(min-width: 768px)"; // `md` de Tailwind

function useCumpleConsulta(consulta) {
  const [cumple, setCumple] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = () => setCumple(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [consulta]);

  return cumple;
}

export function useEsEscritorio() {
  return useCumpleConsulta(CORTE_ESCRITORIO);
}

export function useDesdeMd() {
  return useCumpleConsulta(CORTE_MD);
}
