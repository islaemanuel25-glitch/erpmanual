"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
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

  // 🟦 Ahora SI usamos el LayoutBase Sunmi V2 completo
  return <LayoutBase>{children}</LayoutBase>;
}
