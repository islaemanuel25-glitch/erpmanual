"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { LayoutSettingsProvider } from "@/app/context/LayoutSettingsContext";
import LayoutBase from "@/components/LayoutBase";

export default function ModulosLayout({ children }) {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  // 🔐 Redirección a login
  useEffect(() => {
    if (!cargando && !perfil) {
      router.replace("/login");
    }
  }, [cargando, perfil, router]);

  if (cargando) return null;
  if (!perfil) return null;

  return (
    <LayoutSettingsProvider>
      <LayoutBase>{children}</LayoutBase>
    </LayoutSettingsProvider>
  );
}
