"use client";

import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import FormCombo from "@/components/productos/FormCombo";
import useContextoActivo from "@/hooks/useContextoActivo";

// Alta de COMBO — flujo separado de "+ Producto". El combo nace en el local
// activo (sin selector de local) y es exclusivo de esa ubicación.
export default function NuevoComboPage() {
  const router = useRouter();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();
  const localId = contexto?.localId || 0;

  const handleSubmit = async (payload) => {
    const res = await fetch(`/api/combos/crear?localId=${localId}`, {
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo crear el combo.");
    }
    router.push("/modulos/productos?tipo=combos");
  };

  if (loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title={`Nuevo combo${contexto?.nombre ? ` — ${contexto.nombre}` : ""}`} />
          <SunmiBackButton href="/modulos/productos" />
        </div>
        <div className="p-1">
          <FormCombo
            mode="crear"
            localId={localId}
            localNombre={contexto?.nombre}
            esDeposito={contexto?.esDeposito === true}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/modulos/productos")}
            submitLabel="Crear combo"
          />
        </div>
      </SunmiCard>
    </div>
  );
}
