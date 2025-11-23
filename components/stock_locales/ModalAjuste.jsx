"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function ModalAjuste({ open, onClose, producto, local }) {
  const [cantidad, setCantidad] = useState("");
  const [tipo, setTipo] = useState("sumar");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setCantidad("");
      setTipo("sumar");
      setMotivo("");
    }
  }, [open]);

  if (!open || !producto) return null;

  const guardar = async () => {
    try {
      const body = {
        modo: "ajuste",
        localId: local.id,
        productoLocalId: producto.id,
        cantidad: Number(cantidad),
        tipo,
        motivo,
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
        alert(json.error || "Error ajustando stock");
      }
    } catch (e) {
      console.error("AJUSTE ERROR:", e);
      alert("Error inesperado");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="sunmi-card relative w-full max-w-md">

        {/* HEADER */}
        <div className="sunmi-header-amber flex items-center justify-between">
          <span>Ajustar stock</span>
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

            {/* Cantidad */}
            <input
              type="number"
              className="sunmi-input"
              placeholder="Cantidad"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />

            {/* Tipo */}
            <select
              className="sunmi-input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="sumar">Sumar</option>
              <option value="restar">Restar</option>
            </select>

            {/* Motivo */}
            <textarea
              className="sunmi-input h-20"
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {/* Botón guardar */}
          <button
            className="sunmi-btn sunmi-btn-cyan w-full mt-5 py-2 text-[13px] font-bold"
            onClick={guardar}
          >
            Guardar ajuste
          </button>
        </div>
      </div>
    </div>
  );
}
