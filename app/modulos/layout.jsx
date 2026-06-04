"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useOperadorActivo } from "@/hooks/useOperadorActivo";
import { LayoutSettingsProvider } from "@/app/context/LayoutSettingsContext";
import LayoutBase from "@/components/LayoutBase";

export default function ModulosLayout({ children }) {
  const router = useRouter();
  const { perfil, cargando } = useUser();
  // Barrera global de contexto activo (Etapa 1): reutiliza el hook existente.
  const { loading: cargandoContexto, needsContexto } = useContextoActivo();
  const { operador, loading: cargandoOp } = useOperadorActivo();

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esExentoDeOperador =
    permisos.includes("*") || permisos.includes("modulos.acceso_sin_operador");

  useEffect(() => {
    // 1) Esperar perfil + contexto antes de decidir.
    if (cargando || cargandoContexto) return;

    if (!perfil) {
      router.replace("/login");
      return;
    }

    // 2) Barrera de contexto: sin contexto activo válido → /inicio (antes que operador).
    //    /inicio está fuera de /modulos, así que no reentra a este layout (evita loops).
    if (needsContexto) {
      router.replace("/inicio");
      return;
    }

    // 3) Operador (como ya existía): requiere su propia carga.
    if (cargandoOp) return;
    if (!esExentoDeOperador && !operador) {
      router.replace("/bloqueo-operador");
    }
  }, [
    cargando,
    cargandoContexto,
    cargandoOp,
    perfil,
    needsContexto,
    esExentoDeOperador,
    operador,
    router,
  ]);

  if (cargando || cargandoContexto) return null;
  if (!perfil) return null;
  if (needsContexto) return null;
  if (cargandoOp) return null;
  if (!esExentoDeOperador && !operador) return null;

  return (
    <LayoutSettingsProvider>
      <LayoutBase>{children}</LayoutBase>
    </LayoutSettingsProvider>
  );
}
