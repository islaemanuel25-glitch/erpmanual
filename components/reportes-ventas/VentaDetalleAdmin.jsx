"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

const TZ_AR = "America/Argentina/Cordoba";

const FORMA_PAGO_LABEL = {
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  digital: "Digital",
  debito: "Débito",
  credito: "Crédito",
  mixto: "Mixto",
  fiado: "Fiado",
};

function fmtMoneda(n) {
  if (n == null) return "—";
  return `$ ${Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtCantidad(n) {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  if (Number.isInteger(num)) return num.toLocaleString("es-AR");
  return num.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

function fmtFechaHoraAR(iso) {
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

function Row({ label, value, strong = false, accent = null }) {
  const accentClass =
    accent === "success"
      ? "sunmi-text-success"
      : accent === "accent"
        ? "sunmi-text-accent"
        : accent === "danger"
          ? "sunmi-text-danger"
          : "";
  return (
    <div className="flex justify-between items-baseline gap-2 text-sm">
      <span className="sunmi-text-muted">{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""} ${accentClass}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function VentaDetalleAdmin({ venta, permisos }) {
  if (!venta) return null;

  const verCostos = !!permisos?.verCostos;
  const formaLabel =
    FORMA_PAGO_LABEL[venta.formaPago] || venta.formaPago || "—";
  const t = venta.totales || {};

  return (
    <>
      {/* Encabezado */}
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="text-[11px] sunmi-text-muted">Ticket</div>
            <div className="text-lg font-bold font-mono">
              #{venta.numero ?? venta.id}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] sunmi-text-muted">Fecha y hora</div>
            <div className="text-sm font-medium">
              {fmtFechaHoraAR(venta.fecha)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span
            className={`px-2 py-0.5 rounded-full capitalize ${
              venta.estado === "fiado"
                ? "sunmi-state-warning sunmi-text-accent"
                : "sunmi-state-success sunmi-text-success"
            }`}
          >
            {venta.estado}
          </span>
          <span className="px-2 py-0.5 rounded-full sunmi-surface">
            {formaLabel}
          </span>
        </div>
      </SunmiCard>

      {/* Partes involucradas */}
      <SunmiCard className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] sunmi-text-muted">Cajero</div>
            <div className="font-medium">{venta.vendedor?.nombre || "—"}</div>
          </div>
          <div>
            <div className="text-[11px] sunmi-text-muted">Cliente</div>
            <div className="font-medium">
              {venta.cliente?.nombre || "Consumidor final"}
              {venta.cliente?.documento ? (
                <span className="sunmi-text-muted ml-1">
                  ({venta.cliente.documento})
                </span>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-[11px] sunmi-text-muted">Local</div>
            <div className="font-medium">{venta.local?.nombre || "—"}</div>
          </div>
          <div>
            <div className="text-[11px] sunmi-text-muted">Forma de pago</div>
            <div className="font-medium">{formaLabel}</div>
          </div>
        </div>
      </SunmiCard>

      {/* Items */}
      <SunmiCard className="p-3">
        <SunmiSeparator label="Items" />
        <div className="mt-2 space-y-2">
          {(venta.detalles || []).length === 0 && (
            <div className="text-center py-4 sunmi-text-muted text-sm">
              Sin items
            </div>
          )}
          {(venta.detalles || []).map((d) => (
            <div
              key={d.id}
              className="sunmi-surface rounded-lg p-2.5 text-sm space-y-1.5"
            >
              <div className="flex justify-between gap-2">
                <div className="font-medium truncate">{d.nombre}</div>
                <div className="tabular-nums font-mono shrink-0">
                  {fmtMoneda(d.subtotal)}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] sunmi-text-muted">
                <span>
                  Cant.{" "}
                  <span className="tabular-nums sunmi-text-link">
                    {fmtCantidad(d.cantidad)}
                  </span>
                </span>
                <span>
                  P. unit.{" "}
                  <span className="tabular-nums">{fmtMoneda(d.precio)}</span>
                </span>
                {verCostos && d.precioCosto != null && (
                  <span>
                    Costo unit.{" "}
                    <span className="tabular-nums">
                      {fmtMoneda(d.precioCosto)}
                    </span>
                  </span>
                )}
                {verCostos && d.ganancia != null && (
                  <span>
                    Ganancia{" "}
                    <span className="tabular-nums sunmi-text-success">
                      {fmtMoneda(d.ganancia)}
                    </span>
                    {d.margen ? (
                      <span className="sunmi-text-muted"> ({d.margen}%)</span>
                    ) : null}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SunmiCard>

      {/* Totales */}
      <SunmiCard className="p-3">
        <SunmiSeparator label="Totales" />
        <div className="mt-2 space-y-1">
          <Row label="Subtotal" value={fmtMoneda(t.subtotal)} />
          {Number(t.descuento) > 0 && (
            <Row label="Descuento" value={`- ${fmtMoneda(t.descuento)}`} />
          )}
          <Row label="Total" value={fmtMoneda(t.total)} strong accent="accent" />
          {Number(t.comisionBancaria) > 0 && (
            <Row
              label="Comisión bancaria"
              value={`- ${fmtMoneda(t.comisionBancaria)}`}
            />
          )}
          <Row
            label="Neto recibido"
            value={fmtMoneda(t.netoRecibido)}
            strong
            accent="success"
          />
          {verCostos && t.costoTotal != null && (
            <>
              <div className="my-2 sunmi-divider border-t" />
              <Row label="Costo total" value={fmtMoneda(t.costoTotal)} />
              <Row
                label="Ganancia bruta"
                value={fmtMoneda(t.gananciaBruta)}
              />
              <Row
                label="Ganancia neta"
                value={fmtMoneda(t.gananciaNeta)}
                strong
                accent="success"
              />
            </>
          )}
        </div>
      </SunmiCard>
    </>
  );
}
