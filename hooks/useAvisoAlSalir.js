"use client";

// hooks/useAvisoAlSalir.js
//
// AVISAR ANTES DE SALIR DE UNA PANTALLA CON ALGO SIN GUARDAR.
//
// Salió tal cual de `components/reportes-ventas/EditorVentaCorreccion.jsx`, que
// es donde funcionaba: el aviso nativo al recargar o cerrar (`beforeunload`, que
// los navegadores no dejan personalizar) y el botón atrás con un centinela en el
// historial —App Router no ofrece bloqueador—: al entrar en "hay cambios" se
// inserta UNA entrada; el primer "atrás" la consume y, en vez de salir, se avisa
// y se repone el centinela.
//
// Lo que se agregó, para el Control de stock: `interceptarEnlaces`. El menú del
// shell y los demás enlaces son `<a href>` (Next `Link`), y Link no navega si el
// click llega con `defaultPrevented`. Un oyente en captura, sobre el documento,
// llega antes que React y frena el click mientras haya algo sin aceptar.
//
// La pantalla decide qué mostrar (`onIntento`) y, si la persona elige salir,
// llama a `salir()`: deja pasar y sigue hacia donde iba —el enlace tocado, o
// atrás—. `permitirSalida()` solo deja pasar, para quien navega por su cuenta.

import { useCallback, useEffect, useRef } from "react";

export function useAvisoAlSalir({ activo, onIntento, interceptarEnlaces = false }) {
  const permitida = useRef(false); // salida ya autorizada (no re-preguntar)
  const centinela = useRef(false); // centinela de history ya insertado (botón atrás)
  const destino = useRef(null);
  const intento = useRef(onIntento);
  intento.current = onIntento;

  // beforeunload: advertencia nativa SOLO mientras hay cambios (recarga/cerrar
  // pestaña o navegador). El mensaje no se personaliza (los navegadores modernos
  // lo ignoran).
  useEffect(() => {
    if (!activo) return undefined;
    const onBeforeUnload = (e) => {
      if (permitida.current) return undefined;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activo]);

  // Botón atrás: centinela de history + popstate.
  useEffect(() => {
    if (!activo || typeof window === "undefined") return undefined;
    if (!centinela.current) {
      window.history.pushState({ avisoAlSalir: true }, "");
      centinela.current = true;
    }
    const onPop = () => {
      if (permitida.current) return; // salida ya autorizada → no interferir
      window.history.pushState({ avisoAlSalir: true }, ""); // reponer centinela
      destino.current = { atras: true };
      intento.current?.({ atras: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activo]);

  // Los enlaces de la app: el menú del shell, otro módulo.
  useEffect(() => {
    if (!activo || !interceptarEnlaces || typeof document === "undefined") return undefined;
    const onClick = (e) => {
      if (permitida.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      destino.current = { href: url.href };
      intento.current?.({ href: url.href });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [activo, interceptarEnlaces]);

  const permitirSalida = useCallback(() => {
    permitida.current = true;
  }, []);

  const salir = useCallback(() => {
    permitida.current = true;
    const d = destino.current;
    destino.current = null;
    if (d?.href) window.location.assign(d.href);
    // El primer atrás consumió el centinela y se repuso: hay que saltar los dos.
    else if (d?.atras) window.history.go(-2);
  }, []);

  return { permitirSalida, salir };
}
