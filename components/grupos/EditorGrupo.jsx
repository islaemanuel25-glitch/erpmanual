"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Plus } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

import SelectAgregarLocal from "@/components/grupos/SelectAgregarLocal";
import SelectAgregarDeposito from "@/components/grupos/SelectAgregarDeposito";
import GrupoHeader from "@/components/grupos/GrupoHeader";
import GrupoItemRow from "@/components/grupos/GrupoItemRow";

export default function EditorGrupo({ grupoId }) {
  const router = useRouter();
  const [grupo, setGrupo] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [showAgregarLocal, setShowAgregarLocal] = useState(false);
  const [showAgregarDeposito, setShowAgregarDeposito] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  const load = async () => {
    const res = await fetch(`/api/grupos/${grupoId}`, { credentials: "include" });
    const data = await res.json();
    setGrupo(data);
  };

  useEffect(() => {
    load();
  }, [grupoId]);

  const saveNombre = async (nuevoNombre) => {
    await fetch(`/api/grupos/${grupoId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoNombre }),
    });
    await load();
  };

  const sincronizarProductos = async () => {
    if (!confirm("¿Sincronizar catálogo del depósito a todos los locales del grupo?")) {
      return;
    }

    setSincronizando(true);
    try {
      const res = await fetch(`/api/grupos/${grupoId}/sync-productos`, {
        method: "POST",
        credentials: "include",
      });

      const json = await res.json();

      if (json.ok) {
        const { productoLocalCreated, stockCreated, productosBase, locales } = json.data;
        alert(
          `✅ Sincronización completada:\n` +
          `- ${productosBase} productos base\n` +
          `- ${locales} locales\n` +
          `- ${productoLocalCreated} ProductoLocal creados\n` +
          `- ${stockCreated} StockLocal creados`
        );
        await load();
      } else {
        alert(`❌ Error: ${json.error || "Error al sincronizar productos"}`);
      }
    } catch (error) {
      console.error("Error sincronizando productos:", error);
      alert("❌ Error de red al sincronizar productos");
    } finally {
      setSincronizando(false);
    }
  };

  if (!grupo) {
    return (
      <div className="py-10 text-center sunmi-text-muted text-xs">
        Cargando…
      </div>
    );
  }

  const cantidadLocales = (grupo.localesGrupo || []).length;
  const cantidadDepositos = (grupo.locales || []).length;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      {/* TOPBAR: breadcrumb + back */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <nav className="text-[11px] sunmi-text-muted flex items-center gap-1.5 min-w-0">
          <span
            onClick={() => router.push("/modulos/grupos")}
            className="cursor-pointer hover:sunmi-text-strong transition shrink-0"
          >
            Grupos
          </span>
          <span className="opacity-60 shrink-0">/</span>
          <span className="sunmi-text-strong truncate max-w-[260px]">
            {grupo.nombre}
          </span>
        </nav>
        <SunmiBackButton href="/modulos/grupos" />
      </div>

      {/* HEADER: avatar+nombre+edit a la izquierda, sincronizar a la derecha */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <GrupoHeader grupo={grupo} onSaveNombre={saveNombre} />
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <SunmiButton
            color="cyan"
            onClick={sincronizarProductos}
            disabled={sincronizando}
          >
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw
                size={14}
                className={sincronizando ? "animate-spin" : ""}
              />
              {sincronizando ? "Sincronizando…" : "Sincronizar catálogo"}
            </span>
          </SunmiButton>
          <span className="text-[11px] sunmi-text-muted">Catálogo compartido</span>
        </div>
      </div>

      <div className="border-t sunmi-divider" />

      {/* SECCIÓN: Locales */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold sunmi-text-strong">
            Locales{" "}
            <span className="sunmi-text-muted font-normal">
              ({cantidadLocales})
            </span>
          </h2>
          {!showAgregarLocal && (
            <SunmiButton
              color="amber"
              onClick={() => setShowAgregarLocal(true)}
            >
              <span className="inline-flex items-center gap-1">
                <Plus size={13} />
                Agregar local
              </span>
            </SunmiButton>
          )}
        </div>

        {showAgregarLocal && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex-1 min-w-0">
              <SelectAgregarLocal
                onAgregar={async (localId) => {
                  await fetch(`/api/grupos/${grupoId}/locales`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ localId }),
                  });
                  await load();
                  setShowAgregarLocal(false);
                }}
                excluidos={(grupo.localesGrupo || []).map((lg) => lg.local.id)}
              />
            </div>
            <SunmiButton
              color="slate"
              onClick={() => setShowAgregarLocal(false)}
            >
              Cancelar
            </SunmiButton>
          </div>
        )}

        {cantidadLocales === 0 ? (
          <div className="py-6 text-center sunmi-text-muted text-[12px] border sunmi-divider rounded-lg">
            Aún no hay locales asignados al grupo.
          </div>
        ) : (
          <div className="rounded-lg border sunmi-divider sunmi-card overflow-hidden divide-y sunmi-divide">
            {(grupo.localesGrupo || []).map((lg) => (
              <GrupoItemRow
                key={lg.local.id}
                local={lg.local}
                tipo="local"
                productCount={lg.local?._count?.productos ?? 0}
                pending={pendingId === `local:${lg.local.id}`}
                onIr={() =>
                  router.push(`/modulos/locales/editar/${lg.local.id}`)
                }
                onQuitar={async () => {
                  setPendingId(`local:${lg.local.id}`);
                  try {
                    await fetch(`/api/grupos/${grupoId}/locales`, {
                      method: "DELETE",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ localId: lg.local.id }),
                    });
                    await load();
                  } finally {
                    setPendingId(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* SECCIÓN: Depósitos */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold sunmi-text-strong">
            Depósitos{" "}
            <span className="sunmi-text-muted font-normal">
              ({cantidadDepositos})
            </span>
          </h2>
          {!showAgregarDeposito && (
            <SunmiButton
              color="amber"
              onClick={() => setShowAgregarDeposito(true)}
            >
              <span className="inline-flex items-center gap-1">
                <Plus size={13} />
                Agregar depósito
              </span>
            </SunmiButton>
          )}
        </div>

        {showAgregarDeposito && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex-1 min-w-0">
              <SelectAgregarDeposito
                onAgregar={async (localId) => {
                  await fetch(`/api/grupos/${grupoId}/depositos`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ localId }),
                  });
                  await load();
                  setShowAgregarDeposito(false);
                }}
                excluidos={(grupo.locales || []).map((d) => d.localId)}
              />
            </div>
            <SunmiButton
              color="slate"
              onClick={() => setShowAgregarDeposito(false)}
            >
              Cancelar
            </SunmiButton>
          </div>
        )}

        {cantidadDepositos === 0 ? (
          <div className="py-6 text-center sunmi-text-muted text-[12px] border sunmi-divider rounded-lg">
            Aún no hay depósitos asignados al grupo.
          </div>
        ) : (
          <div className="rounded-lg border sunmi-divider sunmi-card overflow-hidden divide-y sunmi-divide">
            {(grupo.locales || []).map((d) => (
              <GrupoItemRow
                key={d.localId}
                local={d.local}
                tipo="deposito"
                productCount={d.local?._count?.productos ?? 0}
                showActivo={false}
                pending={pendingId === `deposito:${d.localId}`}
                onIr={() => router.push(`/modulos/locales/editar/${d.localId}`)}
                onQuitar={async () => {
                  setPendingId(`deposito:${d.localId}`);
                  try {
                    await fetch(`/api/grupos/${grupoId}/depositos`, {
                      method: "DELETE",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ localId: d.localId }),
                    });
                    await load();
                  } finally {
                    setPendingId(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
