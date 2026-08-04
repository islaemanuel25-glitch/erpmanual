"use client";

// ABRIR CAJA — contar lo recibido y comparar contra lo que dejó el cierre.
//
// Tres columnas en escritorio, una debajo de otra en móvil, con la misma
// geometría del retiro y del cierre: lo que dejaron a la izquierda, el conteo en
// el medio, la comparación y la confirmación a la derecha.
//
// LA COMPARACIÓN ES DOBLE
//
// Por total y por denominación. Diez billetes de $1.000 y cinco de $2.000 suman
// los mismos $10.000, pero con los de $2.000 no se puede dar vuelto de $1.000.
// Si solo se comparara el total, la pantalla diría "todo bien" sobre un cajón que
// no sirve para trabajar, y además se perdería el rastro de que alguien cambió
// billetes por otros entre un turno y el siguiente.
//
// EL MONTO INICIAL ES LO CONTADO
//
// Nunca lo declarado por el cierre. Si el sistema impusiera lo esperado, una
// diferencia de recepción quedaría escondida y reaparecería como faltante al
// cerrar, culpando al cajero equivocado.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { Cifra, tonoDiferencia, money } from "@/components/caja/CifrasRetiro";
import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import { CABECERA_BLOQUE, BLOQUE_ALINEADO } from "@/components/caja/geometriaGrilla";
import {
  PanelCambioEsperado,
  PanelComparacion,
  AYUDA_CONTEO_APERTURA,
  TITULO_APERTURA,
  minutosRestantes,
} from "@/components/caja/PanelesApertura";

import { totalDesglose, desgloseVacio } from "@/lib/caja/conteoBilletes";
import { calcularDiferencia } from "@/lib/caja/efectivoEsperado";
import {
  evaluarRecepcionCambio,
  mensajeRecepcion,
  accionRecepcion,
  RECEPCION,
} from "@/lib/caja/cierreRelevo";
import {
  armarBorradorApertura,
  guardarBorradorApertura,
  leerBorradorApertura,
  descartarBorradorApertura,
  limpiarBorradoresAperturaViejos,
  sanearDesglose,
} from "@/lib/caja/borradorApertura";

export default function AperturaConCambioPage() {
  const router = useRouter();
  const ruta = useParams();
  const cambioId = Number(ruta?.cambioId);

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { operador, refrescar: refrescarOperador } = useOperadorContext() || {};

  const [cargando, setCargando] = useState(true);
  const [cambio, setCambio] = useState(null);
  const [errorFatal, setErrorFatal] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [desgloseRecibido, setDesgloseRecibido] = useState({});
  const [motivo, setMotivo] = useState("");
  const [confirmaComposicion, setConfirmaComposicion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const usuarioId = perfil?.id ?? null;
  const operadorId = operador?.operadorId ?? 0;

  const ident = useMemo(
    () => ({ cambioId, usuarioId: usuarioId ?? 0, operadorId }),
    [cambioId, usuarioId, operadorId]
  );

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cargandoUser || !puedeUsar || !Number.isInteger(cambioId)) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos-ventas/cambios-pendientes/${cambioId}`, {
          credentials: "include",
          cache: "no-store",
        }).then((x) => x.json());
        if (!vivo) return;
        if (!r?.ok) {
          setErrorFatal(r?.error || "No se encontró este cambio.");
          return;
        }
        setCambio(r.cambio);

        if (r.cambio?.estado === "RECIBIDO") {
          setErrorFatal("Este cambio ya lo recibió otro turno.");
          return;
        }
        if (r.cambio?.estado !== "RESERVADO") {
          setErrorFatal("Tenés que tomar este cambio antes de contarlo.");
          return;
        }

        // El borrador es de ESTA persona sobre ESTE sobre: si la reserva venció y
        // lo tomó otro, no debe aparecerle su conteo.
        limpiarBorradoresAperturaViejos(storage);
        const b = leerBorradorApertura(storage, { cambioId, usuarioId: usuarioId ?? 0, operadorId });
        if (b) {
          setDesgloseRecibido(sanearDesglose(b.desgloseRecibido));
          setMotivo(b.motivo || "");
          setAviso("Recuperamos lo que habías contado.");
        }
      } catch {
        if (vivo) setErrorFatal("No se pudo leer el cambio.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cambioId, cargandoUser, puedeUsar, storage, usuarioId, operadorId]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const totalEsperado = Number(cambio?.total ?? 0);
  const totalRecibido = totalDesglose(desgloseRecibido);
  const hayConteo = !desgloseVacio(desgloseRecibido);
  const diferencia = calcularDiferencia(totalRecibido, totalEsperado);

  // MISMA función que usa el servidor. La pantalla no tiene una regla propia: si
  // acá dijera una cosa y el backend otra, el operador vería un mensaje y
  // recibiría un error distinto al confirmar.
  const evaluacion = useMemo(
    () =>
      evaluarRecepcionCambio({
        totalEsperado,
        totalRecibido,
        motivo,
        desgloseEsperado: cambio?.desglose ?? {},
        desgloseRecibido,
        confirmaComposicion,
      }),
    [totalEsperado, totalRecibido, motivo, cambio?.desglose, desgloseRecibido, confirmaComposicion]
  );

  const clase = evaluacion.clase ?? RECEPCION.COINCIDE;
  const filasComposicion = evaluacion.composicion?.filas ?? [];
  const puedeConfirmar = hayConteo && evaluacion.valido;

  // ── Borrador ─────────────────────────────────────────────────────────────
  const persistir = useCallback(() => {
    if (!Number.isInteger(cambioId) || usuarioId == null) return false;
    return guardarBorradorApertura(
      storage,
      armarBorradorApertura({ ...ident, desgloseRecibido, motivo })
    );
  }, [cambioId, usuarioId, storage, ident, desgloseRecibido, motivo]);

  const guardarSolo = () => {
    persistir();
    setAviso("Conteo guardado. Mientras la reserva siga vigente podés volver.");
  };

  // ── Soltar la reserva ────────────────────────────────────────────────────
  const soltar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await fetch("/api/pos-ventas/cambios-pendientes/liberar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cambioPendienteId: cambioId }),
      });
      // El conteo deja de describir algo que exista: se descarta.
      descartarBorradorApertura(storage, ident);
      router.push("/modulos/pos-ventas/aperturas");
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Confirmar y abrir ────────────────────────────────────────────────────
  const confirmar = async () => {
    if (!puedeConfirmar || guardando) return;
    setError("");
    setGuardando(true);
    try {
      const res = await fetch("/api/pos-ventas/turnos/abrir-con-cambio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Solo el desglose y las decisiones. Los totales los calcula el servidor.
        body: JSON.stringify({
          cambioPendienteId: cambioId,
          desgloseRecibido,
          motivoDiferencia: motivo.trim() || null,
          confirmaComposicion,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo abrir el turno.");
        return;
      }
      descartarBorradorApertura(storage, ident);
      refrescarOperador?.();
      setResultado(json);
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (cargandoUser) return null;
  if (!puedeUsar) return <SinPermisos />;

  if (errorFatal) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <p className="text-sm text-center py-4 sunmi-text-danger">{errorFatal}</p>
          <SunmiButton
            color="slate"
            onClick={() => router.push("/modulos/pos-ventas/aperturas")}
            className="w-full py-3"
          >
            Ver cambios pendientes
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

  if (resultado) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <div className="sunmi-state-success sunmi-border rounded-xl p-3 flex items-center gap-3">
            <Check size={26} className="shrink-0 sunmi-text-success" />
            <div className="min-w-0">
              <div className="text-base font-bold sunmi-text-success">Caja abierta</div>
              <div className="text-[12px] sunmi-text-muted break-words">{resultado.aviso}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Cifra label="Monto inicial" valor={resultado.recepcion?.montoInicial} clase="sunmi-text-accent" destacado />
            <Cifra label="Cambio esperado" valor={totalEsperado} />
            <Cifra
              label="Diferencia"
              valor={resultado.recepcion?.diferencia ?? 0}
              clase={tonoDiferencia(resultado.recepcion?.diferencia ?? 0)}
            />
          </div>
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

  const restan = minutosRestantes(cambio?.reservaVenceEn);

  return (
    <Marco>
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {TITULO_APERTURA}
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Recibiendo el cambio del turno #{cambio?.turnoOrigenId} ·{" "}
              {cambio?.operadorOrigen || cambio?.cajeroOrigen || "sin operario"}
            </p>
            {typeof restan === "number" && (
              <p className="text-[11px] sunmi-text-warning leading-tight">
                {restan > 0
                  ? `Reserva vigente: quedan ${restan} minuto${restan === 1 ? "" : "s"}`
                  : "La reserva está por vencer"}
              </p>
            )}
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

      {aviso && (
        <div className="sunmi-surface-soft sunmi-text-muted sunmi-border rounded-lg p-2 text-[11px] leading-snug">
          {aviso}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Cifra label="Cambio esperado" valor={totalEsperado} />
        <Cifra label="Total recibido" valor={hayConteo ? totalRecibido : "—"} />
        <Cifra
          label="Diferencia"
          valor={hayConteo ? diferencia : "—"}
          clase={hayConteo ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
        />
        <Cifra label="Abre con" valor={totalRecibido} clase="sunmi-text-accent" destacado />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <PanelCambioEsperado cambio={cambio} />

        {/* El conteo usa la MISMA tabla del retiro y del cierre. Sin monto total
            manual: el número sale de sumar filas. */}
        <SunmiCard className={`p-3 space-y-2 ${BLOQUE_ALINEADO}`}>
          <div className={CABECERA_BLOQUE}>
            <h2 className="text-sm font-bold sunmi-text-strong leading-tight">
              Contar lo que recibiste
            </h2>
            <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">
              {AYUDA_CONTEO_APERTURA}
            </p>
          </div>
          <TablaDenominaciones
            desglose={desgloseRecibido}
            onCambiar={setDesgloseRecibido}
            idPrefijo="recibido"
          />
        </SunmiCard>

        <PanelComparacion
          totalEsperado={totalEsperado}
          totalRecibido={totalRecibido}
          hayConteo={hayConteo}
          diferencia={diferencia}
          clase={clase}
          mensaje={mensajeRecepcion(clase, diferencia)}
          accion={accionRecepcion(clase)}
          diferenciasComposicion={filasComposicion}
          motivo={motivo}
          onMotivo={setMotivo}
          confirmaComposicion={confirmaComposicion}
          onConfirmaComposicion={setConfirmaComposicion}
          error={error}
          guardando={guardando}
          puedeConfirmar={puedeConfirmar}
          onGuardar={guardarSolo}
          onConfirmar={confirmar}
          onCancelar={soltar}
        />
      </div>

      <p className="text-[10px] sunmi-text-muted text-center pb-1">
        La caja abre con {money(totalRecibido)}: lo que contaste, no lo que declaró el cierre anterior.
      </p>
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[1400px] mx-auto">{children}</div>;
}
