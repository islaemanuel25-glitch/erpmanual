"use client";

// Los bloques PROPIOS del cierre de caja.
//
// Todo lo que el cierre comparte con el retiro —contar, elegir el cambio, ver
// los movimientos, el resumen y la confirmación— se reutiliza tal cual desde
// PanelesRetiro.jsx. Acá viven únicamente las dos cosas que el retiro no tiene:
//
//   · la pantalla PREVIA al corte, que no existe en un retiro porque un retiro
//     no congela nada;
//   · los avisos del corte, que explican por qué este cierre no va a cambiar
//     aunque el local siga vendiendo.
//
// Igual que PanelesRetiro: son de presentación pura. Reciben todo por props, no
// llaman a nada y no deciden nada, así que se pueden renderizar en una prueba y
// ejercitar el JSX real que ve el cajero.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { Lock, TriangleAlert, Clock } from "lucide-react";

import { Cifra, Fila, money } from "@/components/caja/CifrasRetiro";

export const TITULO_CIERRE = "Cierre de caja";

export const AVISO_ANTES_DEL_CORTE =
  "Al iniciar el cierre se hará un corte de este turno. El POS quedará disponible para el siguiente operador y las operaciones posteriores no formarán parte de este cierre.";

export const AVISO_POSTERIORES =
  "Las operaciones posteriores pertenecen al siguiente turno.";

/** "Corte realizado a las HH:mm. Este cierre incluye operaciones hasta ese momento." */
export function avisoDespuesDelCorte(hora) {
  return `Corte realizado a las ${hora}. Este cierre incluye operaciones hasta ese momento.`;
}

/**
 * Hora en 24 h.
 *
 * `hour12: false` es explícito y no un detalle de estilo. Sin él, el ICU del
 * entorno decide: medido, la misma llamada devolvía "03:18 p. m." en vez de
 * "15:18", y el aviso quedaba escrito "Corte realizado a las 03:18 p. m.."
 * —con punto doble, porque la plantilla agrega el suyo—. Además, 24 h es la
 * convención de fechas del proyecto.
 */
export const hora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
};

// ── Antes del corte ─────────────────────────────────────────────────────────

/**
 * Lo que se ve ANTES de cortar.
 *
 * El corte NO se dispara al abrir la pantalla, y esa decisión es la razón de ser
 * de este bloque. Después del corte el turno deja de vender: si abrir el link
 * por curiosidad congelara la caja, un toque accidental dejaría al local sin
 * poder cobrar hasta que alguien contara todo el cajón. Por eso hay una pantalla
 * previa, con los datos a la vista, y una confirmación explícita.
 *
 * El efectivo esperado que se muestra acá es el de AHORA —todavía no hay corte
 * que congelar— y por eso se rotula distinto que después.
 */
export function PanelAntesDelCorte({
  turno,
  operadorNombre,
  localNombre,
  esperado,
  confirmando = false,
  iniciando = false,
  error = "",
  onPedirConfirmacion,
  onCancelar,
  onIniciar,
}) {
  return (
    <SunmiCard className="p-3 space-y-3">
      <div>
        <h2 className="text-sm font-bold sunmi-text-strong leading-tight">
          Antes de cerrar
        </h2>
        <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">
          Revisá que esta sea la caja que querés cerrar.
        </p>
      </div>

      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        <Fila label="Turno" valor={turno?.id ? `#${turno.id}` : "—"} />
        <Fila label="Abierto desde" valor={hora(turno?.apertura)} />
        <Fila label="Operador" valor={operadorNombre || "Sin operario"} />
        <Fila label="Local" valor={localNombre || "—"} />
      </div>

      <Cifra label="Efectivo esperado ahora" valor={esperado ?? "—"} destacado />

      <div className="sunmi-state-warning sunmi-text-warning sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2">
        <TriangleAlert size={14} className="shrink-0 mt-0.5" />
        <div className="min-w-0">{AVISO_ANTES_DEL_CORTE}</div>
      </div>

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      {/* Confirmación en DOS TIEMPOS. El botón no corta: pide confirmar. Es la
          misma razón por la que abrir la pantalla no corta — la acción no se
          deshace sin dejar rastro y deja al local sin cobrar mientras tanto. */}
      {!confirmando ? (
        <SunmiButton
          color="amber"
          onClick={onPedirConfirmacion}
          disabled={iniciando || !turno?.id}
          className="w-full py-3 font-bold"
        >
          Iniciar cierre y liberar POS
        </SunmiButton>
      ) : (
        <div className="sunmi-surface sunmi-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Lock size={16} className="shrink-0 mt-0.5 sunmi-text-warning" />
            <p className="text-[12px] sunmi-text-strong leading-snug">
              Después de esto el turno #{turno?.id} no admite más ventas ni movimientos.
              Vas a poder contar con calma; el POS queda libre para el siguiente operador.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton color="slate" onClick={onCancelar} disabled={iniciando} className="py-2 !text-xs">
              Volver
            </SunmiButton>
            <SunmiButton color="amber" onClick={onIniciar} disabled={iniciando} className="py-2 !text-xs font-bold">
              {iniciando ? "Cortando…" : "Sí, cortar el turno"}
            </SunmiButton>
          </div>
        </div>
      )}
    </SunmiCard>
  );
}

// ── Después del corte ───────────────────────────────────────────────────────

/**
 * Los dos avisos que explican por qué este cierre ya no se mueve.
 *
 * No es decoración. El cajero va a estar contando mientras el local vende, y sin
 * esto la pregunta obvia —"¿el número que veo incluye lo que están cobrando
 * ahora?"— no tiene respuesta en pantalla.
 */
export function AvisoCorteHecho({ corteEn, atrasado = false }) {
  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2">
      <Clock size={14} className="shrink-0 mt-0.5 sunmi-text-accent" />
      <div className="min-w-0 space-y-0.5">
        <div className="sunmi-text-strong">{avisoDespuesDelCorte(hora(corteEn))}</div>
        <div className="sunmi-text-muted">{AVISO_POSTERIORES}</div>
        {atrasado && (
          <div className="sunmi-text-warning font-semibold">
            Este cierre está atrasado: se cortó hace varias horas y todavía no se confirmó.
          </div>
        )}
      </div>
    </div>
  );
}

/** Renglones que el cierre agrega al resumen y el retiro no tiene. */
export function FilasResumenCierre({ corteEn, operadorNombre }) {
  return (
    <>
      <Fila label="Hora del corte" valor={hora(corteEn)} />
      <Fila label="Operador que cierra" valor={operadorNombre || "Sin operario"} />
    </>
  );
}

// ── Bandeja de cierres pendientes ───────────────────────────────────────────

/**
 * Una caja a medio cerrar, en la bandeja de recuperación.
 *
 * Existe porque el corte ya congeló un turno: si nadie encuentra ese cierre, esa
 * caja queda trabada sin que se sepa por qué.
 */
export function FilaCierrePendiente({ item, onContinuar }) {
  return (
    <div className="sunmi-surface sunmi-border rounded-lg p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <div className="text-[13px] font-bold sunmi-text-strong leading-tight">
          Turno #{item.turnoId} · {item.operadorNombre || item.cajeroNombre || "Sin operario"}
        </div>
        <div className="text-[11px] sunmi-text-muted leading-tight">
          Corte a las {hora(item.corteEn)} · esperado {money(item.efectivoEsperadoCorte)}
        </div>
        <div className="text-[11px] leading-tight">
          {item.atrasado ? (
            <span className="sunmi-text-warning font-semibold">Atrasado</span>
          ) : (
            <span className="sunmi-text-muted">Esperando conteo</span>
          )}
        </div>
      </div>
      <SunmiButton
        color="amber"
        onClick={() => onContinuar?.(item)}
        className="shrink-0 py-2 px-3 !text-xs font-bold"
      >
        Continuar cierre
      </SunmiButton>
    </div>
  );
}
