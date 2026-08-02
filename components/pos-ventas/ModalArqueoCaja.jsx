"use client";

// Arqueo parcial de caja, en dos pasos.
//
// PASO 1 — CONTEO CIEGO. Solo se pide el efectivo contado. El esperado NO se
// muestra ni se envía al navegador: si el cajero lo ve antes de contar, deja de
// ser un control y pasa a ser una confirmación.
//
// PASO 2 — RESULTADO. Recién después de confirmar aparecen esperado, contado y
// diferencia, con su clasificación.
//
// El esperado y la diferencia los calcula el BACKEND con la hora real de
// confirmación. Este componente no hace aritmética de caja: si una venta entra
// mientras el formulario está abierto, el backend la incluye y el modal muestra
// el número correcto.
//
// El arqueo parcial no cierra la caja, no toca ventas y no crea ajustes.

import { useRef, useState } from "react";
import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Clave de idempotencia por apertura de modal: dos envíos del mismo conteo colapsan. */
function nuevaClave(turnoId) {
  const azar = Math.random().toString(36).slice(2, 10);
  return `arqueo-${turnoId}-${Date.now().toString(36)}-${azar}`;
}

const TONOS = {
  CORRECTO: {
    icono: CheckCircle2,
    caja: "sunmi-state-success",
    texto: "sunmi-text-success",
    titulo: "Caja correcta",
    detalle: "El conteo coincide con lo esperado.",
  },
  SOBRANTE: {
    icono: TriangleAlert,
    caja: "sunmi-state-warning",
    texto: "sunmi-text-warning",
    titulo: "Sobrante",
    detalle: "Hay más efectivo del esperado.",
  },
  FALTANTE: {
    icono: XCircle,
    caja: "sunmi-state-danger",
    texto: "sunmi-text-danger",
    titulo: "Faltante",
    detalle: "Hay menos efectivo del esperado.",
  },
};

export default function ModalArqueoCaja({ turnoId, localId, onClose, onRegistrado }) {
  const [paso, setPaso] = useState("conteo"); // conteo | resultado
  const [contado, setContado] = useState("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  // Se fija al montar: reintentar el mismo conteo reusa la clave y no duplica.
  const claveRef = useRef(nuevaClave(turnoId));

  const confirmar = async () => {
    setError("");
    const n = Number(contado);
    // Cero es válido: una caja puede quedar vacía. Se rechaza solo lo que no es
    // un número o es negativo.
    if (!Number.isFinite(n) || n < 0) {
      setError("Ingresá el efectivo contado");
      return;
    }
    if (guardando) return;

    setGuardando(true);
    try {
      const res = await fetch("/api/pos-ventas/arqueos/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId,
          localId,
          efectivoContado: n,
          observacion: observacion.trim() || null,
          idempotencyKey: claveRef.current,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo registrar el arqueo");
        return;
      }

      setResultado({ ...json.arqueo, estadoDiferencia: json.estadoDiferencia, desglose: json.desglose });
      setPaso("resultado");
      onRegistrado?.(json.arqueo);
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
      <div className="sunmi-pos-panel rounded-xl shadow-2xl w-full max-w-md space-y-4 p-5 max-h-[92vh] overflow-y-auto">
        {paso === "conteo" && (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold sunmi-pos-text-accent">Arqueo de caja</h2>
              <p className="text-[12px] sunmi-pos-muted mt-0.5">
                Contá el efectivo del cajón e ingresá el total. No cierra la caja.
              </p>
            </div>

            <div>
              <label className="text-xs sunmi-pos-muted mb-1 block">Efectivo contado ($)</label>
              <SunmiInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="text-2xl font-bold text-center"
              />
            </div>

            <div>
              <label className="text-xs sunmi-pos-muted mb-1 block">Observación (opcional)</label>
              <SunmiInput
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej: faltan monedas de $50"
              />
            </div>

            {error && <div className="text-xs sunmi-text-danger text-center">{error}</div>}

            {/* Botones grandes: se usa en pantalla táctil */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <SunmiButton color="slate" onClick={onClose} disabled={guardando} className="py-3">
                Cancelar
              </SunmiButton>
              <SunmiButton color="amber" onClick={confirmar} disabled={guardando} className="py-3 font-bold">
                {guardando ? "Registrando…" : "Confirmar conteo"}
              </SunmiButton>
            </div>
          </>
        )}

        {paso === "resultado" && resultado && (
          <>
            <div className={`${tono.caja} sunmi-border rounded-xl p-4 flex items-center gap-3`}>
              <Icono size={28} className={`shrink-0 ${tono.texto}`} />
              <div className="min-w-0">
                <div className={`text-base font-bold ${tono.texto}`}>{tono.titulo}</div>
                <div className="text-[12px] sunmi-text-muted">{tono.detalle}</div>
              </div>
            </div>

            {/* Tres cifras, en cards: legibles en móvil sin scroll horizontal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Cifra label="Efectivo esperado" valor={money(resultado.efectivoEsperado)} />
              <Cifra label="Efectivo contado" valor={money(resultado.efectivoContado)} />
              <Cifra
                label="Diferencia"
                valor={money(resultado.diferencia)}
                clase={tono.texto}
                destacado
              />
            </div>

            {resultado.desglose && (
              <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1 text-[12px]">
                <Fila label="Fondo inicial" valor={money(resultado.desglose.montoInicial)} />
                <Fila label="+ Ventas en efectivo" valor={money(resultado.desglose.ventasEfectivo)} />
                <Fila label="+ Ingresos" valor={money(resultado.desglose.ingresos)} />
                <Fila label="− Retiros" valor={money(resultado.desglose.retiros)} />
              </div>
            )}

            <p className="text-[11px] sunmi-text-muted text-center">
              El arqueo quedó registrado como corte de control. La caja sigue abierta y
              ninguna venta fue modificada.
            </p>

            <SunmiButton color="amber" onClick={onClose} className="w-full py-3 font-bold">
              Listo
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

function Fila({ label, valor }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="sunmi-text-muted">{label}</span>
      <span className="font-mono tabular-nums sunmi-text-strong">{valor}</span>
    </div>
  );
}
