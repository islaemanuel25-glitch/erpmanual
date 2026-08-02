"use client";

// Sección "Información general" del detalle de transferencia.
//
// Calca el primer bloque de components/reportes-ventas/VentaDetalleAdmin.jsx:
// `section space-y-2` con SectionHead + SunmiCard, y adentro la grilla
// `grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-3` de campos
// label-muted / valor-fuerte.
//
// Ya NO lleva los botones de PDF ni el ticket: esas acciones se mudaron a la
// card de acciones que va arriba, igual que AccionesTicket en "Ver venta".
// Tampoco lleva su propio título ni el badge de estado: eso vive en la franja
// de encabezado de la página.

import SunmiCard from "@/components/sunmi/SunmiCard";
import EstadoTransferenciaBadge from "./EstadoTransferenciaBadge";
import { SectionHead, Campo, fmtFechaHoraAR } from "./detallePresentacion";

export default function TransferenciaHeader({ item }) {
  if (!item) return null;

  const confirmadores = Array.isArray(item.confirmadores) ? item.confirmadores : [];

  return (
    <section className="space-y-2">
      <SectionHead title="Información general" />
      <SunmiCard>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-3">
          <Campo label="Transferencia">
            <span className="font-mono">#{item.id}</span>
          </Campo>

          <Campo label="Origen → destino" className="col-span-2">
            {item.origen?.nombre || "—"}
            {item.origen?.esDeposito && (
              <span className="sunmi-text-accent text-[11px] font-normal ml-1">(Dep.)</span>
            )}
            <span className="sunmi-text-muted font-normal"> → </span>
            {item.destino?.nombre || "—"}
          </Campo>

          <Campo label="Creada">
            <span className="tabular-nums">{fmtFechaHoraAR(item.fechaCreada)}</span>
          </Campo>
          <Campo label="Envío">
            <span className="tabular-nums">{fmtFechaHoraAR(item.fechaEnvio)}</span>
          </Campo>
          <Campo label="Recepción">
            <span className="tabular-nums">{fmtFechaHoraAR(item.fechaRecepcion)}</span>
          </Campo>

          <Campo label="Estado">
            <EstadoTransferenciaBadge estado={item.estado} />
          </Campo>
          <Campo label="Enviada por">{item.creadaPor?.nombre || "—"}</Campo>
          <Campo label="Recibida por">
            {confirmadores.length ? confirmadores.map((u) => u.nombre).join(", ") : "—"}
          </Campo>
        </div>
      </SunmiCard>
    </section>
  );
}
