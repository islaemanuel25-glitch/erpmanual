"use client";

// Los tres bloques de la pantalla de retiro, como componentes de presentación.
//
// NO son pasos. Se ven los tres a la vez: en escritorio en tres columnas, en
// móvil uno debajo del otro. El flujo anterior los partía en pasos numerados con
// Anterior y Siguiente, y eso escondía justo lo que hay que mirar junto —cuánto
// hay, qué queda y cuánto sale—, además de sugerir que el retiro se elige.
//
// POR QUÉ VIVEN ACÁ Y NO DENTRO DE LA PÁGINA
//
// La página tiene estado, efectos y fetch: renderizarla en una prueba deja todo
// en "cargando" y no ejercita nada del JSX que ve el cajero. Ya pasó una vez que
// un identificador sin importar llegó a producción porque ninguna prueba
// ejecutaba ese JSX. Acá todo entra por props y no se llama a nada.
//
// Ninguno decide: no calculan importes ni validan. Eso vive en lib/caja.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { TriangleAlert } from "lucide-react";

import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import GrillaCambio from "@/components/caja/GrillaCambio";
import { Cifra, Fila, money, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import { MODO_TOTAL, MODO_BILLETES } from "@/lib/caja/conteoBilletes";

export function Aviso({ children, tono = "warning" }) {
  const clase =
    tono === "danger"
      ? "sunmi-state-danger sunmi-text-danger"
      : tono === "info"
      ? "sunmi-surface-soft sunmi-text-muted"
      : "sunmi-state-warning sunmi-text-warning";
  return (
    <div className={`${clase} sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2`}>
      {tono !== "info" && <TriangleAlert size={14} className="shrink-0 mt-0.5" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Bloque({ titulo, ayuda, children, className = "" }) {
  return (
    <SunmiCard className={`p-3 space-y-2 ${className}`}>
      <div>
        <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{titulo}</h2>
        {ayuda && <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </SunmiCard>
  );
}

function SelectorModo({ valor, onCambiar, opciones }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onCambiar?.(o.valor)}
          aria-pressed={valor === o.valor}
          className={`rounded-lg px-2 py-2 text-[12px] font-semibold sunmi-border text-center ${
            valor === o.valor ? "sunmi-surface sunmi-text-accent" : "sunmi-surface-soft sunmi-text-muted"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

// ── Contar ──────────────────────────────────────────────────────────────────

export function PanelConteo({ modo, onModo, monto, onMonto, desglose, onDesglose, horaConteo }) {
  return (
    <Bloque
      titulo="Contar todo el efectivo del cajón"
      ayuda="Incluí el cambio que hay en el cajón. No cuentes Mercado Pago, débito ni crédito."
    >
      <SelectorModo
        valor={modo}
        onCambiar={onModo}
        opciones={[
          { valor: MODO_TOTAL, texto: "Monto total" },
          { valor: MODO_BILLETES, texto: "Contar billetes" },
        ]}
      />

      {modo === MODO_BILLETES ? (
        <TablaDenominaciones
          desglose={desglose}
          onCambiar={onDesglose}
          idPrefijo="conteo"
          titulo="Cantidad en el cajón"
        />
      ) : (
        <div>
          <label htmlFor="monto-total" className="text-xs sunmi-text-muted mb-1 block">
            Monto total contado ($)
          </label>
          <SunmiInput
            id="monto-total"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={monto}
            onChange={(e) => onMonto?.(e.target.value)}
            placeholder="0.00"
            className="text-2xl font-bold text-center"
          />
        </div>
      )}

      {/* El problema operativo real: si el mismo cajón sigue recibiendo plata
          mientras se cuenta, el conteo ya no describe nada. No se bloquean las
          ventas —dejar a la gente esperando es peor— pero tampoco se oculta. */}
      <Aviso>Mientras contás, no deben mezclarse nuevas ventas en el efectivo ya contado.</Aviso>

      {horaConteo && (
        <p className="text-[11px] sunmi-text-muted">Conteo iniciado a las {horaConteo}</p>
      )}
    </Bloque>
  );
}

// ── Movimientos manuales de caja ────────────────────────────────────────────

/**
 * Lo que entró o salió por "Caja +/−" en este turno.
 *
 * Informativo y nada más: sin botones para crear movimientos, porque esa función
 * ya vive en el POS y duplicarla acá invitaría a registrar un gasto en medio de
 * un conteo. Sirve para responder "¿por qué el esperado no es lo que vendí?".
 *
 * NO incluye los retiros de recaudación: esos tienen su propia pantalla y su
 * propio historial. Mezclarlos haría leer un retiro de $103.400 como si alguien
 * hubiera sacado plata a mano.
 */
export function PanelMovimientos({ movimientos = null, className = "" }) {
  const ingresos = Number(movimientos?.ingresos) || 0;
  const retiros = Number(movimientos?.retiros) || 0;
  const neto = Number(movimientos?.neto) || 0;
  const hay = Math.round((ingresos + retiros) * 100) !== 0;

  return (
    <Bloque titulo="Movimientos de caja" className={className}>
      {hay ? (
        <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
          <Fila label="Ingresos manuales" valor={ingresos} clase="sunmi-text-strong" />
          <Fila label="Retiros manuales" valor={-retiros} clase={retiros ? "sunmi-text-warning" : "sunmi-text-strong"} />
          <Fila label="Neto movimientos" valor={neto} clase={tonoDiferencia(neto)} fuerte />
        </div>
      ) : (
        <p className="text-[12px] sunmi-text-muted leading-snug">
          No hay ingresos ni retiros manuales en este turno.
        </p>
      )}
      <p className="text-[11px] sunmi-text-muted leading-snug">
        No incluye los retiros de recaudación.
      </p>
    </Bloque>
  );
}

// ── Cambio que queda ────────────────────────────────────────────────────────

export function PanelCambio({
  desgloseContado,
  desgloseCambio,
  onDesgloseCambio,
  totalCambio = 0,
  error = null,
}) {
  return (
    <Bloque
      titulo="Billetes que quedan como cambio"
      ayuda="Elegí los billetes y monedas que quedan en el cajón. Todo lo demás se retira."
    >
      <GrillaCambio
        desgloseContado={desgloseContado}
        desgloseCambio={desgloseCambio}
        onCambiar={onDesgloseCambio}
        total={totalCambio}
      />
      {error && <Aviso tono="danger">{error}</Aviso>}
    </Bloque>
  );
}

// ── Resumen y confirmación ──────────────────────────────────────────────────

export function PanelResumen({
  esperado = null,
  totalContado = 0,
  totalCambio = 0,
  totalRetiro = 0,
  diferencia = 0,
  sinRecaudacion = false,
  hayContado = false,
  observacion = "",
  onObservacion,
  cambios = null,
  error = "",
  guardando = false,
  puedeConfirmar = false,
  enPestanaNueva = false,
  onGuardar,
  onVolver,
  onConfirmar,
}) {
  return (
    <Bloque titulo="Resumen y confirmación">
      {/* El valor principal de la pantalla. Todo lo demás lo explica. */}
      <div className="sunmi-surface sunmi-border rounded-xl px-3 py-3 text-center">
        <div className="text-[11px] sunmi-text-muted leading-tight">Total a retirar</div>
        <div className="text-3xl font-bold font-mono tabular-nums sunmi-text-accent leading-tight break-words">
          {money(totalRetiro)}
        </div>
      </div>

      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        <Fila label="Efectivo esperado" valor={esperado ?? "—"} />
        <Fila label="Efectivo contado" valor={hayContado ? totalContado : "—"} />
        <Fila
          label="Diferencia al contar"
          valor={hayContado ? diferencia : "—"}
          clase={hayContado ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
        />
        <Fila label="Cambio que queda" valor={totalCambio} />
        <Fila label="Total a retirar" valor={totalRetiro} clase="sunmi-text-accent" fuerte />
      </div>

      {sinRecaudacion && hayContado && (
        <Aviso>No hay recaudación para retirar.</Aviso>
      )}

      {/* Hubo movimientos mientras se contaba. No se confirma en silencio y NO
          se toca el efectivo contado: esa plata la contó una persona. */}
      {cambios?.hayCambios && (
        <div className="sunmi-state-warning sunmi-border rounded-lg p-3 space-y-1 text-[12px] sunmi-text-warning">
          <div className="font-bold">Hubo movimientos mientras preparabas el retiro.</div>
          <Fila label="Esperado anterior" valor={cambios.esperadoAnterior} />
          <Fila label="Esperado actual" valor={cambios.esperadoActual} />
          <Fila label="Diferencia" valor={cambios.diferenciaEsperado} />
          {cambios.ventasNuevas && (
            <p className="leading-snug">
              Entraron {cambios.ventasAgregadas} venta{cambios.ventasAgregadas === 1 ? "" : "s"} nueva
              {cambios.ventasAgregadas === 1 ? "" : "s"}.
            </p>
          )}
          {cambios.otroRetiro && <p className="leading-snug">Se registró otro retiro en esta caja.</p>}
          <p className="leading-snug pt-1">
            No tocamos lo que contaste. Revisá la diferencia y confirmá otra vez.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="obs" className="text-xs sunmi-text-muted mb-1 block">
          Observación (opcional)
        </label>
        <SunmiInput
          id="obs"
          value={observacion}
          onChange={(e) => onObservacion?.(e.target.value)}
          placeholder="Ej: se lleva Marcela"
        />
      </div>

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      <div className="space-y-2 pt-1">
        <SunmiButton
          color="amber"
          onClick={onConfirmar}
          disabled={guardando || !puedeConfirmar}
          className="w-full py-3 font-bold"
        >
          {guardando ? "Registrando…" : cambios?.hayCambios ? "Confirmar con el valor nuevo" : "Confirmar retiro"}
        </SunmiButton>

        {/* En una pestaña aparte no hay adónde "volver": el POS sigue abierto en
            la suya. Guardar y cerrar son dos acciones distintas. */}
        {enPestanaNueva ? (
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton color="slate" onClick={onGuardar} disabled={guardando} className="py-2 !text-xs">
              Guardar borrador
            </SunmiButton>
            <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="py-2 !text-xs">
              Cerrar esta pestaña
            </SunmiButton>
          </div>
        ) : (
          <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="w-full py-2 !text-xs">
            Guardar y volver al POS
          </SunmiButton>
        )}
      </div>
    </Bloque>
  );
}

// ── Cifras de cabecera ──────────────────────────────────────────────────────

export function ResumenCabecera({
  esperado = null,
  totalContado = 0,
  hayContado = false,
  diferencia = 0,
  totalCambio = 0,
  totalRetiro = 0,
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
      <Cifra label="Efectivo esperado ahora" valor={esperado ?? "—"} />
      <Cifra label="Efectivo contado" valor={hayContado ? totalContado : "—"} />
      <Cifra
        label="Diferencia"
        valor={hayContado ? diferencia : "—"}
        clase={hayContado ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
      />
      <Cifra label="Cambio que queda" valor={totalCambio} />
      <Cifra label="Total a retirar" valor={totalRetiro} clase="sunmi-text-accent" destacado />
    </div>
  );
}
