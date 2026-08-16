"use client";

// Los bloques PROPIOS de la apertura con relevo.
//
// Lo compartido con el retiro y el cierre —contar por denominación, la
// geometría de las grillas, las cifras— se reutiliza tal cual. Acá vive lo que
// esas dos pantallas no tienen: la lista de sobres de cambio y la comparación
// entre lo que declaró el cierre y lo que contó quien abre.
//
// De presentación pura, igual que PanelesRetiro y PanelesCierre: todo entra por
// props, no se llama a nada y no se decide nada. Así el JSX real que ve el
// operador se puede renderizar en una prueba.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { TriangleAlert, Check, Clock, Coins } from "lucide-react";

import { Cifra, Fila, money, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import { CABECERA_BLOQUE, BLOQUE_ALINEADO } from "@/components/caja/geometriaGrilla";
import { DENOMINACIONES, CLAVE_MONEDAS } from "@/lib/caja/conteoBilletes";
import { RECEPCION } from "@/lib/caja/cierreRelevo";

export const TITULO_APERTURA = "Abrir caja";

export const AYUDA_CONTEO_APERTURA =
  "Contá los billetes y monedas que recibiste. El total se calcula automáticamente.";

export const AYUDA_SIN_CAMBIO =
  "Indicá de dónde proviene el cambio con el que abrís la caja.";

const hhmm = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
};

/** Minutos que faltan para que venza una reserva. Negativo = ya venció. */
export function minutosRestantes(venceEn, ahora = Date.now()) {
  if (!venceEn) return null;
  const t = new Date(venceEn).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - ahora) / 60000);
}

function Bloque({ titulo, ayuda, children, className = "", alineado = false }) {
  return (
    <SunmiCard className={`p-3 space-y-2 ${alineado ? BLOQUE_ALINEADO : ""} ${className}`}>
      <div className={alineado ? CABECERA_BLOQUE : ""}>
        <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{titulo}</h2>
        {ayuda && <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </SunmiCard>
  );
}

// ── Desglose resumido ───────────────────────────────────────────────────────

/**
 * "10 × $1.000" por cada fila con algo.
 *
 * El resumen por denominación no es decoración: es lo que le permite a quien
 * recibe saber QUÉ está por contar antes de abrir el sobre, y lo que hace
 * evidente después si le dieron otros billetes.
 */
export function DesgloseResumido({ desglose = {}, className = "" }) {
  const filas = [];
  for (const { valor, etiqueta } of DENOMINACIONES) {
    const n = Number(desglose?.[String(valor)] ?? 0);
    if (n > 0) filas.push({ clave: String(valor), texto: `${n} × ${etiqueta}` });
  }
  const monedas = Number(desglose?.[CLAVE_MONEDAS] ?? 0);
  if (monedas > 0) filas.push({ clave: CLAVE_MONEDAS, texto: `${money(monedas)} en monedas / otros` });

  if (!filas.length) {
    return <p className={`text-[11px] sunmi-text-muted ${className}`}>Sin desglose declarado.</p>;
  }

  return (
    <ul className={`text-[12px] sunmi-text-strong leading-snug space-y-0.5 ${className}`}>
      {filas.map((f) => (
        <li key={f.clave} className="font-mono tabular-nums">{f.texto}</li>
      ))}
    </ul>
  );
}

// ── Tarjeta de un sobre pendiente ───────────────────────────────────────────

/**
 * Un cambio esperando en el local.
 *
 * ABRIR EL DETALLE NO RESERVA NADA. La reserva ocurre solo al pulsar "Tomar este
 * cambio", y esa distinción es deliberada: si mirar bloqueara, el primero que
 * entra a curiosear dejaría el sobre trabado para todos hasta que venza.
 */
export function TarjetaCambio({ item, onTomar, onContinuar, ocupado = false }) {
  const esMio = item?.esMio === true;
  const restan = esMio ? minutosRestantes(item?.reservaVenceEn) : null;

  return (
    <SunmiCard className={`p-3 space-y-2 ${esMio ? "sunmi-state-warning" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold sunmi-text-strong leading-tight break-words">
            {item?.operadorOrigen || item?.cajeroOrigen || "Sin operario"}
          </div>
          <div className="text-[11px] sunmi-text-muted leading-tight">
            Turno #{item?.turnoOrigenId} · cerrado {hhmm(item?.dejadoEn)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] sunmi-text-muted leading-tight">Cambio dejado</div>
          <div className="text-base font-bold font-mono tabular-nums sunmi-text-accent leading-tight">
            {money(item?.total)}
          </div>
        </div>
      </div>

      <DesgloseResumido desglose={item?.desglose} />

      {item?.observacion && (
        <p className="text-[11px] sunmi-text-muted leading-snug break-words">
          Observación: {item.observacion}
        </p>
      )}

      {esMio && (
        <div className="text-[11px] sunmi-text-warning leading-snug flex items-center gap-1">
          <Clock size={12} className="shrink-0" />
          Reservado por vos
          {typeof restan === "number" && restan > 0
            ? ` · quedan ${restan} minuto${restan === 1 ? "" : "s"}`
            : " · la reserva está por vencer"}
        </div>
      )}

      {item?.estado === "VENCIDO" && (
        <div className="text-[11px] sunmi-text-warning leading-snug">
          Atrasado: lleva mucho tiempo sin que nadie lo reciba.
        </div>
      )}

      <SunmiButton
        color="amber"
        onClick={() => (esMio ? onContinuar?.(item) : onTomar?.(item))}
        disabled={ocupado}
        className="w-full py-2 text-xs font-bold"
      >
        {esMio ? "Continuar apertura" : "Tomar este cambio"}
      </SunmiButton>
    </SunmiCard>
  );
}

// ── Lo que dejó el cierre anterior ──────────────────────────────────────────

export function PanelCambioEsperado({ cambio }) {
  return (
    <Bloque
      titulo="Cambio que dejó el turno anterior"
      ayuda={`Lo declaró ${cambio?.operadorOrigen || cambio?.cajeroOrigen || "el turno anterior"} al cerrar.`}
      alineado
    >
      <Cifra label="Total declarado" valor={cambio?.total ?? 0} destacado />
      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3">
        <div className="text-[11px] sunmi-text-muted mb-1">Desglose declarado</div>
        <DesgloseResumido desglose={cambio?.desglose} />
      </div>
      {cambio?.observacion && (
        <p className="text-[11px] sunmi-text-muted leading-snug break-words">
          Observación del cierre: {cambio.observacion}
        </p>
      )}
    </Bloque>
  );
}

// ── Comparación y confirmación ──────────────────────────────────────────────

/** Las filas que difieren, denominación por denominación. */
export function TablaDiferenciasComposicion({ filas = [] }) {
  if (!filas.length) return null;
  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
      <div className="text-[11px] sunmi-text-muted">Diferencias por denominación</div>
      {filas.map((f) => (
        <div key={f.clave} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="sunmi-text-strong font-mono tabular-nums">{f.etiqueta}</span>
          <span className="sunmi-text-muted font-mono tabular-nums">
            esperadas {f.clave === "monedas" ? money(f.esperadas) : f.esperadas} · recibidas{" "}
            <span className="sunmi-text-warning">
              {f.clave === "monedas" ? money(f.recibidas) : f.recibidas}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function PanelComparacion({
  totalEsperado = 0,
  totalRecibido = 0,
  hayConteo = false,
  diferencia = 0,
  clase = RECEPCION.COINCIDE,
  mensaje = "",
  accion = "Confirmar cambio e iniciar turno",
  diferenciasComposicion = [],
  motivo = "",
  onMotivo,
  confirmaComposicion = false,
  onConfirmaComposicion,
  error = "",
  guardando = false,
  puedeConfirmar = false,
  onGuardar,
  onConfirmar,
  onCancelar,
}) {
  const necesitaMotivo = clase === RECEPCION.FALTANTE || clase === RECEPCION.SOBRANTE;
  const necesitaTilde = clase === RECEPCION.COINCIDE_TOTAL;

  return (
    <Bloque titulo="Comparación y confirmación">
      <div className="sunmi-surface sunmi-border rounded-xl px-3 py-3 text-center">
        <div className="text-[11px] sunmi-text-muted leading-tight">Con esto abre la caja</div>
        <div className="text-3xl font-bold font-mono tabular-nums sunmi-text-accent leading-tight break-words">
          {money(totalRecibido)}
        </div>
        <div className="text-[10px] sunmi-text-muted leading-tight mt-0.5">
          El total realmente contado, no el declarado
        </div>
      </div>

      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        <Fila label="Cambio esperado" valor={totalEsperado} />
        <Fila label="Total recibido" valor={hayConteo ? totalRecibido : "—"} />
        <Fila
          label="Diferencia"
          valor={hayConteo ? diferencia : "—"}
          clase={hayConteo ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
          fuerte
        />
      </div>

      {hayConteo && (
        <div
          className={`sunmi-border rounded-lg p-2 text-[12px] leading-snug flex items-start gap-2 ${
            clase === RECEPCION.COINCIDE
              ? "sunmi-state-success sunmi-text-success"
              : "sunmi-state-warning sunmi-text-warning"
          }`}
        >
          {clase === RECEPCION.COINCIDE ? (
            <Check size={14} className="shrink-0 mt-0.5" />
          ) : (
            <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">{mensaje}</div>
        </div>
      )}

      {hayConteo && diferenciasComposicion.length > 0 && (
        <TablaDiferenciasComposicion filas={diferenciasComposicion} />
      )}

      {/* Mismo importe, otros billetes: no bloquea, pero tiene que ser una
          decisión. El tilde es lo que convierte "no me di cuenta" en "lo vi". */}
      {hayConteo && necesitaTilde && (
        <label className="flex items-start gap-2 text-[12px] sunmi-text-strong leading-snug cursor-pointer">
          <input
            type="checkbox"
            checked={confirmaComposicion}
            onChange={(e) => onConfirmaComposicion?.(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            Verifiqué que el importe es correcto y que los billetes son distintos a los declarados.
          </span>
        </label>
      )}

      {hayConteo && necesitaMotivo && (
        <div>
          <label htmlFor="motivo-recepcion" className="text-xs sunmi-text-muted mb-1 block">
            {clase === RECEPCION.FALTANTE ? "¿Por qué falta?" : "¿Por qué sobra?"}
          </label>
          <SunmiInput
            id="motivo-recepcion"
            value={motivo}
            onChange={(e) => onMotivo?.(e.target.value)}
            placeholder="Ej: el sobre vino con dos billetes menos"
          />
        </div>
      )}

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      <div className="space-y-2 pt-1">
        <SunmiButton
          color="amber"
          onClick={onConfirmar}
          disabled={guardando || !puedeConfirmar}
          className="w-full py-3 font-bold"
        >
          {guardando ? "Abriendo…" : accion}
        </SunmiButton>
        <div className="grid grid-cols-2 gap-2">
          <SunmiButton color="slate" onClick={onGuardar} disabled={guardando} className="py-2 text-xs">
            Guardar conteo
          </SunmiButton>
          <SunmiButton color="slate" onClick={onCancelar} disabled={guardando} className="py-2 text-xs">
            Soltar el cambio
          </SunmiButton>
        </div>
      </div>
    </Bloque>
  );
}

// ── Apertura sin tomar un cambio anterior ───────────────────────────────────

export function PanelSinCambio({
  totalContado = 0,
  hayConteo = false,
  motivo = "",
  onMotivo,
  error = "",
  guardando = false,
  onConfirmar,
  onVolver,
  hayPendientes = 0,
}) {
  return (
    <Bloque titulo="Abrir sin tomar un cambio anterior" ayuda={AYUDA_SIN_CAMBIO}>
      <div className="sunmi-surface sunmi-border rounded-xl px-3 py-3 text-center">
        <div className="text-[11px] sunmi-text-muted leading-tight">Con esto abre la caja</div>
        <div className="text-3xl font-bold font-mono tabular-nums sunmi-text-accent leading-tight break-words">
          {money(totalContado)}
        </div>
      </div>

      {/* Si hay sobres esperando y alguien abre igual, el sobre queda huérfano.
          No se bloquea —puede ser legítimo— pero se dice. */}
      {hayPendientes > 0 && (
        <div className="sunmi-state-warning sunmi-text-warning sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2">
          <Coins size={14} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            Hay {hayPendientes} cambio{hayPendientes === 1 ? "" : "s"} sin tomar en este local. Si
            abrís con plata propia, ese cambio va a seguir esperando a alguien.
          </div>
        </div>
      )}

      <div>
        <label htmlFor="motivo-sin-cambio" className="text-xs sunmi-text-muted mb-1 block">
          Origen del cambio
        </label>
        <SunmiInput
          id="motivo-sin-cambio"
          value={motivo}
          onChange={(e) => onMotivo?.(e.target.value)}
          placeholder="Ej: lo traje del depósito esta mañana"
        />
      </div>

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      <div className="space-y-2 pt-1">
        <SunmiButton
          color="amber"
          onClick={onConfirmar}
          disabled={guardando || !hayConteo || !String(motivo || "").trim()}
          className="w-full py-3 font-bold"
        >
          {guardando ? "Abriendo…" : "Abrir caja con este conteo"}
        </SunmiButton>
        <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="w-full py-2 text-xs">
          Volver a los cambios pendientes
        </SunmiButton>
      </div>
    </Bloque>
  );
}
