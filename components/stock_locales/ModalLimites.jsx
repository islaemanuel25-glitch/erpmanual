"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function ModalLimites({ open, onClose, producto, local }) {
  const [minimo, setMinimo] = useState("");
  const [maximo, setMaximo] = useState("");

  useEffect(() => {
    if (open && producto) {
      setMinimo(producto.stockMin || "");
      setMaximo(producto.stockMax || "");
    }
  }, [open, producto]);

  if (!open || !producto) return null;

  const guardar = async () => {
    try {
      const body = {
        modo: "limites",
        localId: local.id,
        productoLocalId: producto.id,
        nuevoMin: minimo === "" ? null : Number(minimo),
        nuevoMax: maximo === "" ? null : Number(maximo),
      };

      const res = await fetch("/api/stock_locales/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.ok) {
        onClose(true);
      } else {
        alert(json.error || "Error guardando límites");
      }
    } catch (e) {
      console.error("LÍMITES ERROR:", e);
      alert("Error inesperado");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="sunmi-card relative w-full max-w-md">

        {/* HEADER */}
        <div className="sunmi-header-amber flex items-center justify-between">
          <span>Límites de stock</span>
          <button className="text-slate-900" onClick={() => onClose(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          <p className="text-slate-300 text-[13px]">
            Producto: <strong className="text-slate-100">{producto.nombre}</strong>
          </p>

          <p className="text-slate-300 text-[13px] mt-1">
            Local: <strong className="text-slate-100">{local.nombre}</strong>
          </p>

          {/* Inputs */}
          <div className="flex flex-col gap-3 mt-4">

            {/* Min */}
            <input
              type="number"
              className="sunmi-input"
              placeholder="Stock mínimo"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
            />

            {/* Max */}
            <input
              type="number"
              className="sunmi-input"
              placeholder="Stock máximo"
              value={maximo}
              onChange={(e) => setMaximo(e.target.value)}
            />
          </div>

          {/* Botón guardar */}
          <button
            className="sunmi-btn sunmi-btn-cyan w-full mt-5 py-2 text-[13px] font-bold"
            onClick={guardar}
          >
            Guardar límites
          </button>
        </div>
      </div>
    </div>
  );
}
