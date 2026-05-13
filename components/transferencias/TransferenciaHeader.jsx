"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function TransferenciaHeader({ item, id, me }) {
  if (!item) return null;

  const handleImprimirTicket = async () => {
    const { default: imprimirTicketTransferencia } = await import(
      "@/lib/transferencias/imprimirTicketTransferencia"
    );
    imprimirTicketTransferencia(item, me);
  };

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

      <SunmiCard className="grid gap-3 md:grid-cols-2 mx-1 text-sm">
        <div>
          <div className="font-semibold">Origen</div>
          <div className="sunmi-text-muted">{item.origen.nombre}</div>
        </div>

        <div>
          <div className="font-semibold">Destino</div>
          <div className="sunmi-text-muted">{item.destino.nombre}</div>
        </div>

        <div>
          <div className="font-semibold">Fechas</div>
          <div className="sunmi-text-muted">
            Creada: {item.fechaCreada ? new Date(item.fechaCreada).toLocaleString() : "-"}
          </div>
          <div className="sunmi-text-muted">
            Envío: {item.fechaEnvio ? new Date(item.fechaEnvio).toLocaleString() : "-"}
          </div>
          <div className="sunmi-text-muted">
            Recepción: {item.fechaRecepcion ? new Date(item.fechaRecepcion).toLocaleString() : "-"}
          </div>
        </div>

        <div>
          <div className="font-semibold">Estado</div>
          <span className="sunmi-badge-muted text-[12px] px-2.5 py-1 rounded-full font-medium">
            {item.estado}
          </span>
        </div>
      </SunmiCard>
    </div>
  );
}
