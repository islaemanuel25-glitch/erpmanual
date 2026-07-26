"use client";

import { useEffect } from "react";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

// Carga la apariencia institucional del local activo y la entrega al
// SunmiThemeProvider. Se monta DENTRO de UserProvider (para leer el perfil) y
// bajo SunmiThemeProvider (para aplicar el tema). No hace requests en /login ni
// sin contexto de local; re-fetch al cambiar el local; fallback silencioso.
export default function AparienciaInstitucionalSync() {
  const { perfil, cargando } = useUser();
  const { setInstitucional } = useSunmiTheme();

  const logueado = !!perfil;
  const localId = perfil?.localId ?? null;

  useEffect(() => {
    if (cargando) return;
    // Sin sesión (login) → no pedir institucional; limpiar cualquier residuo.
    if (!logueado) {
      setInstitucional(null);
      return;
    }

    let cancelado = false;
    fetch("/api/config/apariencia-local", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelado) return;
        // apariencia = { tema?: string, ... } | null. Fallback: sin institucional.
        setInstitucional(d?.ok ? d.apariencia?.tema ?? null : null);
      })
      .catch(() => {
        // Endpoint caído o sin contexto: se mantiene personal/default.
        if (!cancelado) setInstitucional(null);
      });

    return () => {
      cancelado = true;
    };
    // setInstitucional es estable (useCallback). Re-fetch al cambiar de local/sesión.
  }, [logueado, localId, cargando, setInstitucional]);

  return null;
}
