"use client";

import { useState, useEffect } from "react";

import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiSection from "@/components/sunmi/SunmiSection";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

import SunmiListCard from "@/components/sunmi/SunmiListCard";
import SunmiListCardItem from "@/components/sunmi/SunmiListCardItem";
import SunmiListCardRemove from "@/components/sunmi/SunmiListCardRemove";

import SelectAgregarLocal from "@/components/grupos/SelectAgregarLocal";
import SelectAgregarDeposito from "@/components/grupos/SelectAgregarDeposito";

export default function EditorGrupo({ grupoId }) {
  const [grupo, setGrupo] = useState(null);
  const [nombre, setNombre] = useState("");

  const load = async () => {
    const res = await fetch(`/api/grupos/${grupoId}`, { credentials: "include" });
    const data = await res.json();
    setGrupo(data);
    setNombre(data.nombre || "");
  };

  useEffect(() => {
    load();
  }, [grupoId]);

  const saveNombre = async (e) => {
    e.preventDefault();
    await fetch(`/api/grupos/${grupoId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    load();
  };

  if (!grupo) return "Cargando…";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">

      {/* ========== COLUMNA IZQUIERDA ========== */}
      <div className="md:col-span-1 h-full">
        <SunmiPanel title="Datos del grupo" className="h-full">
          <SunmiSection>
            <form onSubmit={saveNombre} className="flex items-center gap-2">
              <SunmiInput
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="p-1 text-sm w-full"
                placeholder="Nombre del grupo"
              />

              <SunmiButton
                color="amber"
                type="submit"
                className="px-3 py-1 text-sm"
              >
                Guardar
              </SunmiButton>
            </form>
          </SunmiSection>
        </SunmiPanel>
      </div>

      {/* ========== COLUMNA DERECHA ========== */}
      <div className="md:col-span-2 flex flex-col gap-3 h-full">

        {/* PANEL: DEPÓSITOS */}
        <SunmiPanel title="Depósitos" className="h-full">
          <SunmiSection>
            <SelectAgregarDeposito
              onAgregar={async (localId) => {
                await fetch(`/api/grupos/${grupoId}/depositos`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ localId }),
                });
                load();
              }}
              excluidos={(grupo.locales || []).map((d) => d.localId)}
            />
          </SunmiSection>

          <div className="mt-1">
            <SunmiListCard compact>
              {(grupo.locales || []).map((d) => (
                <SunmiListCardItem key={d.localId}>
                  <span className="text-sm">{d.local.nombre}</span>

                  <SunmiListCardRemove
                    compact
                    onClick={async () => {
                      await fetch(`/api/grupos/${grupoId}/depositos`, {
                        method: "DELETE",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ localId: d.localId }),
                      });
                      load();
                    }}
                  />
                </SunmiListCardItem>
              ))}
            </SunmiListCard>
          </div>
        </SunmiPanel>

        {/* PANEL: LOCALES */}
        <SunmiPanel title="Locales" className="h-full">
          <SunmiSection>
            <SelectAgregarLocal
              onAgregar={async (localId) => {
                await fetch(`/api/grupos/${grupoId}/locales`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ localId }),
                });
                load();
              }}
              excluidos={(grupo.localesGrupo || []).map((lg) => lg.local.id)}
            />
          </SunmiSection>

          <div className="mt-1">
            <SunmiListCard compact>
              {(grupo.localesGrupo || []).map((lg) => (
                <SunmiListCardItem key={lg.local.id}>
                  <span className="text-sm">{lg.local.nombre}</span>

                  <SunmiListCardRemove
                    compact
                    onClick={async () => {
                      await fetch(`/api/grupos/${grupoId}/locales`, {
                        method: "DELETE",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ localId: lg.local.id }),
                      });
                      load();
                    }}
                  />
                </SunmiListCardItem>
              ))}
            </SunmiListCard>
          </div>
        </SunmiPanel>

      </div>
    </div>
  );
}
