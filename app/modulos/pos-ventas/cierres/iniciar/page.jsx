"use client";

// CIERRE DE CAJA — paso previo: SEPARAR EL CAMBIO y tomar el corte.
//
// Es la única pantalla del flujo donde todavía no pasó nada. Acá se decide y se
// cuenta el dinero que queda en la caja para seguir vendiendo, se ve cuánto va a
// haber que retirar, y se pide una confirmación explícita.
//
// EL CAMBIO VA PRIMERO, Y ESO INVIERTE EL FLUJO ANTERIOR
//
// Antes se contaba todo el cajón y el cambio se elegía al final, sobre la pila
// ya contada. Eso obligaba a contar el cajón entero mientras el local seguía
// cobrando sobre ese mismo cajón. Ahora el cambio se aparta físicamente ANTES
// del corte: desde el corte queda congelado, se publica para el relevo, y lo
// único que queda por contar es el dinero que se retira.
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
import { Aviso } from "@/components/caja/PanelesRetiro";
import {
  PanelAntesDelCorte,
  TITULO_CIERRE,
  ACCION_INICIAR_CIERRE,
} from "@/components/caja/PanelesCierre";
import { totalDesglose } from "@/lib/caja/conteoBilletes";
import { calcularRetiroEsperado } from "@/lib/caja/cierreRelevo";
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
  const [errorFatal, setErrorFatal] = useState("");
  const [error, setError] = useState("");
  const [iniciando, setIniciando] = useState(false);

  // El modal donde se separa el cambio. Abrirlo NO crea nada.
  const [modalAbierto, setModalAbierto] = useState(false);
  // El esperado se movió mientras el modal estaba abierto: hace falta una
  // segunda confirmación con el número nuevo a la vista.
  const [revalidado, setRevalidado] = useState(false);

  // El cambio que se separa. Vive solo en memoria hasta el corte: no hay
  // borrador acá a propósito, porque esta pantalla se completa en un minuto y
  // guardar un cambio a medio contar invitaría a retomarlo horas después contra
  // un efectivo esperado que ya no es el mismo.
  const [desgloseCambio, setDesgloseCambio] = useState({});

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");

  const totalCambio = totalDesglose(desgloseCambio);
  const retiroEstimado = useMemo(
    () =>
      esperado == null
        ? null
        : calcularRetiroEsperado({ efectivoEsperadoCorte: esperado, totalCambio }),
    [esperado, totalCambio]
  );

  // ── Estado de la caja, ANTES del corte ──────────────────────────────────
  // Acá sí se lee el resumen vivo: todavía no hay nada congelado, y el número
  // que se muestra es el de este instante. Después del corte, la otra pantalla
  // lee exclusivamente de CierrePreparacion.
  const cargar = useCallback(async () => {
    const r = await fetch("/api/pos-ventas/turnos/actual", {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    // ── PROCESOS PENDIENTES, ANTES QUE NADA ────────────────────────────────
    //
    // Antes esta pantalla redirigía sola al cierre que ya existía, y no miraba
    // el retiro. Con un retiro a medio contar, el cajero llegaba hasta el modal,
    // apretaba el botón, el servidor devolvía 409 y no se veía nada. Ahora los
    // dos casos se detectan acá y se muestran: el cajero decide si continúa o
    // cancela, en vez de que la pantalla decida por él.
    const pendiente =
      r?.cierreEnPreparacion?.proceso || r?.retiroEnPreparacion?.proceso || null;
    if (pendiente?.token) return { pendiente };

    const t = r?.ok ? r.turno : null;
    if (!t?.id) return { turno: null };

    const res = await fetch(`/api/pos-ventas/turnos/resumen?turnoId=${t.id}`, {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());

    return { turno: t, esperado: res?.ok ? Number(res.efectivoEsperado) : null };
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

  // Releer el estado de la caja. Se usa al entrar y otra vez después de cancelar
  // un proceso pendiente, cuando la pantalla vuelve a tener algo que cortar.
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
    } catch {
      setErrorFatal("No se pudo leer el estado de la caja.");
    } finally {
      setCargando(false);
    }
  }, [cargar, setProceso]);

  releerRef.current = releer;

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeUsar || needsContexto) return;
    releer();
  }, [releer, cargandoUser, cargandoCtx, puedeUsar, needsContexto]);

  const volver = () => {
    if (enPestanaNueva && typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    router.push("/modulos/pos-ventas");
  };

  // ── El modal ─────────────────────────────────────────────────────────────
  //
  // Abrirlo y cerrarlo no toca nada: no hay pedido al servidor, no se crea la
  // preparación y no se congela ninguna cifra. Lo único que hace es mostrar la
  // grilla.
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
      // abierto el local pudo cobrar, y el retiro estimado que se muestra sería
      // otro. No se manda ese número —el servidor calcula el suyo igual— pero sí
      // se avisa, para que nadie confirme mirando una cifra vieja.
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

      const res = await fetch("/api/pos-ventas/cierres/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Solo el desglose. Los totales los calcula el servidor: mandarlos sería
        // ofrecerle números que no tiene por qué creer.
        body: JSON.stringify({ turnoId: turno.id, desgloseCambio }),
      });
      const json = await res.json();

      // Un proceso pendiente no es un error a mostrar en letra chica adentro del
      // modal: es un cartel con salidas. Llega tanto en el 409 de exclusión mutua
      // —un retiro a medio contar— como en el 200 con `repetido`, cuando el corte
      // ya existía. Los dos casos terminan en la misma pantalla.
      if (proc.tomarDeRespuesta(json)) {
        setModalAbierto(false);
        return;
      }

      if (!res.ok || !json?.ok || !json.cierre?.token) {
        setError(json?.error || "No se pudo iniciar el cierre.");
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

  // El aviso de proceso pendiente se muestra SOLO, sin la tarjeta de abajo: no
  // hay nada que cortar mientras exista, y dejar el botón a la vista invitaría a
  // apretarlo otra vez.
  if (proc.proceso) {
    return (
      <Marco>
        <ModalProcesoPendiente
          proceso={proc.proceso}
          cancelando={proc.cancelando}
          error={proc.error}
          onContinuar={() => router.replace(proc.rutaContinuar())}
          onCancelar={proc.cancelar}
          onVolver={volver}
        />
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

      {/* Lo que quedó del proceso que se acaba de deshacer. Se dice explícito
          que la caja sigue viva: es la duda inmediata del cajero. */}
      {proc.exito && <Aviso tono="info">{proc.exito}</Aviso>}

      <PanelAntesDelCorte
        turno={turno}
        operadorNombre={operador?.nombre}
        localNombre={contexto?.nombre}
        esperado={esperado}
        iniciando={iniciando}
        error={modalAbierto ? "" : error}
        onIniciar={abrirModal}
      />

      {/* La grilla vive acá: aparece al apretar el botón y desaparece al
          cancelar. Hasta que se confirme, no hay nada creado ni congelado. */}
      <ModalCambioPrevio
        abierto={modalAbierto}
        esperado={esperado}
        desglose={desgloseCambio}
        onDesglose={setDesgloseCambio}
        totalCambio={totalCambio}
        retiroEstimado={retiroEstimado}
        textoConfirmar={ACCION_INICIAR_CIERRE}
        confirmando={iniciando}
        revalidado={revalidado}
        error={error}
        onCancelar={cerrarModal}
        onConfirmar={iniciar}
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
  // Angosta otra vez: la página volvió a ser una tarjeta con cuatro datos y un
  // botón. La grilla ya no está acá, está en el modal.
  return <div className="p-2 lg:p-3 space-y-3 max-w-[560px] mx-auto">{children}</div>;
}
