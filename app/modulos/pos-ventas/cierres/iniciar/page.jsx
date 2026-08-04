"use client";

// CIERRE DE CAJA — paso previo: tomar el corte.
//
// Es la única pantalla del flujo donde todavía no pasó nada. Muestra qué caja se
// va a cerrar y cuánto se espera encontrar, y pide una confirmación explícita.
//
// POR QUÉ NO CORTA SOLA AL ABRIRSE
//
// Porque después del corte el turno deja de vender. Si entrar a la pantalla
// congelara la caja, un toque accidental —o volver atrás en el navegador—
// dejaría al local sin poder cobrar hasta que alguien contara todo el cajón. El
// corte es un acto, no una consecuencia de mirar.
//
// Al confirmar, esta misma pestaña pasa a la pantalla del cierre por token, y la
// pestaña del POS recibe el aviso para soltar el turno y volver al ingreso de
// operario. Ver lib/caja/senalCierre.js.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { PanelAntesDelCorte, TITULO_CIERRE } from "@/components/caja/PanelesCierre";
import { emitirCorteIniciado } from "@/lib/caja/senalCierre";

export default function IniciarCierrePage() {
  const router = useRouter();
  const params = useSearchParams();
  const enPestanaNueva = params?.get("pestana") === "nueva";

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();
  const { operador } = useOperadorContext() || {};

  const [cargando, setCargando] = useState(true);
  const [turno, setTurno] = useState(null);
  const [esperado, setEsperado] = useState(null);
  const [cierreExistente, setCierreExistente] = useState(null);
  const [errorFatal, setErrorFatal] = useState("");
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [iniciando, setIniciando] = useState(false);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");

  // ── Estado de la caja, ANTES del corte ──────────────────────────────────
  // Acá sí se lee el resumen vivo: todavía no hay nada congelado, y el número
  // que se muestra es el de este instante. Después del corte, la otra pantalla
  // lee exclusivamente de CierrePreparacion.
  const cargar = useCallback(async () => {
    const r = await fetch("/api/pos-ventas/turnos/actual", {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    // Si este usuario ya tiene un cierre en preparación, no hay nada que cortar:
    // se va derecho a terminarlo. Es el caso de quien vuelve a tocar el botón.
    if (r?.cierreEnPreparacion?.token) {
      return { yaCortado: r.cierreEnPreparacion };
    }
    const t = r?.ok ? r.turno : null;
    if (!t?.id) return { turno: null };

    const res = await fetch(`/api/pos-ventas/turnos/resumen?turnoId=${t.id}`, {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    return { turno: t, esperado: res?.ok ? Number(res.efectivoEsperado) : null };
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeUsar || needsContexto) return;
    let vivo = true;
    (async () => {
      try {
        const d = await cargar();
        if (!vivo) return;
        if (d.yaCortado) {
          setCierreExistente(d.yaCortado);
          return;
        }
        if (!d.turno) {
          setErrorFatal("No hay una caja abierta a tu nombre en este local.");
          return;
        }
        setTurno(d.turno);
        setEsperado(d.esperado);
      } catch {
        if (vivo) setErrorFatal("No se pudo leer el estado de la caja.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cargar, cargandoUser, cargandoCtx, puedeUsar, needsContexto]);

  // Un cierre ya existente redirige solo, sin pedir nada.
  useEffect(() => {
    if (!cierreExistente?.token) return;
    router.replace(rutaCierre(cierreExistente.token, enPestanaNueva));
  }, [cierreExistente, router, enPestanaNueva]);

  const volver = () => {
    if (enPestanaNueva && typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    router.push("/modulos/pos-ventas");
  };

  // ── El corte ─────────────────────────────────────────────────────────────
  const iniciar = async () => {
    if (iniciando || !turno?.id) return;
    setIniciando(true);
    setError("");
    try {
      const res = await fetch("/api/pos-ventas/cierres/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ turnoId: turno.id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json.cierre?.token) {
        setError(json?.error || "No se pudo iniciar el cierre.");
        setConfirmando(false);
        return;
      }

      // EL AVISO VA ANTES DE NAVEGAR. Si se emitiera después, en móvil —donde
      // esta misma pestaña se convierte en la del cierre— el componente ya
      // estaría desmontado y el POS nunca se enteraría.
      //
      // El aviso NO lleva el token: la pestaña del POS no lo necesita, solo
      // tiene que soltar el turno.
      emitirCorteIniciado({ turnoId: turno.id, localId: contexto?.id ?? null });

      router.replace(rutaCierre(json.cierre.token, enPestanaNueva));
    } catch {
      setError("Error de conexión.");
      setConfirmando(false);
    } finally {
      setIniciando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (cargandoUser || cargandoCtx) return null;
  if (!puedeUsar) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un local para cerrar la caja.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cierreExistente) {
    return (
      <Marco>
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Esta caja ya tiene un cierre en preparación. Te llevamos a terminarlo…
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  if (errorFatal) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <p className="text-sm text-center py-4 sunmi-text-danger">{errorFatal}</p>
          <SunmiButton color="slate" onClick={volver} className="w-full py-3">
            {enPestanaNueva ? "Cerrar" : "Volver al POS"}
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando) {
    return (
      <Marco>
        <SunmiLoader />
      </Marco>
    );
  }

  return (
    <Marco>
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {TITULO_CIERRE}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Todavía no se cortó nada. La caja sigue operativa.
            </p>
          </div>
          <button
            type="button"
            onClick={volver}
            className="shrink-0 text-[11px] sunmi-text-muted inline-flex items-center gap-1"
          >
            {enPestanaNueva ? <X size={14} /> : <ArrowLeft size={14} />}
            {enPestanaNueva ? "Cerrar" : "Volver"}
          </button>
        </div>
      </SunmiCard>

      <PanelAntesDelCorte
        turno={turno}
        operadorNombre={operador?.nombre}
        localNombre={contexto?.nombre}
        esperado={esperado}
        confirmando={confirmando}
        iniciando={iniciando}
        error={error}
        onPedirConfirmacion={() => setConfirmando(true)}
        onCancelar={() => setConfirmando(false)}
        onIniciar={iniciar}
      />
    </Marco>
  );
}

/** Ruta de la pantalla del cierre, conservando la marca de pestaña. */
function rutaCierre(token, enPestanaNueva) {
  const base = `/modulos/pos-ventas/cierres/${encodeURIComponent(token)}`;
  return enPestanaNueva ? `${base}?pestana=nueva` : base;
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[560px] mx-auto">{children}</div>;
}
