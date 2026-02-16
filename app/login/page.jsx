"use client";

import { useState } from "react";
import { useUser } from "@/app/context/UserContext";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

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
      const r = await fetch("/api/login", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    <main className="min-h-screen w-full grid place-items-center p-4">
      <SunmiCard className="w-full max-w-sm p-4">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="text-center">
            <h1 className="text-xl font-semibold">Iniciar sesión</h1>
            <p className="text-xs text-slate-400 mt-1">
              Accedé al sistema con tu usuario
            </p>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Email
            </label>
            <SunmiInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Contraseña
            </label>
            <SunmiInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <SunmiButton
            type="submit"
            disabled={cargando}
            color="amber"
            className="w-full"
          >
            {cargando ? "Ingresando..." : "Ingresar"}
          </SunmiButton>
        </form>
      </SunmiCard>
    </main>
  );
}
