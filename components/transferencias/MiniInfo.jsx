"use client";

// Panel expandible bajo la fila. Complementa la fila en lugar de repetirla: la
// fila ya muestra fecha de envío, ítems, enviada, recibida y estado, así que acá
// van los datos que NO entran arriba (recepción, faltante, importe).
//
// Antes decía "Correcta" en toda transferencia recibida porque el listado no
// serializaba `tieneDiferencias` y el valor llegaba `undefined`. Ahora el campo
// llega de verdad y el estado se lee del dato, no de la ausencia de dato.

import SunmiCard from "@/components/sunmi/SunmiCard";

const TZ_AR = "America/Argentina/Cordoba";

function fechaHoraAR(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ_AR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function Dato({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
      <div className="text-[13px] sunmi-text-strong leading-tight">{children}</div>
    </div>
  );
}

export default function MiniInfo({ t, formatCantidad = (v) => String(v ?? ""), money }) {
  const sinRecepcion = t.cantidadRecibida == null;
  const faltante = sinRecepcion
    ? 0
    : Number(t.cantidadEnviada || 0) - Number(t.cantidadRecibida || 0);

  const recibida = t.estado === "Recibida";

  return (
    <SunmiCard className="p-3 my-1">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Dato label="Creada">{fechaHoraAR(t.createdAt)}</Dato>
        <Dato label="Recepción">{fechaHoraAR(t.fechaRecepcion)}</Dato>
        <Dato label="Importe">
          <span className="sunmi-text-accent font-semibold font-mono tabular-nums">
            {money ? money(t.totalCosto) : Number(t.totalCosto || 0).toFixed(2)}
          </span>
        </Dato>
        <Dato label="Faltante">
          {sinRecepcion ? (
            <span className="sunmi-text-muted">Sin recepción</span>
          ) : faltante > 0 ? (
            <span className="sunmi-text-warning font-semibold font-mono tabular-nums">
              {formatCantidad(faltante)}
            </span>
          ) : (
            <span className="sunmi-text-success font-semibold">Sin faltante</span>
          )}
        </Dato>
      </div>

      {/* El veredicto de la recepción solo tiene sentido una vez confirmada. */}
      {recibida && (
        <div className="mt-3 pt-3 border-t sunmi-divider">
          {t.tieneDiferencias ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium sunmi-state-warning sunmi-text-accent">
              ⚠ Recibida con diferencias
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium sunmi-state-success sunmi-text-success">
              Recibida sin diferencias
            </span>
          )}
        </div>
      )}
    </SunmiCard>
  );
}
