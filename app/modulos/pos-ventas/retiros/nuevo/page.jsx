"use client";

// RETIRO DE RECAUDACIÓN — una sola pantalla.
//
// CÓMO FUNCIONA UN RETIRO DE VERDAD
//
// 1. Se cuenta todo el efectivo del cajón.
// 2. Se eligen los billetes y monedas que quedan como cambio.
// 3. Todo lo demás se retira. El importe es una resta, no una decisión.
//
// La versión anterior preguntaba cuánto retirar y ofrecía elegir los billetes
// que salían, repartido en tres pasos con Anterior y Siguiente. Eso pedía la
// resta mental que la máquina hace sola, y escondía en pantallas distintas las
// tres cifras que hay que mirar juntas. Acá no hay pasos: en escritorio son tres
// columnas, en móvil una debajo de la otra.
//
// EL CAJERO PUEDE SEGUIR VENDIENDO. En escritorio esta pantalla se abre en una
// pestaña aparte y el POS queda intacto en la suya; en móvil se navega y se
// vuelve con el borrador. En los dos casos, antes de confirmar se revalida
// contra el servidor.
//
// Nada se registra hasta "Confirmar retiro": el borrador vive solo en el
// navegador y no crea filas ni movimientos.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { Cifra, money, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import {
  Aviso,
  PanelConteo,
  PanelCambio,
  PanelResumen,
  ResumenCabecera,
} from "@/components/caja/PanelesRetiro";

import {
  MODO_TOTAL,
  MODO_BILLETES,
  totalDesglose,
  desgloseVacio,
  validarCambioQueQueda,
  limitarCambioAlConteo,
} from "@/lib/caja/conteoBilletes";
import {
  armarBorrador,
  guardarBorrador,
  leerBorrador,
  descartarBorrador,
  limpiarBorradoresViejos,
  sanearDesglose,
} from "@/lib/caja/borradorRetiro";
import {
  evaluarRetiroPorCambio,
  huellaDelTurno,
  compararHuellas,
  resolverFondoObjetivo,
} from "@/lib/caja/retiroDinero";

/** Clave por visita: reintentar el mismo retiro no lo duplica. */
function nuevaClave(turnoId) {
  return `retiro-${turnoId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function NuevoRetiroPage() {
  const router = useRouter();
  const params = useSearchParams();
  // El POS marca la pestaña nueva. No se adivina por user-agent ni por ancho:
  // lo sabe con certeza quien la abrió.
  const enPestanaNueva = params?.get("pestana") === "nueva";

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [turno, setTurno] = useState(null);
  const [huellaInicial, setHuellaInicial] = useState(null);
  const [esperado, setEsperado] = useState(null);
  const [fondoConfigurado, setFondoConfigurado] = useState(null);
  const [errorFatal, setErrorFatal] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [modoConteo, setModoConteo] = useState(MODO_TOTAL);
  const [montoContado, setMontoContado] = useState("");
  const [desgloseContado, setDesgloseContado] = useState({});
  const [desgloseCambio, setDesgloseCambio] = useState({});
  const [observacion, setObservacion] = useState("");
  const [conteoIniciadoEn, setConteoIniciadoEn] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios] = useState(null);
  const [resultado, setResultado] = useState(null);
  const claveRef = useRef(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const usuarioId = perfil?.id ?? null;
  const storage = typeof window !== "undefined" ? window.localStorage : null;

  // ── Estado de la caja ────────────────────────────────────────────────────
  const cargarEstado = useCallback(async () => {
    const r = await fetch("/api/pos-ventas/turnos/actual", {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());
    const t = r?.ok ? r.turno : null;
    if (!t?.id) return { turno: null };

    const [res, cfg] = await Promise.all([
      fetch(`/api/pos-ventas/turnos/resumen?turnoId=${t.id}`, {
        credentials: "include",
        cache: "no-store",
      }).then((x) => x.json()),
      fetch("/api/config/arqueo-caja", { credentials: "include", cache: "no-store" }).then((x) =>
        x.json()
      ),
    ]);

    return {
      turno: t,
      esperado: res?.ok ? Number(res.efectivoEsperado) : null,
      fondo: cfg?.ok ? cfg.fondoObjetivoCaja : null,
      // Huella completa: el esperado solo no distingue una venta de un retiro.
      huella: huellaDelTurno({
        turnoId: t.id,
        efectivoEsperado: res?.efectivoEsperado,
        totalRetirosCaja: res?.totalRetirosCaja,
        cantidadVentas: res?.cantidadVentas,
        estaCerrado: res?.estaCerrado,
      }),
    };
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeUsar || needsContexto) return;
    let vivo = true;
    (async () => {
      try {
        const d = await cargarEstado();
        if (!vivo) return;
        if (!d.turno) {
          setErrorFatal("No hay una caja abierta a tu nombre en este local.");
          return;
        }
        setTurno(d.turno);
        setEsperado(d.esperado);
        setFondoConfigurado(d.fondo);
        setHuellaInicial(d.huella);
        claveRef.current = nuevaClave(d.turno.id);

        if (usuarioId) {
          limpiarBorradoresViejos(storage, { turnoIdActivo: d.turno.id, usuarioId });
          const b = leerBorrador(storage, { turnoId: d.turno.id, usuarioId });
          if (b) {
            setModoConteo(b.modoConteo || MODO_TOTAL);
            setMontoContado(b.montoContado || "");
            setDesgloseContado(sanearDesglose(b.desgloseContado));
            setDesgloseCambio(sanearDesglose(b.desgloseCambio));
            setObservacion(b.observacion || "");
            setConteoIniciadoEn(b.conteoIniciadoEn || null);
            setAviso(
              b.avisoCompat ||
                "Recuperamos lo que habías contado. Los importes de la caja se volvieron a leer del servidor."
            );
          }
        }
      } catch {
        if (vivo) setErrorFatal("No se pudo leer el estado de la caja.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cargarEstado, usuarioId, storage, cargandoUser, cargandoCtx, puedeUsar, needsContexto]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const { fondoObjetivo } = useMemo(
    () => resolverFondoObjetivo({ configurado: fondoConfigurado, montoInicial: turno?.montoInicial }),
    [fondoConfigurado, turno?.montoInicial]
  );

  const totalContado =
    modoConteo === MODO_BILLETES ? totalDesglose(desgloseContado) : Number(montoContado) || 0;
  const hayContado =
    modoConteo === MODO_BILLETES ? !desgloseVacio(desgloseContado) : montoContado !== "";
  const totalCambio = totalDesglose(desgloseCambio);

  const evaluacion = useMemo(
    () =>
      evaluarRetiroPorCambio({
        efectivoEsperadoAntes: esperado ?? 0,
        efectivoContado: totalContado,
        cambioQueQueda: totalCambio,
        fondoObjetivo,
      }),
    [esperado, totalContado, totalCambio, fondoObjetivo]
  );

  const validacionCambio = validarCambioQueQueda({
    desgloseContado: modoConteo === MODO_BILLETES ? desgloseContado : {},
    desgloseCambio,
    totalContado,
  });

  const puedeConfirmar =
    hayContado && validacionCambio.valido && !evaluacion.sinRecaudacion && !evaluacion.cambioExcedeContado;

  // Corregir el conteo hacia abajo no puede dejar un cambio de billetes que ya
  // no existen. Se recorta en el momento en que cambia el conteo.
  const actualizarConteo = (nuevo) => {
    setDesgloseContado(nuevo);
    setDesgloseCambio((c) => limitarCambioAlConteo(c, nuevo));
    if (!conteoIniciadoEn) setConteoIniciadoEn(new Date().toISOString());
  };
  const actualizarMonto = (v) => {
    setMontoContado(v);
    if (!conteoIniciadoEn) setConteoIniciadoEn(new Date().toISOString());
  };

  // ── Borrador ─────────────────────────────────────────────────────────────
  const persistirBorrador = useCallback(() => {
    if (!turno?.id || !usuarioId) return false;
    return guardarBorrador(
      storage,
      armarBorrador({
        turnoId: turno.id,
        usuarioId,
        modoConteo,
        montoContado,
        desgloseContado,
        desgloseCambio,
        observacion,
        conteoIniciadoEn,
      })
    );
  }, [
    turno?.id,
    usuarioId,
    storage,
    modoConteo,
    montoContado,
    desgloseContado,
    desgloseCambio,
    observacion,
    conteoIniciadoEn,
  ]);

  const guardarSolo = () => {
    persistirBorrador();
    setAviso("Borrador guardado. Podés volver cuando quieras.");
  };

  const volverAlPos = () => {
    persistirBorrador();
    // Abierta en pestaña propia: cerrarla devuelve al POS, que nunca se fue.
    if (enPestanaNueva && typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    router.push("/modulos/pos-ventas");
  };

  // ── Confirmar ────────────────────────────────────────────────────────────
  const confirmar = async () => {
    setError("");
    if (!puedeConfirmar || guardando || !turno) return;
    const yaReconfirmado = Boolean(cambios?.hayCambios);

    setGuardando(true);
    try {
      // Se revalida contra el servidor: pudieron entrar ventas o pudo haber otro
      // retiro desde otro dispositivo.
      const fresco = await cargarEstado();
      if (!fresco.turno) {
        setError("La caja ya no está abierta.");
        return;
      }
      const c = compararHuellas(huellaInicial, fresco.huella);
      if (c.bloquea) {
        setEsperado(fresco.esperado);
        setError(
          c.turnoCerrado
            ? "La caja se cerró mientras preparabas el retiro. No se puede registrar."
            : "El turno cambió mientras preparabas el retiro. Volvé a empezar."
        );
        return;
      }
      if (c.hayCambios && !yaReconfirmado) {
        // Solo se actualiza el ESPERADO. Lo contado lo contó una persona y no se
        // toca por detrás.
        setEsperado(fresco.esperado);
        setHuellaInicial(fresco.huella);
        setCambios(c);
        return;
      }

      const res = await fetch("/api/pos-ventas/retiros/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId: turno.id,
          efectivoContado: totalContado,
          efectivoRetirado: evaluacion.totalRetiro,
          observacion: observacion.trim() || null,
          idempotencyKey: claveRef.current,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo registrar el retiro.");
        return;
      }
      descartarBorrador(storage, { turnoId: turno.id, usuarioId });
      setCambios(null);
      setResultado(json.retiro);
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
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

  if (resultado) {
    return (
      <Marco>
        <SunmiCard className="space-y-3">
          <div className="sunmi-state-success sunmi-border rounded-xl p-3 flex items-center gap-3">
            <Check size={26} className="shrink-0 sunmi-text-success" />
            <div className="min-w-0">
              <div className="text-base font-bold sunmi-text-success">Retiro registrado</div>
              <div className="text-[12px] sunmi-text-muted">
                El descuento ya está aplicado. La entrega se completa después.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Cifra label="Se retiró" valor={resultado.efectivoRetirado} clase="sunmi-text-accent" destacado />
            <Cifra label="Quedó de cambio" valor={resultado.fondoDejado} />
            <Cifra
              label="Diferencia al contar"
              valor={resultado.diferencia}
              clase={tonoDiferencia(resultado.diferencia)}
            />
          </div>
          <SunmiButton color="amber" onClick={volverAlPos} className="w-full py-3 font-bold">
            {enPestanaNueva ? "Cerrar esta pestaña" : "Volver al POS"}
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco>
      {/* Encabezado compacto */}
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              Retiro de recaudación
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Turno #{turno?.id} · <span className="sunmi-text-success font-semibold">abierto</span> desde{" "}
              {hora(turno?.apertura)} · {contexto?.nombre || "—"}
            </p>
            {enPestanaNueva && (
              <p className="text-[11px] sunmi-text-accent leading-tight mt-0.5">
                Podés seguir vendiendo desde la pestaña del POS.
              </p>
            )}
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

      <ResumenCabecera
        esperado={esperado}
        totalContado={totalContado}
        hayContado={hayContado}
        diferencia={evaluacion.diferencia}
        totalCambio={totalCambio}
        totalRetiro={evaluacion.totalRetiro}
      />

      {/* Una sola pantalla: tres columnas en escritorio, una sobre otra en móvil.
          Sin pasos, sin Anterior ni Siguiente. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <PanelConteo
          modo={modoConteo}
          onModo={setModoConteo}
          monto={montoContado}
          onMonto={actualizarMonto}
          desglose={desgloseContado}
          onDesglose={actualizarConteo}
          horaConteo={conteoIniciadoEn ? hora(conteoIniciadoEn) : null}
        />

        <PanelCambio
          desgloseContado={modoConteo === MODO_BILLETES ? desgloseContado : {}}
          desgloseCambio={desgloseCambio}
          onDesgloseCambio={setDesgloseCambio}
          totalCambio={totalCambio}
          error={validacionCambio.valido ? null : validacionCambio.error}
        />

        <PanelResumen
          esperado={esperado}
          totalContado={totalContado}
          hayContado={hayContado}
          totalCambio={totalCambio}
          totalRetiro={evaluacion.totalRetiro}
          diferencia={evaluacion.diferencia}
          sinRecaudacion={evaluacion.sinRecaudacion}
          observacion={observacion}
          onObservacion={setObservacion}
          cambios={cambios}
          error={error}
          guardando={guardando}
          puedeConfirmar={puedeConfirmar}
          enPestanaNueva={enPestanaNueva}
          onGuardar={guardarSolo}
          onVolver={volverAlPos}
          onConfirmar={confirmar}
        />
      </div>

      <p className="text-[10px] sunmi-text-muted text-center pb-1">
        Cambio de referencia del local: {money(fondoObjetivo)}. No hace falta dejar ese importe exacto.
      </p>
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-[1400px] mx-auto">{children}</div>;
}
