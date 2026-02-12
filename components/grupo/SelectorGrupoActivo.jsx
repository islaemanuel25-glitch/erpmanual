"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function SelectorGrupoActivo({ onGrupoChanged }) {
  const router = useRouter();

  const [esAdmin, setEsAdmin] = useState(false);
  const [grupoActivoId, setGrupoActivoId] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);

        // Cargar estado actual
        const resEstado = await fetch("/api/grupo-activo/get", {
          credentials: "include",
        });

        if (resEstado.status === 401) {
          router.replace("/login");
          return;
        }

        const dataEstado = await resEstado.json();

        if (dataEstado.ok) {
          setEsAdmin(dataEstado.esAdmin || false);
          setGrupoActivoId(dataEstado.grupoId || dataEstado.grupoActivoId || null);

          // Solo cargar grupos si es admin
          if (dataEstado.esAdmin) {
            const resGrupos = await fetch("/api/grupos/opciones", {
              credentials: "include",
            });

            if (resGrupos.status === 401) {
              router.replace("/login");
              return;
            }

            const dataGrupos = await resGrupos.json();

            if (dataGrupos.ok) {
              setGrupos(dataGrupos.items || []);
              // Pre-seleccionar grupo activo si existe
              if (dataEstado.grupoId || dataEstado.grupoActivoId) {
                setSelectedGrupoId(
                  String(dataEstado.grupoId || dataEstado.grupoActivoId)
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("Error cargando selector grupo activo:", err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [router]);

  const handleAplicar = async () => {
    if (!selectedGrupoId) {
      return;
    }

    setApplying(true);
    setSuccessMsg("");

    try {
      const res = await fetch("/api/grupo-activo/set", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupoId: Number(selectedGrupoId) }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (data.ok) {
        setSuccessMsg("✓ Grupo activo actualizado correctamente");
        setGrupoActivoId(Number(selectedGrupoId));

        if (onGrupoChanged) {
          onGrupoChanged(Number(selectedGrupoId));
        }
      } else {
        setSuccessMsg(`Error: ${data.error || "Error al actualizar grupo activo"}`);
      }
    } catch (err) {
      console.error("Error aplicando grupo activo:", err);
      setSuccessMsg("Error de conexión al actualizar grupo activo.");
    } finally {
      setApplying(false);
    }
  };

  // No mostrar nada si no es admin
  if (!esAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="text-xs text-slate-400">Cargando grupos...</div>
    );
  }

  return (
    <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-200">Grupo activo</div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <SunmiSelect
            value={selectedGrupoId}
            onChange={(e) => setSelectedGrupoId(e.target.value)}
            disabled={applying}
          >
            <option value="">Seleccionar grupo...</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </SunmiSelect>
        </div>

        <SunmiButton
          color="amber"
          onClick={handleAplicar}
          disabled={!selectedGrupoId || applying}
        >
          {applying ? "Aplicando..." : "Aplicar"}
        </SunmiButton>
      </div>

      {grupoActivoId && (
        <div className="text-xs text-slate-400">
          Actual: {grupos.find((g) => g.id === grupoActivoId)?.nombre || `#${grupoActivoId}`}
        </div>
      )}

      {successMsg && (
        <div
          className={`text-xs ${
            successMsg.includes("Error")
              ? "text-red-300"
              : "text-emerald-300"
          }`}
        >
          {successMsg}
        </div>
      )}
    </div>
  );
}

