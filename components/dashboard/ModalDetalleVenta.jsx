"use client";

import { useState, useEffect, useCallback } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { X } from "lucide-react";

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FORMA_PAGO_LABELS = {
  efectivo: "Efectivo",
  digital: "Digital / MP",
  mercadopago: "MP",
  debito: "Débito",
  credito: "Crédito",
  mixto: "Mixto",
  fiado: "Fiado",
};

export default function ModalDetalleVenta({ open, ventaId, onClose }) {
  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!ventaId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pos-ventas/venta/${ventaId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setVenta(data.venta);
      } else {
        setError(data.error || "Error al cargar la venta");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [ventaId]);

  useEffect(() => {
    if (open && ventaId) {
      cargar();
    } else {
      setVenta(null);
      setError("");
    }
  }, [open, ventaId, cargar]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "var(--pos-overlay)" }}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose?.()}
        role="button"
        tabIndex={0}
        aria-label="Cerrar"
      />
      <div
        className="relative w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <SunmiCard className="p-4 border border-current/10 shadow-lg">
          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-10">
              <SunmiLoader />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-center py-6">
              <p className="text-sm sunmi-text-muted">{error}</p>
              <SunmiButton color="slate" size="sm" onClick={onClose} className="mt-3">
                Cerrar
              </SunmiButton>
            </div>
          )}

          {/* Contenido del ticket */}
          {venta && !loading && (
            <>
              {/* Header: Ticket # + fecha + cerrar */}
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold">Ticket #{venta.numero}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-current/10 transition"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Info compacta */}
              <div className="flex gap-4 mb-3 text-xs sunmi-text-muted flex-wrap">
                <span>{fmtFecha(venta.fecha)}</span>
                <span>{venta.vendedor?.nombre || "—"}</span>
                <span>{FORMA_PAGO_LABELS[venta.formaPago] || venta.formaPago}</span>
              </div>

              {/* Cliente si existe */}
              {venta.cliente?.nombre && (
                <div className="text-xs sunmi-text-muted mb-3">
                  Cliente: <span className="font-medium opacity-90">{venta.cliente.nombre}</span>
                </div>
              )}

              {/* Items */}
              <div className="space-y-1 mb-3 max-h-48 overflow-y-auto overflow-x-hidden">
                {(venta.detalles || []).map((d, i) => (
                  <div
                    key={d.id || i}
                    className="flex justify-between text-sm sunmi-surface-soft px-2 py-1.5 rounded"
                  >
                    <span className="truncate flex-1 mr-2">{d.nombre}</span>
                    <span className="sunmi-text-muted shrink-0">
                      {d.cantidad} x ${fmt(d.precio)}
                    </span>
                    <span className="font-medium ml-2 shrink-0 tabular-nums">
                      ${fmt(d.subtotal)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totales */}
              <div className="border-t sunmi-divider pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="sunmi-text-muted">Subtotal</span>
                  <span className="tabular-nums">${fmt(venta.subtotal)}</span>
                </div>
                {Number(venta.descuento) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="sunmi-text-success">Descuento</span>
                    <span className="sunmi-text-success tabular-nums">
                      -${fmt(venta.descuento)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1">
                  <span>Total</span>
                  <span className="sunmi-text-accent tabular-nums">
                    ${fmt(venta.total)}
                  </span>
                </div>
                {Number(venta.comisionBancaria) > 0 && (
                  <div className="flex justify-between text-xs sunmi-text-muted">
                    <span>Comisión</span>
                    <span className="tabular-nums">-${fmt(venta.comisionBancaria)}</span>
                  </div>
                )}
              </div>

              {/* Cerrar */}
              <div className="mt-4">
                <SunmiButton color="slate" onClick={onClose} className="w-full !text-sm">
                  Cerrar
                </SunmiButton>
              </div>
            </>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
