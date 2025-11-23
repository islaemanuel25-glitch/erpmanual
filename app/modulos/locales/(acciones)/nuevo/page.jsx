"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoLocalPage() {
  const router = useRouter();

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
  });

  const update = (campo, valor) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    if (!form.nombre.trim() || !form.tipo.trim()) {
      alert("Completá nombre y tipo");
      return;
    }

    const res = await fetch("/api/locales", { credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
      body: JSON.stringify(form),
    });

    const json = await res.json();
    if (!json.ok) return alert("Error al guardar");

    router.push("/modulos/locales");
  };

  return (
    <div className="p-6 max-w-xl mx-auto">

      <button onClick={() => router.push("/modulos/locales")} className="mb-4">
        ← Volver
      </button>

      <h1 className="text-2xl font-bold mb-6">Nuevo Local</h1>

      <div className="flex flex-col gap-3">

        <input className="border px-3 py-2 rounded"
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => update("nombre", e.target.value)}
        />

        <select
          className="border px-3 py-2 rounded"
          value={form.tipo}
          onChange={(e) => update("tipo", e.target.value)}
        >
          <option value="">Tipo...</option>
          <option value="local">Local</option>
          <option value="deposito">Depósito</option>
        </select>

        <input className="border px-3 py-2 rounded"
          placeholder="Dirección"
          value={form.direccion}
          onChange={(e) => update("direccion", e.target.value)}
        />

        <input className="border px-3 py-2 rounded"
          placeholder="Teléfono"
          value={form.telefono}
          onChange={(e) => update("telefono", e.target.value)}
        />

        <input className="border px-3 py-2 rounded"
          placeholder="Email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
        />

        <input className="border px-3 py-2 rounded"
          placeholder="CUIL"
          value={form.cuil}
          onChange={(e) => update("cuil", e.target.value)}
        />

        <input className="border px-3 py-2 rounded"
          placeholder="Ciudad"
          value={form.ciudad}
          onChange={(e) => update("ciudad", e.target.value)}
        />

        <input className="border px-3 py-2 rounded"
          placeholder="Provincia"
          value={form.provincia}
          onChange={(e) => update("provincia", e.target.value)}
        />

        <input className="border px-3 py-2 rounded"
          placeholder="Código Postal"
          value={form.codigoPostal}
          onChange={(e) => update("codigoPostal", e.target.value)}
        />

        <label className="flex items-center gap-2 mt-4">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => update("activo", e.target.checked)}
          />
          Activo
        </label>

        <button
          onClick={guardar}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
