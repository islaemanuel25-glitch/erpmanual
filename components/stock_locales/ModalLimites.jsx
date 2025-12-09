"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ModalLimites({ open, onClose, producto, local }) {
  const { ui } = useUIConfig();
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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      style={{
        padding: ui.helpers.spacing("lg"),
      }}
    >
      <div className="sunmi-card relative w-full max-w-md">
        {/* HEADER */}
        <div className="sunmi-header-amber flex items-center justify-between">
          <span>Límites de stock</span>
          <button className="text-slate-900" onClick={() => onClose(false)}>
            <X size={parseInt(ui.helpers.icon(1.125))} />
          </button>
        </div>

        <div
          style={{
            marginTop: ui.helpers.spacing("lg"),
          }}
        >
          <p
            className="text-slate-300"
            style={{
              fontSize: ui.helpers.font("sm"),
            }}
          >
            Producto: <strong className="text-slate-100">{producto.nombre}</strong>
          </p>

          <p
            className="text-slate-300"
            style={{
              fontSize: ui.helpers.font("sm"),
              marginTop: ui.helpers.spacing("xs"),
            }}
          >
            Local: <strong className="text-slate-100">{local.nombre}</strong>
          </p>

          {/* Inputs */}
          <div
            className="flex flex-col"
            style={{
              gap: ui.helpers.spacing("md"),
              marginTop: ui.helpers.spacing("lg"),
            }}
          >
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
            className="sunmi-btn sunmi-btn-cyan w-full font-bold"
            style={{
              marginTop: parseInt(ui.helpers.spacing("lg")) * 1.25,
              paddingTop: ui.helpers.spacing("sm"),
              paddingBottom: ui.helpers.spacing("sm"),
              fontSize: ui.helpers.font("sm"),
            }}
            onClick={guardar}
          >
            Guardar límites
          </button>
        </div>
      </div>
    </div>
  );
}
