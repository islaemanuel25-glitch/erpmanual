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

import { FilaCierrePendiente } from "@/components/caja/PanelesCierre";
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
        return;
      }
      setItems(Array.isArray(r.items) ? r.items : []);
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
      ) : items.length === 0 ? (
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
            />
          ))}
        </div>
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
