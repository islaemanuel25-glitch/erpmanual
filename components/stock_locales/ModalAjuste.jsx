"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { toUnidades, fromUnidades } from "@/lib/conversiones/stock";

export default function ModalAjuste({ open, onClose, producto, local }) {
  // Hooks deben ejecutarse siempre, antes de cualquier return condicional
  const [bultos, setBultos] = useState("");
  const [sueltas, setSueltas] = useState("");
  const [tipo, setTipo] = useState("sumar");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setBultos("");
      setSueltas("");
      setTipo("sumar");
      setMotivo("");
    }
  }, [open]);

  // Validación después de los hooks
  if (!open || !producto) return null;

  const factorPack = Number(producto.factorPack || producto.factor_pack || 1);
  const modoStock = producto.modoStock || producto.modo_stock || "BULTO";
  const esDeposito = local?.esDeposito || local?.es_deposito || false;
  const usarBultos = esDeposito && modoStock === "BULTO" && factorPack > 1;

  // Calcular total en unidades
  const totalUnidades = usarBultos
    ? toUnidades({
        cantidad: Number(bultos || 0),
        unidad: "BULTO",
        factorPack,
      }) + Number(sueltas || 0)
    : Number(sueltas || bultos || 0);

  const guardar = async () => {
    if (totalUnidades <= 0) {
      alert("La cantidad debe ser mayor a 0");
      return;
    }

    try {
      const body = {
        modo: "ajuste",
        localId: local.id,
        productoLocalId: producto.id,
        cantidad: totalUnidades, // Siempre en unidades para el backend
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
            {usarBultos ? (
              <>
                {/* Bultos + Sueltas */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Bultos
                    </label>
                    <SunmiInput
                      type="number"
                      placeholder="0"
                      min={0}
                      value={bultos}
                      onChange={(e) => setBultos(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">
                      Sueltas
                    </label>
                    <SunmiInput
                      type="number"
                      placeholder="0"
                      min={0}
                      max={factorPack - 1}
                      value={sueltas}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 0 && val < factorPack) {
                          setSueltas(e.target.value);
                        }
                      }}
                    />
                  </div>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Total: <strong className="text-slate-200">{totalUnidades} unidades</strong>
                </p>
              </>
            ) : (
              <>
                {/* Solo unidades */}
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Cantidad (unidades)
                  </label>
                  <SunmiInput
                    type="number"
                    placeholder="0"
                    min={0}
                    value={sueltas || bultos}
                    onChange={(e) => {
                      setSueltas(e.target.value);
                      setBultos("");
                    }}
                  />
                </div>
              </>
            )}

            {/* Tipo */}
            <SunmiSelect
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="sumar">Sumar</option>
              <option value="restar">Restar</option>
            </SunmiSelect>

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
