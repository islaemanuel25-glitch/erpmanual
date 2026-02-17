"use client";

import { useState, useEffect } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import useLocalSelector from "@/hooks/useLocalSelector";
import PantallaSeleccionLocal from "@/components/local/PantallaSeleccionLocal";
import SinPermisos from "@/components/auth/SinPermisos";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ReportesVentasPage() {
  const {
    perfil,
    locales,
    localSeleccionado,
    esAdminSinLocal,
    cargandoLocales,
    handleCambiarLocal,
  } = useLocalSelector();

  const esAdmin = perfil?.esAdmin;

  // Filtros
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [localId, setLocalId] = useState("");
  const [formaPago, setFormaPago] = useState("");

  // Datos
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  useEffect(() => {
    if (localSeleccionado) {
      setLocalId(String(localSeleccionado));
    }
  }, [localSeleccionado]);

  const cargarReporte = async () => {
    if (!fechaDesde || !fechaHasta) {
      setErrorMsg("Selecciona las fechas");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    setReporte(null);

    try {
      const params = new URLSearchParams({
        fechaDesde,
        fechaHasta,
      });
      if (localId) params.set("localId", localId);
      if (formaPago) params.set("formaPago", formaPago);

      const res = await fetch(`/api/reportes-ventas/general?${params}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!data.ok) {
        setErrorMsg(data.error || "Error generando reporte");
        return;
      }

      setReporte(data);
    } catch (error) {
      console.error("Error:", error);
      setErrorMsg("Error de conexion al generar reporte");
    } finally {
      setLoading(false);
    }
  };

  if (!perfil || cargandoLocales) return null;

  const permisosR = perfil?.permisos || [];
  const esAdminR = Array.isArray(permisosR) && permisosR.includes("*");
  if (!esAdminR && !permisosR.includes("reportes.ver")) return <SinPermisos />;

  if (esAdminSinLocal && !localSeleccionado) {
    return (
      <PantallaSeleccionLocal
        locales={locales}
        onSeleccionar={handleCambiarLocal}
      />
    );
  }

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Reportes de Ventas</h1>
        <p className="text-sm text-slate-400">
          Analisis de ventas, comisiones y rentabilidad
        </p>
      </div>

      {/* Filtros */}
      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        <SunmiSeparator label="Filtros" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 relative">
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Desde
            </label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Hasta
            </label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>

          {esAdmin && (
            <div className="relative">
              <label className="text-[11px] text-slate-400 mb-1 block">
                Local
              </label>
              <SunmiSelectAdv
                value={localId}
                onChange={(val) => setLocalId(val)}
              >
                <option value="">Todos</option>
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </SunmiSelectAdv>
            </div>
          )}

          <div className="relative">
            <label className="text-[11px] text-slate-400 mb-1 block">
              Forma de pago
            </label>
            <SunmiSelectAdv
              value={formaPago}
              onChange={(val) => setFormaPago(val)}
            >
              <option value="">Todas</option>
              <option value="efectivo">Efectivo</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="debito">Debito</option>
              <option value="credito">Credito</option>
            </SunmiSelectAdv>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <SunmiButton
            color="amber"
            onClick={cargarReporte}
            disabled={loading}
            className="flex-1"
          >
            {loading ? "Cargando..." : "Generar Reporte"}
          </SunmiButton>
        </div>

        {errorMsg && (
          <div className="mt-2 text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
            {errorMsg}
          </div>
        )}
      </SunmiCard>

      {/* Loader */}
      {loading && (
        <div className="text-center py-8">
          <SunmiLoader />
        </div>
      )}

      {/* Reporte */}
      {reporte && !loading && (
        <>
          {/* Resumen General */}
          <SunmiCard className="p-3">
            <SunmiSeparator label="Resumen Financiero" />

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
              <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                <div className="text-[10px] text-slate-400">Ventas</div>
                <div className="text-xl font-bold text-cyan-400">
                  {reporte.resumen.cantidadVentas}
                </div>
              </div>

              <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                <div className="text-[10px] text-slate-400">Total Bruto</div>
                <div className="text-xl font-bold text-amber-400">
                  ${formatPrecio(reporte.resumen.totalBruto)}
                </div>
              </div>

              <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                <div className="text-[10px] text-slate-400">Comisiones</div>
                <div className="text-xl font-bold text-orange-400">
                  -${formatPrecio(reporte.resumen.totalComisiones)}
                </div>
              </div>

              <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                <div className="text-[10px] text-slate-400">Neto Recibido</div>
                <div className="text-xl font-bold text-emerald-400">
                  ${formatPrecio(reporte.resumen.totalNeto)}
                </div>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg text-center">
                <div className="text-[10px] text-emerald-300">
                  Ganancia Neta
                </div>
                <div className="text-xl font-bold text-emerald-400">
                  ${formatPrecio(reporte.resumen.gananciaNeta)}
                </div>
              </div>
            </div>
          </SunmiCard>

          {/* Desglose por forma de pago */}
          {reporte.desglosePago && reporte.desglosePago.length > 0 && (
            <SunmiCard className="p-3">
              <SunmiSeparator label="Desglose por Forma de Pago" />

              <div className="overflow-x-auto mt-3">
                <SunmiTable
                  headers={[
                    "Forma de Pago",
                    "Ventas",
                    "Total Bruto",
                    "Comision",
                    "Neto Recibido",
                  ]}
                >
                  {reporte.desglosePago.map((item) => (
                    <tr key={item.formaPago} className="hover:bg-slate-800/40">
                      <td className="px-2 py-1.5 font-medium capitalize">
                        {item.formaPago}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.cantidad}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        ${formatPrecio(item.total)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-orange-400">
                        {item.comision > 0
                          ? `-$${formatPrecio(item.comision)}`
                          : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-emerald-400 font-bold">
                        ${formatPrecio(item.neto)}
                      </td>
                    </tr>
                  ))}
                </SunmiTable>
              </div>
            </SunmiCard>
          )}

          {/* Top productos */}
          {reporte.topProductos && reporte.topProductos.length > 0 && (
            <SunmiCard className="p-3">
              <SunmiSeparator label="Productos Mas Vendidos" />

              <div className="overflow-x-auto mt-3">
                <SunmiTable
                  headers={[
                    "Producto",
                    "Cant",
                    "Total Venta",
                    "Costo",
                    "Ganancia",
                    "Margen %",
                  ]}
                >
                  {reporte.topProductos.map((item, idx) => {
                    const margen =
                      item.totalVenta > 0
                        ? ((item.ganancia / item.totalVenta) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
                          {item.nombre}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {item.cantidad}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          ${formatPrecio(item.totalVenta)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                          ${formatPrecio(item.totalCosto)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-emerald-400">
                          ${formatPrecio(item.ganancia)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          <span
                            className={
                              margen > 30
                                ? "text-emerald-400"
                                : margen > 15
                                ? "text-amber-400"
                                : "text-red-400"
                            }
                          >
                            {margen}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </SunmiTable>
              </div>
            </SunmiCard>
          )}
        </>
      )}

      {/* Sin datos */}
      {!reporte && !loading && (
        <SunmiCard className="p-3">
          <div className="text-center py-12 text-slate-500">
            Selecciona las fechas y genera el reporte
          </div>
        </SunmiCard>
      )}
    </div>
  );
}
