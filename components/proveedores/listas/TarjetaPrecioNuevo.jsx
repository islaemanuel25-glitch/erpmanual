"use client";

// UN PRODUCTO CON SU PRECIO NUEVO: nombre, "$ hoy → $ nuevo" y el % con la regla
// de colores de siempre (`tonoDelPorcentaje`).
//
// Salió de `HojaBajasDePrecio` tal cual el 2026-10-24, cuando "Te quedan
// precios sin aplicar" tuvo que mostrar lo mismo para cada producto pendiente.
// Allá no lleva acción; acá, la hoja de pendientes pone su «✓ Usar» arriba a la
// derecha (`accion`). Sin `accion`, el marcado es el de antes, letra por letra.

import SunmiCard from "@/components/sunmi/SunmiCard";
import { money, pct, tonoDelPorcentaje } from "@/components/proveedores/listas/PiezasPantallas";

/**
 * @param nombre, costoHoy, costoNuevo, variacionPct
 * @param accion  opcional: el botón de arriba a la derecha
 */
export default function TarjetaPrecioNuevo({ nombre, costoHoy, costoNuevo, variacionPct, accion = null }) {
  const titulo = <p className="text-sm3 font-semibold sunmi-text-strong break-words">{nombre}</p>;
  return (
    <SunmiCard className="p-3">
      {accion ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">{titulo}</div>
          {accion}
        </div>
      ) : (
        titulo
      )}
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-sm2 tabular-nums sunmi-text-muted">
          {money(costoHoy)} → {money(costoNuevo)}
        </span>
        <span className={`shrink-0 text-sm2 font-semibold tabular-nums ${tonoDelPorcentaje(variacionPct)}`}>
          {pct(variacionPct)}
        </span>
      </div>
    </SunmiCard>
  );
}
