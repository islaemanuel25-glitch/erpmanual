"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useOperadorActivo } from "@/hooks/useOperadorActivo";
import { LayoutSettingsProvider } from "@/app/context/LayoutSettingsContext";
import LayoutBase from "@/components/LayoutBase";

export default function ModulosLayout({ children }) {
  const router = useRouter();
  const { perfil, cargando } = useUser();
  const { operador, loading: cargandoOp } = useOperadorActivo();

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esExentoDeOperador =
    permisos.includes("*") || permisos.includes("modulos.acceso_sin_operador");

  useEffect(() => {
    if (cargando || cargandoOp) return;

    if (!perfil) {
      router.replace("/login");
      return;
    }

    if (!esExentoDeOperador && !operador) {
      router.replace("/bloqueo-operador");
    }
  }, [cargando, cargandoOp, perfil, esExentoDeOperador, operador, router]);

  if (cargando || cargandoOp) return null;
  if (!perfil) return null;
  if (!esExentoDeOperador && !operador) return null;

  return (
    <LayoutSettingsProvider>
      <LayoutBase>{children}</LayoutBase>
    </LayoutSettingsProvider>
  );
}
