"use client";

// ABRIR CAJA — elegir de dónde sale el cambio.
//
// Es la primera pantalla que ve el operador después del PIN cuando no tiene
// turno. Muestra los sobres que dejaron los cierres anteriores y deja elegir uno
// manualmente, o abrir con plata propia explicando de dónde salió.
//
// MIRAR NO RESERVA
//
// Entrar acá, y hasta abrir el detalle de un sobre, no bloquea nada. La reserva
// ocurre solo al pulsar "Tomar este cambio". Si mirar bloqueara, el primero que
// entra a curiosear dejaría el sobre trabado para todos hasta que venciera.
//
// NO SE ABRE NINGÚN TURNO SOLO. Ni siquiera cuando hay un único sobre y parece
// obvio: la apertura es una declaración de quien cuenta, y el sistema no puede
// firmarla por él.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { TarjetaCambio, TITULO_APERTURA } from "@/components/caja/PanelesApertura";

export default function AperturasPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();
  const { operador } = useOperadorContext() || {};

  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState([]);
  const [miReserva, setMiReserva] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  // Se mantiene `pos.usar`: es el permiso que hoy gobierna abrir caja. Esta
  // subetapa cambia CÓMO se abre, no QUIÉN puede hacerlo.
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/pos-ventas/cambios-pendientes/listar", {
        credentials: "include",
        cache: "no-store",
      }).then((x) => x.json());
      if (!r?.ok) {
        setError(r?.error || "No se pudieron leer los cambios pendientes.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(r.items) ? r.items : []);
      setMiReserva(r.miReserva ?? null);
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

  // ── Tomar un cambio ──────────────────────────────────────────────────────
  const tomar = async (item) => {
    if (ocupado) return;
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const res = await fetch("/api/pos-ventas/cambios-pendientes/reservar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cambioPendienteId: item.id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        // 409 con estado RESERVADO = alguien ganó la carrera. Se refresca la
        // lista para que el operador vea el estado real, no un error suelto.
        setAviso(
          json?.estadoActual === "RESERVADO"
            ? "Este cambio acaba de ser tomado por otro operador."
            : json?.error || "No se pudo tomar el cambio."
        );
        await cargar();
        return;
      }
      router.push(`/modulos/pos-ventas/aperturas/${item.id}`);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  };

  const continuar = (item) => router.push(`/modulos/pos-ventas/aperturas/${item.id}`);

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeUsar) return <SinPermisos />;

  // La reserva propia va primero y sola: mientras haya una, no se puede tomar
  // otra, así que ofrecer el resto sería ofrecer algo que el servidor rechaza.
  const otros = miReserva ? [] : items.filter((i) => !i.esMio);

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-[720px] mx-auto">
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {TITULO_APERTURA}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              {operador?.nombre ? `${operador.nombre} · ` : ""}
              {contexto?.nombre || "—"}
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
              onClick={() => router.push("/modulos")}
              className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Salir
            </button>
          </div>
        </div>
      </SunmiCard>

      {aviso && (
        <div className="sunmi-state-warning sunmi-text-warning sunmi-border rounded-lg p-2 text-[12px] leading-snug">
          {aviso}
        </div>
      )}

      {needsContexto ? (
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un local para abrir la caja.
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
          {miReserva && (
            <div className="space-y-2">
              <p className="text-[11px] sunmi-text-muted px-1">
                Tenés una apertura empezada. Terminala o soltá el cambio antes de tomar otro.
              </p>
              <TarjetaCambio item={miReserva} onContinuar={continuar} ocupado={ocupado} />
            </div>
          )}

          {!miReserva && otros.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] sunmi-text-muted px-1">
                Elegí el cambio que estás recibiendo. Verlo no lo reserva.
              </p>
              {otros.map((item) => (
                <TarjetaCambio key={item.id} item={item} onTomar={tomar} ocupado={ocupado} />
              ))}
            </div>
          )}

          {!miReserva && otros.length === 0 && (
            <SunmiCard>
              <p className="text-sm text-center py-6 sunmi-text-muted">
                No hay cambios pendientes en este local.
              </p>
            </SunmiCard>
          )}

          {!miReserva && (
            <SunmiCard className="p-3 space-y-2">
              <p className="text-[12px] sunmi-text-muted leading-snug">
                Si el cambio con el que abrís no viene de un cierre anterior, contalo igual y
                explicá de dónde salió.
              </p>
              <SunmiButton
                color="slate"
                onClick={() => router.push("/modulos/pos-ventas/aperturas/sin-cambio")}
                className="w-full py-3 text-sm"
              >
                Abrir sin tomar un cambio anterior
              </SunmiButton>
            </SunmiCard>
          )}
        </>
      )}
    </div>
  );
}
