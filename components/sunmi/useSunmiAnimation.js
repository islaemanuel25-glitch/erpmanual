"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

/**
 * Hook centralizado de animaciones Sunmi
 * ----------------------------------------------------
 * Controla:
 * - Hover
 * - Focus
 * - Fade-in
 * - Slide-in
 * - Modales
 * - Filas de tabla
 *
 * Todas las duraciones se ajustan según:
 * ui.animSpeed  -> ("fast" | "normal" | "slow")
 * ui.animSpeedMultipliers -> factores globales
 *
 * NO modifica ningún componente Sunmi.
 * Los componentes SOLO leen desde este hook.
 */
export function useSunmiAnimation() {
  const { ui } = useUIConfig();

  const anim = ui.animations;
  const speedMultiplier =
    ui.animSpeedMultipliers?.[ui.animSpeed] ?? 1;

  return {
    // =============================
    // HOVER
    // =============================
    hover: {
      scale: anim.hoverScale,
      duration: anim.hoverDuration * speedMultiplier,
      easing: anim.easing,
    },

    // =============================
    // FOCUS
    // =============================
    focus: {
      scale: anim.focusScale,
      duration: anim.focusDuration * speedMultiplier,
      easing: anim.easing,
    },

    // =============================
    // FADE-IN
    // =============================
    fade: {
      from: anim.fadeFrom,
      duration: anim.fadeDuration * speedMultiplier,
    },

    // =============================
    // SLIDE-IN (Y)
    // =============================
    slide: {
      offsetY: anim.slideOffsetY,
      duration: anim.slideDuration * speedMultiplier,
      easing: anim.easing,
    },

    // =============================
    // MODALES
    // =============================
    modal: {
      scale: anim.modalScale,
      backdropBlur: anim.modalBackdropBlur,
      duration: anim.modalDuration * speedMultiplier,
    },

    // =============================
    // TABLAS
    // =============================
    table: {
      fadeDuration: anim.tableFade * speedMultiplier,
      slideOffsetY: anim.tableSlideY,
    },

    // =============================
    // Metadata
    // =============================
    speedMultiplier,
  };
}
