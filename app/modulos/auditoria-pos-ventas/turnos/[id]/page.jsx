"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Printer, AlertTriangle, CheckCircle, MessageSquare } from "lucide-react";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

function fmt(n) {
  return Number(n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtHora(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("es-AR", { timeStyle: "short" });
  } catch {
    return "";
  }
}

function fmtFechaCorta(d) {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "\u2014";
  }
}

function getFranjaLabel(apertura) {
  if (!apertura) return "Turno";
  const h = new Date(apertura).getHours();
  if (h >= 6 && h < 13) return "Turno Ma\u00f1ana";
  if (h >= 13 && h < 20) return "Turno Tarde";
  return "Turno Noche";
}

export default function DetalleTurnoPage() {
  const params = useParams();
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();

  const turnoId = Number(params.id);

  const [turno, setTurno] = useState(null);
  const [ventas, setVentas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!turnoId) return;
    setCargando(true);
    setErr("");
    fetch(`/api/pos-ventas/turnos/ventas?turnoId=${turnoId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setErr(data.error || "Error al cargar detalle");
          return;
        }
        setTurno(data.turno);
        setVentas(data.ventas);
      })
      .catch(() => setErr("Error de conexi\u00f3n"))
      .finally(() => setCargando(false));
  }, [turnoId]);

  const totales = useMemo(() => {
    if (!ventas) return null;
    return ventas.reduce(
      (acc, v) => ({
        total: acc.total + v.total,
        neto: acc.neto + v.netoRecibido,
        costo: acc.costo + v.costoTotal,
        ganancia: acc.ganancia + v.gananciaNeta,
        comision: acc.comision + v.comisionBancaria,
      }),
      { total: 0, neto: 0, costo: 0, ganancia: 0, comision: 0 }
    );
  }, [ventas]);

  if (cargandoUsuario || !perfil) return null;
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("reportes.ver")) return <SinPermisos />;

  const franjaLabel = turno ? getFranjaLabel(turno.apertura) : "Turno";
  const vendedorNombre = turno?.vendedor?.nombre || "Sin nombre";

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-8 pb-20">
      {/* Barra de acciones (no se imprime) */}
      <div className="flex items-center justify-between py-5 print:hidden">
        <button
          onClick={() => window.print()}
          className="sunmi-btn-base sunmi-btn-cyan !h-8 !text-[12px] !px-4 !rounded-lg font-semibold inline-flex items-center gap-1.5"
        >
          <Printer size={14} /> Imprimir
        </button>
        <SunmiBackButton href="/modulos/auditoria-pos-ventas/turnos" />
      </div>

      {/* Cargando */}
      {cargando && (
        <div className="text-center py-20">
          <SunmiLoader />
        </div>
      )}

      {/* Error */}
      {err && (
        <div className="text-sm text-red-600 text-center bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-4">
          {err}
        </div>
      )}

      {/* Contenido imprimible */}
      {!cargando && !err && turno && (
        <div className="bg-white text-gray-900 rounded-2xl shadow-sm border border-gray-200 print:shadow-none print:border-0 print:rounded-none">
          <div className="px-8 py-8 print:px-12 print:py-10">

            {/* Encabezado */}
            <div className="border-b-2 border-gray-800 pb-5 mb-6">
              <h1 className="text-2xl font-black tracking-tight">{franjaLabel}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {vendedorNombre} &middot; {fmtFechaCorta(turno.apertura)}
              </p>
            </div>

            {/* Datos del turno */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 text-sm">
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Apertura</div>
                <div className="font-bold tabular-nums">
                  {fmtFechaCorta(turno.apertura)} {fmtHora(turno.apertura)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Cierre</div>
                <div className="font-bold tabular-nums">
                  {turno.cierre ? `${fmtFechaCorta(turno.cierre)} ${fmtHora(turno.cierre)}` : "Abierto"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Estado</div>
                <div className={`font-bold ${turno.cierre ? "text-green-600" : "text-blue-600"}`}>
                  {turno.cierre ? "Cerrado" : "Abierto"}
                </div>
              </div>
            </div>

            {/* Datos de caja */}
            {/*
              LOS COLORES DE ESTE RECUADRO SON FIJOS A PROPÓSITO, y es una
              excepción declarada, igual que el resto de los de esta pantalla.

              Esta tarjeta es un DOCUMENTO PARA PAPEL: nace en `bg-white
              text-gray-900` unas líneas más arriba y todo lo que vive adentro
              hereda ese negro sobre ese blanco. No sigue al tema, y no debe.

              El recuadro era el ÚNICO elemento de la tarjeta que leía un token,
              y por eso se rompía: `--card-bg` cambia con los catorce temas, el
              texto de arriba no cambia nunca, y en los oscuros quedaban uno
              encima del otro. Medido sobre la pantalla real, el valor daba
              1,03:1 en sunmiGraphite y operixNight, 1,23 en sunmiBlueClassic,
              1,31 en sunmiDarkCompact y 3,27 en sunmiDark. Cinco de catorce
              abajo de 4,5:1 — los números no se leían.

              El tono salió de medir, no de elegir a ojo: gray-50 se separa del
              blanco apenas 1,78 de L*, que está en el límite de lo perceptible
              —sirve para un hover, no para delimitar un bloque—. gray-100 se
              separa 3,83 y deja el valor en 16,12:1. Un solo número y no
              catorce, porque ya no depende del tema.

              El borde también era un token, y uno MUERTO: `--border` no está
              definido en ninguna parte del repo. Un var() sin definir invalida
              la declaración, así que el borde caía en `currentColor` y se
              dibujaba gray-900. `border-gray-900` pinta exactamente ese color
              —medido idéntico en los catorce— y saca el token.

              El papel no cambia: el fondo no se imprime y nunca se imprimió.
            */}
            {(turno.montoEsperadoEfectivo != null || turno.montoRealEfectivo != null) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3 text-sm border border-gray-900 rounded-xl p-4 bg-gray-100">
                {turno.montoInicial != null && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Monto inicial</div>
                    <div className="font-bold tabular-nums">${fmt(turno.montoInicial)}</div>
                  </div>
                )}
                {turno.totalVentasEfectivo != null && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Ventas efectivo</div>
                    <div className="font-bold tabular-nums">${fmt(turno.totalVentasEfectivo)}</div>
                  </div>
                )}
                {turno.totalVentasDigital != null && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Ventas digital</div>
                    <div className="font-bold tabular-nums">${fmt(turno.totalVentasDigital)}</div>
                  </div>
                )}
                {turno.montoEsperadoEfectivo != null && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Esperado efectivo</div>
                    <div className="font-bold tabular-nums">${fmt(turno.montoEsperadoEfectivo)}</div>
                  </div>
                )}
                {turno.montoRealEfectivo != null && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Real efectivo</div>
                    <div className="font-bold tabular-nums">${fmt(turno.montoRealEfectivo)}</div>
                  </div>
                )}
              </div>
            )}

            {/* Resultado arqueo */}
            {turno.diferenciaEfectivo != null && (() => {
              const dif = turno.diferenciaEfectivo;
              if (dif === 0) return (
                <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-green-200 bg-green-50 mb-6">
                  <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-[16px] font-bold text-green-800">Caja cuadrada</div>
                    <div className="text-[12px] text-green-700">El efectivo contado coincide con el esperado</div>
                  </div>
                  <div className="text-[18px] font-bold tabular-nums text-green-700">$0,00</div>
                </div>
              );
              if (dif < 0) return (
                <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-red-200 bg-red-50 mb-6">
                  <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-[16px] font-bold text-red-800">Faltante de efectivo</div>
                    <div className="text-[12px] text-red-700">El cajero contó menos de lo esperado</div>
                  </div>
                  <div className="text-[18px] font-bold tabular-nums text-red-700">${fmt(Math.abs(dif))}</div>
                </div>
              );
              return (
                <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-amber-200 bg-amber-50 mb-6">
                  <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-[16px] font-bold text-amber-800">Sobrante de efectivo</div>
                    <div className="text-[12px] text-amber-700">El cajero contó más de lo esperado</div>
                  </div>
                  <div className="text-[18px] font-bold tabular-nums text-amber-700">+${fmt(dif)}</div>
                </div>
              );
            })()}

            {/* Observaciones */}
            {turno.observaciones && (
              <div className="mb-6 flex gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex-shrink-0 mt-0.5">
                  <MessageSquare size={16} className="text-amber-600" />
                </div>
                <div>
                  <div className="text-[10px] text-amber-700 uppercase tracking-wider font-semibold mb-1">
                    Observaciones del cajero
                  </div>
                  <p className="text-[13px] text-amber-900">{turno.observaciones}</p>
                </div>
              </div>
            )}

            {/* Tabla de ventas */}
            {ventas && (
              <>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Detalle de ventas ({ventas.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-800 text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="py-2 pr-3 text-left">#</th>
                        <th className="py-2 px-3 text-left">Fecha / Hora</th>
                        <th className="py-2 px-3 text-left">Forma pago</th>
                        <th className="py-2 px-3 text-right">Total</th>
                        <th className="py-2 px-3 text-right">Comisión</th>
                        <th className="py-2 px-3 text-right">Neto</th>
                        <th className="py-2 px-3 text-right">Costo</th>
                        <th className="py-2 pl-3 text-right">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((v) => (
                        <tr key={v.id} className="border-b border-gray-200 hover:bg-gray-50 print:hover:bg-transparent">
                          <td className="py-2 pr-3 font-mono text-xs text-gray-500">{v.numero}</td>
                          <td className="py-2 px-3 tabular-nums whitespace-nowrap">
                            {v.fecha
                              ? new Date(v.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                              : "\u2014"}
                          </td>
                          <td className="py-2 px-3 capitalize">{v.formaPago}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">${fmt(v.total)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-400">${fmt(v.comisionBancaria)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">${fmt(v.netoRecibido)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-400">${fmt(v.costoTotal)}</td>
                          <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${v.gananciaNeta < 0 ? "text-red-600" : "text-green-600"}`}>
                            ${fmt(v.gananciaNeta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {totales && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-800 font-bold">
                          <td className="py-3 pr-3" colSpan={3}>
                            TOTAL ({ventas.length} ventas)
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">${fmt(totales.total)}</td>
                          <td className="py-3 px-3 text-right tabular-nums text-gray-400">${fmt(totales.comision)}</td>
                          <td className="py-3 px-3 text-right tabular-nums">${fmt(totales.neto)}</td>
                          <td className="py-3 px-3 text-right tabular-nums text-gray-400">${fmt(totales.costo)}</td>
                          <td className={`py-3 pl-3 text-right tabular-nums ${totales.ganancia < 0 ? "text-red-600" : "text-green-600"}`}>
                            ${fmt(totales.ganancia)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {ventas.length === 0 && (
                  <p className="text-center text-gray-400 py-8 text-sm">Este turno no tiene ventas registradas.</p>
                )}
              </>
            )}

            {/* Pie */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between">
              <span>Generado: {new Date().toLocaleString("es-AR")}</span>
              <span>ERP Azul</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
