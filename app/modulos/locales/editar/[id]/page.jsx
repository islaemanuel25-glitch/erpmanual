"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function EditarLocalPage() {
  const router = useRouter();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mostrarAvanzado, setMostrarAvanzado] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    tipo: "",
    direccion: "",
    telefono: "",
    email: "",
    cuil: "",
    ciudad: "",
    provincia: "",
    codigoPostal: "",
    activo: true,
    esDeposito: false,
  });

  // normaliza: null → ""
  const safe = (v) => (v === null || v === undefined ? "" : v);

  const update = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  // Cargar datos del local
  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(`/api/locales/${id}`, {
          credentials: "include",
        });
        const json = await res.json();

        if (!json.ok || !json.data) {
          alert("Error cargando local");
          router.push("/modulos/locales");
          return;
        }

        const d = json.data;

        setForm({
          nombre: safe(d.nombre),
          tipo: safe(d.tipo),
          direccion: safe(d.direccion),
          telefono: safe(d.telefono),
          email: safe(d.email),
          cuil: safe(d.cuil),
          ciudad: safe(d.ciudad),
          provincia: safe(d.provincia),
          codigoPostal: safe(d.codigoPostal),
          activo: d.activo ?? true,
          esDeposito: d.es_deposito ?? false, // snake_case → camelCase
        });

        setLoading(false);
      } catch (err) {
        console.error("ERROR CARGANDO LOCAL:", err);
        alert("Error cargando datos");
        router.push("/modulos/locales");
      }
    };

    cargar();
  }, [id, router]);

  // Guardar cambios
  const guardar = async () => {
    if (!form.nombre.trim() || !form.tipo.trim()) {
      alert("Completá nombre y tipo.");
      return;
    }

    setGuardando(true);

    const res = await fetch(`/api/locales/${id}`, {
      credentials: "include",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const json = await res.json();
    setGuardando(false);

    if (!json.ok) {
      alert("Error al guardar: " + json.error);
      return;
    }

    alert("✅ Local actualizado");
    router.push("/modulos/locales");
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Cargando…</div>;
  }

  return (
    <div className="p-6 max-w-xl">
      <button
        onClick={() => router.push("/modulos/locales")}
        className="mb-4 text-blue-600"
      >
        ← Volver
      </button>

      <h1 className="text-2xl font-bold mb-6">Editar Local</h1>

      <div className="flex flex-col gap-4">

        <input
          type="text"
          value={form.nombre}
          onChange={(e) => update("nombre", e.target.value)}
          className="border px-3 py-2 rounded"
        />

        <select
          value={form.tipo}
          onChange={(e) => update("tipo", e.target.value)}
          className="border px-3 py-2 rounded"
        >
          <option value="local">Local</option>
          <option value="deposito">Depósito</option>
        </select>

        <input
          type="text"
          value={form.direccion}
          onChange={(e) => update("direccion", e.target.value)}
          placeholder="Dirección"
          className="border px-3 py-2 rounded"
        />

        <input
          type="text"
          value={form.telefono}
          onChange={(e) => update("telefono", e.target.value)}
          placeholder="Teléfono"
          className="border px-3 py-2 rounded"
        />

        {/* Estado */}
        <select
          value={form.activo ? "true" : "false"}
          onChange={(e) => update("activo", e.target.value === "true")}
          className="border px-3 py-2 rounded"
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>

        {/* Campos Avanzados */}
        <button
          onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
          className="text-blue-600 text-sm underline mt-2"
        >
          {mostrarAvanzado
            ? "Ocultar campos avanzados"
            : "Mostrar campos avanzados"}
        </button>

        {mostrarAvanzado && (
          <div className="bg-gray-50 border p-4 rounded-md flex flex-col gap-3 mt-3">
            <h2 className="text-sm font-semibold text-gray-700">Datos administrativos</h2>

            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="h-[36px] px-3 rounded border text-sm"
            />

            <input
              type="text"
              placeholder="CUIL"
              value={form.cuil}
              onChange={(e) => update("cuil", e.target.value)}
              className="h-[36px] px-3 rounded border text-sm"
            />

            <h2 className="text-sm font-semibold text-gray-700 mt-4">Ubicación</h2>

            <input
              type="text"
              placeholder="Ciudad"
              value={form.ciudad}
              onChange={(e) => update("ciudad", e.target.value)}
              className="h-[36px] px-3 rounded border text-sm"
            />

            <input
              type="text"
              placeholder="Provincia"
              value={form.provincia}
              onChange={(e) => update("provincia", e.target.value)}
              className="h-[36px] px-3 rounded border text-sm"
            />

            <input
              type="text"
              placeholder="Código Postal"
              value={form.codigoPostal}
              onChange={(e) => update("codigoPostal", e.target.value)}
              className="h-[36px] px-3 rounded border text-sm"
            />
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="mt-6 bg-blue-600 text-white px-4 py-2 rounded"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>

      </div>
    </div>
  );
}
