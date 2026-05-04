"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ReportesVentasPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  // Filtros
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
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
      if (contexto?.localId) params.set("localId", String(contexto.localId));
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

  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const permisosR = perfil?.permisos || [];
  const esAdminR = Array.isArray(permisosR) && permisosR.includes("*");
  if (!esAdminR && !permisosR.includes("reportes.ver")) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Ventas</h1>
        <p className="text-sm sunmi-text-muted">
          Analisis de ventas, comisiones y rentabilidad
        </p>
      </div>

      {/* Filtros */}
      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        <SunmiSeparator label="Filtros" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 relative">
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Desde
            </label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Hasta
            </label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>

          <div className="relative">
            <label className="text-[11px] sunmi-text-muted mb-1 block">
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
          <div className="mt-2 text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
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
              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Ventas</div>
                <div className="text-xl font-bold sunmi-text-link">
                  {reporte.resumen.cantidadVentas}
                </div>
              </div>

              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Total Bruto</div>
                <div className="text-xl font-bold sunmi-text-accent">
                  ${formatPrecio(reporte.resumen.totalBruto)}
                </div>
              </div>

              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Comisiones</div>
                <div className="text-xl font-bold sunmi-text-accent">
                  -${formatPrecio(reporte.resumen.totalComisiones)}
                </div>
              </div>

              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Neto Recibido</div>
                <div className="text-xl font-bold sunmi-text-success">
                  ${formatPrecio(reporte.resumen.totalNeto)}
                </div>
              </div>

              <div className="sunmi-state-success p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-success">
                  Ganancia Neta
                </div>
                <div className="text-xl font-bold sunmi-text-success">
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
                    <tr key={item.formaPago} className="hover:bg-[var(--hover-bg)]">
                      <td className="px-2 py-1.5 font-medium capitalize">
                        {item.formaPago}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.cantidad}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        ${formatPrecio(item.total)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono sunmi-text-accent">
                        {item.comision > 0
                          ? `-$${formatPrecio(item.comision)}`
                          : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono sunmi-text-success font-bold">
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
                      <tr key={idx} className="hover:bg-[var(--hover-bg)]">
                        <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
                          {item.nombre}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {item.cantidad}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          ${formatPrecio(item.totalVenta)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono sunmi-text-muted">
                          ${formatPrecio(item.totalCosto)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono sunmi-text-success">
                          ${formatPrecio(item.ganancia)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          <span
                            className={
                              margen > 30
                                ? "sunmi-text-success"
                                : margen > 15
                                ? "sunmi-text-accent"
                                : "sunmi-text-danger"
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
          <div className="text-center py-12 sunmi-text-muted">
            Selecciona las fechas y genera el reporte
          </div>
        </SunmiCard>
      )}
    </div>
  );
}
