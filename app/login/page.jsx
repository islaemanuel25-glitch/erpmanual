"use client";

import { useState } from "react";
import { useUser } from "@/app/context/UserContext";

export default function LoginPage() {
  const { refrescar } = useUser();

  // ✅ DATOS REALES DEL SEED
  const [email, setEmail] = useState("admin@admin.com");
  const [password, setPassword] = useState("123456");

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);

    try {
      const r = await fetch("/api/login", { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
        body: JSON.stringify({ email, password }),
      });

      const data = await r.json();

      if (!data.ok) {
        setError(data.error || "Error al iniciar sesión.");
      } else {
        await refrescar();
        window.location.href = "/modulos/dashboard";
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="w-full h-full grid place-items-center bg-gray-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-6 rounded-2xl shadow"
      >
        <h1 className="text-xl font-semibold mb-4 text-center">
          Iniciar sesión
        </h1>

        <label className="text-sm">Email</label>
        <input
          className="w-full border rounded p-2 mb-3"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />

        <label className="text-sm">Contraseña</label>
        <input
          className="w-full border rounded p-2 mb-3"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-blue-600 text-white py-2 rounded-lg"
        >
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
