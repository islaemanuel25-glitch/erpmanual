"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";

const fmtFecha = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const FORMA_PAGO_LABELS = {
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  debito: "Debito",
  credito: "Credito",
  fiado: "Fiado",
};

export default function TurnoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const turnoId = params?.id;

  const { perfil, cargando: cargandoUser } = useUser();
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [turno, setTurno] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeUsar = esAdmin || permisos.includes("pos.usar");

  useEffect(() => {
    if (!turnoId || !contexto?.localId) return;

    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const [resVentas, resResumen] = await Promise.all([
          fetch(`/api/pos-ventas/turnos/ventas?turnoId=${turnoId}`, {
            credentials: "include",
          }),
          fetch(`/api/pos-ventas/turnos/resumen?turnoId=${turnoId}`, {
            credentials: "include",
          }),
        ]);

        const dataVentas = await resVentas.json();
        const dataResumen = await resResumen.json();

        if (dataVentas.ok) {
          setTurno(dataVentas.turno);
          setVentas(dataVentas.ventas || []);
        } else {
          setError(dataVentas.error || "Error cargando turno");
        }

        if (dataResumen.ok) {
          setResumen(dataResumen);
        }
      } catch (err) {
        console.error("Error cargando detalle turno:", err);
        setError("Error de conexion");
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [turnoId, contexto?.localId]);

  if (cargandoUser || cargandoCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }
  if (!puedeUsar) return <SinPermisos />;

  if (loading) {
    return (
      <div className="p-3">
        <SunmiLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 space-y-3">
        <SunmiCard>
          <p className="sunmi-text-danger">{error}</p>
          <SunmiButton color="slate" onClick={() => router.push("/modulos/turnos")} className="mt-3">
            Volver
          </SunmiButton>
        </SunmiCard>
      </div>
    );
  }

  if (!turno) return null;

  const ventaHeaders = [
    "#",
    "Fecha",
    "Total",
    "Forma Pago",
    "Neto Recibido",
    "Comision",
    "Costo",
    "Ganancia Neta",
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Header del turno */}
      <SunmiCard>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">
            Turno #{turno.id} - {turno.vendedor?.nombre || "-"}
          </h1>
          <SunmiButton color="slate" onClick={() => router.push("/modulos/turnos")}>
            Volver
          </SunmiButton>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <span className="sunmi-text-muted text-xs">Apertura</span>
            <p className="font-semibold text-sm">{fmtFecha(turno.apertura)}</p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Cierre</span>
            <p className="font-semibold text-sm">
              {turno.cierre ? (
                fmtFecha(turno.cierre)
              ) : (
                <span className="sunmi-text-success">Abierto</span>
              )}
            </p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Monto Inicial</span>
            <p className="font-semibold text-sm">${fmt(turno.montoInicial)}</p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Cant. Ventas</span>
            <p className="font-semibold text-sm">{turno.cantidadVentas ?? ventas.length}</p>
          </div>
        </div>

        {turno.cierre && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <div>
              <span className="sunmi-text-muted text-xs">Esperado Efectivo</span>
              <p className="font-semibold text-sm">${fmt(turno.montoEsperadoEfectivo)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Real Efectivo</span>
              <p className="font-semibold text-sm">${fmt(turno.montoRealEfectivo)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Diferencia</span>
              <p
                className={`font-semibold text-sm ${
                  turno.diferenciaEfectivo != null && turno.diferenciaEfectivo < 0
                    ? "sunmi-text-danger"
                    : turno.diferenciaEfectivo != null && turno.diferenciaEfectivo > 0
                    ? "sunmi-text-success"
                    : ""
                }`}
              >
                ${fmt(turno.diferenciaEfectivo)}
              </p>
            </div>
          </div>
        )}

        {turno.observaciones && (
          <div className="mt-3">
            <span className="sunmi-text-muted text-xs">Observaciones</span>
            <p className="text-sm">{turno.observaciones}</p>
          </div>
        )}
      </SunmiCard>

      {/* Resumen por forma de pago */}
      {resumen && (
        <SunmiCard>
          <SunmiSeparator label="Resumen por Forma de Pago" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div>
              <span className="sunmi-text-muted text-xs">Efectivo</span>
              <p className="font-semibold text-sm">${fmt(resumen.totalEfectivo)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Digital (bruto)</span>
              <p className="font-semibold text-sm">${fmt(resumen.totalDigital)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Comisiones</span>
              <p className="font-semibold text-sm sunmi-text-danger">
                -${fmt(resumen.totalComision)}
              </p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Neto Digital</span>
              <p className="font-semibold text-sm">${fmt(resumen.netoDigital)}</p>
            </div>
          </div>
          {resumen.desglose && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <span className="sunmi-text-muted text-xs">MercadoPago</span>
                <p className="text-sm">${fmt(resumen.desglose.mercadopago)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Debito</span>
                <p className="text-sm">${fmt(resumen.desglose.debito)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Credito</span>
                <p className="text-sm">${fmt(resumen.desglose.credito)}</p>
              </div>
            </div>
          )}
        </SunmiCard>
      )}

      {/* Tabla de ventas */}
      <SunmiCard>
        <SunmiSeparator label="Ventas del Turno" />
        <SunmiTable headers={ventaHeaders}>
          {ventas.length === 0 ? (
            <SunmiTableEmpty colSpan={ventaHeaders.length} />
          ) : (
            ventas.map((v) => (
              <SunmiTableRow key={v.id}>
                <td className="px-3 py-2 text-sm font-semibold">{v.numero}</td>
                <td className="px-3 py-2 text-sm">{fmtFecha(v.fecha)}</td>
                <td className="px-3 py-2 text-sm text-right">${fmt(v.total)}</td>
                <td className="px-3 py-2 text-sm">
                  {FORMA_PAGO_LABELS[v.formaPago] || v.formaPago}
                </td>
                <td className="px-3 py-2 text-sm text-right">${fmt(v.netoRecibido)}</td>
                <td className="px-3 py-2 text-sm text-right sunmi-text-danger">
                  {v.comisionBancaria > 0 ? `-${fmt(v.comisionBancaria)}` : "-"}
                </td>
                <td className="px-3 py-2 text-sm text-right">${fmt(v.costoTotal)}</td>
                <td className="px-3 py-2 text-sm text-right">${fmt(v.gananciaNeta)}</td>
              </SunmiTableRow>
            ))
          )}
        </SunmiTable>
      </SunmiCard>
    </div>
  );
}
