"use client";

import { useUser } from "@/app/context/UserContext";

export default function DashboardPage() {
  const { perfil, cargando, logout } = useUser();

  if (cargando) return <p className="p-4">Cargando...</p>;

  if (!perfil) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <button onClick={logout} className="text-sm underline">Salir</button>
      </div>

      <p className="text-gray-700">
        Hola <b>{perfil.nombre}</b> — Rol: <b>{perfil.rol}</b>
      </p>

      <p className="mt-2 text-gray-500">Esta es la base del dashboard.</p>
    </div>
  );
}
