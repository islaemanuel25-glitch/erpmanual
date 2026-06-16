"use client";

import { useEffect } from "react";

// Handlers compartidos para inputs numéricos de los modales de stock (Ajuste /
// Límites): seleccionar al focus, bloquear el scroll del body mientras se edita
// y limpiarlo al cerrar. Extraído sin cambios de ModalAjuste/ModalLimites.
export function useNumberInputHandlers(open) {
  const handleWheel = (e) => {
    e.target.focus();
    e.stopPropagation();
  };
  const handleFocus = (e) => {
    e.target.select();
    document.body.style.overflow = "hidden";
  };
  const handleBlur = () => {
    document.body.style.overflow = "";
  };

  // Limpiar overflow al cerrar
  useEffect(() => {
    if (!open) document.body.style.overflow = "";
  }, [open]);

  return { handleWheel, handleFocus, handleBlur };
}
