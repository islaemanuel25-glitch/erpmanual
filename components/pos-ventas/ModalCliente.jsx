"use client";

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ModalCliente({ localId, onSeleccionar, onCerrar }) {
  const [busqueda, setBusqueda] = useState("");
  const [clientes, setClientes] = useState([]);
  const [clientesAll, setClientesAll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState("");

  useEffect(() => {
    const cargarClientesAll = async () => {
      if (!localId) return;
      setLoadingAll(true);
      setShowLimitWarning(false);
      try {
        const res = await fetch(
          `/api/clientes/listar?localId=${localId}&limit=500`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) {
          setClientesAll(data.items || []);
          setShowLimitWarning(Boolean(data.capped));
        } else {
          setClientesAll([]);
        }
      } catch {
        setClientesAll([]);
      } finally {
        setLoadingAll(false);
      }
    };

    cargarClientesAll();
  }, [localId]);

  const buscarClientes = async () => {
    if (!busqueda || busqueda.length < 2) return;

    // Validar que haya localId
    if (!localId) {
      setErrorMsg("No hay contexto operativo activo.");
      return;
    }

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
    } catch (error) {
      console.error("Error buscando clientes:", error);
      setErrorMsg("Error de conexión");
      setClientes([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <h3 className="text-lg font-bold mb-3">Seleccionar Cliente</h3>

        <div className="space-y-3">
          {/* Consumidor Final */}
          <SunmiButton
            color="amber"
            onClick={() => onSeleccionar(null)}
            className="w-full !py-3"
          >
            Consumidor Final
          </SunmiButton>

          <div className="text-center text-[11px] text-slate-500">
            o seleccionar de la lista
          </div>

          {loadingAll ? (
            <div className="text-center text-slate-400 py-2 text-sm">
              Cargando clientes...
            </div>
          ) : (
            <select
              value={selectedClienteId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedClienteId(id);
                if (!id) return;
                const cliente = clientesAll.find((c) => String(c.id) === id);
                if (cliente) onSeleccionar(cliente);
              }}
              disabled={!localId}
              className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
            >
              <option value="">Seleccionar cliente...</option>
              {clientesAll.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                  {cliente.telefono ? ` - ${cliente.telefono}` : ""}
                  {cliente.documento ? ` (${cliente.documento})` : cliente.email ? ` (${cliente.email})` : ""}
                </option>
              ))}
            </select>
          )}

          {showLimitWarning && (
            <div className="text-center text-amber-400 py-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded px-2">
              Mostrando primeros 500, use búsqueda para más
            </div>
          )}

          <div className="text-center text-[11px] text-slate-500">
            o buscar cliente
          </div>

          {/* Advertencia si no hay localId */}
          {!localId && (
            <div className="text-center text-amber-400 py-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded px-2">
              No hay contexto operativo activo.
            </div>
          )}

          {/* Busqueda */}
          <div className="flex gap-2">
            <SunmiInput
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarClientes()}
              placeholder="Nombre o documento..."
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

          {/* Mensaje de error */}
          {errorMsg && (
            <div className="text-center text-red-400 py-2 text-xs bg-red-500/10 border border-red-500/30 rounded px-2">
              {errorMsg}
            </div>
          )}

          {/* Resultados */}
          {loading ? (
            <div className="text-center text-slate-400 py-4 text-sm">
              Buscando...
            </div>
          ) : clientes.length > 0 ? (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {clientes.map((cliente) => (
                <button
                  key={cliente.id}
                  onClick={() => onSeleccionar(cliente)}
                  className="w-full bg-slate-800/40 p-3 rounded-lg text-left hover:bg-slate-700/60 transition-colors"
                >
                  <div className="font-medium text-sm">{cliente.nombre}</div>
                  {cliente.documento && (
                    <div className="text-[11px] text-slate-400">
                      DNI: {cliente.documento}
                    </div>
                  )}
                  {cliente.telefono && (
                    <div className="text-[11px] text-slate-400">
                      Tel: {cliente.telefono}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : buscado && !loading ? (
            <div className="text-center text-slate-500 py-4 text-sm">
              No se encontraron clientes
            </div>
          ) : null}

          {/* Cerrar */}
          <SunmiButton color="slate" onClick={onCerrar} className="w-full">
            Cancelar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
