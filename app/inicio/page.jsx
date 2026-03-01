"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { Store, Warehouse, Loader2 } from "lucide-react";

export default function InicioPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  const [locales, setLocales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cargando) return;

    if (!perfil) {
      router.replace("/login");
      return;
    }

    // Usuario con local fijo → ir directo
    if (perfil.localId) {
      router.replace("/modulos/dashboard");
      return;
    }

    cargarOpciones();
  }, [cargando, perfil]);

  const cargarOpciones = async () => {
    try {
      const res = await fetch("/api/locales/opciones", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();

      if (data.ok) {
        const items = data.items || [];
        setLocales(items);

        // Auto-seleccionar si hay 1 sola opción
        if (items.length === 1) {
          await seleccionar(items[0]);
          return;
        }
      } else {
        setError(data.error || "Error cargando locales");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
    }
    setLoading(false);
  };

  const seleccionar = async (local) => {
    setSetting(true);
    setError("");
    try {
      const res = await fetch("/api/contexto-activo/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ localId: local.id }),
      });
      const data = await res.json();

      if (data.ok) {
        router.replace("/modulos/dashboard");
        return;
      }
      setError(data.error || "Error al seleccionar");
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
    }
    setSetting(false);
  };

  // Loading
  if (cargando || loading) {
    return (
      <main className="min-h-screen grid place-items-center sunmi-bg">
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={24} className="animate-spin text-slate-400" />
          <span className="text-sm text-slate-400">Cargando...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center p-4 sunmi-bg">
      <SunmiCard className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold text-center mb-1">
          Elegí tu contexto operativo
        </h1>
        <p className="text-xs text-slate-400 text-center mb-5">
          Seleccioná el local o depósito desde donde vas a operar.
        </p>

        {error && (
          <div className="mb-4 text-[11px] text-red-400 bg-red-900/20 border border-red-500/40 rounded-lg px-3 py-2 text-center">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {locales.map((local) => (
            <button
              key={local.id}
              type="button"
              disabled={setting}
              onClick={() => seleccionar(local)}
              className="
                w-full flex items-center gap-3 p-3
                bg-slate-800/60 border border-slate-700
                rounded-xl
                hover:border-cyan-500/50 hover:bg-slate-800
                transition text-left
                disabled:opacity-50
              "
            >
              {local.esDeposito ? (
                <Warehouse size={20} className="text-amber-400 flex-shrink-0" />
              ) : (
                <Store size={20} className="text-cyan-400 flex-shrink-0" />
              )}
              <div>
                <div className="text-[13px] font-medium">{local.nombre}</div>
                <div className="text-[10px] text-slate-500">
                  {local.esDeposito ? "Depósito" : "Local"}
                </div>
              </div>
            </button>
          ))}
        </div>

        {locales.length === 0 && !error && (
          <div className="text-xs text-slate-500 text-center py-4">
            No hay locales disponibles. Seleccioná un grupo primero.
          </div>
        )}
      </SunmiCard>
    </main>
  );
}
