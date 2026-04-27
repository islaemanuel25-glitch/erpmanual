"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useOperadorActivo } from "@/hooks/useOperadorActivo";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

export default function BloqueoOperadorPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser, logout } = useUser();
  const { operador, loading: cargandoOp, login } = useOperadorActivo();

  const [operadores, setOperadores] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(true);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esExento = permisos.includes("*") || permisos.includes("modulos.acceso_sin_operador");

  // Cuenta exenta → directo al dashboard
  useEffect(() => {
    if (cargandoUser || cargandoOp) return;
    if (!perfil) {
      router.replace("/login");
      return;
    }
    if (esExento) {
      router.replace("/modulos/dashboard");
      return;
    }
    if (operador) {
      router.replace("/modulos/dashboard");
    }
  }, [cargandoUser, cargandoOp, perfil, esExento, operador, router]);

  // Cargar lista de operadores del local activo
  useEffect(() => {
    if (!perfil) return;
    setCargandoLista(true);
    fetch("/api/operador/listar", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setOperadores(d.ok ? d.items : []))
      .catch(() => setOperadores([]))
      .finally(() => setCargandoLista(false));
  }, [perfil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedId) {
      setError("Seleccioná tu nombre.");
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Ingresá tu PIN (mínimo 4 dígitos).");
      return;
    }

    setEnviando(true);
    const result = await login(Number(selectedId), pin);
    setEnviando(false);

    if (!result.ok) {
      setError(result.error || "PIN incorrecto.");
      setPin("");
    }
  };

  // No mostrar nada mientras carga o si va a redirigir
  if (cargandoUser || cargandoOp) return null;
  if (!perfil) return null;
  if (esExento) return null;
  if (operador) return null;

  return (
    <main className="min-h-screen w-full grid place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* HEADER */}
        <div className="text-center space-y-1">
          <div className="text-3xl font-black tracking-tight">
            <span className="sunmi-text-accent">ERP</span>{" "}
            <span>Azul</span>
          </div>
          <p className="text-sm sunmi-text-muted">
            Bienvenido al sistema
          </p>
        </div>

        {/* CARD */}
        <SunmiCard className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center">
              <h1 className="text-lg font-semibold">Identificate para operar</h1>
              <p className="text-[11px] sunmi-text-muted mt-0.5">
                Seleccioná tu nombre e ingresá tu PIN
              </p>
            </div>

            {/* OPERADOR */}
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">
                Operador
              </label>
              {cargandoLista ? (
                <div className="text-xs sunmi-text-muted py-2">Cargando operadores...</div>
              ) : operadores.length === 0 ? (
                <div className="text-xs sunmi-text-muted py-2 text-center">
                  No hay operadores registrados en este local.
                  <br />
                  <span className="text-[10px]">Contactá al administrador.</span>
                </div>
              ) : (
                <SunmiSelectAdv
                  value={selectedId}
                  onChange={(v) => { setSelectedId(v); setError(""); }}
                  placeholder="Seleccionar operador..."
                >
                  {operadores.map((op) => (
                    <SunmiSelectOption key={op.id} value={op.id}>
                      {op.nombre}
                    </SunmiSelectOption>
                  ))}
                </SunmiSelectAdv>
              )}
            </div>

            {/* PIN */}
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">
                PIN
              </label>
              <SunmiInput
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                placeholder="****"
                maxLength={6}
                inputMode="numeric"
                autoFocus
              />
            </div>

            {/* ERROR */}
            {error && (
              <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                {error}
              </div>
            )}

            {/* SUBMIT */}
            <SunmiButton
              type="submit"
              disabled={enviando || cargandoLista || operadores.length === 0}
              color="amber"
              className="w-full"
            >
              {enviando ? "Verificando..." : "Ingresar"}
            </SunmiButton>
          </form>
        </SunmiCard>

        {/* FOOTER: cerrar sesión */}
        <div className="text-center">
          <button
            onClick={logout}
            className="text-[11px] sunmi-text-muted hover:sunmi-text-danger transition-colors"
          >
            Cerrar sesión del local
          </button>
        </div>
      </div>
    </main>
  );
}
