"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import LayoutBase from "@/components/LayoutBase";

export default function ModulosLayout({ children }) {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  // 🔐 Redirección si no está logueado
  useEffect(() => {
    if (!cargando && !perfil) {
      router.replace("/login");
    }
  }, [cargando, perfil, router]);

  if (cargando || !perfil) return null;

  return <LayoutBase>{children}</LayoutBase>;
}
