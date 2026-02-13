"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ModalCliente({ onSeleccionar, onCerrar }) {
  const [busqueda, setBusqueda] = useState("");
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);

  const buscarClientes = async () => {
    if (!busqueda || busqueda.length < 2) return;

    setLoading(true);
    setBuscado(true);
    try {
      const res = await fetch(
        `/api/clientes/buscar?q=${encodeURIComponent(busqueda)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      setClientes(data.items || []);
    } catch (error) {
      console.error("Error buscando clientes:", error);
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
            o buscar cliente
          </div>

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
              disabled={!busqueda || busqueda.length < 2}
            >
              Buscar
            </SunmiButton>
          </div>

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
