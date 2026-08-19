"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";

const FORMA_PAGO_LABEL = {
  efectivo: "Efectivo",
  digital: "Digital / Mercado Pago",
  mixto: "Mixto",
  fiado: "Fiado",
};

export function fmtMonedaVenta(n) {
  if (n == null || n === undefined) return "—";
  return `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtFechaVenta(iso) {
  // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
  return fechaHoraAR(iso);
}

export default function VentaDetalleContent({ venta }) {
  if (!venta) return null;

  const formaPagoLabel = FORMA_PAGO_LABEL[venta.formaPago] || venta.formaPago || "—";

  return (
    <>
      <SunmiCard className="p-4">
        <p className="text-sm sunmi-text-muted mb-1">Fecha y hora</p>
        <p className="text-base font-medium">{fmtFechaVenta(venta.fecha)}</p>
      </SunmiCard>

      <SunmiCard className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="sunmi-text-muted mb-0.5">Cliente</p>
            <p className="font-medium">{venta.cliente?.nombre ?? "Consumidor final"}</p>
          </div>
          <div>
            <p className="sunmi-text-muted mb-0.5">Vendedor</p>
            <p className="font-medium">{venta.vendedor?.nombre ?? "—"}</p>
          </div>
          <div>
            <p className="sunmi-text-muted mb-0.5">Local</p>
            <p className="font-medium">{venta.local?.nombre ?? "—"}</p>
          </div>
          <div>
            <p className="sunmi-text-muted mb-0.5">Forma de pago</p>
            <p className="font-medium">{formaPagoLabel}</p>
          </div>
        </div>
      </SunmiCard>

      <SunmiCard className="p-4 overflow-hidden">
        <p className="text-sm sunmi-text-muted mb-2">Detalle de ítems</p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b sunmi-divider">
                <th className="text-left py-1.5 px-2 font-medium sunmi-text-muted">Producto</th>
                <th className="text-right py-1.5 px-2 font-medium sunmi-text-muted w-14">Cant.</th>
                <th className="text-right py-1.5 px-2 font-medium sunmi-text-muted w-20">P. unit.</th>
                <th className="text-right py-1.5 px-2 font-medium sunmi-text-muted w-20">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(venta.detalles || []).map((d) => (
                <tr key={d.id} className="border-b border-current/5">
                  <td className="py-2 px-2 truncate max-w-[180px]">{d.nombre}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{d.cantidad}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {fmtMonedaVenta(d.precio)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">
                    {fmtMonedaVenta(d.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SunmiCard>

      <SunmiCard className="p-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="sunmi-text-muted">Subtotal</span>
            <span className="tabular-nums font-medium">{fmtMonedaVenta(venta.subtotal)}</span>
          </div>
          {Number(venta.descuento) > 0 && (
            <div className="flex justify-between">
              <span className="sunmi-text-muted">Descuento</span>
              <span className="tabular-nums">-{fmtMonedaVenta(venta.descuento)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold pt-2 border-t sunmi-divider">
            <span>Total</span>
            <span className="tabular-nums sunmi-text-accent">{fmtMonedaVenta(venta.total)}</span>
          </div>
        </div>
      </SunmiCard>
    </>
  );
}
