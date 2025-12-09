"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ModalAjuste({ open, onClose, producto, local }) {
  const { ui } = useUIConfig();
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
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        padding: ui.helpers.spacing("lg"),
      }}
    >
      <div className="sunmi-card relative w-full max-w-md">
        {/* HEADER */}
        <div className="sunmi-header-amber flex items-center justify-between">
          <span>Ajustar stock</span>
          <button
            style={{
              color: "#0f172a", // slate-900
            }}
            onClick={() => onClose(false)}
          >
            <X size={parseInt(ui.helpers.icon(1.125))} />
          </button>
        </div>

        <div
          style={{
            marginTop: ui.helpers.spacing("lg"),
          }}
        >
          <p
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.8,
              fontSize: ui.helpers.font("sm"),
            }}
          >
            Producto:{" "}
            <strong style={{ color: "var(--sunmi-text)" }}>
              {producto.nombre}
            </strong>
          </p>

          <p
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.8,
              fontSize: ui.helpers.font("sm"),
              marginTop: ui.helpers.spacing("xs"),
            }}
          >
            Local:{" "}
            <strong style={{ color: "var(--sunmi-text)" }}>{local.nombre}</strong>
          </p>

          {/* Inputs */}
          <div
            className="flex flex-col"
            style={{
              gap: ui.helpers.spacing("md"),
              marginTop: ui.helpers.spacing("lg"),
            }}
          >
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
              className="sunmi-input"
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              style={{
                height: parseInt(ui.helpers.controlHeight()) * 2.5,
              }}
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
            Guardar ajuste
          </button>
        </div>
      </div>
    </div>
  );
}
