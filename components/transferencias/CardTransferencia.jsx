"use client";

// Card de transferencia para mobile y tablet (hasta 1023 px). Calcada de la card
// de Ventas (app/modulos/reportes-ventas/page.jsx), campo por campo:
//
//   Ventas                                   Transferencias
//   ─────────────────────────────────────    ────────────────────────────────
//   cliente (15px bold)  ·  total (17px)     origen → destino  ·  importe
//   Ticket #id · fecha        (11px muted)   Transferencia #id · fecha
//   local · vendedor · ítems  (12px muted)   autor · ítems · enviada · recibida
//   badges de estado                          badges de estado
//   botón ámbar de ancho completo             botón ámbar de ancho completo
//
// La composición es FIJA: la configuración de columnas solo aplica a la tabla
// desktop, donde hay ancho para elegir. Acá esconder campos dejaría cards
// incompletas sin que se note por qué.

import SunmiButton from "@/components/sunmi/SunmiButton";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "./EstadoTransferenciaBadge";

export default function CardTransferencia({ t, onVer, fechaHoraAR, formatCantidad, money }) {
  // `null` = todavía no se registró recepción → "—".
  // `0`    = se registró que no llegó nada     → "0".
  const sinRecepcion = t.cantidadRecibida == null;
  const faltante = sinRecepcion
    ? 0
    : Number(t.cantidadEnviada || 0) - Number(t.cantidadRecibida || 0);

  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
      {/* Ruta protagonista + importe como ancla derecha (el lugar del total de
          Ventas). El nº de remito baja a la línea secundaria, igual que el
          ticket. */}
      <div className="flex items-start justify-between gap-3">
        {/* `line-clamp-2` en vez del `truncate` de Ventas: allá el título es un
            solo nombre y nunca se corta, acá son dos y con truncate el destino
            desaparecía por completo desde 768 px para abajo. */}
        <div className="min-w-0 font-semibold sunmi-text-strong text-[15px] leading-tight line-clamp-2">
          {t.origenNombre || "—"}
          {t.origenEsDeposito && <span className="sunmi-text-accent text-[10px] ml-1">(Dep.)</span>}
          <span className="sunmi-text-muted"> → </span>
          {t.destinoNombre || "—"}
        </div>
        <div className="font-mono font-bold text-[17px] sunmi-text-strong whitespace-nowrap tabular-nums">
          {money ? money(t.totalCosto) : t.totalCosto}
        </div>
      </div>

      <div className="text-[11px] sunmi-text-muted">
        Transferencia #{t.id} · {fechaHoraAR(t.fechaEnvio ?? t.createdAt)}
      </div>

      {/* Sin `truncate`: la línea de Ventas es corta y nunca se corta, la nuestra
          lleva cantidades y cortarla escondía la recibida. Envuelve en vez de
          perder el dato. */}
      <div className="text-[12px] sunmi-text-muted">
        {t.creadaPorNombre || "—"} · {formatCantidad(t.cantidadItems)} ítem
        {t.cantidadItems === 1 ? "" : "s"} · Enviada{" "}
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
        <DiferenciasBadge estado={t.estado} tieneDiferencias={t.tieneDiferencias} />
      </div>

      <SunmiButton color="amber" size="sm" onClick={onVer} className="w-full mt-1">
        Ver transferencia
      </SunmiButton>
    </div>
  );
}
