// Envoltorio de las TARJETAS DE PREVISUALIZACIÓN — no es parte del kit.
//
// ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────
//
// Los componentes Sunmi no sacan el tema de un provider de React: lo sacan del
// atributo `data-theme` del `<html>`, que en la aplicación lo deja el servidor
// (o el script de pre-hidratación) antes de que React monte.
//
// `SunmiThemeProvider` administra la PREFERENCIA, y en su primer sincronizado se
// abstiene de escribir el atributo a propósito —para no pisar lo que dejó el
// SSR—. En una tarjeta suelta no hay SSR ni script, así que sin esto el `<html>`
// queda sin `data-theme` y todo se dibuja con el tema por defecto sobre el fondo
// blanco del andamio: la misma combinación que hoy vuelve ilegible el botón
// seleccionado de auditoría.
//
// Así que las tarjetas fijan el atributo ellas mismas, que es lo que reproduce
// lo que se ve en un local de verdad.

import { useLayoutEffect } from "react";

/** El tema con el que se dibujan las tarjetas. Es el del depósito en producción. */
export const TEMA_PREVIEW = "violetaSaas";

export function SunmiPreviewTheme({ children, tema = TEMA_PREVIEW }) {
  // useLayoutEffect y no useEffect: el atributo tiene que estar puesto antes de
  // que el navegador pinte, o la captura toma el primer cuadro sin tema.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previo = html.getAttribute("data-theme");
    html.setAttribute("data-theme", tema);
    // El fondo de la página acompaña al tema. El andamio pone blanco fijo, y un
    // tema oscuro sobre blanco se ve roto sin que el componente tenga la culpa.
    const fondoPrevio = document.body.style.background;
    document.body.style.background = "var(--app-bg)";
    return () => {
      if (previo === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", previo);
      document.body.style.background = fondoPrevio;
    };
  }, [tema]);

  return children ?? null;
}
