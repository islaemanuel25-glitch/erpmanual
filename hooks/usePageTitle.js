"use client";

// ============================================================
// hooks/usePageTitle.js
//
// Resuelve el título de la página activa a partir del menú
// visible y el pathname. Pensado para reemplazar a futuro las
// cadenas `pathname.includes(...)` duplicadas en
// `components/Header.jsx` y `components/LayoutBase.jsx`.
//
// Etapa 3:
//   El hook queda creado y disponible, pero NO se consume desde
//   la UI todavía. La migración de Header.jsx / LayoutBase.jsx
//   se hará en una etapa siguiente, donde se pueda validar caso
//   por caso que el título derivado del registry coincide con
//   el texto histórico (ej. "Auditoría POS Ventas" vs
//   "Auditoría POS").
//
// Uso futuro:
//   const titulo = usePageTitle({ fallback: "Panel" });
// ============================================================

import { useMenu } from "@/hooks/useMenu";

/**
 * @param {{ fallback?: string }} [options]
 * @returns {string}
 */
export function usePageTitle({ fallback = "Panel" } = {}) {
  const { currentTitle } = useMenu();
  return currentTitle || fallback;
}
