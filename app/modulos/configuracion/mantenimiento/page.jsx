"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Trash2 } from "lucide-react";

export default function MantenimientoPage() {
  const { perfil, cargando } = useUser();

  // Reset operativo
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPass, setResetPass] = useState("");
  const [resetFrase, setResetFrase] = useState("");
  const [resetCheck, setResetCheck] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResult, setResetResult] = useState(null);

  const resetFormValid =
    resetPass.length > 0 &&
    resetFrase === "REINICIAR TODO" &&
    resetCheck;

  const handleReset = async () => {
    setResetError("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-operativo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: resetPass,
          frase: resetFrase,
          confirmado: resetCheck,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setResetError(data.error || "Error desconocido");
      } else {
        setResetResult(data.deleted);
      }
    } catch {
      setResetError("Error de conexion");
    } finally {
      setResetLoading(false);
    }
  };

  const closeReset = () => {
    setResetOpen(false);
    setResetPass("");
    setResetFrase("");
    setResetCheck(false);
    setResetError("");
    setResetResult(null);
  };

  if (cargando) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Mantenimiento"
        subtitle="Herramientas administrativas y operaciones peligrosas."
      />

      {/* Zona peligrosa */}
      <div className="mt-2">
        <h2 className="text-sm font-semibold sunmi-text-danger mb-3">Zona peligrosa</h2>
        <SunmiCard className="border border-red-500/30">
          <div className="flex items-start gap-3">
            <Trash2 size={22} className="sunmi-text-danger mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Reiniciar base operativa</h3>
              <p className="text-[12px] sunmi-text-muted mt-1">
                Elimina todos los datos operativos: productos, ventas, stock,
                transferencias, turnos, pedidos y movimientos de caja.
                No elimina usuarios, roles, categorias, proveedores ni
                configuraciones.
              </p>
              <div className="mt-3">
                <SunmiButton
                  color="red"
                  size="sm"
                  onClick={() => setResetOpen(true)}
                >
                  Reiniciar base operativa
                </SunmiButton>
              </div>
            </div>
          </div>
        </SunmiCard>
      </div>

      {/* Modal de confirmacion */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="sunmi-card w-full max-w-md mx-4 p-5 rounded-xl shadow-xl">
            {resetResult ? (
              <>
                <h3 className="text-sm font-bold sunmi-text-success mb-3">
                  Reset completado
                </h3>
                <div className="text-[12px] sunmi-text-strong space-y-1">
                  <p>Ventas eliminadas: {resetResult.ventas}</p>
                  <p>Productos eliminados: {resetResult.productos}</p>
                  <p>Transferencias eliminadas: {resetResult.transferencias}</p>
                  <p>Turnos eliminados: {resetResult.turnos}</p>
                </div>
                <div className="mt-4">
                  <SunmiButton onClick={closeReset}>Cerrar</SunmiButton>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold sunmi-text-danger mb-1">
                  Reiniciar base operativa
                </h3>
                <p className="text-[11px] sunmi-text-muted mb-4">
                  Esta accion es irreversible. Se eliminaran todos los productos,
                  ventas, stock, transferencias, turnos y pedidos.
                </p>

                <div className="space-y-3">
                  <SunmiInput
                    label="Tu contrasena"
                    type="password"
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                    placeholder="Ingresa tu contrasena"
                  />

                  <SunmiInput
                    label='Escribe "REINICIAR TODO" para confirmar'
                    value={resetFrase}
                    onChange={(e) => setResetFrase(e.target.value)}
                    placeholder="REINICIAR TODO"
                  />

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetCheck}
                      onChange={(e) => setResetCheck(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[12px] sunmi-text-strong">
                      Entiendo que esto eliminara todos los datos operativos
                      y que no se puede deshacer
                    </span>
                  </label>
                </div>

                {resetError && (
                  <div className="mt-3 px-3 py-2 rounded sunmi-state-danger sunmi-text-danger text-[12px]">
                    {resetError}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <SunmiButton
                    color="red"
                    disabled={!resetFormValid || resetLoading}
                    onClick={handleReset}
                  >
                    {resetLoading ? "Eliminando..." : "Confirmar reinicio"}
                  </SunmiButton>
                  <SunmiButton onClick={closeReset} disabled={resetLoading}>
                    Cancelar
                  </SunmiButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
