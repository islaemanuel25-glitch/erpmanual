"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { LayoutSettingsProvider } from "@/app/context/LayoutSettingsContext";
import { OperadorProvider } from "@/app/context/OperadorContext";
import { AccionDePaginaProvider } from "@/app/context/AccionDePaginaContext";
import LayoutBase from "@/components/LayoutBase";

export default function ModulosLayout({ children }) {
  const router = useRouter();
  const { perfil, cargando } = useUser();
  // Barrera global de contexto activo (Etapa 1): reutiliza el hook existente.
  const { loading: cargandoContexto, needsContexto } = useContextoActivo();

  useEffect(() => {
    // 1) Esperar perfil + contexto antes de decidir.
    if (cargando || cargandoContexto) return;

    if (!perfil) {
      router.replace("/login");
      return;
    }

    // 2) Barrera de contexto: sin contexto activo válido → /inicio.
    //    /inicio está fuera de /modulos, así que no reentra a este layout (evita loops).
    if (needsContexto) {
      router.replace("/inicio");
      return;
    }
    // 3) La barrera de operario vive ahora en OperadorProvider: decide entre
    //    redirect (ingreso inicial) y modal de PIN (caída a mitad de sesión).
  }, [cargando, cargandoContexto, perfil, needsContexto, router]);

  if (cargando || cargandoContexto) return null;
  if (!perfil) return null;
  if (needsContexto) return null;

  return (
    <LayoutSettingsProvider>
      <OperadorProvider>
        {/* El proveedor envuelve al shell Y a las pantallas: el shell lee la
            acción registrada y la pantalla activa la registra. Si envolviera
            solo a una de las dos partes, no habría slot. */}
        <AccionDePaginaProvider>
          <LayoutBase>{children}</LayoutBase>
        </AccionDePaginaProvider>
      </OperadorProvider>
    </LayoutSettingsProvider>
  );
}
