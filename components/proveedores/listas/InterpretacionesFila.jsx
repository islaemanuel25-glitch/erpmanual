"use client";

// LAS INTERPRETACIONES DE UNA FILA: hasta tres tarjetas y el cierre de la
// decisión, colgando de la fila que se expandió.
//
// ── POR QUÉ TARJETAS Y NO UNA LISTA ─────────────────────────────────────────
//
// Elegir entre interpretaciones es comparar tres números equivalentes —cuánto
// costaría cada una— y eso se lee mejor en paralelo que en renglones. Cada
// tarjeta dice lo mismo en el mismo lugar: qué interpretación es, por cuánto
// multiplica, cuánto da y cuánto sube. El ojo compara columnas, no memoriza.
//
// ── LO QUE NO ESTÁ ACÁ ──────────────────────────────────────────────────────
//
// El producto, su código y su costo ya están en las dos filas de arriba. Acá no
// se repiten: solo va lo que la tabla no puede mostrar, que es la decisión.

import { useState } from "react";
import { AlertTriangle, Check, Link2 } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { money } from "@/lib/proveedores/listas/presentacion";
import { analizarFila } from "@/lib/proveedores/listas/confirmarPresentacion";
import {
  TEXTO_ESTADO_VARIACION,
  TONO_ESTADO_VARIACION,
  esAlertaFuerte,
} from "@/lib/proveedores/listas/rangoAumento";
import { rangoDeLaFila } from "@/lib/proveedores/listas/vigenciaConfirmacion";

const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`);

/**
 * Una interpretación.
 *
 * La elegida se marca con el acento del tema —borde y anillo— y con el tilde.
 * No hay radio ni casilla: la tarjeta entera es el control, y su estado se ve
 * sin tener que buscar un cuadradito.
 */
function Tarjeta({ h, activa, recomendada, onElegir }) {
  const tono = TONO_ESTADO_VARIACION[h.estado];
  return (
    <button
      type="button"
      data-opcion={h.clave}
      aria-pressed={activa}
      disabled={h.absurda}
      onClick={onElegir}
      style={activa ? { borderColor: "var(--pos-accent)", boxShadow: "inset 0 0 0 1px var(--pos-accent)" } : undefined}
      className={`text-left rounded-md sunmi-border border px-2 py-1.5 flex-1 min-w-[13.5rem] ${
        h.absurda ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] font-semibold sunmi-text-strong truncate">
          {h.multiplicador === 1 ? "Sin multiplicar" : `Por ${h.multiplicador}`}
        </span>
        {recomendada && !h.absurda && (
          <span className="text-[9px] px-1 py-px rounded sunmi-border border sunmi-text-success shrink-0">
            sugerida
          </span>
        )}
        {activa && <Check size={12} aria-hidden="true" className="ml-auto shrink-0 sunmi-text-accent" />}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold tabular-nums sunmi-text-strong">{money(h.costoNuevo)}</span>
        <span className={`text-[10.5px] tabular-nums shrink-0 ${tono}`}>{pct(h.variacionPct)}</span>
      </div>

      {/* Una sola línea de contexto: por qué se descartó, o de dónde sale la
          cantidad y en qué queda el aumento. */}
      <div className={`text-[9.5px] leading-tight truncate ${h.absurda ? "sunmi-text-muted" : tono}`}>
        {h.absurda
          ? "Descartada: cambia el orden de magnitud"
          : `${TEXTO_ESTADO_VARIACION[h.estado]} · ${h.origenCantidad ?? "el precio ya es el del envase"}`}
      </div>
    </button>
  );
}

export default function InterpretacionesFila({ fila, importacion, onConfirmada, onVincularOtro }) {
  const erp = fila.erp;
  const base = erp
    ? {
        unidad_medida: erp.unidadMedida,
        factor_pack: erp.factorPack,
        modoCompraProveedor: erp.modoCompraProveedor ?? null,
        precio_costo: erp.costoActual,
      }
    : null;

  // El rango DE ESTA FILA: el congelado si su confirmación sigue vigente, si no
  // el de la cabecera, si no el default. Antes había un `?? 10` y un `?? 20`
  // escritos acá, que ignoraban el congelado.
  const rango = rangoDeLaFila(fila, importacion);
  const analisis = analizarFila({ fila, base, recargoPct: fila.recargoPct, rango });
  const { evaluadas, recomendada, presentacion } = analisis;

  // La recomendada viene marcada, pero confirmar sigue siendo un acto explícito.
  const [clave, setClave] = useState(recomendada ?? "");
  const [aceptoAlerta, setAceptoAlerta] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const elegida = evaluadas.find((h) => h.clave === clave) ?? null;
  const necesitaAceptar = elegida ? esAlertaFuerte(elegida.estado) : false;
  const listo = elegida !== null && !elegida.absurda && (!necesitaAceptar || aceptoAlerta);

  const confirmar = async () => {
    if (!listo || trabajando) return;
    setTrabajando(true);
    setError("");
    try {
      const r = await fetch(
        `/api/proveedores/listas/${fila.importacionId}/filas/${fila.id}/confirmar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            clave,
            cantidadPresentacion: presentacion.cantidadDescripcion ?? null,
          }),
        }
      );
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo confirmar.");
        return;
      }
      onConfirmada?.(json);
    } catch {
      setError("Error de conexión.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div data-panel="interpretaciones" data-fila={fila.id} className="space-y-1">
      <div className="text-[9px] font-bold uppercase tracking-wide sunmi-text-muted">
        Cómo se interpreta el precio del archivo
      </div>

      <div role="group" aria-label="Interpretaciones posibles" className="flex flex-wrap gap-1.5">
        {evaluadas.map((h) => (
          <Tarjeta
            key={h.clave}
            h={h}
            activa={clave === h.clave}
            recomendada={h.clave === recomendada}
            onElegir={() => { setClave(h.clave); setAceptoAlerta(false); setError(""); }}
          />
        ))}
      </div>

      {elegida && necesitaAceptar && (
        <p data-rol="alerta-fuerte" className="sunmi-text-danger text-[10px] leading-snug flex items-start gap-1">
          <AlertTriangle size={11} aria-hidden="true" className="shrink-0 mt-px" />
          <span>
            {elegida.estado === "DISMINUCION"
              ? "Con esta interpretación el costo BAJA: casi siempre significa que la interpretación o el producto vinculado están mal."
              : "Con esta interpretación el costo queda igual que hoy. Revisá que sea lo que corresponde."}
          </span>
        </p>
      )}

      {error && <p className="text-[10px] sunmi-text-danger leading-snug">{error}</p>}

      {/* ── El cierre de la decisión ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SunmiButton
          color="cyan"
          onClick={confirmar}
          disabled={!listo || trabajando}
          className="py-1.5 px-3 font-bold text-[11px] inline-flex items-center gap-1"
        >
          <Check size={12} aria-hidden="true" />
          {trabajando ? "Confirmando…" : "Confirmar selección"}
        </SunmiButton>
        <SunmiButton
          color="slate"
          onClick={onVincularOtro}
          disabled={trabajando}
          className="py-1.5 px-3 text-[11px] inline-flex items-center gap-1"
        >
          <Link2 size={11} aria-hidden="true" />
          No es este producto
        </SunmiButton>
        {elegida && necesitaAceptar && (
          <label className="flex items-center gap-1.5 text-[10px] sunmi-text-strong cursor-pointer">
            <input
              type="checkbox"
              checked={aceptoAlerta}
              onChange={(e) => setAceptoAlerta(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Revisé esta fila y aun así corresponde
          </label>
        )}
      </div>
    </div>
  );
}
