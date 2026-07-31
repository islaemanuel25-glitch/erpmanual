"use client";

// Encabezado del detalle. Muestra quién envió y quién recibió, las fechas en
// hora argentina explícita y el estado con el mismo mapeo visual que el listado.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "./EstadoTransferenciaBadge";

const TZ_AR = "America/Argentina/Cordoba";

// Antes se usaba `toLocaleString()` sin zona: la hora dependía del huso del
// navegador, así que la misma transferencia se leía distinto en un equipo con
// otra configuración regional.
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
      <div className="text-[13px] sunmi-text-strong leading-tight break-words">{children}</div>
    </div>
  );
}

export default function TransferenciaHeader({ item, id, me }) {
  if (!item) return null;

  const handleImprimirTicket = async () => {
    const { default: imprimirTicketTransferencia } = await import(
      "@/lib/transferencias/imprimirTicketTransferencia"
    );
    imprimirTicketTransferencia(item, me);
  };

  const confirmadores = Array.isArray(item.confirmadores) ? item.confirmadores : [];

  return (
    <div className="space-y-2">
      {/* BOTONES PDF + TICKET POS */}
      <div className="flex flex-wrap gap-2 px-2 py-2">
        <a href={`/api/transferencias/pdf?id=${id}`} target="_blank">
          <SunmiButton color="amber">PDF Envío</SunmiButton>
        </a>
        <a href={`/api/transferencias/pdf-recepcion?id=${id}`} target="_blank">
          <SunmiButton color="cyan">PDF Recepción</SunmiButton>
        </a>
        <SunmiButton color="slate" onClick={handleImprimirTicket}>
          Imprimir ticket POS
        </SunmiButton>
      </div>

      <SunmiSeparator label="Datos generales" />

      <SunmiCard className="mx-1 p-3 space-y-3">
        {/* Encabezado: número + estado */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-base font-bold sunmi-text-strong leading-tight">
              Transferencia #{item.id}
            </div>
            <div className="text-[12px] sunmi-text-muted leading-tight truncate">
              {item.origen?.nombre || "—"}
              {item.origen?.esDeposito && (
                <span className="sunmi-text-accent text-[10px] ml-1">(Dep.)</span>
              )}
              {" → "}
              {item.destino?.nombre || "—"}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <EstadoTransferenciaBadge estado={item.estado} />
            <DiferenciasBadge estado={item.estado} tieneDiferencias={item.tieneDiferencias} />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t sunmi-divider">
          <Dato label="Enviada por">{item.creadaPor?.nombre || "—"}</Dato>
          <Dato label={confirmadores.length > 1 ? "Recibida por" : "Recibida por"}>
            {confirmadores.length
              ? confirmadores.map((u) => u.nombre).join(", ")
              : "—"}
          </Dato>
          <Dato label="Creada">{fechaHoraAR(item.fechaCreada)}</Dato>
          <Dato label="Envío">{fechaHoraAR(item.fechaEnvio)}</Dato>
          <Dato label="Recepción">{fechaHoraAR(item.fechaRecepcion)}</Dato>
        </div>
      </SunmiCard>
    </div>
  );
}
