"use client";

// ABRIR CAJA sin tomar un cambio anterior.
//
// Existe porque no siempre hay un cierre previo del cual heredar: el primer
// turno del día en un local nuevo, un cajón que se trajo del depósito, una caja
// que se abre después de que el cambio anterior ya se lo llevó otro.
//
// EL MOTIVO ES OBLIGATORIO
//
// Si hay sobres esperando en el local y alguien abre igual con plata propia, eso
// tiene que quedar explicado. Si no, el sobre queda huérfano: nadie sabe por qué
// no se tomó y la plata que dejó el turno anterior deja de tener a quién
// atribuirse.
//
// El conteo también: sin denominaciones no hay forma de comparar nada después, y
// un total tipeado admite el error que el conteo detecta.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

import { Cifra } from "@/components/caja/CifrasRetiro";
import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import { CABECERA_BLOQUE, BLOQUE_ALINEADO } from "@/components/caja/geometriaGrilla";
import {
  PanelSinCambio,
  AYUDA_CONTEO_APERTURA,
  TITULO_APERTURA,
} from "@/components/caja/PanelesApertura";

import { totalDesglose, desgloseVacio } from "@/lib/caja/conteoBilletes";

export default function AperturaSinCambioPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { contexto, needsContexto } = useContextoActivo();
  const { operador, refrescar: refrescarOperador } = useOperadorContext() || {};

  const [desgloseContado, setDesgloseContado] = useState({});
  const [motivo, setMotivo] = useState("");
  const [pendientes, setPendientes] = useState(0);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");

  // Cuántos sobres quedan sin tomar. Informativo: no bloquea, pero se dice.
  const contarPendientes = useCallback(async () => {
    try {
      const r = await fetch("/api/pos-ventas/cambios-pendientes/listar", {
        credentials: "include",
        cache: "no-store",
      }).then((x) => x.json());
      if (r?.ok) setPendientes((r.items || []).filter((i) => i.estado === "DISPONIBLE").length);
    } catch {
      /* informativo: si falla, no se muestra el aviso y ya */
    }
  }, []);

  useEffect(() => {
    if (cargandoUser || !puedeUsar || needsContexto) return;
    contarPendientes();
  }, [contarPendientes, cargandoUser, puedeUsar, needsContexto]);

  const totalContado = totalDesglose(desgloseContado);
  const hayConteo = !desgloseVacio(desgloseContado);

  const confirmar = async () => {
    if (guardando || !hayConteo || !motivo.trim()) return;
    setError("");
    setGuardando(true);
    try {
      const res = await fetch("/api/pos-ventas/turnos/abrir-sin-cambio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ desgloseContado, motivo: motivo.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo abrir el turno.");
        return;
      }
      refrescarOperador?.();
      setResultado(json);
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoUser) return null;
  if (!puedeUsar) return <SinPermisos />;

  if (resultado) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <div className="sunmi-state-success sunmi-border rounded-xl p-3 flex items-center gap-3">
            <Check size={26} className="shrink-0 sunmi-text-success" />
            <div className="min-w-0">
              <div className="text-base font-bold sunmi-text-success">Caja abierta</div>
              <div className="text-[12px] sunmi-text-muted break-words">
                Abriste con {money(resultado.montoInicial)} contados. El origen quedó registrado.
              </div>
            </div>
          </div>
          {resultado.cambiosPendientesSinTomar > 0 && (
            <div className="sunmi-state-warning sunmi-text-warning sunmi-border rounded-lg p-2 text-[11px] leading-snug">
              Quedan {resultado.cambiosPendientesSinTomar} cambio
              {resultado.cambiosPendientesSinTomar === 1 ? "" : "s"} sin tomar en este local.
            </div>
          )}
          <SunmiButton
            color="amber"
            onClick={() => router.push("/modulos/pos-ventas")}
            className="w-full py-3 font-bold"
          >
            Empezar a vender
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco>
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {TITULO_APERTURA}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Sin tomar un cambio anterior · {operador?.nombre ? `${operador.nombre} · ` : ""}
              {contexto?.nombre || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/modulos/pos-ventas/aperturas")}
            className="shrink-0 text-[11px] sunmi-text-muted inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Volver
          </button>
        </div>
      </SunmiCard>

      <div className="grid grid-cols-2 gap-2">
        <Cifra label="Total contado" valor={hayConteo ? totalContado : "—"} />
        <Cifra label="Abre con" valor={totalContado} clase="sunmi-text-accent" destacado />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <SunmiCard className={`p-3 space-y-2 ${BLOQUE_ALINEADO}`}>
          <div className={CABECERA_BLOQUE}>
            <h2 className="text-sm font-bold sunmi-text-strong leading-tight">
              Contar el cambio con el que abrís
            </h2>
            <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">
              {AYUDA_CONTEO_APERTURA}
            </p>
          </div>
          <TablaDenominaciones
            desglose={desgloseContado}
            onCambiar={setDesgloseContado}
            idPrefijo="apertura"
          />
        </SunmiCard>

        <PanelSinCambio
          totalContado={totalContado}
          hayConteo={hayConteo}
          motivo={motivo}
          onMotivo={setMotivo}
          error={error}
          guardando={guardando}
          onConfirmar={confirmar}
          onVolver={() => router.push("/modulos/pos-ventas/aperturas")}
          hayPendientes={pendientes}
        />
      </div>
    </Marco>
  );
}

function money(n) {
  return "$" + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[1000px] mx-auto">{children}</div>;
}
