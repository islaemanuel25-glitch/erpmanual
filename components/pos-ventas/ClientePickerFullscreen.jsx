"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ClientePickerFullscreen({
  localId,
  onSeleccionar,
  onCerrar,
}) {
  const [busqueda, setBusqueda] = useState("");
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const buscarClientes = async () => {
    if (!localId) {
      setErrorMsg("No hay contexto operativo activo.");
      return;
    }
    if (!busqueda || busqueda.length < 2) return;

    setErrorMsg("");
    setLoading(true);
    setBuscado(true);
    try {
      const res = await fetch(
        `/api/clientes/buscar?localId=${localId}&q=${encodeURIComponent(busqueda)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) {
        setClientes(data.items || []);
      } else {
        setErrorMsg(data.error || "Error buscando clientes");
        setClientes([]);
      }
    } catch {
      setErrorMsg("Error de conexión");
      setClientes([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] sunmi-surface p-2 lg:p-3">
      <div className="max-w-4xl mx-auto h-full flex flex-col gap-3">
        <SunmiCard className="p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Elegir cliente</h2>
            <SunmiButton color="slate" onClick={onCerrar}>
              Volver
            </SunmiButton>
          </div>

          <div className="mt-3 flex gap-2">
            <SunmiInput
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarClientes()}
              placeholder="Buscar por nombre, teléfono, documento o email..."
              className="flex-1"
              autoFocus
            />
            <SunmiButton
              color="cyan"
              onClick={buscarClientes}
              disabled={!busqueda || busqueda.length < 2 || !localId}
            >
              Buscar
            </SunmiButton>
          </div>

          {errorMsg && (
            <div className="mt-2 text-xs sunmi-text-danger sunmi-state-danger rounded px-2 py-1.5">
              {errorMsg}
            </div>
          )}

          <div className="mt-2 text-[11px] sunmi-text-muted">
            Escribí al menos 2 caracteres para buscar.
          </div>
        </SunmiCard>

        <SunmiCard className="p-3 flex-1 min-h-0">
          <div className="h-full overflow-y-auto space-y-1">
            <SunmiButton
              color="amber"
              onClick={() => onSeleccionar(null)}
              className="w-full !py-3"
            >
              Consumidor Final
            </SunmiButton>

            {loading ? (
              <div className="text-center sunmi-text-muted py-8">Buscando...</div>
            ) : clientes.length > 0 ? (
              clientes.map((cliente) => (
                <button
                  key={cliente.id}
                  onClick={() => onSeleccionar(cliente)}
                  className="w-full sunmi-surface-soft p-3 rounded-lg text-left sunmi-row-hover transition-colors"
                >
                  <div className="font-medium text-sm">{cliente.nombre}</div>
                  <div className="text-[11px] sunmi-text-muted">
                    {[cliente.telefono, cliente.documento, cliente.email]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </div>
                </button>
              ))
            ) : buscado ? (
              <div className="text-center sunmi-text-muted py-8">
                No se encontraron clientes
              </div>
            ) : (
              <div className="text-center sunmi-text-muted py-8">
                Buscá un cliente para seleccionarlo
              </div>
            )}
          </div>
        </SunmiCard>
      </div>
    </div>
  );
}
