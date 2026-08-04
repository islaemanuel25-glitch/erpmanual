"use client";

// Los tres pasos del retiro de recaudación, como componentes de presentación.
//
// POR QUÉ ESTÁN ACÁ Y NO DENTRO DE LA PÁGINA
//
// La página tiene estado, efectos y fetch: renderizarla en una prueba deja todo
// en "cargando" y no ejercita nada del JSX que ve el cajero. Ya pasó una vez que
// un identificador sin importar llegó a producción porque ninguna prueba
// ejecutaba ese JSX.
//
// Acá los pasos reciben TODO por props y no llaman a nada. Se renderizan en una
// prueba con react-dom/server, con datos armados a mano, y cualquier referencia
// suelta explota ahí y no en la pantalla de un usuario.
//
// Ninguno decide: no calculan importes ni validan. Eso vive en lib/caja.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { TriangleAlert } from "lucide-react";

import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import { Fila, money, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import { MODO_TOTAL, MODO_BILLETES, totalDesglose } from "@/lib/caja/conteoBilletes";

export const PASOS = [
  { n: 1, titulo: "Contar efectivo" },
  { n: 2, titulo: "Definir retiro" },
  { n: 3, titulo: "Confirmar" },
];

/** En escritorio los tres pasos se ven juntos; en móvil, uno por vez. */
export function Seccion({ visible, n, titulo, children }) {
  return (
    <SunmiCard className={`p-3 space-y-3 ${visible ? "" : "hidden xl:block"}`}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 w-6 h-6 rounded-full sunmi-surface sunmi-border grid place-items-center text-[11px] font-bold sunmi-text-accent">
          {n}
        </span>
        <h2 className="text-sm font-bold sunmi-text-strong">{titulo}</h2>
      </div>
      {children}
    </SunmiCard>
  );
}

export function SelectorModo({ valor, onCambiar, opciones }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onCambiar?.(o.valor)}
          aria-pressed={valor === o.valor}
          className={`rounded-lg px-3 py-2 text-sm font-semibold sunmi-border text-left ${
            valor === o.valor ? "sunmi-surface sunmi-text-accent" : "sunmi-surface-soft sunmi-text-muted"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Advertencia({ children, tono = "warning" }) {
  const clase =
    tono === "danger" ? "sunmi-state-danger sunmi-text-danger" : "sunmi-state-warning sunmi-text-warning";
  return (
    <div className={`${clase} sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2`}>
      <TriangleAlert size={14} className="shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Aviso de que el desglose por billetes y el monto tipeado no dicen lo mismo. */
function AvisoDesacople({ totalBilletes, montoEscrito, onLimpiar }) {
  return (
    <Advertencia>
      El detalle por billetes suma {money(totalBilletes)} y escribiste {money(montoEscrito)}. Corregí
      uno de los dos: no se pueden sostener dos totales distintos.{" "}
      <button type="button" className="underline font-semibold" onClick={onLimpiar}>
        Limpiar desglose
      </button>
    </Advertencia>
  );
}

// ── PASO 1 ──────────────────────────────────────────────────────────────────

export function PasoContar({
  visible = true,
  modo,
  onModo,
  monto,
  onMonto,
  desglose,
  onDesglose,
  desacople = false,
}) {
  return (
    <Seccion visible={visible} n={1} titulo="Contar todo el efectivo del cajón">
      <SelectorModo
        valor={modo}
        onCambiar={onModo}
        opciones={[
          { valor: MODO_TOTAL, texto: "Ingresar monto total" },
          { valor: MODO_BILLETES, texto: "Contar billetes del cajón" },
        ]}
      />

      {modo === MODO_BILLETES ? (
        <TablaDenominaciones
          desglose={desglose}
          onCambiar={onDesglose}
          idPrefijo="conteo"
          titulo="Cantidad de billetes en el cajón"
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

      {desacople && (
        <AvisoDesacople
          totalBilletes={totalDesglose(desglose)}
          montoEscrito={Number(monto) || 0}
          onLimpiar={() => onDesglose?.({})}
        />
      )}

      <p className="text-[11px] sunmi-text-muted leading-snug">
        Contá todo lo que hay en el cajón, incluido el fondo. No cuentes Mercado Pago, débito ni
        crédito.
      </p>
    </Seccion>
  );
}

// ── PASO 2 ──────────────────────────────────────────────────────────────────

export function PasoDefinir({
  visible = true,
  modo,
  onModo,
  importe,
  onImporte,
  sugerido = 0,
  desglose,
  onDesglose,
  topes = null,
  totalContado = 0,
  totalRetiro = 0,
  fondoObjetivo = 0,
  fondoFisico = 0,
  evaluacion = null,
  errorBilletes = null,
  errorReparto = null,
  desacople = false,
}) {
  return (
    <Seccion visible={visible} n={2} titulo="Definir los billetes que se retiran">
      <SelectorModo
        valor={modo}
        onCambiar={onModo}
        opciones={[
          { valor: MODO_TOTAL, texto: "Ingresar importe a retirar" },
          { valor: MODO_BILLETES, texto: "Seleccionar billetes a retirar" },
        ]}
      />

      {modo === MODO_BILLETES ? (
        <TablaDenominaciones
          desglose={desglose}
          onCambiar={onDesglose}
          // Tope por denominación: no se puede sacar del cajón un billete que el
          // conteo dice que no está.
          topes={topes}
          idPrefijo="retiro"
          titulo="Billetes que salen del cajón"
        />
      ) : (
        <div>
          <label htmlFor="importe-retiro" className="text-xs sunmi-text-muted mb-1 block">
            Total a retirar ($) — sugerido {money(sugerido)}
          </label>
          <SunmiInput
            id="importe-retiro"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={importe}
            onChange={(e) => onImporte?.(e.target.value)}
            className="text-2xl font-bold text-center"
          />
        </div>
      )}

      {errorBilletes && <Advertencia tono="danger">{errorBilletes}</Advertencia>}
      {desacople && (
        <AvisoDesacople
          totalBilletes={totalDesglose(desglose)}
          montoEscrito={Number(importe) || 0}
          onLimpiar={() => onDesglose?.({})}
        />
      )}
      {errorReparto && <Advertencia tono="danger">{errorReparto}</Advertencia>}

      {evaluacion && (
        <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
          <Fila label="Recaudación esperada" valor={evaluacion.recaudacionEsperada} />
          <Fila
            label="Diferencia al contar"
            valor={evaluacion.diferencia}
            clase={tonoDiferencia(evaluacion.diferencia)}
          />
          <Fila label="Fondo objetivo" valor={fondoObjetivo} />
          <Fila
            label="Fondo real que queda"
            valor={fondoFisico}
            clase={evaluacion.fondoFisicoDistinto ? "sunmi-text-warning" : "sunmi-text-strong"}
          />
          <Fila label="Total a retirar" valor={totalRetiro} clase="sunmi-text-accent" fuerte />
        </div>
      )}

      {evaluacion?.fondoFisicoDistinto && (
        <Advertencia>
          Luego del retiro quedarán {money(fondoFisico)}. El fondo objetivo es {money(fondoObjetivo)}.
        </Advertencia>
      )}
      {evaluacion?.retiroLimitadoPorFaltante && (
        <Advertencia tono="danger">
          La recaudación esperada es {money(evaluacion.recaudacionEsperada)} pero en el cajón hay{" "}
          {money(totalContado)}. No se puede retirar plata que no está.
        </Advertencia>
      )}
    </Seccion>
  );
}

// ── PASO 3 ──────────────────────────────────────────────────────────────────

export function PasoConfirmar({
  visible = true,
  esperado = null,
  totalContado = 0,
  totalRetiro = 0,
  fondoObjetivo = 0,
  fondoFisico = 0,
  evaluacion = null,
  observacion = "",
  onObservacion,
  cambioEsperado = null,
  error = "",
  guardando = false,
  puedeConfirmar = false,
  onGuardarYVolver,
  onConfirmar,
}) {
  const contraObjetivo = Number((fondoFisico - fondoObjetivo).toFixed(2));
  return (
    <Seccion visible={visible} n={3} titulo="Confirmar">
      {evaluacion && (
        <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
          <Fila label="Efectivo esperado" valor={esperado ?? "—"} />
          <Fila label="Efectivo contado" valor={totalContado} />
          <Fila
            label="Diferencia al contar"
            valor={evaluacion.diferencia}
            clase={tonoDiferencia(evaluacion.diferencia)}
          />
          <Fila label="Recaudación esperada" valor={evaluacion.recaudacionEsperada} />
          <Fila label="Fondo objetivo" valor={fondoObjetivo} />
          <Fila
            label="Fondo real que queda"
            valor={fondoFisico}
            clase={evaluacion.fondoFisicoDistinto ? "sunmi-text-warning" : "sunmi-text-strong"}
          />
          <Fila
            label="Diferencia contra el fondo objetivo"
            valor={contraObjetivo}
            clase={tonoDiferencia(contraObjetivo)}
          />
          <Fila label="Total a retirar" valor={totalRetiro} clase="sunmi-text-accent" fuerte />
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

      {/* El esperado cambió mientras se contaba: no se confirma en silencio. */}
      {cambioEsperado?.cambio && (
        <div className="sunmi-state-warning sunmi-border rounded-lg p-3 space-y-1 text-[12px] sunmi-text-warning">
          <div className="font-bold">El efectivo esperado cambió mientras preparabas el retiro.</div>
          <Fila label="Antes" valor={cambioEsperado.anterior} />
          <Fila label="Ahora" valor={cambioEsperado.actual} />
          <Fila label="Entraron" valor={cambioEsperado.diferencia} />
          <p className="leading-snug pt-1">Revisá el retiro con el valor nuevo y confirmá otra vez.</p>
        </div>
      )}

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <SunmiButton color="slate" onClick={onGuardarYVolver} disabled={guardando} className="py-3">
          Guardar y volver al POS
        </SunmiButton>
        <SunmiButton
          color="amber"
          onClick={onConfirmar}
          disabled={guardando || !puedeConfirmar}
          className="py-3 font-bold"
        >
          {guardando
            ? "Registrando…"
            : cambioEsperado?.cambio
            ? "Confirmar con el valor nuevo"
            : "Confirmar retiro"}
        </SunmiButton>
      </div>
    </Seccion>
  );
}
