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

      <BloqueCancelacion cancelacion={item.cancelacion} />
    </section>
  );
}

// ── EL BLOQUE DE CANCELACIÓN ────────────────────────────────────────────────
//
// En ERP Azul una corrección nunca hace desaparecer la historia: al abrir el
// documento después tiene que entenderse qué ocurrió. El remito cancelado
// conserva sus líneas y sus cantidades —eso se ve más abajo, en la tabla— y esto
// cuenta el resto.
//
// ── LOS DOS CASOS, Y POR QUÉ SE DISTINGUEN ─────────────────────────────────
//
// Una cancelación hecha con el registro habilitado trae fecha, autor y motivo.
// Una anterior a que esas columnas existieran no trae nada, y ahí está el riesgo:
// tres campos vacíos se leen como un error de la pantalla, no como "esto no se
// registró". Por eso el caso viejo dice lo que pasó con todas las letras en vez
// de mostrar huecos.
//
// No se atribuye autor, fecha ni motivo que nadie escribió, y no se toma prestado
// el motivo de la venta vinculada aunque exista: son dos decisiones distintas.
function BloqueCancelacion({ cancelacion }) {
  if (!cancelacion) return null;

  if (!cancelacion.registroCompleto) {
    return (
      <SunmiCard className="sunmi-state-warning">
        <div className="text-sm2">
          <span className="font-semibold sunmi-text-accent">Transferencia cancelada.</span>{" "}
          <span className="sunmi-text-muted">
            Cancelada antes de habilitar el registro detallado de cancelaciones, así que no
            quedaron guardados el autor, la fecha ni el motivo. Los productos y las cantidades
            enviadas siguen abajo, como estaban.
          </span>
        </div>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="sunmi-state-danger">
      <div className="space-y-1">
        <div className="text-sm font-semibold sunmi-text-danger">Transferencia cancelada</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2">
          <Campo label="Cancelada el">
            <span className="tabular-nums">{fmtFechaHoraAR(cancelacion.fecha)}</span>
          </Campo>
          <Campo label="Cancelada por">{cancelacion.usuario || "—"}</Campo>
          {/* El motivo va COMPLETO y sin recortar: es el dato de auditoría, y
              truncarlo para que entre en una línea es perder justamente la parte
              que explica qué pasó. */}
          <Campo label="Motivo" className="md:col-span-3">
            <span className="break-words whitespace-pre-wrap">{cancelacion.motivo || "—"}</span>
          </Campo>
        </div>
        <div className="text-sm2 sunmi-text-muted pt-1">
          Los productos y las cantidades enviadas siguen abajo, como estaban.
        </div>
      </div>
    </SunmiCard>
  );
}
