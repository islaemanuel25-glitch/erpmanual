"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import { getDefaultRoute } from "@/lib/getDefaultRoute";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { Store, Warehouse, Loader2 } from "lucide-react";

export default function InicioPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();
  const { menuMode } = useLayoutSettings();

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
      router.replace(getDefaultRoute(menuMode));
      return;
    }

    cargarOpciones();
  }, [cargando, perfil, menuMode]);

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
        router.replace(getDefaultRoute(menuMode));
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
          <Loader2 size={24} className="animate-spin sunmi-text-muted" />
          <span className="text-sm sunmi-text-muted">Cargando...</span>
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
        <p className="text-xs sunmi-text-muted text-center mb-5">
          Seleccioná el local o depósito desde donde vas a operar.
        </p>

        {error && (
          <div className="mb-4 text-[11px] sunmi-text-danger sunmi-state-danger rounded-lg px-3 py-2 text-center">
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
                sunmi-surface-soft sunmi-border
                rounded-xl
                sunmi-row-hover
                transition text-left
                disabled:opacity-50
              "
            >
              {local.esDeposito ? (
                <Warehouse size={20} className="sunmi-text-warning flex-shrink-0" />
              ) : (
                <Store size={20} className="sunmi-text-accent flex-shrink-0" />
              )}
              <div>
                <div className="text-[13px] font-medium">{local.nombre}</div>
                <div className="text-[10px] sunmi-text-muted">
                  {local.esDeposito ? "Depósito" : "Local"}
                </div>
              </div>
            </button>
          ))}
        </div>

        {locales.length === 0 && !error && (
          <div className="text-xs sunmi-text-muted text-center py-4">
            No hay locales disponibles. Seleccioná un grupo primero.
          </div>
        )}
      </SunmiCard>
    </main>
  );
}
