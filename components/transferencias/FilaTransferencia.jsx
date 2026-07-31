"use client";

// Fila de la tabla desktop. Calcada de la fila de Ventas
// (app/modulos/reportes-ventas/page.jsx): mismo `align-middle sunmi-row-hover
// transition-colors border-t sunmi-divider`, mismo padding `px-2.5 py-3` en
// todas las celdas, fecha en mono 11px muted a la izquierda, dos celdas de
// "dato protagonista + subtítulo muted", importe en mono bold 14px como ancla
// derecha y botón ámbar al final.
//
// La fila NO se despliega ni navega: el detalle completo vive en su propia
// página (/modulos/transferencias/[id]) y el único acceso es el botón. Se
// conserva el hover como afordancia de lectura, sin cursor-pointer, para que no
// aparente ser desplegable ni clickeable.

import SunmiButton from "@/components/sunmi/SunmiButton";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "./EstadoTransferenciaBadge";

export default function FilaTransferencia({
  t,
  columns,
  onVer,
  fechaHoraAR,
  formatCantidad,
  money,
}) {
  // `null` = sin recepción registrada → "—"; `0` = llegó vacío → "0".
  const sinRecepcion = t.cantidadRecibida == null;
  const faltante = sinRecepcion
    ? 0
    : Number(t.cantidadEnviada || 0) - Number(t.cantidadRecibida || 0);

  return (
    <tr className="align-middle sunmi-row-hover transition-colors border-t sunmi-divider">
      {columns.fecha && (
        <td className="px-2.5 py-3 font-mono text-[11px] whitespace-nowrap sunmi-text-muted">
          {fechaHoraAR(t.fechaEnvio ?? t.createdAt)}
        </td>
      )}

      {/* Nº protagonista + autor del remito debajo, igual que "Cliente / Ticket".
          El tope baja en lg y se suelta en xl: a 1024 px las nueve columnas
          compiten por 874 px y sin tope el texto largo empuja la tabla. */}
      {columns.numero && (
        <td className="px-2.5 py-3 max-w-[110px] xl:max-w-[180px]">
          <div className="font-semibold sunmi-text-strong truncate text-[13px]">
            #{t.id}
          </div>
          <div className="text-[11px] sunmi-text-muted truncate">
            {t.creadaPorNombre || "—"}
          </div>
        </td>
      )}

      {/* Origen protagonista + destino como subtítulo muted, igual que
          "Local / Usuario": una sola celda, no dos columnas separadas. */}
      {columns.ruta && (
        <td className="px-2.5 py-3 max-w-[130px] xl:max-w-[200px]">
          <div className="truncate sunmi-text-strong">
            {t.origenNombre || "—"}
            {t.origenEsDeposito && (
              <span className="sunmi-text-accent text-[10px] ml-1">(Dep.)</span>
            )}
          </div>
          <div className="text-[11px] sunmi-text-muted truncate">
            → {t.destinoNombre || "—"}
          </div>
        </td>
      )}

      {columns.items && (
        <td className="px-2.5 py-3 text-center tabular-nums">
          {formatCantidad(t.cantidadItems)}
        </td>
      )}

      {columns.enviada && (
        <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
          {formatCantidad(t.cantidadEnviada)}
        </td>
      )}

      {columns.recibida && (
        <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
          <div className={sinRecepcion ? "sunmi-text-muted" : "sunmi-text-strong"}>
            {sinRecepcion ? "—" : formatCantidad(t.cantidadRecibida)}
          </div>
          {faltante > 0 && (
            <div className="text-[11px] sunmi-text-warning">
              −{formatCantidad(faltante)}
            </div>
          )}
        </td>
      )}

      {columns.estado && (
        <td className="px-2.5 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <EstadoTransferenciaBadge estado={t.estado} />
            <DiferenciasBadge estado={t.estado} tieneDiferencias={t.tieneDiferencias} />
          </div>
        </td>
      )}

      {/* Ancla derecha de la fila, con el mismo peso que el "Total" de Ventas. */}
      {columns.importe && (
        <td className="px-2.5 py-3 text-right font-mono font-bold text-[14px] sunmi-text-strong whitespace-nowrap tabular-nums">
          {money ? money(t.totalCosto) : t.totalCosto}
        </td>
      )}

      {columns.acciones && (
        <td className="px-2.5 py-3 text-right">
          <SunmiButton
            color="amber"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => onVer?.(t.id)}
          >
            Ver transferencia
          </SunmiButton>
        </td>
      )}
    </tr>
  );
}
