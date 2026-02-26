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

export default function ModalDescuento({
  subtotal,
  descuentoActual,
  onAplicar,
  onQuitar,
  onCancelar,
}) {
  const [tipo, setTipo] = useState("porcentaje");
  const [valor, setValor] = useState(
    descuentoActual?.valor ? String(descuentoActual.valor) : ""
  );

  const valorNum = Number(valor) || 0;
  const descuento =
    tipo === "porcentaje"
      ? (subtotal * Math.min(valorNum, 100)) / 100
      : Math.min(valorNum, subtotal);
  const totalConDescuento = subtotal - descuento;

  const porcentajesRapidos = [5, 10, 15, 20];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <h3 className="text-lg font-bold mb-3">Aplicar Descuento</h3>

        <div className="space-y-3">
          {/* Subtotal */}
          <div className="pos-bg-panel p-3 rounded-lg text-center">
            <div className="text-xs pos-text-muted">Subtotal</div>
            <div className="text-xl font-bold">${formatPrecio(subtotal)}</div>
          </div>

          {/* Tipo */}
          <div className="flex gap-2">
            <button
              onClick={() => { setTipo("porcentaje"); setValor(""); }}
              className={`flex-1 py-2 rounded font-medium text-sm transition-colors ${
                tipo === "porcentaje" ? "pos-tab-active" : "pos-tab"
              }`}
            >
              Porcentaje %
            </button>
            <button
              onClick={() => { setTipo("fijo"); setValor(""); }}
              className={`flex-1 py-2 rounded font-medium text-sm transition-colors ${
                tipo === "fijo" ? "pos-tab-active" : "pos-tab"
              }`}
            >
              Monto fijo $
            </button>
          </div>

          {/* Input */}
          <SunmiInput
            type="number"
            step="0.01"
            min="0"
            max={tipo === "porcentaje" ? "100" : String(subtotal)}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={tipo === "porcentaje" ? "10" : "1000"}
            className="text-xl !text-center"
            autoFocus
          />

          {/* Porcentajes rapidos */}
          {tipo === "porcentaje" && (
            <div className="grid grid-cols-4 gap-2">
              {porcentajesRapidos.map((p) => (
                <SunmiButton
                  key={p}
                  color={valorNum === p ? "amber" : "cyan"}
                  onClick={() => setValor(String(p))}
                  className="!text-sm !py-1.5"
                >
                  {p}%
                </SunmiButton>
              ))}
            </div>
          )}

          {/* Preview */}
          {descuento > 0 && (
            <div className="pos-success-box p-3 rounded-lg text-center">
              <div className="text-xs pos-text-success-soft">
                Descuento: -${formatPrecio(descuento)}
                {tipo === "porcentaje" && ` (${valorNum}%)`}
              </div>
              <div className="text-2xl font-bold pos-text-success mt-1">
                ${formatPrecio(totalConDescuento)}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <SunmiButton color="slate" onClick={onCancelar} className="flex-1">
              Cancelar
            </SunmiButton>
            {descuentoActual && (
              <SunmiButton
                color="red"
                onClick={onQuitar}
                className="flex-1"
              >
                Quitar
              </SunmiButton>
            )}
            <SunmiButton
              color="amber"
              onClick={() => onAplicar(descuento, tipo, valorNum)}
              disabled={descuento <= 0}
              className="flex-1 !font-bold"
            >
              Aplicar
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}
