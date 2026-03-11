"use client";

import { useState, useEffect, useCallback } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatHora(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FORMAS_PAGO = [
  { value: "TODAS", label: "Todas" },
  { value: "efectivo", label: "Efectivo" },
  { value: "mercadopago", label: "MercadoPago" },
  { value: "debito", label: "Debito" },
  { value: "credito", label: "Credito" },
  { value: "fiado", label: "Fiado" },
];

const FORMA_PAGO_LABELS = {
  efectivo: "Efectivo",
  mercadopago: "MP",
  debito: "Debito",
  credito: "Credito",
  fiado: "Fiado",
};

export default function HistorialDia({
  localId,
  onReimprimir,
  onCerrar,
  puedeVerTodosCajeros = false,
}) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);

  // Filtros
  const [filtroNumero, setFiltroNumero] = useState("");
  const [filtroFormaPago, setFiltroFormaPago] = useState("TODAS");
  const [filtroVendedorId, setFiltroVendedorId] = useState("");
  const [filtroSoloConTurno, setFiltroSoloConTurno] = useState(false);

  // Cajeros derivados de ventas (para select)
  const [cajeros, setCajeros] = useState([]);

  const cargar = useCallback(async () => {
    if (!localId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroNumero) params.set("numero", filtroNumero);
      if (filtroFormaPago !== "TODAS") params.set("formaPago", filtroFormaPago);
      if (filtroVendedorId) params.set("vendedorId", filtroVendedorId);
      if (filtroSoloConTurno) params.set("soloConTurno", "true");

      const res = await fetch(
        `/api/pos-ventas/historial-dia?${params}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) {
        setVentas(data.items || []);

        // Derivar cajeros únicos (solo en primera carga sin filtro vendedor)
        if (!filtroVendedorId && puedeVerTodosCajeros) {
          const map = new Map();
          (data.items || []).forEach((v) => {
            if (v.vendedor?.id && !map.has(v.vendedor.id)) {
              map.set(v.vendedor.id, v.vendedor.nombre || v.vendedor.email || `#${v.vendedor.id}`);
            }
          });
          setCajeros(Array.from(map, ([id, nombre]) => ({ id, nombre })));
        }
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [localId, filtroNumero, filtroFormaPago, filtroVendedorId, filtroSoloConTurno, puedeVerTodosCajeros]);

  // Carga inicial
  useEffect(() => {
    cargar();
  }, [localId]);

  // Re-fetch al cambiar filtros (con debounce implícito por user action)
  const handleBuscar = () => cargar();

  const totalVendido = ventas.reduce((s, v) => s + Number(v.total), 0);

  const formatTurno = (v) => {
    if (!v.turnoId || !v.turno) return "—";
    const hora = formatHora(v.turno.apertura);
    const label = `#${v.turno.id} · ${hora}`;
    return v.turno.cierre ? label : `${label} (abierto)`;
  };

  return (
    <div className="fixed inset-0 sunmi-overlay-strong flex items-center justify-center p-4 z-50 overflow-y-auto">
      <SunmiCard className="w-full max-w-2xl p-4 my-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold">Ventas del dia</h2>
          <button onClick={handleBuscar} className="text-[11px] sunmi-link">
            Actualizar
          </button>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <SunmiInput
            type="number"
            placeholder="Nº ticket"
            value={filtroNumero}
            onChange={(e) => setFiltroNumero(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
          />
          <SunmiSelectAdv
            value={filtroFormaPago}
            onChange={(val) => setFiltroFormaPago(val)}
            options={FORMAS_PAGO}
          />
          {puedeVerTodosCajeros && (
            <SunmiSelectAdv
              value={filtroVendedorId}
              onChange={(val) => setFiltroVendedorId(val)}
              options={[
                { value: "", label: "Todos los cajeros" },
                ...cajeros.map((c) => ({
                  value: String(c.id),
                  label: c.nombre,
                })),
              ]}
            />
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={filtroSoloConTurno}
              onChange={(e) => setFiltroSoloConTurno(e.target.checked)}
              className="accent-cyan-500"
            />
            Solo con turno
          </label>
        </div>
        <div className="flex gap-2 mb-3">
          <SunmiButton color="amber" onClick={handleBuscar} className="!text-sm">
            Buscar
          </SunmiButton>
        </div>

        {/* Resumen */}
        {ventas.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="sunmi-surface-soft p-2 rounded-lg text-center">
              <div className="text-[10px] sunmi-text-muted">Ventas</div>
              <div className="text-lg font-bold sunmi-text-link">{ventas.length}</div>
            </div>
            <div className="sunmi-surface-soft p-2 rounded-lg text-center">
              <div className="text-[10px] sunmi-text-muted">Total</div>
              <div className="text-lg font-bold sunmi-text-accent">
                ${formatPrecio(totalVendido)}
              </div>
            </div>
          </div>
        )}

        {/* Lista de ventas */}
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 sunmi-text-muted">Cargando...</div>
          ) : ventas.length === 0 ? (
            <div className="text-center py-8 sunmi-text-muted">
              No hay ventas registradas hoy
            </div>
          ) : (
            ventas.map((v) => (
              <div
                key={v.id}
                onClick={() => setDetalle(v)}
                className="sunmi-surface-soft p-2 rounded-lg cursor-pointer sunmi-row-hover transition-colors"
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium shrink-0">#{v.numero}</span>
                    <span className="text-[11px] sunmi-text-muted shrink-0">
                      {formatHora(v.fecha)}
                    </span>
                    <span className="text-[11px] sunmi-text-muted truncate">
                      {FORMA_PAGO_LABELS[v.formaPago] || v.formaPago}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-bold sunmi-text-accent">
                        ${formatPrecio(Number(v.total))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-0.5 text-[10px] sunmi-text-muted">
                  <span>{v.vendedor?.nombre || v.vendedor?.email || "-"}</span>
                  <span>{formatTurno(v)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Boton cerrar */}
        <div className="mt-4">
          <SunmiButton color="slate" onClick={onCerrar} className="w-full">
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-[60]">
          <SunmiCard className="w-full max-w-md p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold">Ticket #{detalle.numero}</h3>
              <span className="text-xs sunmi-text-muted">
                {new Date(detalle.fecha).toLocaleString("es-AR")}
              </span>
            </div>

            {/* Info cajero y turno */}
            <div className="flex gap-4 mb-3 text-xs sunmi-text-muted">
              <span>Cajero: {detalle.vendedor?.nombre || detalle.vendedor?.email || "-"}</span>
              <span>Turno: {formatTurno(detalle)}</span>
            </div>

            {/* Items */}
            <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
              {detalle.detalles?.map((d, i) => (
                <div
                  key={i}
                  className="flex justify-between text-sm sunmi-surface-soft px-2 py-1 rounded"
                >
                  <span className="truncate flex-1 mr-2">{d.nombre}</span>
                  <span className="sunmi-text-muted shrink-0">
                    {d.cantidad} x ${formatPrecio(Number(d.precio))}
                  </span>
                  <span className="font-medium ml-2 shrink-0">
                    ${formatPrecio(Number(d.subtotal))}
                  </span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="border-t sunmi-divider pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="sunmi-text-muted">Subtotal</span>
                <span>${formatPrecio(Number(detalle.subtotal))}</span>
              </div>
              {Number(detalle.descuento) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="sunmi-text-success">Descuento</span>
                  <span className="sunmi-text-success">
                    -${formatPrecio(Number(detalle.descuento))}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="sunmi-text-accent">
                  ${formatPrecio(Number(detalle.total))}
                </span>
              </div>
              <div className="text-xs sunmi-text-muted">
                Pago: {detalle.formaPago}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-2 mt-4">
              <SunmiButton
                color="cyan"
                onClick={() => {
                  if (onReimprimir) {
                    onReimprimir({
                      numero: detalle.numero,
                      fecha: detalle.fecha,
                      items: detalle.detalles.map((d) => ({
                        nombre: d.nombre,
                        precio: Number(d.precio),
                        cantidad: d.cantidad,
                      })),
                      subtotal: Number(detalle.subtotal),
                      descuento: Number(detalle.descuento),
                      total: Number(detalle.total),
                      formaPago: detalle.formaPago,
                      cliente: detalle.cliente?.nombre
                        ? { nombre: detalle.cliente.nombre }
                        : null,
                    });
                  }
                  setDetalle(null);
                }}
                className="flex-1 !text-sm"
              >
                Reimprimir
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => setDetalle(null)}
                className="flex-1 !text-sm"
              >
                Cerrar
              </SunmiButton>
            </div>
          </SunmiCard>
        </div>
      )}
    </div>
  );
}
