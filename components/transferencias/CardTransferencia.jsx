"use client";

// Card de transferencia para mobile y tablet (hasta 1023 px). Calcada de la card
// de Ventas (app/modulos/reportes-ventas/page.jsx): mismo contenedor
// `sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5`, número
// protagonista arriba, datos secundarios en muted y botón de ancho completo.
//
// La composición es FIJA: la configuración de columnas solo aplica a la tabla
// desktop, donde hay ancho para elegir. Acá esconder campos dejaría cards
// incompletas sin que se note por qué.

import SunmiButton from "@/components/sunmi/SunmiButton";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "./EstadoTransferenciaBadge";

export default function CardTransferencia({ t, onVer, fechaHoraAR, formatCantidad }) {
  // `null` = todavía no se registró recepción → "—".
  // `0`    = se registró que no llegó nada     → "0".
  const sinRecepcion = t.cantidadRecibida == null;
  const faltante = sinRecepcion
    ? 0
    : Number(t.cantidadEnviada || 0) - Number(t.cantidadRecibida || 0);

  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
      {/* Nº protagonista + indicador de diferencias a la derecha */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-semibold sunmi-text-strong text-[15px] leading-tight">
          #{t.id}
        </div>
        <DiferenciasBadge estado={t.estado} tieneDiferencias={t.tieneDiferencias} />
      </div>

      <div className="text-[11px] sunmi-text-muted">
        {fechaHoraAR(t.fechaEnvio ?? t.createdAt)}
      </div>

      {/* Origen → destino: se trunca por separado para que un nombre largo no
          empuje al otro fuera de la card. */}
      <div className="flex items-center gap-1.5 text-[12px] min-w-0">
        <span className="truncate sunmi-text-strong">
          {t.origenNombre || "—"}
          {t.origenEsDeposito && <span className="sunmi-text-accent text-[10px] ml-1">(Dep.)</span>}
        </span>
        <span className="shrink-0 sunmi-text-muted">→</span>
        <span className="truncate sunmi-text-strong">{t.destinoNombre || "—"}</span>
      </div>

      <div className="text-[12px] sunmi-text-muted">
        {formatCantidad(t.cantidadItems)} ítem{t.cantidadItems === 1 ? "" : "s"}
        {" · "}Enviada{" "}
        <span className="font-mono tabular-nums sunmi-text-strong">
          {formatCantidad(t.cantidadEnviada)}
        </span>
        {" · "}Recibida{" "}
        <span className="font-mono tabular-nums sunmi-text-strong">
          {sinRecepcion ? "—" : formatCantidad(t.cantidadRecibida)}
        </span>
      </div>

      {faltante > 0 && (
        <div className="text-[11px] sunmi-text-warning font-medium">
          Faltante: {formatCantidad(faltante)}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <EstadoTransferenciaBadge estado={t.estado} />
      </div>

      <SunmiButton color="amber" size="sm" onClick={onVer} className="w-full mt-1">
        Ver
      </SunmiButton>
    </div>
  );
}
