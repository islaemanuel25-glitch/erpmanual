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

export default function ModalPagoEfectivo({ total, onConfirmar, onCancelar }) {
  const [pagaCon, setPagaCon] = useState("");
  const pagaConNum = Number(pagaCon) || 0;
  const vuelto = pagaConNum >= total ? pagaConNum - total : 0;

  // Montos sugeridos redondeados
  const montosSugeridos = [
    Math.ceil(total / 1000) * 1000,
    Math.ceil(total / 5000) * 5000,
    Math.ceil(total / 10000) * 10000,
  ]
    .filter((m, i, arr) => m > total && arr.indexOf(m) === i)
    .slice(0, 3);

  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">Pago en Efectivo</h3>

        <div className="space-y-4">
          {/* Total */}
          <div className="pos-bg-panel p-4 rounded-lg">
            <div className="text-sm pos-text-muted">Total a cobrar</div>
            <div className="text-5xl font-black pos-text-accent">
              ${formatPrecio(total)}
            </div>
          </div>

          {/* Monto que paga */}
          <div>
            <label className="text-sm pos-text-muted mb-1 block">
              Cliente paga con:
            </label>
            <SunmiInput
              type="number"
              value={pagaCon}
              onChange={(e) => setPagaCon(e.target.value)}
              placeholder="0.00"
              className="text-xl"
              autoFocus
            />
          </div>

          {/* Botones rapidos */}
          {montosSugeridos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {montosSugeridos.map((monto) => (
                <SunmiButton
                  key={monto}
                  color="cyan"
                  onClick={() => setPagaCon(String(monto))}
                  className="!text-sm !py-3"
                >
                  ${monto.toLocaleString("es-AR")}
                </SunmiButton>
              ))}
            </div>
          )}

          {/* Pago exacto — confirma al instante */}
          <SunmiButton
            color="amber"
            onClick={() => onConfirmar({ pagaCon: total, vuelto: 0 })}
            className="!text-base !py-3 w-full !font-bold"
          >
            PAGO EXACTO ${formatPrecio(total)}
          </SunmiButton>

          {/* Vuelto */}
          {pagaConNum >= total && pagaConNum > 0 && (
            <div className="pos-success-box p-3 rounded-lg">
              <div className="text-sm pos-text-success-soft">VUELTO</div>
              <div className="text-5xl font-black tracking-wide pos-text-success">
                ${formatPrecio(vuelto)}
              </div>
            </div>
          )}

          {pagaConNum > 0 && pagaConNum < total && (
            <div className="text-sm pos-text-danger">
              El monto debe ser mayor o igual al total
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-2">
            <SunmiButton color="slate" onClick={onCancelar} className="flex-1 !py-3">
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="amber"
              onClick={() =>
                onConfirmar({ pagaCon: pagaConNum, vuelto })
              }
              disabled={!pagaConNum || pagaConNum < total}
              className="flex-1 !font-bold !py-3"
            >
              Confirmar
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}
