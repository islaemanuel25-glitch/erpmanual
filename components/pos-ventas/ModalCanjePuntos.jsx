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

export default function ModalCanjePuntos({
  saldo,
  pesoPorPunto,
  canjeActual,
  onCanjear,
  onQuitar,
  onCancelar,
}) {
  const [puntos, setPuntos] = useState(
    canjeActual > 0 ? String(canjeActual) : ""
  );

  const puntosNum = Math.min(Math.max(Math.floor(Number(puntos) || 0), 0), saldo);
  const descuento = puntosNum * pesoPorPunto;

  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <h3 className="text-lg font-bold mb-3">Canjear Puntos</h3>

        <div className="space-y-3">
          {/* Saldo disponible */}
          <div className="sunmi-surface-soft p-3 rounded-lg text-center">
            <div className="text-xs sunmi-text-muted">Puntos disponibles</div>
            <div className="text-xl font-bold sunmi-text-link">{saldo}</div>
            <div className="text-[10px] sunmi-text-muted mt-1">
              1 punto = ${formatPrecio(pesoPorPunto)}
            </div>
          </div>

          {/* Input */}
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">
              Puntos a canjear
            </label>
            <SunmiInput
              type="number"
              step="1"
              min="0"
              max={String(saldo)}
              value={puntos}
              onChange={(e) => setPuntos(e.target.value)}
              placeholder="0"
              className="text-xl !text-center"
              autoFocus
            />
          </div>

          {/* Botones rapidos */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "25%", val: Math.floor(saldo * 0.25) },
              { label: "50%", val: Math.floor(saldo * 0.5) },
              { label: "75%", val: Math.floor(saldo * 0.75) },
              { label: "Todo", val: saldo },
            ].map((opt) => (
              <SunmiButton
                key={opt.label}
                color={puntosNum === opt.val && opt.val > 0 ? "amber" : "cyan"}
                onClick={() => setPuntos(String(opt.val))}
                className="text-sm py-1.5"
                disabled={opt.val <= 0}
              >
                {opt.label}
              </SunmiButton>
            ))}
          </div>

          {/* Preview */}
          {puntosNum > 0 && (
            <div className="sunmi-badge-link p-3 rounded-lg text-center">
              <div className="text-xs">
                {puntosNum} puntos = descuento de -${formatPrecio(descuento)}
              </div>
              <div className="text-2xl font-bold sunmi-text-link mt-1">
                -${formatPrecio(descuento)}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <SunmiButton color="slate" onClick={onCancelar} className="flex-1">
              Cancelar
            </SunmiButton>
            {canjeActual > 0 && (
              <SunmiButton color="red" onClick={onQuitar} className="flex-1">
                Quitar
              </SunmiButton>
            )}
            <SunmiButton
              color="amber"
              onClick={() => onCanjear(puntosNum)}
              disabled={puntosNum <= 0}
              className="flex-1 font-bold"
            >
              Canjear
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}
