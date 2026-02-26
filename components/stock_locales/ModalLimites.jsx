"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { toUnidades, fromUnidades } from "@/lib/conversiones/stock";

export default function ModalLimites({ open, onClose, producto, local }) {
  const [minimo, setMinimo] = useState("");
  const [maximo, setMaximo] = useState("");

  const factorPack = Number(producto?.factorPack || producto?.factor_pack || 1);
  const unidadMedida = producto?.unidadMedida || producto?.unidad_medida || "unidad";
  const esDeposito = local?.esDeposito || local?.es_deposito || false;
  const usarBultos = esDeposito && factorPack > 1 && (unidadMedida === "pack" || unidadMedida === "cajon");

  useEffect(() => {
    if (open && producto) {
      if (usarBultos) {
        // Mostrar en bultos: convertir unidades → bultos
        const minUds = Number(producto.stockMin || 0);
        const maxUds = Number(producto.stockMax || 0);
        setMinimo(minUds ? fromUnidades({ unidades: minUds, factorPack }).bultos : "");
        setMaximo(maxUds ? fromUnidades({ unidades: maxUds, factorPack }).bultos : "");
      } else {
        setMinimo(producto.stockMin || "");
        setMaximo(producto.stockMax || "");
      }
    }
  }, [open, producto]);

  if (!open || !producto) return null;

  const guardar = async () => {
    try {
      // Si depósito pack, convertir bultos → unidades antes de enviar
      const minVal = minimo === "" ? null : Number(minimo);
      const maxVal = maximo === "" ? null : Number(maximo);

      const body = {
        modo: "limites",
        localId: local.id,
        productoLocalId: producto.id,
        nuevoMin: usarBultos && minVal != null
          ? toUnidades({ cantidad: minVal, unidad: "BULTO", factorPack })
          : minVal,
        nuevoMax: usarBultos && maxVal != null
          ? toUnidades({ cantidad: maxVal, unidad: "BULTO", factorPack })
          : maxVal,
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
            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">
                {usarBultos ? "Stock mínimo (bultos)" : "Stock mínimo"}
              </label>
              <SunmiInput
                type="number"
                placeholder={usarBultos ? "0 bultos" : "0"}
                min={0}
                step={unidadMedida === "kg" ? 0.001 : 1}
                value={minimo}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (unidadMedida !== "kg") {
                    setMinimo(raw === "" ? "" : String(parseInt(raw, 10) || 0));
                  } else {
                    setMinimo(raw);
                  }
                }}
              />
            </div>

            {/* Max */}
            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">
                {usarBultos ? "Stock máximo (bultos)" : "Stock máximo"}
              </label>
              <SunmiInput
                type="number"
                placeholder={usarBultos ? "0 bultos" : "0"}
                min={0}
                step={unidadMedida === "kg" ? 0.001 : 1}
                value={maximo}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (unidadMedida !== "kg") {
                    setMaximo(raw === "" ? "" : String(parseInt(raw, 10) || 0));
                  } else {
                    setMaximo(raw);
                  }
                }}
              />
            </div>
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
