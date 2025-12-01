"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      const res = await fetch("/api/grupos/crear", { credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        , headers: { "Content-Type": "application/json" }},
        body: JSON.stringify({ nombre }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || "No se pudo crear el grupo");
        setCreando(false);
        return;
      }

      alert("Grupo creado correctamente");
      router.push(`/modulos/grupos/${data.data.id}`);

    } catch (e) {
      console.error("Error creando grupo:", e);
      alert("Error inesperado");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">

      <div className="bg-white shadow rounded p-6 space-y-4">

        <div className="space-y-2">
          <label className="block font-medium">Nombre del Grupo</label>
          <input
            className="border px-3 py-2 rounded w-full"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Zona Norte, Rosario, Locales Premium..."
          />
        </div>

        <button
          onClick={crearGrupo}
          disabled={creando}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          {creando ? "Creando..." : "Crear Grupo"}
        </button>
      </div>
    </div>
  );
}
