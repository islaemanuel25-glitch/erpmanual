"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SidebarPro from "@/components/sidebar/SidebarPro";

export default function ModulosLayout({ children }) {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  useEffect(() => {
    if (!cargando && !perfil) {
      router.replace("/login");
    }
  }, [cargando, perfil, router]);

  if (cargando) return null;
  if (!perfil) return null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-900">

      <SidebarPro />

      <main className="flex-1 overflow-auto p-4">
        {children}
      </main>
    </div>
  );
}
