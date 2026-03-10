"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ModalPesoKg({ producto, onConfirmar, onCancelar }) {
  const precioPorKg = Number(producto.precioVenta) || 0;
  const [modo, setModo] = useState("peso"); // "peso" | "precio"
  const [valor, setValor] = useState("");

  const valorNum = Number(valor) || 0;

  // Cálculos según modo
  const peso = modo === "peso" ? valorNum : precioPorKg > 0 ? valorNum / precioPorKg : 0;
  const totalCalc = modo === "peso" ? valorNum * precioPorKg : valorNum;
  const pesoRedondeado = Math.round(peso * 1000) / 1000;

  const valido = pesoRedondeado >= 0.001 && totalCalc > 0;

  const handleConfirmar = () => {
    if (!valido) return;
    onConfirmar(pesoRedondeado);
  };

  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <h3 className="text-lg font-bold mb-1">{producto.nombre}</h3>
        <div className="text-xs pos-text-muted mb-4">
          Precio por kg: <span className="font-semibold">${formatPrecio(precioPorKg)}</span>
        </div>

        {/* Selector de modo */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setModo("peso"); setValor(""); }}
            className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
              modo === "peso" ? "sunmi-pos-btn-primary" : "sunmi-pos-btn-secondary"
            }`}
          >
            POR PESO
          </button>
          <button
            type="button"
            onClick={() => { setModo("precio"); setValor(""); }}
            className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
              modo === "precio" ? "sunmi-pos-btn-primary" : "sunmi-pos-btn-secondary"
            }`}
          >
            POR PRECIO
          </button>
        </div>

        {/* Input */}
        <div className="mb-3">
          <label className="text-[11px] pos-text-muted mb-1 block">
            {modo === "peso" ? "Peso (kg)" : "Importe ($)"}
          </label>
          <SunmiInput
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(",", "."))}
            placeholder={modo === "peso" ? "0.000" : "0.00"}
            className="text-xl"
            autoFocus
          />
        </div>

        {/* Resultado calculado */}
        {valorNum > 0 && (
          <div className="pos-bg-panel p-3 rounded-lg mb-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="pos-text-muted">Peso</span>
              <span className="font-medium">{pesoRedondeado.toFixed(3)} kg</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="pos-text-muted">Total</span>
              <span className="font-bold pos-text-accent text-lg">${formatPrecio(totalCalc)}</span>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          <SunmiButton color="slate" onClick={onCancelar} className="flex-1">
            Cancelar
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={handleConfirmar}
            disabled={!valido}
            className="flex-1 !font-bold"
          >
            Agregar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
