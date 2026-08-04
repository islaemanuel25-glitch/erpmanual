"use client";

// RETIRO DE RECAUDACIÓN — paso previo: SEPARAR EL CAMBIO y tomar el corte.
//
// CÓMO SE HACE UN RETIRO DE VERDAD
//
// 1. Se aparta físicamente el cambio que queda en la caja para seguir vendiendo.
// 2. Se cuenta ese cambio por denominaciones y se toma el corte.
// 3. La caja sigue vendiendo con ese cambio, y lo que entre después ya no forma
//    parte de este retiro.
// 4. Se cuenta únicamente el dinero retirado, con calma, en la otra pantalla.
//
// POR QUÉ EL ORDEN IMPORTA
//
// La versión anterior contaba todo el cajón primero y elegía el cambio al final.
// Como el POS sigue cobrando sobre ese mismo cajón, el efectivo esperado crecía
// mientras el cajero contaba, y al confirmar aparecía un faltante por plata que
// entró después de que cerrara la pila. Separando el cambio antes, el corte
// congela los dos números y nada de lo que pase después los mueve.
//
// Nada se registra hasta "Separar cambio e iniciar retiro". Hasta ahí no hay
// fila, no hay movimiento y no salió plata.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { Cifra, Fila } from "@/components/caja/CifrasRetiro";
import { Aviso, PanelCambioPrevio, PanelMovimientos } from "@/components/caja/PanelesRetiro";
import { totalDesglose } from "@/lib/caja/conteoBilletes";
import { calcularRetiroEsperado } from "@/lib/caja/cierreRelevo";
import {
  TITULO_PREPARAR_RETIRO,
  AYUDA_CAMBIO_RETIRO,
  ACCION_INICIAR_RETIRO,
} from "@/lib/caja/retiroRelevo";
import { purgarBorradoresViejos, AVISO_FLUJO_CAMBIADO } from "@/lib/caja/borradorRetiro";

const AYUDA_GRILLA =
  "Contá los billetes y monedas que dejás en la caja para seguir vendiendo.";

export default function PrepararRetiroPage() {
  const router = useRouter();
  const params = useSearchParams();
  // El POS marca la pestaña nueva. No se adivina por user-agent ni por ancho:
  // lo sabe con certeza quien la abrió.
  const enPestanaNueva = params?.get("pestana") === "nueva";

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();
  const { operador } = useOperadorContext() || {};

  const [cargando, setCargando] = useState(true);
  const [turno, setTurno] = useState(null);
  const [esperado, setEsperado] = useState(null);
  const [movimientos, setMovimientos] = useState(null);
  const [errorFatal, setErrorFatal] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // El cambio que se separa. Vive solo en memoria hasta el corte: guardarlo a
  // medias invitaría a retomarlo horas después contra un esperado que ya cambió.
  const [desgloseCambio, setDesgloseCambio] = useState({});

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const storage = typeof window !== "undefined" ? window.localStorage : null;

  const totalCambio = totalDesglose(desgloseCambio);
  const retiroEstimado = useMemo(
    () =>
      esperado == null
        ? null
        : calcularRetiroEsperado({ efectivoEsperadoCorte: esperado, totalCambio }),
    [esperado, totalCambio]
  );
  const superaEsperado = retiroEstimado != null && retiroEstimado < 0;

  // ── Estado de la caja, ANTES del corte ───────────────────────────────────
  // Acá sí se lee el resumen vivo: todavía no hay nada congelado y el número que
  // se muestra es el de este instante. Después del corte, la otra pantalla lee
  // exclusivamente de RetiroPreparacion.
  const cargar = useCallback(async () => {
    const r = await fetch("/api/pos-ventas/turnos/actual", {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    // Si esta caja ya tiene un retiro a medio contar, no hay nada que preparar:
    // se va derecho a terminarlo. Es el caso de quien vuelve a tocar el botón.
    if (r?.retiroEnPreparacion?.token) {
      return { yaCortado: r.retiroEnPreparacion };
    }
    const t = r?.ok ? r.turno : null;
    if (!t?.id) return { turno: null };

    const res = await fetch(`/api/pos-ventas/turnos/resumen?turnoId=${t.id}`, {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    return {
      turno: t,
      esperado: res?.ok ? Number(res.efectivoEsperado) : null,
      movimientos: res?.ok ? res.movimientosManuales ?? null : null,
    };
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeUsar || needsContexto) return;
    let vivo = true;
    (async () => {
      try {
        const d = await cargar();
        if (!vivo) return;
        if (d.yaCortado?.token) {
          router.replace(rutaRetiro(d.yaCortado.token, enPestanaNueva));
          return;
        }
        if (!d.turno) {
          setErrorFatal("No hay una caja abierta a tu nombre en este local.");
          return;
        }
        setTurno(d.turno);
        setEsperado(d.esperado);
        setMovimientos(d.movimientos);

        // Un conteo del flujo anterior no se traduce: se descarta y se avisa.
        // Ver el comentario de versiones en borradorRetiro.js.
        if (purgarBorradoresViejos(storage) > 0) setAviso(AVISO_FLUJO_CAMBIADO);
      } catch {
        if (vivo) setErrorFatal("No se pudo leer el estado de la caja.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cargar, cargandoUser, cargandoCtx, puedeUsar, needsContexto, storage, router, enPestanaNueva]);

  const volverAlPos = () => {
    // Abierta en pestaña propia: cerrarla devuelve al POS, que nunca se fue.
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
      const res = await fetch("/api/pos-ventas/retiros/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Solo el desglose. El total lo calcula el servidor.
        body: JSON.stringify({ turnoId: turno.id, desgloseCambio }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json.retiro?.token) {
        setError(json?.error || "No se pudo iniciar el retiro.");
        setConfirmando(false);
        return;
      }
      router.replace(rutaRetiro(json.retiro.token, enPestanaNueva));
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
            Seleccioná un local para retirar la recaudación.
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
          <SunmiButton color="slate" onClick={volverAlPos} className="w-full py-3">
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
              {TITULO_PREPARAR_RETIRO}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Turno #{turno?.id} · <span className="sunmi-text-success font-semibold">abierto</span> ·{" "}
              {contexto?.nombre || "—"}
            </p>
            <p className="text-[11px] sunmi-text-accent leading-snug mt-0.5">
              {AYUDA_CAMBIO_RETIRO}
            </p>
          </div>
          <button
            type="button"
            onClick={volverAlPos}
            className="shrink-0 text-[11px] sunmi-text-muted inline-flex items-center gap-1"
          >
            {enPestanaNueva ? <X size={14} /> : <ArrowLeft size={14} />}
            {enPestanaNueva ? "Cerrar" : "Volver"}
          </button>
        </div>
      </SunmiCard>

      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <PanelCambioPrevio
          desglose={desgloseCambio}
          onDesglose={setDesgloseCambio}
          ayuda={AYUDA_GRILLA}
        />

        <div className="space-y-3">
          <SunmiCard className="p-3 space-y-3">
            <div>
              <h2 className="text-sm font-bold sunmi-text-strong leading-tight">
                Antes de retirar
              </h2>
              <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">
                La caja va a seguir vendiendo con el cambio que dejes.
              </p>
            </div>

            <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
              <Fila label="Turno" valor={turno?.id ? `#${turno.id}` : "—"} />
              <Fila label="Operador" valor={operador?.nombre || "Sin operario"} />
              <Fila label="Local" valor={contexto?.nombre || "—"} />
            </div>

            <Cifra label="Efectivo esperado ahora" valor={esperado ?? "—"} destacado />

            <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
              <Fila label="Cambio que queda" valor={totalCambio} />
              <Fila
                label="Retiro estimado"
                valor={retiroEstimado ?? "—"}
                clase={superaEsperado ? "sunmi-text-warning" : "sunmi-text-accent"}
                fuerte
              />
            </div>

            {superaEsperado && (
              <Aviso>
                El cambio que estás dejando supera el efectivo esperado. Si es correcto, la
                diferencia va a aparecer como sobrante al confirmar.
              </Aviso>
            )}

            {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

            {/* Confirmación en DOS TIEMPOS: después del corte el cambio queda
                congelado y no se puede volver a elegir. */}
            {!confirmando ? (
              <SunmiButton
                color="amber"
                onClick={() => setConfirmando(true)}
                disabled={iniciando || !turno?.id}
                className="w-full py-3 font-bold"
              >
                {ACCION_INICIAR_RETIRO}
              </SunmiButton>
            ) : (
              <div className="sunmi-surface sunmi-border rounded-lg p-3 space-y-2">
                <p className="text-[12px] sunmi-text-strong leading-snug">
                  Después del corte no vas a poder cambiar el cambio separado. La caja sigue
                  vendiendo y lo que entre después no forma parte de este retiro.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <SunmiButton
                    color="slate"
                    onClick={() => setConfirmando(false)}
                    disabled={iniciando}
                    className="py-2 !text-xs"
                  >
                    Volver
                  </SunmiButton>
                  <SunmiButton
                    color="amber"
                    onClick={iniciar}
                    disabled={iniciando}
                    className="py-2 !text-xs font-bold"
                  >
                    {iniciando ? "Cortando…" : "Sí, separar cambio y cortar"}
                  </SunmiButton>
                </div>
              </div>
            )}
          </SunmiCard>

          <PanelMovimientos movimientos={movimientos} />
        </div>
      </div>
    </Marco>
  );
}

/** Ruta de la pantalla de conteo, conservando la marca de pestaña. */
function rutaRetiro(token, enPestanaNueva) {
  const base = `/modulos/pos-ventas/retiros/${encodeURIComponent(token)}`;
  return enPestanaNueva ? `${base}?pestana=nueva` : base;
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[1000px] mx-auto">{children}</div>;
}
