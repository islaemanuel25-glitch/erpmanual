"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import TablaDepositos from "@/components/grupos/TablaDepositos";
import TablaLocales from "@/components/grupos/TablaLocales";
import SelectAgregarDeposito from "@/components/grupos/SelectAgregarDeposito";
import SelectAgregarLocal from "@/components/grupos/SelectAgregarLocal";

import { Warehouse, Store } from "lucide-react";

export default function PageGrupo({ params }) {
  const router = useRouter();
  const { id } = use(params);       // ✅ params es Promise → use()
  const numId = Number(id);

  const [grupo, setGrupo] = useState(null);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const res = await fetch(`/api/grupos/${numId}`, { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGrupo(data);
      setNombre(data.nombre || "");
    } catch {
      alert("No se pudo cargar el grupo");
      router.push("/modulos/grupos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (numId) cargar();
  }, [numId]);

  const guardarNombre = async () => {
    if (!nombre.trim()) return alert("El nombre no puede estar vacío");

    setGuardando(true);
    try {
      const res = await fetch(`/api/grupos/${numId}`, { credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
        body: JSON.stringify({ nombre }),
      });
      const data = await res.json();
      if (!data.ok) return alert(data.error);
      cargar();
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="p-4">Cargando grupo...</div>;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-5xl mx-auto">

      {/* ===== BREADCRUMB ===== */}
      <button
        onClick={() => router.push("/modulos/grupos")}
        className="text-blue-600 underline"
      >
        ← Volver a Grupos
      </button>

      {/* ============================================================
          CARD 1 — DATOS BÁSICOS DEL GRUPO
      ============================================================ */}
      <div className="bg-white p-6 rounded-xl shadow-md border space-y-6">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-600">Nombre del grupo</label>
            <input
              className="border px-3 py-2 rounded w-full mt-1"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={guardarNombre}
              disabled={guardando}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>

        </div>

        {/* Estadísticas compactas */}
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded">
            <Warehouse className="text-blue-700" size={18} />
            <span className="font-semibold text-blue-700 text-sm">
              Depósitos: {grupo.locales?.length}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded">
            <Store className="text-green-700" size={18} />
            <span className="font-semibold text-green-700 text-sm">
              Locales: {grupo.localesGrupo?.length}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================
          CARD 2 — DEPÓSITOS DEL GRUPO
      ============================================================ */}
      <div className="bg-white p-6 rounded-xl shadow-md border space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Warehouse className="text-blue-600" size={22} />
          Depósitos del Grupo
        </h2>

        <SelectAgregarDeposito
          onAgregar={async (localId) => {
            const res = await fetch(`/api/grupos/${numId}/depositos`, { credentials: "include",
              method: "POST",
              headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
              body: JSON.stringify({ localId }),
            });
            const data = await res.json();
            if (!data.ok) return alert(data.error);
            cargar();
          }}
        />

        <TablaDepositos
          depositos={grupo.locales}
          onQuitar={async (localId) => {
            const res = await fetch(`/api/grupos/${numId}/depositos`, { credentials: "include",
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ localId }),
            });
            const data = await res.json();
            if (!data.ok) return alert(data.error);
            cargar();
          }}
        />
      </div>

      {/* ============================================================
          CARD 3 — LOCALES DEL GRUPO
      ============================================================ */}
      <div className="bg-white p-6 rounded-xl shadow-md border space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Store className="text-green-600" size={22} />
          Locales del Grupo
        </h2>

        <SelectAgregarLocal
          onAgregar={async (localId) => {
            const res = await fetch(`/api/grupos/${numId}/locales`, { credentials: "include",
              method: "POST",
              headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
              body: JSON.stringify({ localId }),
            });
            const data = await res.json();
            if (!data.ok) return alert(data.error);
            cargar();
          }}
        />

        <TablaLocales
          items={grupo.localesGrupo}
          onQuitar={async (localId) => {
            const res = await fetch(`/api/grupos/${numId}/locales`, { credentials: "include",
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ localId }),
            });
            const data = await res.json();
            if (!data.ok) return alert(data.error);
            cargar();
          }}
        />
      </div>

    </div>
  );
}
