"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function NuevoGrupoPage() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const crearGrupo = async () => {
    if (!nombre.trim()) {
      return alert("El nombre del grupo es obligatorio");
    }

    setCreando(true);
    try {
      const res = await fetch("/api/grupos/crear", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || "No se pudo crear el grupo");
        setCreando(false);
        return;
      }

      router.push(`/modulos/grupos/${data.data.id}`);

    } catch (e) {
      console.error("Error creando grupo:", e);
      alert("Error inesperado");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="w-full min-h-full flex justify-center">
      <div className="w-full max-w-xl">
        <SunmiCard>
          <SunmiCardHeader
            title="Nuevo Grupo"
            color="amber"
          />

          <SunmiSeparator label="Datos" color="amber" />

          <div className="flex flex-col gap-2">
            <SunmiInput
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Zona Norte, Rosario, Premium…"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos/grupos")}
            >
              Cancelar
            </SunmiButton>

            <SunmiButton
              color="amber"
              onClick={crearGrupo}
              disabled={creando}
            >
              {creando ? "Creando…" : "Crear Grupo"}
            </SunmiButton>
          </div>
        </SunmiCard>
      </div>
    </div>
  );
}
