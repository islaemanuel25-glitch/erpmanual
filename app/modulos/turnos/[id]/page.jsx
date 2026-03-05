"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { showError, showSuccess } from "@/components/sunmi/SunmiToast";

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

const fmtHora = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("es-AR", {
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

function imprimirZReport(turno, resumen, movimientos) {
  const totalVentas =
    (resumen.totalEfectivo || 0) + (resumen.totalDigital || 0);
  const totalIngresos = (movimientos || [])
    .filter((m) => m.tipo === "INGRESO")
    .reduce((s, m) => s + m.monto, 0);
  const totalRetiros = (movimientos || [])
    .filter((m) => m.tipo === "RETIRO")
    .reduce((s, m) => s + m.monto, 0);
  const esperado =
    Number(turno.montoInicial) + (resumen.totalEfectivo || 0) + totalIngresos - totalRetiros;

  let movHtml = "";
  if (movimientos && movimientos.length > 0) {
    movHtml = `
<div class="line"></div>
<div class="center bold">MOVIMIENTOS CAJA</div>
<div class="row"><span>Ingresos:</span><span>+$${fmt(totalIngresos)}</span></div>
<div class="row"><span>Retiros:</span><span>-$${fmt(totalRetiros)}</span></div>`;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Z Report - Turno #${turno.id}</title>
<style>
  body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .row span:last-child { text-align: right; }
  .big { font-size: 14px; }
  h2 { margin: 4px 0; font-size: 14px; }
</style></head><body>
<div class="center bold big">Z REPORT</div>
<div class="center">Cierre de Turno</div>
<div class="line"></div>
<div class="row"><span>Turno:</span><span>#${turno.id}</span></div>
<div class="row"><span>Cajero:</span><span>${turno.vendedor?.nombre || "-"}</span></div>
<div class="row"><span>Apertura:</span><span>${fmtFecha(turno.apertura)}</span></div>
<div class="row"><span>Cierre:</span><span>${fmtFecha(turno.cierre)}</span></div>
<div class="line"></div>
<div class="center bold">VENTAS</div>
<div class="row"><span>Cantidad:</span><span>${resumen.cantidadVentas || 0}</span></div>
<div class="line"></div>
<div class="row"><span>Efectivo:</span><span>$${fmt(resumen.totalEfectivo)}</span></div>
<div class="row"><span>MercadoPago:</span><span>$${fmt(resumen.desglose?.mercadopago)}</span></div>
<div class="row"><span>Debito:</span><span>$${fmt(resumen.desglose?.debito)}</span></div>
<div class="row"><span>Credito:</span><span>$${fmt(resumen.desglose?.credito)}</span></div>
<div class="row"><span>Fiado:</span><span>$${fmt(resumen.desglose?.fiado)}</span></div>
<div class="line"></div>
<div class="row bold"><span>Total ventas:</span><span>$${fmt(totalVentas)}</span></div>
${movHtml}
<div class="line"></div>
<div class="center bold">ARQUEO EFECTIVO</div>
<div class="row"><span>Monto inicial:</span><span>$${fmt(turno.montoInicial)}</span></div>
<div class="row"><span>+ Ventas efectivo:</span><span>$${fmt(resumen.totalEfectivo)}</span></div>
${totalIngresos > 0 ? `<div class="row"><span>+ Ingresos:</span><span>$${fmt(totalIngresos)}</span></div>` : ""}
${totalRetiros > 0 ? `<div class="row"><span>- Retiros:</span><span>$${fmt(totalRetiros)}</span></div>` : ""}
<div class="row bold"><span>Esperado:</span><span>$${fmt(esperado)}</span></div>
<div class="row"><span>Real contado:</span><span>$${fmt(turno.montoRealEfectivo)}</span></div>
<div class="row bold"><span>Diferencia:</span><span>$${fmt(turno.diferenciaEfectivo)}</span></div>
<div class="line"></div>
<div class="center" style="font-size:10px; margin-top:8px;">Impreso: ${new Date().toLocaleString("es-AR")}</div>
</body></html>`;

  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export default function TurnoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const turnoId = params?.id;

  const { perfil, cargando: cargandoUser } = useUser();
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [turno, setTurno] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal movimiento caja
  const [modalMov, setModalMov] = useState(null); // null | "INGRESO" | "RETIRO"
  const [movMonto, setMovMonto] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [guardandoMov, setGuardandoMov] = useState(false);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeUsar = esAdmin || permisos.includes("pos.usar");

  const cargarMovimientos = useCallback(async () => {
    if (!turnoId) return;
    try {
      const res = await fetch(
        `/api/pos-ventas/caja-movimientos/listar?turnoId=${turnoId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) setMovimientos(data.items || []);
    } catch {
      // silencioso
    }
  }, [turnoId]);

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
    cargarMovimientos();
  }, [turnoId, contexto?.localId, cargarMovimientos]);

  const handleGuardarMovimiento = async () => {
    const montoNum = Number(movMonto);
    if (!montoNum || montoNum <= 0) {
      showError("Ingresa un monto valido");
      return;
    }

    setGuardandoMov(true);
    try {
      const res = await fetch("/api/pos-ventas/caja-movimientos/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnoId: Number(turnoId),
          tipo: modalMov,
          monto: montoNum,
          motivo: movMotivo || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`${modalMov === "INGRESO" ? "Ingreso" : "Retiro"} registrado`);
        setModalMov(null);
        setMovMonto("");
        setMovMotivo("");
        cargarMovimientos();
      } else {
        showError(data.error || "Error al registrar movimiento");
      }
    } catch {
      showError("Error de conexion");
    } finally {
      setGuardandoMov(false);
    }
  };

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

  const estaCerrado = turno.cierre != null;
  const totalVentas =
    (resumen?.totalEfectivo || 0) + (resumen?.totalDigital || 0);

  const totalIngresos = movimientos
    .filter((m) => m.tipo === "INGRESO")
    .reduce((s, m) => s + m.monto, 0);
  const totalRetiros = movimientos
    .filter((m) => m.tipo === "RETIRO")
    .reduce((s, m) => s + m.monto, 0);

  const esperadoEfectivo =
    Number(turno.montoInicial) +
    (resumen?.totalEfectivo || 0) +
    totalIngresos -
    totalRetiros;

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

  const movHeaders = ["Hora", "Tipo", "Motivo", "Monto", "Usuario"];

  return (
    <div className="p-3 space-y-3">
      {/* Header del turno */}
      <SunmiCard>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">
            Turno #{turno.id} - {turno.vendedor?.nombre || "-"}
          </h1>
          <div className="flex gap-2">
            {estaCerrado && resumen && (
              <SunmiButton
                color="cyan"
                onClick={() => imprimirZReport(turno, resumen, movimientos)}
              >
                Imprimir Z Report
              </SunmiButton>
            )}
            <SunmiButton color="slate" onClick={() => router.push("/modulos/turnos")}>
              Volver
            </SunmiButton>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <span className="sunmi-text-muted text-xs">Apertura</span>
            <p className="font-semibold text-sm">{fmtFecha(turno.apertura)}</p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Cierre</span>
            <p className="font-semibold text-sm">
              {estaCerrado ? (
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
            <p className="font-semibold text-sm">
              {resumen?.cantidadVentas ?? turno.cantidadVentas ?? ventas.length}
            </p>
          </div>
        </div>

        {turno.observaciones && (
          <div className="mt-3">
            <span className="sunmi-text-muted text-xs">Observaciones</span>
            <p className="text-sm">{turno.observaciones}</p>
          </div>
        )}
      </SunmiCard>

      {/* X Report (siempre visible) */}
      {resumen && (
        <SunmiCard>
          <div className="flex items-center justify-between mb-1">
            <SunmiSeparator label={estaCerrado ? "Reporte de turno" : "Reporte de turno (X Report)"} />
            {!estaCerrado && (
              <span className="text-xs font-semibold sunmi-text-success px-2 py-0.5 rounded-full sunmi-state-success">
                Turno abierto
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <div>
              <span className="sunmi-text-muted text-xs">Efectivo</span>
              <p className="font-semibold text-sm">${fmt(resumen.totalEfectivo)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">MercadoPago</span>
              <p className="font-semibold text-sm">${fmt(resumen.desglose?.mercadopago)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Debito</span>
              <p className="font-semibold text-sm">${fmt(resumen.desglose?.debito)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Credito</span>
              <p className="font-semibold text-sm">${fmt(resumen.desglose?.credito)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Fiado</span>
              <p className="font-semibold text-sm">${fmt(resumen.desglose?.fiado)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t sunmi-divider">
            <div>
              <span className="sunmi-text-muted text-xs">Total Digital (bruto)</span>
              <p className="font-semibold text-sm">${fmt(resumen.totalDigital)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Comisiones</span>
              <p className="font-semibold text-sm sunmi-text-danger">-${fmt(resumen.totalComision)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Total Ventas</span>
              <p className="font-bold text-base sunmi-text-accent">${fmt(totalVentas)}</p>
            </div>
          </div>
        </SunmiCard>
      )}

      {/* Movimientos de Caja */}
      <SunmiCard>
        <div className="flex items-center justify-between mb-1">
          <SunmiSeparator label="Movimientos de Caja" />
          {!estaCerrado && (
            <div className="flex gap-2">
              <SunmiButton
                color="cyan"
                onClick={() => { setModalMov("INGRESO"); setMovMonto(""); setMovMotivo(""); }}
                className="!text-sm"
              >
                + Ingreso
              </SunmiButton>
              <SunmiButton
                color="amber"
                onClick={() => { setModalMov("RETIRO"); setMovMonto(""); setMovMotivo(""); }}
                className="!text-sm"
              >
                + Retiro
              </SunmiButton>
            </div>
          )}
        </div>

        {movimientos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3 mt-2">
            <div className="sunmi-surface-soft p-2 rounded-lg text-center">
              <div className="text-[10px] sunmi-text-muted">Ingresos</div>
              <div className="text-sm font-bold sunmi-text-success">+${fmt(totalIngresos)}</div>
            </div>
            <div className="sunmi-surface-soft p-2 rounded-lg text-center">
              <div className="text-[10px] sunmi-text-muted">Retiros</div>
              <div className="text-sm font-bold sunmi-text-danger">-${fmt(totalRetiros)}</div>
            </div>
          </div>
        )}

        <SunmiTable headers={movHeaders}>
          {movimientos.length === 0 ? (
            <SunmiTableEmpty colSpan={movHeaders.length} />
          ) : (
            movimientos.map((m) => (
              <SunmiTableRow key={m.id}>
                <td className="px-3 py-2 text-sm">{fmtHora(m.createdAt)}</td>
                <td className="px-3 py-2 text-sm">
                  <span
                    className={`font-semibold ${
                      m.tipo === "INGRESO" ? "sunmi-text-success" : "sunmi-text-danger"
                    }`}
                  >
                    {m.tipo}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm">{m.motivo || "-"}</td>
                <td className="px-3 py-2 text-sm text-right font-semibold">
                  {m.tipo === "INGRESO" ? "+" : "-"}${fmt(m.monto)}
                </td>
                <td className="px-3 py-2 text-sm">{m.usuario?.nombre || "-"}</td>
              </SunmiTableRow>
            ))
          )}
        </SunmiTable>
      </SunmiCard>

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

      {/* Z Report (solo turno cerrado) */}
      {estaCerrado && resumen && (
        <SunmiCard>
          <SunmiSeparator label="Cierre de turno (Z Report)" />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <div>
              <span className="sunmi-text-muted text-xs">Monto Inicial</span>
              <p className="font-semibold text-sm">${fmt(turno.montoInicial)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Ventas Efectivo</span>
              <p className="font-semibold text-sm">${fmt(resumen.totalEfectivo)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Ventas Digital</span>
              <p className="font-semibold text-sm">${fmt(resumen.totalDigital)}</p>
            </div>
          </div>

          {(totalIngresos > 0 || totalRetiros > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t sunmi-divider">
              <div>
                <span className="sunmi-text-muted text-xs">Ingresos Caja</span>
                <p className="font-semibold text-sm sunmi-text-success">+${fmt(totalIngresos)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Retiros Caja</span>
                <p className="font-semibold text-sm sunmi-text-danger">-${fmt(totalRetiros)}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t sunmi-divider">
            <div>
              <span className="sunmi-text-muted text-xs">Total Ventas</span>
              <p className="font-bold text-sm">${fmt(totalVentas)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Esperado Efectivo</span>
              <p className="font-bold text-sm">${fmt(esperadoEfectivo)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t sunmi-divider">
            <div>
              <span className="sunmi-text-muted text-xs">Real Contado</span>
              <p className="font-bold text-sm">${fmt(turno.montoRealEfectivo)}</p>
            </div>
            <div>
              <span className="sunmi-text-muted text-xs">Diferencia</span>
              <p
                className={`font-bold text-base ${
                  turno.diferenciaEfectivo != null && Number(turno.diferenciaEfectivo) !== 0
                    ? "sunmi-text-danger"
                    : "sunmi-text-success"
                }`}
              >
                ${fmt(turno.diferenciaEfectivo)}
              </p>
            </div>
          </div>
        </SunmiCard>
      )}

      {/* Modal ingreso/retiro */}
      {modalMov && (
        <div className="fixed inset-0 sunmi-overlay-strong flex items-center justify-center p-4 z-50">
          <SunmiCard className="w-full max-w-sm p-4">
            <h3 className="text-lg font-bold mb-3">
              {modalMov === "INGRESO" ? "Ingreso de Efectivo" : "Retiro de Efectivo"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs sunmi-text-muted">Monto</label>
                <SunmiInput
                  type="number"
                  placeholder="0.00"
                  value={movMonto}
                  onChange={(e) => setMovMonto(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs sunmi-text-muted">Motivo (opcional)</label>
                <SunmiInput
                  placeholder="Ej: cambio, pago proveedor..."
                  value={movMotivo}
                  onChange={(e) => setMovMotivo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <SunmiButton
                color={modalMov === "INGRESO" ? "cyan" : "amber"}
                onClick={handleGuardarMovimiento}
                disabled={guardandoMov}
                className="flex-1"
              >
                {guardandoMov ? "Guardando..." : "Confirmar"}
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => setModalMov(null)}
                disabled={guardandoMov}
                className="flex-1"
              >
                Cancelar
              </SunmiButton>
            </div>
          </SunmiCard>
        </div>
      )}
    </div>
  );
}
