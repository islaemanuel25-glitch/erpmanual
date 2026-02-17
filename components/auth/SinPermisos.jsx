"use client";

import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { ShieldOff } from "lucide-react";

export default function SinPermisos({ mensaje }) {
  const router = useRouter();

  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center p-4">
      <SunmiCard className="w-full max-w-sm p-6 text-center">
        <ShieldOff size={40} className="mx-auto text-red-400 mb-3" />
        <h2 className="text-lg font-bold mb-1">Sin permisos</h2>
        <p className="text-sm text-slate-400 mb-4">
          {mensaje || "No tenés permisos para acceder a esta sección."}
        </p>
        <SunmiButton color="slate" onClick={() => router.push("/modulos")}>
          Volver al inicio
        </SunmiButton>
      </SunmiCard>
    </div>
  );
}
