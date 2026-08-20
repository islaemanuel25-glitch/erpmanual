"use client";

// Detalle completo de una venta ya emitida (página "Ver venta").
// Presentación en 3 bloques que aprovechan el ancho disponible:
//   1) Información general — grilla de campos (ticket, fecha, cliente, cajero,
//      local, forma de pago, turno, observaciones/referencia si existen).
//   2) Ítems — sección protagonista: TABLA en md+ y cards en móvil.
//   3) Totales — panel en grilla, con Total y Neto recibido destacados.
// Solo presentación: no calcula nada nuevo ni pide datos extra al endpoint.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiTable from "@/components/sunmi/SunmiTable";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";


const FORMA_PAGO_LABEL = {
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  digital: "Digital",
  debito: "Débito",
  credito: "Crédito",
  mixto: "Mixto",
  fiado: "Fiado",
};

// Etiqueta del tipo de precio aplicado por lista (no es Pack/Unidad: describe de
// dónde salió el precio de la línea).
const TIPO_PRECIO_LABEL = {
  PRECIO_VENTA: null, // caso normal: no vale la pena mostrarlo
  COSTO_MAS_MARGEN: "Costo + margen",
  COSTO_PURO: "Costo puro",
  MANUAL_AUTORIZADO: "Precio manual",
  OVERRIDE_PRODUCTO: "Precio propio",
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

// ── Modo de venta de depósito (Pack / Unidad suelta / Pieza) ─────────────────
// El endpoint ya resolvió `d.deposito.modo` con el helper canónico; acá solo se
// traduce a texto. `modo === null` ⇒ presentación neutra (no se inventa nada).

const MODO_LABEL = { PACK: "Pack/Bulto", UNIDAD: "Unidad suelta", PIEZA: "Piezas" };

// Unidad física en la que se cuenta el consumo, para leer "= 36 u" / "= 4 pz".
function unidadFisica(dep) {
  if (dep?.modo === "PIEZA") return "pz";
  if (dep?.unidadMedida === "kg") return "kg";
  return "u";
}

// Escala del precio/costo de la línea: en PACK el importe es por bulto.
function escalaPrecio(dep) {
  if (dep?.modo === "PACK") return "por pack";
  if (dep?.modo === "PIEZA") return "por pieza";
  if (dep?.modo === "UNIDAD") return "por unidad";
  return null;
}

function BadgeModo({ dep }) {
  if (!dep?.modo) return null;
  const esPack = dep.modo === "PACK";
  return (
    <span
      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
        esPack ? "sunmi-state-success sunmi-text-success" : "sunmi-surface-soft sunmi-text-link"
      }`}
    >
      {MODO_LABEL[dep.modo]}
      {esPack && dep.factorPack > 1 ? ` ×${dep.factorPack}` : ""}
    </span>
  );
}

// "1 pack = N unidades" — solo cuando la línea es un pack real.
function TextoFactor({ dep }) {
  if (dep?.modo !== "PACK" || !(dep.factorPack > 1)) return null;
  return (
    <span className="text-[11px] sunmi-text-muted whitespace-nowrap">
      1 pack = {dep.factorPack} unidades
    </span>
  );
}

// Consumo físico congelado de la línea ("= 36 u"). Ausente en legacy/servicios.
function ConsumoFisico({ dep, className = "" }) {
  if (!dep || dep.cantidadStock == null) return null;
  return (
    <span className={`text-[11px] sunmi-text-muted whitespace-nowrap ${className}`}>
      = {fmtCantidad(dep.cantidadStock)} {unidadFisica(dep)}
    </span>
  );
}

function fmtFechaHoraAR(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  // Ya declaraba la zona; le faltaba `hour12: false`. Del helper único.
  return fechaHoraAR(d);
}

// Título de sección alineado a la izquierda (mismo criterio que el listado).
function SectionHead({ title, subtitle }) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{title}</h2>
      {subtitle && <p className="text-[11px] sunmi-text-muted leading-tight">{subtitle}</p>}
    </div>
  );
}

// Campo de la grilla de información general: label muted + valor.
function Campo({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
      <div className="text-sm font-medium sunmi-text-strong leading-snug break-words">
        {children}
      </div>
    </div>
  );
}

// Tile de la grilla de totales. `tone` colorea el importe; `highlight` le pone
// fondo de estado (Total y Neto recibido).
function TotalTile({ label, value, tone = "neutral", highlight = false }) {
  const toneColor = {
    neutral: "sunmi-text-strong",
    accent: "sunmi-text-accent",
    success: "sunmi-text-success",
    muted: "sunmi-text-muted",
  }[tone] || "sunmi-text-strong";
  const box = highlight ? "sunmi-state-success" : "sunmi-surface-soft sunmi-border";
  return (
    <div className={`${box} rounded-lg px-3 py-2 min-w-0`}>
      <div className="text-[11px] sunmi-text-muted leading-tight truncate">{label}</div>
      <div className={`text-sm sm:text-base font-bold font-mono tabular-nums leading-tight ${toneColor}`}>
        {value}
      </div>
    </div>
  );
}

export default function VentaDetalleAdmin({ venta, permisos }) {
  if (!venta) return null;

  const verCostos = !!permisos?.verCostos;
  const formaLabel = FORMA_PAGO_LABEL[venta.formaPago] || venta.formaPago || "—";
  const t = venta.totales || {};
  const c = venta.correccion || {};
  const detalles = venta.detalles || [];
  const pagos = venta.pagos || [];

  return (
    <>
      {/* 1 · Información general — grilla que se ensancha con la pantalla */}
      <section className="space-y-2">
        <SectionHead title="Información general" />
        <SunmiCard>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-3">
            <Campo label="Ticket">
              <span className="font-mono">#{venta.numero ?? venta.id}</span>
            </Campo>
            <Campo label="Fecha y hora">
              <span className="tabular-nums">{fmtFechaHoraAR(venta.fecha)}</span>
            </Campo>
            <Campo label="Cliente">
              {venta.cliente?.nombre || "Consumidor final"}
              {venta.cliente?.documento ? (
                <span className="sunmi-text-muted font-normal ml-1">
                  ({venta.cliente.documento})
                </span>
              ) : null}
            </Campo>
            <Campo label="Cajero">{venta.vendedor?.nombre || "—"}</Campo>
            <Campo label="Local">{venta.local?.nombre || "—"}</Campo>
            <Campo label="Forma de pago">
              {formaLabel}
              {venta.pagoDividido && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium sunmi-surface-soft sunmi-text-link whitespace-nowrap">
                  dividido
                </span>
              )}
            </Campo>

            {/* Turno: el endpoint expone el estado del turno original. */}
            {c.turnoAbierto != null && (
              <Campo label="Turno original">
                <span className={c.turnoAbierto ? "sunmi-text-success" : "sunmi-text-muted"}>
                  {c.turnoAbierto ? "Abierto" : "Cerrado"}
                </span>
              </Campo>
            )}
            {c.observaciones && (
              <Campo label="Observaciones" className="col-span-2 md:col-span-3">
                {c.observaciones}
              </Campo>
            )}
            {c.referenciaInterna && (
              <Campo label="Referencia interna">{c.referenciaInterna}</Campo>
            )}
          </div>

          {/* Desglose de medios de pago cuando el cobro fue dividido. */}
          {venta.pagoDividido && pagos.length > 0 && (
            <div className="mt-3 pt-3 border-t sunmi-divider flex flex-wrap gap-x-4 gap-y-1 text-[12px] sunmi-text-muted">
              {pagos.map((p, i) => (
                <span key={`${p.medio}-${i}`}>
                  {p.label || p.medio}{" "}
                  <span className="tabular-nums font-mono sunmi-text-strong">
                    {fmtMoneda(p.monto)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </SunmiCard>
      </section>

      {/* 2 · Ítems — sección principal: tabla en desktop, cards en móvil */}
      <section className="space-y-2">
        <SectionHead
          title="Ítems"
          subtitle={`${detalles.length} línea${detalles.length === 1 ? "" : "s"}`}
        />
        <SunmiCard>
          {detalles.length === 0 && (
            <div className="text-center py-8 sunmi-text-muted text-sm">Sin ítems</div>
          )}

          {/* Móvil: una card por línea */}
          {detalles.length > 0 && (
            <div className="md:hidden space-y-2">
              {detalles.map((d) => (
                <div key={d.id} className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-semibold sunmi-text-strong text-[14px] leading-tight">
                      {d.nombre}
                    </div>
                    <div className="font-mono font-bold text-[15px] sunmi-text-strong whitespace-nowrap tabular-nums">
                      {fmtMoneda(d.subtotal)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <BadgeModo dep={d.deposito} />
                    {d.esServicio && <BadgeServicio />}
                    {verCostos && <BadgeTipoPrecio tipo={d.tipoPrecioAplicado} />}
                    <TextoFactor dep={d.deposito} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] sunmi-text-muted">
                    <span>
                      Cant.{" "}
                      <span className="tabular-nums sunmi-text-link">{fmtCantidad(d.cantidad)}</span>{" "}
                      <ConsumoFisico dep={d.deposito} />
                    </span>
                    <span>
                      Precio <span className="tabular-nums">{fmtMoneda(d.precio)}</span>
                      {escalaPrecio(d.deposito) && (
                        <span className="sunmi-text-muted"> {escalaPrecio(d.deposito)}</span>
                      )}
                    </span>
                    {verCostos && d.precioCosto != null && (
                      <span>
                        Costo <span className="tabular-nums">{fmtMoneda(d.precioCosto)}</span>
                        {escalaPrecio(d.deposito) && (
                          <span className="sunmi-text-muted"> {escalaPrecio(d.deposito)}</span>
                        )}
                      </span>
                    )}
                    {verCostos && d.ganancia != null && (
                      <span>
                        Ganancia{" "}
                        <span className="tabular-nums sunmi-text-success">
                          {fmtMoneda(d.ganancia)}
                        </span>
                        {d.margen ? <span className="sunmi-text-muted"> ({d.margen}%)</span> : null}
                      </span>
                    )}
                  </div>
                  {d.esServicio && d.importeBaseServicio != null && (
                    <div className="text-[11px] sunmi-text-muted">
                      Base {fmtMoneda(d.importeBaseServicio)}
                      {d.recargoServicioPct != null && ` · recargo ${d.recargoServicioPct}%`}
                      {d.recargoServicioImporte != null &&
                        ` (${fmtMoneda(d.recargoServicioImporte)})`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Desktop: tabla a todo el ancho */}
          {detalles.length > 0 && (
            <div className="hidden md:block">
              <SunmiTable
                headers={[
                  "Producto",
                  { label: "Cant.", className: "text-center" },
                  { label: "Precio", className: "text-right" },
                  ...(verCostos
                    ? [
                        { label: "Costo", className: "text-right" },
                        { label: "Ganancia", className: "text-right" },
                        { label: "Margen", className: "text-right" },
                      ]
                    : []),
                  { label: "Subtotal", className: "text-right" },
                ]}
              >
                {detalles.map((d) => (
                  <tr key={d.id} className="align-middle sunmi-row-hover transition-colors">
                    <td className="px-2.5 py-3">
                      <div className="font-semibold sunmi-text-strong text-[13px] leading-snug">
                        {d.nombre}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <BadgeModo dep={d.deposito} />
                        {d.esServicio && <BadgeServicio />}
                        {verCostos && <BadgeTipoPrecio tipo={d.tipoPrecioAplicado} />}
                        <TextoFactor dep={d.deposito} />
                        {d.esServicio && d.importeBaseServicio != null && (
                          <span className="text-[11px] sunmi-text-muted">
                            Base {fmtMoneda(d.importeBaseServicio)}
                            {d.recargoServicioPct != null && ` · recargo ${d.recargoServicioPct}%`}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Cantidad comercial + consumo físico congelado debajo */}
                    <td className="px-2.5 py-3 text-center whitespace-nowrap">
                      <div className="tabular-nums sunmi-text-link font-medium">
                        {fmtCantidad(d.cantidad)}
                      </div>
                      <ConsumoFisico dep={d.deposito} className="block" />
                    </td>
                    <td className="px-2.5 py-3 text-right whitespace-nowrap">
                      <div className="font-mono tabular-nums">{fmtMoneda(d.precio)}</div>
                      {escalaPrecio(d.deposito) && (
                        <div className="text-[11px] sunmi-text-muted">{escalaPrecio(d.deposito)}</div>
                      )}
                    </td>
                    {verCostos && (
                      <>
                        <td className="px-2.5 py-3 text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums sunmi-text-muted">
                            {fmtMoneda(d.precioCosto)}
                          </div>
                          {escalaPrecio(d.deposito) && (
                            <div className="text-[11px] sunmi-text-muted">
                              {escalaPrecio(d.deposito)}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums sunmi-text-success whitespace-nowrap">
                          {fmtMoneda(d.ganancia)}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {d.margen != null ? `${d.margen}%` : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-2.5 py-3 text-right font-mono font-bold tabular-nums sunmi-text-strong whitespace-nowrap">
                      {fmtMoneda(d.subtotal)}
                    </td>
                  </tr>
                ))}
              </SunmiTable>
            </div>
          )}
        </SunmiCard>
      </section>

      {/* 3 · Totales — panel en grilla, no una columna de filas */}
      <section className="space-y-2">
        <SectionHead title="Totales" />
        <SunmiCard>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
            <TotalTile label="Subtotal" value={fmtMoneda(t.subtotal)} />
            {Number(t.descuento) > 0 && (
              <TotalTile label="Descuento" value={`- ${fmtMoneda(t.descuento)}`} tone="accent" />
            )}
            <TotalTile label="Total" value={fmtMoneda(t.total)} tone="accent" />
            {Number(t.comisionBancaria) > 0 && (
              <TotalTile
                label="Comisión bancaria"
                value={`- ${fmtMoneda(t.comisionBancaria)}`}
                tone="accent"
              />
            )}
            <TotalTile label="Neto recibido" value={fmtMoneda(t.netoRecibido)} tone="success" highlight />
            {verCostos && t.costoTotal != null && (
              <>
                <TotalTile label="Costo total" value={fmtMoneda(t.costoTotal)} tone="muted" />
                <TotalTile label="Ganancia bruta" value={fmtMoneda(t.gananciaBruta)} tone="success" />
                <TotalTile
                  label="Ganancia neta"
                  value={fmtMoneda(t.gananciaNeta)}
                  tone="success"
                  highlight
                />
              </>
            )}
          </div>
        </SunmiCard>
      </section>
    </>
  );
}

// ── Badges de línea ──────────────────────────────────────────────────────────

function BadgeServicio() {
  return (
    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium sunmi-surface-soft sunmi-text-link whitespace-nowrap">
      Servicio
    </span>
  );
}

function BadgeTipoPrecio({ tipo }) {
  const label = TIPO_PRECIO_LABEL[tipo];
  if (!label) return null;
  return (
    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium sunmi-state-warning sunmi-text-accent whitespace-nowrap">
      {label}
    </span>
  );
}
