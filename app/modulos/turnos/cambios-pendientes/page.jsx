"use client";

// CAMBIOS PENDIENTES — vista de consulta.
//
// Muestra el traspaso de cambio entre turnos: qué dejó cada cierre, quién lo
// tomó y con qué diferencia. Es la contracara de la bandeja del POS: allá se
// listan solo los sobres que uno puede tomar; acá se ve la cadena completa,
// incluidos los ya recibidos y los cancelados.
//
// POR QUÉ NO TIENE ACCIONES
//
// Es deliberado. Un cambio pendiente representa plata física en un cajón: una
// pantalla administrativa que permitiera "marcar como recibido" o "corregir el
// importe" estaría afirmando algo sobre billetes que nadie contó. Lo único que
// se puede hacer desde acá es liberar una reserva VENCIDA —que no mueve plata,
// solo devuelve el sobre a la lista— y usa el endpoint que ya existe.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { DesgloseResumido } from "@/components/caja/PanelesApertura";
import { etiquetaEstadoCambio } from "@/lib/caja/circuitoDinero";
import { reservaVencida } from "@/lib/caja/cierreRelevo";

const money = (n) =>
  n == null ? "—" : "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      });
};

const TONO = {
  DISPONIBLE: "sunmi-text-link",
  RESERVADO: "sunmi-text-warning",
  RECIBIDO: "sunmi-text-success",
  CANCELADO: "sunmi-text-muted",
  VENCIDO: "sunmi-text-danger",
};

export default function CambiosPendientesPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");

  const cargar = useCallback(async () => {
    setError("");
    try {
      // `incluirCerrados=1`: acá sí se muestran los recibidos y cancelados,
      // porque el objetivo es ver la cadena completa y no elegir uno.
      const r = await fetch("/api/pos-ventas/cambios-pendientes/listar?incluirCerrados=1", {
        credentials: "include",
        cache: "no-store",
      }).then((x) => x.json());
      if (!r?.ok) {
        setError(r?.error || "No se pudieron leer los cambios.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(r.items) ? r.items : []);
      if (r.reservasLiberadas > 0) {
        setAviso(
          `Se liberaron ${r.reservasLiberadas} reserva${r.reservasLiberadas === 1 ? "" : "s"} vencida${
            r.reservasLiberadas === 1 ? "" : "s"
          }.`
        );
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeUsar || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, puedeUsar, needsContexto]);

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeUsar) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-[1100px] mx-auto">
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              Cambios pendientes
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              El cambio que cada cierre dejó para el turno siguiente
              {contexto?.nombre ? ` · ${contexto.nombre}` : ""}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <button type="button" onClick={cargar} className="text-[11px] sunmi-text-muted inline-flex items-center gap-1">
              <RefreshCw size={14} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => router.push("/modulos/turnos")}
              className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Cajas
            </button>
          </div>
        </div>
      </SunmiCard>

      {aviso && (
        <div className="sunmi-surface-soft sunmi-text-muted sunmi-border rounded-lg p-2 text-[11px] leading-snug">
          {aviso}
        </div>
      )}

      {needsContexto ? (
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un local para ver sus cambios pendientes.
          </p>
        </SunmiCard>
      ) : cargando ? (
        <SunmiLoader />
      ) : error ? (
        <SunmiCard className="space-y-3">
          <p className="text-sm text-center py-4 sunmi-text-danger">{error}</p>
          <SunmiButton color="slate" onClick={cargar} className="w-full py-3">
            Reintentar
          </SunmiButton>
        </SunmiCard>
      ) : items.length === 0 ? (
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            No hay cambios registrados en este local.
          </p>
        </SunmiCard>
      ) : (
        <div className="space-y-2">
          {items.map((x) => (
            <SunmiCard key={x.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold sunmi-text-strong leading-tight">
                    Turno{" "}
                    <Link href={`/modulos/turnos/${x.turnoOrigenId}`} className="sunmi-text-link underline">
                      #{x.turnoOrigenId}
                    </Link>{" "}
                    · {x.operadorOrigen || x.cajeroOrigen || "Sin operario"}
                  </div>
                  <div className="text-[11px] sunmi-text-muted leading-tight">
                    Dejado {fecha(x.dejadoEn)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] sunmi-text-muted leading-tight">Importe dejado</div>
                  <div className="text-base font-bold font-mono tabular-nums sunmi-text-accent leading-tight">
                    {money(x.total)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sunmi-surface-soft rounded px-2 py-1.5">
                  <div className="text-[11px] sunmi-text-muted mb-1">Denominaciones dejadas</div>
                  <DesgloseResumido desglose={x.desglose} />
                </div>
                {x.desgloseRecibido && (
                  <div className="sunmi-surface-soft rounded px-2 py-1.5">
                    <div className="text-[11px] sunmi-text-muted mb-1">Denominaciones recibidas</div>
                    <DesgloseResumido desglose={x.desgloseRecibido} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <div className="sunmi-text-muted">Estado</div>
                  <div className={`font-semibold ${TONO[x.estado] || ""}`}>
                    {etiquetaEstadoCambio(x.estado)}
                  </div>
                </div>
                <div>
                  <div className="sunmi-text-muted">Reserva actual</div>
                  <div className="font-semibold">
                    {x.estado === "RESERVADO" ? (
                      reservaVencida(x) ? (
                        <span className="sunmi-text-danger">Vencida</span>
                      ) : (
                        <span className="sunmi-text-warning">Vigente</span>
                      )
                    ) : (
                      <span className="sunmi-text-muted">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="sunmi-text-muted">Lo recibió</div>
                  <div className="font-semibold">
                    {x.operadorRecibio || x.cajeroDestino || <span className="sunmi-text-muted">—</span>}
                  </div>
                </div>
                <div>
                  <div className="sunmi-text-muted">Turno destino</div>
                  <div className="font-semibold">
                    {x.turnoDestinoId ? (
                      <Link href={`/modulos/turnos/${x.turnoDestinoId}`} className="sunmi-text-link underline">
                        #{x.turnoDestinoId}
                      </Link>
                    ) : (
                      <span className="sunmi-text-muted">—</span>
                    )}
                  </div>
                </div>
              </div>

              {x.totalRecibido != null && (
                <div className="grid grid-cols-3 gap-2 text-[11px] sunmi-surface-soft rounded px-2 py-1.5">
                  <div>
                    <div className="sunmi-text-muted">Declarado</div>
                    <div className="font-mono tabular-nums">{money(x.total)}</div>
                  </div>
                  <div>
                    <div className="sunmi-text-muted">Contado al recibir</div>
                    <div className="font-mono tabular-nums">{money(x.totalRecibido)}</div>
                  </div>
                  <div>
                    <div className="sunmi-text-muted">Diferencia</div>
                    <div
                      className={`font-mono tabular-nums font-semibold ${
                        !x.diferencia ? "" : x.diferencia > 0 ? "sunmi-text-warning" : "sunmi-text-danger"
                      }`}
                    >
                      {money(x.diferencia)}
                    </div>
                  </div>
                </div>
              )}

              {x.motivoDiferencia && (
                <p className="text-[11px] sunmi-text-warning leading-snug">
                  Motivo de la diferencia: {x.motivoDiferencia}
                </p>
              )}
              {x.observacion && (
                <p className="text-[11px] sunmi-text-muted leading-snug">
                  Observación del cierre: {x.observacion}
                </p>
              )}
            </SunmiCard>
          ))}
        </div>
      )}
    </div>
  );
}
