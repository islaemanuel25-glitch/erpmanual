"use client";

// RETIRAR RECAUDACIÓN: contar el cajón, dejar el fondo y sacar el resto.
//
// Reemplaza al par "arqueo + movimiento de retiro manual". Antes eran dos actos
// separados y el descuento dependía de que el cajero se acordara del segundo; si
// lo olvidaba, el sistema le imputaba un faltante igual a lo que había retirado.
// Acá es una sola confirmación y el backend crea el movimiento en la misma
// transacción.
//
// NO pide destino ni receptor: eso es la ENTREGA y va aparte, para no frenar a
// alguien con gente esperando. La plata ya salió del cajón al confirmar.
//
// Un cambio deliberado respecto del arqueo viejo: acá el esperado SE MUESTRA
// antes de contar. El arqueo era un control a ciegas; esto es una operación de
// dinero, y el cajero necesita ver contra qué está parado para decidir cuánto
// retirar. La contrapartida es que el conteo deja de ser ciego.

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import {
  resolverFondoObjetivo,
  sugerirRepartoRetiro,
  validarRepartoRetiro,
} from "@/lib/caja/retiroDinero";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Clave por apertura del modal: reintentar el mismo retiro no lo duplica. */
function nuevaClave(turnoId) {
  const azar = Math.random().toString(36).slice(2, 10);
  return `retiro-${turnoId}-${Date.now().toString(36)}-${azar}`;
}

const TONOS = {
  CORRECTO: { icono: CheckCircle2, caja: "sunmi-state-success", texto: "sunmi-text-success", titulo: "Coincide" },
  SOBRANTE: { icono: TriangleAlert, caja: "sunmi-state-warning", texto: "sunmi-text-warning", titulo: "Sobrante" },
  FALTANTE: { icono: XCircle, caja: "sunmi-state-danger", texto: "sunmi-text-danger", titulo: "Faltante" },
};

export default function ModalRetiroDinero({ turnoId, montoInicial = 0, onClose, onRegistrado }) {
  const [cargando, setCargando] = useState(true);
  const [esperado, setEsperado] = useState(null);
  const [fondoConfigurado, setFondoConfigurado] = useState(null);

  const [contado, setContado] = useState("");
  const [fondoEditado, setFondoEditado] = useState(null); // null = usar el sugerido
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  const claveRef = useRef(nuevaClave(turnoId));

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/pos-ventas/turnos/resumen?turnoId=${turnoId}`, { credentials: "include" }).then((r) => r.json()),
          fetch("/api/config/arqueo-caja", { credentials: "include" }).then((r) => r.json()),
        ]);
        if (!vivo) return;
        if (r1?.ok) setEsperado(Number(r1.efectivoEsperado));
        if (r2?.ok) setFondoConfigurado(r2.fondoObjetivoCaja);
      } catch {
        // Sin estos datos igual se puede retirar: el backend recalcula todo y es
        // quien decide. Solo se pierde la ayuda visual.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [turnoId]);

  const { fondoObjetivo, origen } = useMemo(
    () => resolverFondoObjetivo({ configurado: fondoConfigurado, montoInicial }),
    [fondoConfigurado, montoInicial]
  );

  const contadoNum = Number(contado);
  const hayContado = contado !== "" && Number.isFinite(contadoNum) && contadoNum >= 0;

  const sugerido = useMemo(
    () => (hayContado ? sugerirRepartoRetiro({ efectivoContado: contadoNum, fondoObjetivo }) : null),
    [hayContado, contadoNum, fondoObjetivo]
  );

  // El fondo que quedará: el sugerido, salvo que el cajero lo haya cambiado.
  const fondoDejado = fondoEditado === null ? sugerido?.fondoDejado ?? 0 : Number(fondoEditado);
  const retirado = hayContado ? Number((contadoNum - Number(fondoDejado || 0)).toFixed(2)) : 0;
  const diferencia = hayContado && esperado != null ? Number((contadoNum - esperado).toFixed(2)) : null;

  const reparto = hayContado
    ? validarRepartoRetiro({ efectivoContado: contadoNum, efectivoRetirado: retirado, fondoDejado })
    : { valido: false, error: null };

  const fondoDistinto =
    hayContado && fondoEditado !== null && Math.round(Number(fondoDejado) * 100) !== Math.round(fondoObjetivo * 100);

  const confirmar = async () => {
    setError("");
    if (!hayContado) {
      setError("Ingresá el efectivo total contado");
      return;
    }
    if (!reparto.valido) {
      setError(reparto.error || "El reparto no cierra contra el efectivo contado");
      return;
    }
    if (guardando) return;

    setGuardando(true);
    try {
      const res = await fetch("/api/pos-ventas/retiros/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId,
          efectivoContado: contadoNum,
          fondoDejado: Number(fondoDejado),
          observacion: observacion.trim() || null,
          idempotencyKey: claveRef.current,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo registrar el retiro");
        return;
      }
      setResultado({ ...json.retiro, estadoDiferencia: json.estadoDiferencia });
      onRegistrado?.(json.retiro);
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  const tono = resultado ? TONOS[resultado.estadoDiferencia] || TONOS.CORRECTO : null;
  const Icono = tono?.icono;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="sunmi-pos-panel rounded-xl shadow-2xl w-full max-w-md space-y-3 p-4 max-h-[92vh] overflow-y-auto">
        {!resultado ? (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold sunmi-pos-text-accent">Retirar recaudación</h2>
              <p className="text-[12px] sunmi-pos-muted mt-0.5">
                Contá el cajón, dejá el fondo y sacá el resto. Se descuenta solo.
              </p>
            </div>

            <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1 text-[12px]">
              <Fila
                label="Efectivo esperado ahora"
                valor={cargando ? "…" : esperado != null ? money(esperado) : "—"}
              />
              <Fila
                label="Fondo objetivo del local"
                valor={cargando ? "…" : money(fondoObjetivo)}
                nota={origen === "MONTO_INICIAL" ? "sin configurar: se usa el fondo de apertura" : null}
              />
            </div>

            <div>
              <label className="text-xs sunmi-pos-muted mb-1 block">Efectivo total contado ($)</label>
              <SunmiInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={contado}
                onChange={(e) => {
                  setContado(e.target.value);
                  setFondoEditado(null); // vuelve a seguir el sugerido
                }}
                placeholder="0.00"
                autoFocus
                className="text-2xl font-bold text-center"
              />
              <p className="text-[11px] sunmi-pos-muted mt-1">
                Contá TODO lo que hay en el cajón, incluido el fondo. No cuentes Mercado Pago,
                débito ni crédito.
              </p>
            </div>

            {hayContado && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Cifra
                    label="Diferencia al contar"
                    valor={diferencia != null ? money(diferencia) : "—"}
                    clase={
                      diferencia == null || diferencia === 0
                        ? "sunmi-text-strong"
                        : diferencia > 0
                        ? "sunmi-text-success"
                        : "sunmi-text-danger"
                    }
                  />
                  <Cifra label="Se retira" valor={money(retirado)} clase="sunmi-text-accent" destacado />
                </div>

                <div>
                  <label className="text-xs sunmi-pos-muted mb-1 block">
                    Fondo que queda en el cajón ($)
                  </label>
                  <SunmiInput
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={fondoEditado === null ? String(sugerido?.fondoDejado ?? 0) : fondoEditado}
                    onChange={(e) => setFondoEditado(e.target.value)}
                    className="text-center font-bold"
                  />
                </div>

                {fondoDistinto && (
                  <div className="sunmi-state-warning sunmi-border rounded-lg p-2 text-[11px] sunmi-text-warning">
                    Vas a dejar {money(fondoDejado)} en vez del fondo objetivo de {money(fondoObjetivo)}.
                    Queda registrado así.
                  </div>
                )}

                {!reparto.valido && reparto.error && (
                  <div className="text-[11px] sunmi-text-danger text-center">{reparto.error}</div>
                )}
              </>
            )}

            <div>
              <label className="text-xs sunmi-pos-muted mb-1 block">Observación (opcional)</label>
              <SunmiInput
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej: se lleva Marcela"
              />
            </div>

            {error && <div className="text-xs sunmi-text-danger text-center">{error}</div>}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <SunmiButton color="slate" onClick={onClose} disabled={guardando} className="py-3">
                Cancelar
              </SunmiButton>
              <SunmiButton
                color="amber"
                onClick={confirmar}
                disabled={guardando || !hayContado || !reparto.valido}
                className="py-3 font-bold"
              >
                {guardando ? "Registrando…" : "Confirmar retiro"}
              </SunmiButton>
            </div>
          </>
        ) : (
          <>
            <div className={`${tono.caja} sunmi-border rounded-xl p-3 flex items-center gap-3`}>
              <Icono size={26} className={`shrink-0 ${tono.texto}`} />
              <div className="min-w-0">
                <div className={`text-base font-bold ${tono.texto}`}>Retiro registrado</div>
                <div className="text-[12px] sunmi-text-muted">
                  {tono.titulo === "Coincide"
                    ? "El conteo coincide con lo esperado."
                    : `${tono.titulo} de ${money(Math.abs(resultado.diferencia))} al contar.`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Cifra label="Se retiró" valor={money(resultado.efectivoRetirado)} clase="sunmi-text-accent" destacado />
              <Cifra label="Queda de fondo" valor={money(resultado.fondoDejado)} />
              <Cifra
                label="Diferencia"
                valor={money(resultado.diferencia)}
                clase={tono.texto}
              />
            </div>

            <p className="text-[11px] sunmi-text-muted text-center">
              El descuento ya está aplicado. Podés seguir vendiendo. La entrega se completa
              después.
            </p>

            <SunmiButton color="amber" onClick={onClose} className="w-full py-3 font-bold">
              Seguir vendiendo
            </SunmiButton>
          </>
        )}
      </div>
    </div>
  );
}

function Cifra({ label, valor, clase = "sunmi-text-strong", destacado = false }) {
  return (
    <div className={`${destacado ? "sunmi-surface" : "sunmi-surface-soft"} sunmi-border rounded-lg px-3 py-2`}>
      <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
      <div className={`text-base font-bold font-mono tabular-nums leading-tight ${clase}`}>{valor}</div>
    </div>
  );
}

function Fila({ label, valor, nota }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="sunmi-text-muted">
        {label}
        {nota && <span className="block text-[10px] opacity-70">{nota}</span>}
      </span>
      <span className="font-mono tabular-nums sunmi-text-strong shrink-0">{valor}</span>
    </div>
  );
}
