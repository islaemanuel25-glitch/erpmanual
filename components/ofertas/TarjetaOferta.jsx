"use client";

import { AlertTriangle, Clock } from "lucide-react";
import SunmiPill from "@/components/sunmi/SunmiPill";
import EstadoOfertaPill from "./EstadoOfertaPill";
import { formatearRangoOferta } from "@/lib/ofertas/formato";

// La fila/tarjeta de una oferta en el listado. Mobile first: en el celular es
// una tarjeta apilada, y en escritorio la misma tarjeta se estira.
//
// Lleva exactamente lo que se pidió que se vea sin entrar: nombre, estado,
// vigencia, local, cantidad de productos, condición de pago y el aviso de
// revisión. El aviso va ABAJO y en su propia línea a propósito: si compartiera
// renglón con el resto, en el celular se cortaría, y es lo único de la tarjeta
// que pide una acción.
export default function TarjetaOferta({ oferta, onAbrir }) {
  if (!oferta) return null;

  return (
    <button
      type="button"
      onClick={() => onAbrir?.(oferta)}
      className="w-full text-left sunmi-panel rounded-lg p-3 flex flex-col gap-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold sunmi-text-strong leading-tight">{oferta.nombre}</span>
        <EstadoOfertaPill estado={oferta.estado} />
      </div>

      <div className="text-xs sunmi-text-muted">{formatearRangoOferta(oferta.inicioEn, oferta.finEn)}</div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {oferta.localNombre && <span className="sunmi-text-muted">{oferta.localNombre}</span>}
        <span className="sunmi-text-muted">·</span>
        <span className="sunmi-text-muted">
          {oferta.cantidadProductos} {oferta.cantidadProductos === 1 ? "producto" : "productos"}
        </span>
        <SunmiPill color="slate">{oferta.condicionPagoLabel}</SunmiPill>
      </div>

      {oferta.requiereRevision && (
        <div className="flex items-center gap-1.5 text-xs sunmi-text-warning">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            {oferta.lineasPorRevisar}{" "}
            {oferta.lineasPorRevisar === 1
              ? "producto cambió de costo"
              : "productos cambiaron de costo"}
          </span>
        </div>
      )}

      {oferta.porVencer && !oferta.requiereRevision && (
        <div className="flex items-center gap-1.5 text-xs sunmi-text-accent">
          <Clock size={14} aria-hidden="true" />
          <span>Vence pronto</span>
        </div>
      )}
    </button>
  );
}
