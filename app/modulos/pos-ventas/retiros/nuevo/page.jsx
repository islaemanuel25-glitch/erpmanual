"use client";

// RETIRO DE RECAUDACIÓN — paso previo: revisar la caja y separar el cambio.
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
// MISMA SECUENCIA QUE EL CIERRE: tarjeta simple, botón, modal con la grilla.
// Nada se registra hasta confirmar el modal. Hasta ahí no hay fila, no hay
// movimiento y no salió plata.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import { useOperadorContext } from "@/app/context/OperadorContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import ModalCambioPrevio from "@/components/caja/ModalCambioPrevio";
import ModalProcesoPendiente from "@/components/caja/ModalProcesoPendiente";
import useProcesoPendiente from "@/hooks/useProcesoPendiente";
import { Aviso, PanelMovimientos } from "@/components/caja/PanelesRetiro";
import { PanelAntesDelCorte } from "@/components/caja/PanelesCierre";
import { totalDesglose } from "@/lib/caja/conteoBilletes";
import { calcularRetiroEsperado } from "@/lib/caja/cierreRelevo";
import {
  TITULO_PREPARAR_RETIRO,
  AVISO_ANTES_DEL_RETIRO,
  ACCION_ABRIR_CAMBIO_RETIRO,
  ACCION_INICIAR_RETIRO,
} from "@/lib/caja/retiroRelevo";
import { purgarBorradoresViejos, AVISO_FLUJO_CAMBIADO } from "@/lib/caja/borradorRetiro";

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

  // El modal donde se separa el cambio. Abrirlo NO crea nada.
  const [modalAbierto, setModalAbierto] = useState(false);
  const [revalidado, setRevalidado] = useState(false);

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

  // ── Estado de la caja, ANTES del corte ───────────────────────────────────
  // Acá sí se lee el resumen vivo: todavía no hay nada congelado y el número que
  // se muestra es el de este instante. Después del corte, la otra pantalla lee
  // exclusivamente de RetiroPreparacion.
  const cargar = useCallback(async () => {
    const r = await fetch("/api/pos-ventas/turnos/actual", {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    // ── PROCESOS PENDIENTES, ANTES QUE NADA ────────────────────────────────
    //
    // Antes esta pantalla redirigía sola al retiro que ya existía, y no miraba el
    // cierre. Con un cierre ya tomado, el cajero llegaba hasta el modal, apretaba
    // el botón, el servidor devolvía 409 y no se veía nada. Ahora los dos casos
    // se detectan acá y se muestran, con salidas.
    const pendiente =
      r?.retiroEnPreparacion?.proceso || r?.cierreEnPreparacion?.proceso || null;
    if (pendiente?.token) return { pendiente };

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

  // El hook va primero y la relectura después, unidas por una ref: la
  // cancelación tiene que releer, y la relectura tiene que poder mostrar un
  // proceso. Con una ref no hay que declarar una antes que la otra.
  const releerRef = useRef(null);
  const proc = useProcesoPendiente({
    enPestanaNueva,
    alCancelar: () => releerRef.current?.(),
  });
  const { setProceso } = proc;

  const releer = useCallback(async () => {
    try {
      const d = await cargar();
      if (d.pendiente) {
        setProceso(d.pendiente);
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
      setErrorFatal("No se pudo leer el estado de la caja.");
    } finally {
      setCargando(false);
    }
  }, [cargar, storage, setProceso]);

  releerRef.current = releer;

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeUsar || needsContexto) return;
    releer();
  }, [releer, cargandoUser, cargandoCtx, puedeUsar, needsContexto]);

  const volverAlPos = () => {
    // Abierta en pestaña propia: cerrarla devuelve al POS, que nunca se fue.
    if (enPestanaNueva && typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    router.push("/modulos/pos-ventas");
  };

  // ── El modal ─────────────────────────────────────────────────────────────
  //
  // Abrirlo y cerrarlo no toca nada: no hay pedido al servidor, no se crea la
  // preparación y no se congela ninguna cifra.
  const abrirModal = () => {
    setError("");
    setRevalidado(false);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (iniciando) return;
    setModalAbierto(false);
    setRevalidado(false);
    setError("");
  };

  // ── El corte ─────────────────────────────────────────────────────────────
  const iniciar = async () => {
    if (iniciando || !turno?.id) return;
    setIniciando(true);
    setError("");
    try {
      // EL ESPERADO SE REVALIDA ANTES DE CORTAR. Mientras el modal estaba
      // abierto la caja pudo cobrar —acá más todavía que en el cierre, porque el
      // turno nunca se congela—. No se manda ese número: el servidor calcula el
      // suyo igual. Se avisa para que nadie confirme mirando una cifra vieja.
      const fresco = await fetch(`/api/pos-ventas/turnos/resumen?turnoId=${turno.id}`, {
        credentials: "include",
        cache: "no-store",
      }).then((x) => x.json()).catch(() => null);
      const esperadoAhora = fresco?.ok ? Number(fresco.efectivoEsperado) : null;

      if (esperadoAhora != null && esperado != null && esperadoAhora !== esperado && !revalidado) {
        setEsperado(esperadoAhora);
        setRevalidado(true);
        return;
      }

      const res = await fetch("/api/pos-ventas/retiros/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Solo el desglose. El total lo calcula el servidor.
        body: JSON.stringify({ turnoId: turno.id, desgloseCambio }),
      });
      const json = await res.json();

      // Un proceso pendiente no es un error en letra chica adentro del modal: es
      // un cartel con salidas. Llega tanto en el 409 de exclusión mutua —un
      // cierre ya tomado— como en el 200 con `repetido`, cuando el retiro ya
      // existía. Los dos casos terminan en la misma pantalla.
      if (proc.tomarDeRespuesta(json)) {
        setModalAbierto(false);
        return;
      }

      if (!res.ok || !json?.ok || !json.retiro?.token) {
        setError(json?.error || "No se pudo iniciar el retiro.");
        return;
      }
      router.replace(rutaRetiro(json.retiro.token, enPestanaNueva));
    } catch {
      setError("Error de conexión.");
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

  // El aviso de proceso pendiente se muestra SOLO: mientras exista no hay nada
  // que preparar, y dejar el botón a la vista invitaría a apretarlo otra vez.
  if (proc.proceso) {
    return (
      <Marco>
        <ModalProcesoPendiente
          proceso={proc.proceso}
          cancelando={proc.cancelando}
          error={proc.error}
          onContinuar={() => router.replace(proc.rutaContinuar())}
          onCancelar={proc.cancelar}
          onVolver={volverAlPos}
        />
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

      {/* Lo que quedó del proceso que se acaba de deshacer. Se dice explícito
          que la caja sigue viva: es la duda inmediata del cajero. */}
      {proc.exito && <Aviso tono="info">{proc.exito}</Aviso>}

      {/* MISMA SECUENCIA QUE EL CIERRE: tarjeta simple, botón, modal. Que las
          dos pantallas se vean igual no es prolijidad: es lo que evita que el
          cajero tenga que acordarse de cuál le pide la grilla de entrada. */}
      <PanelAntesDelCorte
        turno={turno}
        operadorNombre={operador?.nombre}
        localNombre={contexto?.nombre}
        esperado={esperado}
        iniciando={iniciando}
        error={modalAbierto ? "" : error}
        onIniciar={abrirModal}
        titulo="Antes de retirar"
        ayuda="La caja va a seguir vendiendo con el cambio que dejes."
        aviso={AVISO_ANTES_DEL_RETIRO}
        textoBoton={ACCION_ABRIR_CAMBIO_RETIRO}
      />

      <PanelMovimientos movimientos={movimientos} />

      <ModalCambioPrevio
        abierto={modalAbierto}
        esperado={esperado}
        desglose={desgloseCambio}
        onDesglose={setDesgloseCambio}
        totalCambio={totalCambio}
        retiroEstimado={retiroEstimado}
        textoConfirmar={ACCION_INICIAR_RETIRO}
        confirmando={iniciando}
        revalidado={revalidado}
        error={error}
        onCancelar={cerrarModal}
        onConfirmar={iniciar}
      />
    </Marco>
  );
}

/** Ruta de la pantalla de conteo, conservando la marca de pestaña. */
function rutaRetiro(token, enPestanaNueva) {
  const base = `/modulos/pos-ventas/retiros/${encodeURIComponent(token)}`;
  return enPestanaNueva ? `${base}?pestana=nueva` : base;
}

function Marco({ children }) {
  // Angosta: la página es una tarjeta con los datos de la caja y un botón. La
  // grilla del cambio vive en el modal.
  return <div className="p-2 lg:p-3 space-y-3 max-w-[560px] mx-auto">{children}</div>;
}
