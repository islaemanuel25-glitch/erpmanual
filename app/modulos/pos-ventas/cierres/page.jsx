"use client";

// BANDEJA DE CIERRES PENDIENTES.
//
// Existe por una razón concreta: el corte ya congeló un turno. La pestaña se
// puede cerrar, el navegador se puede reiniciar y el cajero se puede ir a su
// casa. Sin un lugar donde encontrar ese cierre, esa caja quedaría trabada —sin
// vender y sin cerrar— y nadie sabría por qué.
//
// Es deliberadamente mínima: lista, estado y un botón para continuar. La
// selección de cambios para el operador que entra NO va acá; es otra pantalla y
// otra etapa.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { FilaCierrePendiente, FilaCajaAbiertaForzable } from "@/components/caja/PanelesCierre";
import ModalCerrarSinConteo from "@/components/caja/ModalCerrarSinConteo";
import { PERMISO_CERRAR_SIN_CONTEO } from "@/lib/caja/cierreRelevo";

export default function CierresPendientesPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState([]);
  // Las cajas abiertas de otros operadores. El servidor las manda SOLO a quien
  // puede forzar (Admin, o el dueño en su local); para el resto viene vacía.
  const [cajasAbiertas, setCajasAbiertas] = useState([]);
  const [forzando, setForzando] = useState(false);
  const [errorForzar, setErrorForzar] = useState("");
  const [error, setError] = useState("");

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  // La resolución excepcional. El servidor la vuelve a exigir: esto solo decide si
  // el botón se ofrece.
  const puedeCerrarSinConteo = permisos.includes("*") || permisos.includes(PERMISO_CERRAR_SIN_CONTEO);

  const [sinConteo, setSinConteo] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [errorSinConteo, setErrorSinConteo] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/pos-ventas/cierres/pendientes", {
        credentials: "include",
        cache: "no-store",
      }).then((x) => x.json());
      if (!r?.ok) {
        setError(r?.error || "No se pudieron leer los cierres pendientes.");
        setItems([]);
        setCajasAbiertas([]);
        return;
      }
      setItems(Array.isArray(r.items) ? r.items : []);
      setCajasAbiertas(Array.isArray(r.cajasAbiertas) ? r.cajasAbiertas : []);
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

  // ── CIERRE FORZADO ───────────────────────────────────────────────────────
  //
  // Una caja ABIERTA de otro operador: se separa el cambio en la pantalla de
  // iniciar cierre, en modo forzado. Una caja con el corte YA tomado no
  // necesita eso —el cambio ya se separó—: se marca forzado el corte que existe
  // y se pasa directo a su conteo.
  const forzarAbierta = (item) => {
    router.push(`/modulos/pos-ventas/cierres/iniciar?turnoId=${item.turnoId}&forzado=1`);
  };

  const forzarCortado = async (item) => {
    setForzando(true);
    setErrorForzar("");
    try {
      const r = await fetch("/api/pos-ventas/cierres/iniciar", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnoId: item.turnoId, forzado: true, desgloseCambio: {} }),
      }).then((x) => x.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor." })));
      const token = r?.cierre?.token;
      if (!r?.ok || !token) {
        setErrorForzar(r?.error || "No se pudo forzar el cierre.");
        return;
      }
      router.push(`/modulos/pos-ventas/cierres/${encodeURIComponent(token)}`);
    } catch {
      setErrorForzar("Error de conexión.");
    } finally {
      setForzando(false);
    }
  };

  const abrirSinConteo = (item) => {
    setErrorSinConteo("");
    setSinConteo(item);
  };

  const cerrarSinConteo = async (motivo) => {
    if (!sinConteo) return;
    setResolviendo(true);
    setErrorSinConteo("");
    try {
      const r = await fetch(
        `/api/pos-ventas/cierres/${encodeURIComponent(sinConteo.token)}/cerrar-sin-conteo`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ motivo }),
        }
      ).then((x) => x.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor." })));
      // El rechazo se muestra: un 409 que no dice nada se ve igual que un botón
      // que no hace nada.
      if (!r?.ok) {
        setErrorSinConteo(r?.error || "No se pudo cerrar sin conteo.");
        return;
      }
      setSinConteo(null);
      await cargar();
    } catch {
      setErrorSinConteo("Error de conexión.");
    } finally {
      setResolviendo(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeUsar) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-[720px] mx-auto">
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              Cierres pendientes
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Cajas que ya cortaron y esperan que alguien termine de contarlas
              {contexto?.nombre ? ` · ${contexto.nombre}` : ""}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={cargar}
              className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
            >
              <RefreshCw size={14} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => router.push("/modulos/pos-ventas")}
              className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              POS
            </button>
          </div>
        </div>
      </SunmiCard>

      {needsContexto ? (
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un local para ver sus cierres pendientes.
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
      ) : (
        <>
          {items.length === 0 ? (
            <SunmiCard>
              <p className="text-sm text-center py-6 sunmi-text-muted">
                No hay cierres pendientes en este local.
              </p>
            </SunmiCard>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <FilaCierrePendiente
                  key={item.id}
                  item={item}
                  onContinuar={(i) =>
                    router.push(`/modulos/pos-ventas/cierres/${encodeURIComponent(i.token)}`)
                  }
                  onCerrarSinConteo={puedeCerrarSinConteo ? abrirSinConteo : undefined}
                  onForzar={forzando ? undefined : forzarCortado}
                />
              ))}
            </div>
          )}

          {cajasAbiertas.length > 0 && (
            <SunmiCard className="p-3 space-y-2">
              <div>
                <h2 className="text-sm3 font-bold sunmi-text-strong leading-tight">
                  Cajas abiertas de otros operadores
                </h2>
                <p className="text-sm2 sunmi-text-muted leading-tight">
                  Cada caja la cierra su operador con su PIN. Forzar el cierre queda
                  registrado a tu nombre, y la caja y su diferencia siguen siendo del
                  operador.
                </p>
              </div>
              {cajasAbiertas.map((item) => (
                <FilaCajaAbiertaForzable key={item.turnoId} item={item} onForzar={forzarAbierta} />
              ))}
            </SunmiCard>
          )}

          {/* El rechazo se muestra: un error que no dice nada se ve igual que un
              botón que no hace nada. */}
          {errorForzar && <p className="text-sm text-center sunmi-text-danger">{errorForzar}</p>}
        </>
      )}

      <ModalCerrarSinConteo
        item={sinConteo}
        trabajando={resolviendo}
        error={errorSinConteo}
        onCerrar={() => setSinConteo(null)}
        onConfirmar={cerrarSinConteo}
      />
    </div>
  );
}
