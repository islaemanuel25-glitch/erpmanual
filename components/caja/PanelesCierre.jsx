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

/**
 * La instrucción del orden físico, en la pantalla previa.
 *
 * Es lo primero que se lee porque es lo primero que hay que hacer con las manos,
 * y porque invierte lo que el cajero venía haciendo hasta ayer: antes contaba
 * todo el cajón y elegía el cambio al final.
 */
export const AYUDA_CAMBIO_PREVIO_CIERRE =
  "Separá primero el cambio que quedará disponible para seguir vendiendo. Después del corte contarás únicamente el dinero retirado.";

/** El cambio que se deja queda para OTRO operador: eso cambia lo que conviene dejar. */
export const AYUDA_GRILLA_CAMBIO_CIERRE =
  "Contá los billetes y monedas que dejás en la caja para el siguiente operador.";

export const ACCION_INICIAR_CIERRE = "Separar cambio, iniciar cierre y liberar POS";

export const AVISO_CONTAR_SOLO_RETIRO_CIERRE =
  "Contá únicamente el dinero que retiraste. El cambio ya quedó separado y no forma parte de este conteo.";

/**
 * Aviso cuando el cambio separado supera el efectivo esperado.
 *
 * El retiro esperado queda negativo, y eso no es un error de cálculo sino un
 * hallazgo: en el cajón hay más plata de la que el sistema dice que debería
 * haber. No se bloquea —la plata está y hay que poder cerrar— pero tampoco se
 * disimula recortando el número a cero, porque eso escondería el sobrante.
 */
export const AVISO_CAMBIO_SUPERA_ESPERADO =
  "El cambio que estás dejando supera el efectivo esperado. Si es correcto, la diferencia va a aparecer como sobrante al confirmar.";

export const AVISO_POSTERIORES =
  "Las operaciones posteriores pertenecen al siguiente turno.";

/**
 * El equivalente para el retiro, que NO cierra el turno.
 *
 * En un cierre lo que viene después es de otro turno; en un retiro es del MISMO
 * turno, que sigue vendiendo. Reusar el texto del cierre le diría al cajero que
 * su caja se acabó, que es justo lo contrario de lo que pasa.
 */
export const AVISO_POSTERIORES_RETIRO =
  "Las operaciones posteriores siguen en esta caja, fuera de este retiro.";

/**
 * "Corte realizado a las HH:mm. Este cierre incluye operaciones hasta ese momento."
 *
 * El sustantivo es un parámetro porque el bloque lo comparten las DOS pantallas.
 * Decirle "cierre" a un retiro —que no cierra nada y deja la caja vendiendo— es
 * exactamente el tipo de detalle que hace dudar al cajero de si entendió bien
 * qué está por pasar. Detectado mirando la captura de la pantalla de retiro.
 */
export function avisoDespuesDelCorte(hora, sustantivo = "cierre") {
  return `Corte realizado a las ${hora}. Este ${sustantivo} incluye operaciones hasta ese momento.`;
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
  /** Total del cambio que se está separando, ya contado en el otro bloque. */
  totalCambio = 0,
  /** `esperado − cambio`. Es lo que se va a tener que contar después del corte. */
  retiroEstimado = null,
  confirmando = false,
  iniciando = false,
  error = "",
  onPedirConfirmacion,
  onCancelar,
  onIniciar,
}) {
  const superaEsperado = retiroEstimado != null && retiroEstimado < 0;

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

      {/* Las dos cifras que resultan de separar el cambio. Se muestran ANTES de
          cortar porque son la decisión que se está tomando: cuánto queda para
          seguir vendiendo y cuánto habrá que contar después. */}
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
        <div className="sunmi-state-warning sunmi-text-warning sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <div className="min-w-0">{AVISO_CAMBIO_SUPERA_ESPERADO}</div>
        </div>
      )}

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
          {ACCION_INICIAR_CIERRE}
        </SunmiButton>
      ) : (
        <div className="sunmi-surface sunmi-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Lock size={16} className="shrink-0 mt-0.5 sunmi-text-warning" />
            <p className="text-[12px] sunmi-text-strong leading-snug">
              Después de esto el turno #{turno?.id} no admite más ventas ni movimientos, y el
              cambio de {money(totalCambio)} queda publicado para el siguiente operador: no vas a
              poder cambiarlo. Vas a contar con calma solo el dinero retirado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton color="slate" onClick={onCancelar} disabled={iniciando} className="py-2 !text-xs">
              Volver
            </SunmiButton>
            <SunmiButton color="amber" onClick={onIniciar} disabled={iniciando} className="py-2 !text-xs font-bold">
              {iniciando ? "Cortando…" : "Sí, separar cambio y cortar"}
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
export function AvisoCorteHecho({ corteEn, atrasado = false, sustantivo = "cierre", posteriores = AVISO_POSTERIORES }) {
  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2">
      <Clock size={14} className="shrink-0 mt-0.5 sunmi-text-accent" />
      <div className="min-w-0 space-y-0.5">
        <div className="sunmi-text-strong">{avisoDespuesDelCorte(hora(corteEn), sustantivo)}</div>
        <div className="sunmi-text-muted">{posteriores}</div>
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
