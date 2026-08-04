"use client";

// RETIRO DE RECAUDACIÓN — pantalla propia.
//
// Reemplaza al modal. Existe como página y no como modal por una razón concreta:
// contar un cajón lleva minutos, y durante esos minutos el cajero tiene que
// poder volver a cobrar sin perder lo contado. El carrito del POS ya persiste en
// localStorage por local y usuario, así que ir y volver es seguro sin tocar nada
// de su estado.
//
// La pantalla NO pregunta si se va a retirar: existe para hacer un retiro.
//
// Nada se registra hasta "Confirmar retiro". El borrador vive solo en el
// navegador: no crea filas, no crea movimientos, no reserva nada.
//
// El JSX de los tres pasos está en components/caja/PasosRetiro para que las
// pruebas puedan renderizarlo de verdad; acá quedan el estado, los datos y las
// decisiones.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { Cifra, money, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import { PASOS, PasoContar, PasoDefinir, PasoConfirmar } from "@/components/caja/PasosRetiro";

import {
  MODO_TOTAL,
  MODO_BILLETES,
  totalDesglose,
  desgloseVacio,
  desgloseCoincide,
  validarRetiroPorBilletes,
  fondoFisicoRestante,
} from "@/lib/caja/conteoBilletes";
import {
  armarBorrador,
  guardarBorrador,
  leerBorrador,
  descartarBorrador,
  limpiarBorradoresViejos,
  detectarEsperadoCambiado,
} from "@/lib/caja/borradorRetiro";
import {
  resolverFondoObjetivo,
  sugerirRepartoRetiro,
  validarRepartoRetiro,
  evaluarRetiro,
} from "@/lib/caja/retiroDinero";

/** Clave por visita: reintentar el mismo retiro no lo duplica. */
function nuevaClave(turnoId) {
  return `retiro-${turnoId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function NuevoRetiroPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [turno, setTurno] = useState(null);
  const [esperado, setEsperado] = useState(null);
  const [fondoConfigurado, setFondoConfigurado] = useState(null);
  const [error, setError] = useState("");
  const [errorFatal, setErrorFatal] = useState("");
  const [aviso, setAviso] = useState("");

  const [paso, setPaso] = useState(1);
  const [modoConteo, setModoConteo] = useState(MODO_TOTAL);
  const [montoContado, setMontoContado] = useState("");
  const [desgloseContado, setDesgloseContado] = useState({});
  const [modoRetiro, setModoRetiro] = useState(MODO_TOTAL);
  const [importeRetiro, setImporteRetiro] = useState("");
  const [desgloseRetiro, setDesgloseRetiro] = useState({});
  const [observacion, setObservacion] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [cambioEsperado, setCambioEsperado] = useState(null);
  const [resultado, setResultado] = useState(null);
  const claveRef = useRef(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeUsar = permisos.includes("*") || permisos.includes("pos.usar");
  const usuarioId = perfil?.id ?? null;

  const storage = typeof window !== "undefined" ? window.localStorage : null;

  // ── Estado de la caja: turno propio abierto, esperado y fondo objetivo ────
  const cargarEstado = useCallback(async () => {
    // `turnos/actual` devuelve el turno completo: hace falta el montoInicial para
    // resolver el fondo objetivo cuando el local no tiene uno configurado.
    const r = await fetch("/api/pos-ventas/turnos/actual", {
      credentials: "include",
      cache: "no-store",
    }).then((x) => x.json());
    const t = r?.ok ? r.turno : null;
    if (!t?.id) return { turno: null };

    const [res, cfg] = await Promise.all([
      fetch(`/api/pos-ventas/turnos/resumen?turnoId=${t.id}`, { credentials: "include", cache: "no-store" })
        .then((x) => x.json()),
      fetch("/api/config/arqueo-caja", { credentials: "include", cache: "no-store" }).then((x) => x.json()),
    ]);
    return {
      turno: t,
      esperado: res?.ok ? Number(res.efectivoEsperado) : null,
      fondo: cfg?.ok ? cfg.fondoObjetivoCaja : null,
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
        claveRef.current = nuevaClave(d.turno.id);

        // Se recupera SOLO el borrador del turno vigente; los de turnos ya
        // cerrados se descartan para que no reaparezcan con números de otra
        // jornada.
        if (usuarioId) {
          limpiarBorradoresViejos(storage, { turnoIdActivo: d.turno.id, usuarioId });
          const b = leerBorrador(storage, { turnoId: d.turno.id, usuarioId });
          if (b) {
            setModoConteo(b.modoConteo || MODO_TOTAL);
            setMontoContado(b.montoContado || "");
            setDesgloseContado(b.desgloseContado || {});
            setModoRetiro(b.modoRetiro || MODO_TOTAL);
            setImporteRetiro(b.importeRetiro || "");
            setDesgloseRetiro(b.desgloseRetiro || {});
            setObservacion(b.observacion || "");
            setAviso(
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
  const { fondoObjetivo, origen } = useMemo(
    () => resolverFondoObjetivo({ configurado: fondoConfigurado, montoInicial: turno?.montoInicial }),
    [fondoConfigurado, turno?.montoInicial]
  );

  // Cuando el modo elegido es por billetes, el desglose ES el importe: no puede
  // quedar como una ayuda decorativa que diga otra cosa que el número real.
  const totalContado =
    modoConteo === MODO_BILLETES ? totalDesglose(desgloseContado) : Number(montoContado) || 0;
  const hayContado = modoConteo === MODO_BILLETES ? !desgloseVacio(desgloseContado) : montoContado !== "";

  const sugerido = useMemo(
    () =>
      esperado != null
        ? sugerirRepartoRetiro({
            efectivoEsperadoAntes: esperado,
            fondoObjetivo,
            efectivoContado: totalContado,
          })
        : null,
    [esperado, fondoObjetivo, totalContado]
  );
  const retiroSugerido = sugerido?.efectivoRetirado ?? 0;

  const totalRetiro =
    modoRetiro === MODO_BILLETES
      ? totalDesglose(desgloseRetiro)
      : importeRetiro === ""
      ? retiroSugerido
      : Number(importeRetiro) || 0;

  const fondoFisico = fondoFisicoRestante(totalContado, totalRetiro);

  const evaluacion = useMemo(
    () =>
      esperado != null && hayContado
        ? evaluarRetiro({
            efectivoEsperadoAntes: esperado,
            fondoObjetivo,
            efectivoContado: totalContado,
            efectivoRetirado: totalRetiro,
          })
        : null,
    [esperado, hayContado, fondoObjetivo, totalContado, totalRetiro]
  );

  const reparto = validarRepartoRetiro({
    efectivoContado: totalContado,
    efectivoRetirado: totalRetiro,
    fondoDejado: fondoFisico,
  });

  // El tope por denominación solo existe si el cajón se contó billete por
  // billete. Con un monto total no hay forma de saber qué billetes hay.
  const validacionBilletes = validarRetiroPorBilletes({
    desgloseContado: modoConteo === MODO_BILLETES ? desgloseContado : {},
    desgloseRetiro: modoRetiro === MODO_BILLETES ? desgloseRetiro : {},
    totalContado,
  });

  // Volver a modo manual con un desglose viejo escondido sería sostener dos
  // totales distintos: se avisa y se ofrece limpiarlo.
  const desacopleConteo =
    modoConteo === MODO_TOTAL &&
    !desgloseVacio(desgloseContado) &&
    !desgloseCoincide(desgloseContado, Number(montoContado) || 0);
  const desacopleRetiro =
    modoRetiro === MODO_TOTAL &&
    !desgloseVacio(desgloseRetiro) &&
    !desgloseCoincide(desgloseRetiro, Number(importeRetiro) || retiroSugerido || 0);

  const puedeConfirmar =
    hayContado && reparto.valido && validacionBilletes.valido && !desacopleConteo && !desacopleRetiro;

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
        modoRetiro,
        importeRetiro,
        desgloseRetiro,
        observacion,
      })
    );
  }, [
    turno?.id,
    usuarioId,
    storage,
    modoConteo,
    montoContado,
    desgloseContado,
    modoRetiro,
    importeRetiro,
    desgloseRetiro,
    observacion,
  ]);

  const volverAlPos = () => router.push("/modulos/pos-ventas");

  const guardarYVolver = () => {
    persistirBorrador();
    volverAlPos();
  };

  // ── Confirmar ────────────────────────────────────────────────────────────
  const confirmar = async () => {
    setError("");
    if (!puedeConfirmar || guardando || !turno) return;
    const yaReconfirmado = Boolean(cambioEsperado?.cambio);

    setGuardando(true);
    try {
      // El esperado SE REVALIDA contra el servidor: entre que se contó y ahora
      // pueden haber entrado ventas, y confirmar con el número viejo produciría
      // una diferencia que no es real.
      const fresco = await cargarEstado();
      if (!fresco.turno || fresco.turno.id !== turno.id) {
        setError("La caja se cerró mientras preparabas el retiro.");
        return;
      }
      const cambio = detectarEsperadoCambiado({
        esperadoAlAbrir: esperado,
        esperadoAhora: fresco.esperado,
      });
      if (cambio.cambio && !yaReconfirmado) {
        setEsperado(fresco.esperado);
        setCambioEsperado(cambio);
        setPaso(3);
        return; // No se confirma en silencio.
      }

      const res = await fetch("/api/pos-ventas/retiros/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId: turno.id,
          efectivoContado: totalContado,
          efectivoRetirado: totalRetiro,
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
      setCambioEsperado(null);
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
            Volver al POS
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
            <Cifra label="Queda de fondo" valor={resultado.fondoDejado} />
            <Cifra
              label="Diferencia al contar"
              valor={resultado.diferencia}
              clase={tonoDiferencia(resultado.diferencia)}
            />
          </div>
          <SunmiButton color="amber" onClick={volverAlPos} className="w-full py-3 font-bold">
            Volver al POS
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco>
      <SunmiCard className="p-3">
        <button
          type="button"
          onClick={guardarYVolver}
          className="text-[12px] sunmi-text-accent inline-flex items-center gap-1 mb-1"
        >
          <ArrowLeft size={14} /> Guardar y volver al POS
        </button>
        <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
          Retiro de recaudación
        </h1>
        <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
          Turno #{turno?.id} · abierto desde {hora(turno?.apertura)} · {contexto?.nombre || "—"}
        </p>
      </SunmiCard>

      {aviso && (
        <div className="sunmi-surface-soft sunmi-border rounded-lg p-2 text-[12px] sunmi-text-muted">
          {aviso}
        </div>
      )}

      {/* Cifras de referencia, siempre a la vista: el cajero decide cuánto sacar
          mirando estos números, no de memoria. */}
      <SunmiCard className="p-3 space-y-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Cifra label="Efectivo esperado ahora" valor={esperado ?? "—"} />
          <Cifra
            label="Fondo objetivo del local"
            valor={fondoObjetivo}
            nota={origen === "MONTO_INICIAL" ? "sin configurar: fondo de apertura" : null}
          />
          <Cifra label="Efectivo contado" valor={hayContado ? totalContado : "—"} />
          <Cifra
            label="Diferencia al contar"
            valor={evaluacion ? evaluacion.diferencia : "—"}
            clase={evaluacion ? tonoDiferencia(evaluacion.diferencia) : "sunmi-text-muted"}
          />
        </div>
        {evaluacion && (
          <p className="text-[11px] sunmi-text-muted leading-snug">
            Recaudación esperada {money(evaluacion.recaudacionEsperada)} · sugerido a retirar{" "}
            {money(retiroSugerido)}.
          </p>
        )}
      </SunmiCard>

      <NavPasos paso={paso} onIr={setPaso} />

      <PasoContar
        visible={paso === 1}
        modo={modoConteo}
        onModo={setModoConteo}
        monto={montoContado}
        onMonto={setMontoContado}
        desglose={desgloseContado}
        onDesglose={setDesgloseContado}
        desacople={desacopleConteo}
      />

      <PasoDefinir
        visible={paso === 2}
        modo={modoRetiro}
        onModo={setModoRetiro}
        importe={importeRetiro === "" ? String(retiroSugerido) : importeRetiro}
        onImporte={setImporteRetiro}
        sugerido={retiroSugerido}
        desglose={desgloseRetiro}
        onDesglose={setDesgloseRetiro}
        topes={modoConteo === MODO_BILLETES ? desgloseContado : null}
        totalContado={totalContado}
        totalRetiro={totalRetiro}
        fondoObjetivo={fondoObjetivo}
        fondoFisico={fondoFisico}
        evaluacion={evaluacion}
        errorBilletes={validacionBilletes.valido ? null : validacionBilletes.error}
        errorReparto={reparto.valido ? null : reparto.error}
        desacople={desacopleRetiro}
      />

      <PasoConfirmar
        visible={paso === 3}
        esperado={esperado}
        totalContado={totalContado}
        totalRetiro={totalRetiro}
        fondoObjetivo={fondoObjetivo}
        fondoFisico={fondoFisico}
        evaluacion={evaluacion}
        observacion={observacion}
        onObservacion={setObservacion}
        cambioEsperado={cambioEsperado}
        error={error}
        guardando={guardando}
        puedeConfirmar={puedeConfirmar}
        onGuardarYVolver={guardarYVolver}
        onConfirmar={confirmar}
      />

      {/* Avanzar y retroceder no pierde nada: el estado vive en la página, no en
          el paso visible. */}
      <div className="xl:hidden grid grid-cols-2 gap-2">
        <SunmiButton color="slate" onClick={() => setPaso((p) => Math.max(1, p - 1))} disabled={paso === 1}>
          Anterior
        </SunmiButton>
        <SunmiButton color="cyan" onClick={() => setPaso((p) => Math.min(3, p + 1))} disabled={paso === 3}>
          Siguiente
        </SunmiButton>
      </div>
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-2 lg:p-3 space-y-3 max-w-5xl mx-auto">{children}</div>;
}

function NavPasos({ paso, onIr }) {
  return (
    <div className="grid grid-cols-3 gap-1 xl:hidden">
      {PASOS.map((p) => (
        <button
          key={p.n}
          type="button"
          onClick={() => onIr(p.n)}
          aria-current={paso === p.n ? "step" : undefined}
          className={`rounded-md px-2 py-1.5 text-[11px] font-semibold sunmi-border ${
            paso === p.n ? "sunmi-surface sunmi-text-accent" : "sunmi-surface-soft sunmi-text-muted"
          }`}
        >
          {p.n}. {p.titulo}
        </button>
      ))}
    </div>
  );
}
