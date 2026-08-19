"use client";

import { useState } from "react";
import Link from "next/link";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { ShoppingCart, Package, Clock, ChevronRight } from "lucide-react";
import ModalDetalleVenta from "./ModalDetalleVenta";

const ICONO_TIPO = {
  venta: ShoppingCart,
  stock: Package,
};

function formatHora(fecha) {
  const d = new Date(fecha);
  // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
  return horaAR(d);
}

function formatFechaCorta(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const esHoy =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();

  if (esHoy) return formatHora(fecha);

  return (
    d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
    " " +
    formatHora(fecha)
  );
}

export default function ActividadReciente({ actividad = [], cargando = false, sinPermiso = false }) {
  const [ventaIdAbierta, setVentaIdAbierta] = useState(null);
  const cardClass = "p-4 border border-current/[0.06] shadow-sm";

  if (cargando) {
    return (
      <SunmiCard className={cardClass}>
        <h3 className="text-sm font-semibold mb-3">
          Actividad reciente
        </h3>
        <div className="flex items-center justify-center py-6 sunmi-text-muted">
          <Clock size={20} className="animate-spin" />
        </div>
      </SunmiCard>
    );
  }

  // SIN PERMISO NO ES LO MISMO QUE SIN ACTIVIDAD, y hay que decirlo antes de
  // mirar el largo de la lista: para un rol sin `stock.ver` la lista siempre
  // llega vacía, y "Sin actividad reciente" le estaría diciendo que en el local
  // no pasó nada cuando lo que pasa es que no lo puede ver.
  if (sinPermiso) {
    return (
      <SunmiCard className={cardClass}>
        <h3 className="text-sm font-semibold mb-3 opacity-70">
          Actividad reciente
        </h3>
        <p className="text-sm sunmi-text-muted py-4 text-center">
          Tu rol no incluye ver la actividad del local.
        </p>
      </SunmiCard>
    );
  }

  if (!actividad.length) {
    return (
      <SunmiCard className={cardClass}>
        <h3 className="text-sm font-semibold mb-3 opacity-70">
          Actividad reciente
        </h3>
        <p className="text-sm sunmi-text-muted py-4 text-center">
          Sin actividad reciente
        </p>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className={`${cardClass} overflow-hidden`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          Actividad reciente
        </h3>
        <Link
          href="/modulos/reportes-ventas"
          className="text-xs font-medium sunmi-text-muted hover:opacity-85 transition"
        >
          Ver historial
        </Link>
      </div>
      <ul className="flex flex-col overflow-y-auto overflow-x-hidden max-h-[280px]">
        {actividad.map((item, i) => {
          const Icono = ICONO_TIPO[item.tipo] || Clock;
          const borderClass = i > 0 ? "border-t border-current/[0.04]" : "";

          const contenido = (
            <>
              <Icono size={15} className="shrink-0 mt-0.5 sunmi-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate leading-snug">{item.descripcion}</p>
                <p className="text-[11px] sunmi-text-muted mt-0.5 leading-none">
                  {item.usuario && <span>{item.usuario} · </span>}
                  {formatFechaCorta(item.fecha)}
                </p>
              </div>
            </>
          );

          if (item.tipo === "venta") {
            return (
              <li key={`${item.tipo}-${item.id}-${i}`}>
                <button
                  type="button"
                  onClick={() => setVentaIdAbierta(item.id)}
                  className={`
                    w-full group flex items-start gap-3 py-2.5 px-3 rounded-lg text-[13px] cursor-pointer text-left
                    ${borderClass}
                    transition-colors duration-100
                    hover:bg-[var(--pos-surface-hover)]
                  `}
                >
                  {contenido}
                  <ChevronRight size={14} className="shrink-0 sunmi-text-muted opacity-50 group-hover:opacity-80 transition-opacity mt-0.5" />
                </button>
              </li>
            );
          }

          return (
            <li key={`${item.tipo}-${item.id}-${i}`}>
              <div className={`flex items-start gap-3 py-2.5 px-3 rounded-lg text-[13px] ${borderClass}`}>
                {contenido}
              </div>
            </li>
          );
        })}
      </ul>
      <ModalDetalleVenta
        open={!!ventaIdAbierta}
        ventaId={ventaIdAbierta}
        onClose={() => setVentaIdAbierta(null)}
      />
    </SunmiCard>
  );
}
