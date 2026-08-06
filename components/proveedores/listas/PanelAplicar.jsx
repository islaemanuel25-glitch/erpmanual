"use client";

// BARRA DE APLICACIÓN de una conciliación.
//
// Es la única parte del módulo desde la que se escriben costos reales, así que
// la pantalla tiene que dejar clarísimo qué va a pasar ANTES de que pase:
// cuántas filas, de qué proveedor, de qué archivo, qué se hace con la venta, y
// que los costos se modifican de verdad.
//
// La confirmación NO es un `confirm()` del navegador. Un cuadro de sistema no
// puede mostrar el proveedor, el archivo ni el modo elegido, y es justamente
// esa información la que hace que la confirmación signifique algo.

import { useState } from "react";
import { AlertTriangle, Check, PlayCircle } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { money } from "@/lib/proveedores/listas/presentacion";
import {
  MODO_PRECIO_VENTA,
  MODO_PRECIO_VENTA_DEFAULT,
  TEXTO_MODO_PRECIO_VENTA,
} from "@/lib/proveedores/listas/aplicacion";

export default function PanelAplicar({
  importacion,
  resumenSeleccion,
  previo,
  cargandoPrevio,
  onPedirPrevio,
  trabajando,
  onSeleccionarTodos,
  onDeseleccionar,
  onAplicar,
  resultado,
  error,
}) {
  const [modo, setModo] = useState(MODO_PRECIO_VENTA_DEFAULT);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmadoLeido, setConfirmadoLeido] = useState(false);

  // Solo APLICADA cierra. PARCIALMENTE_APLICADA sigue aceptando tandas.
  const yaAplicada = importacion?.estado === "APLICADA";
  const seleccionadas = resumenSeleccion?.seleccionadas ?? 0;
  const seleccionables = resumenSeleccion?.seleccionables ?? 0;
  const puedeAplicar = !yaAplicada && seleccionadas > 0 && !trabajando;

  // ── Ya se aplicó: no hay nada que ofrecer, solo lo que pasó ──────────────
  if (yaAplicada && !resultado) {
    return (
      <SunmiCard className="p-3">
        <div className="text-[12.5px] font-semibold sunmi-text-success inline-flex items-center gap-1">
          <Check size={14} aria-hidden="true" />
          Esta lista ya se aplicó
        </div>
        <p className="text-[11.5px] sunmi-text-muted leading-snug mt-0.5">
          Se actualizaron {importacion.aplicadas} filas y se omitieron {importacion.omitidas}.
          Una lista aplicada no se vuelve a aplicar.
        </p>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-3 space-y-3">
      {/* ── Selección ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[12.5px] font-semibold sunmi-text-strong">
          {seleccionadas} de {seleccionables} seleccionadas
        </div>
        <div className="flex-1" />
        <SunmiButton
          color="slate"
          onClick={onSeleccionarTodos}
          disabled={trabajando || seleccionables === 0}
          className="py-1.5 px-3 !text-[11.5px]"
        >
          Seleccionar todas las listas
        </SunmiButton>
        <SunmiButton
          color="slate"
          onClick={onDeseleccionar}
          disabled={trabajando || seleccionadas === 0}
          className="py-1.5 px-3 !text-[11.5px]"
        >
          Deseleccionar
        </SunmiButton>
      </div>

      {/* ── Modo de venta ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <label htmlFor="modo-venta" className="text-[11.5px] font-semibold sunmi-text-strong block">
            Precio de venta
          </label>
          <SunmiSelectAdv id="modo-venta" value={modo} onChange={(v) => setModo(v)}>
            <SunmiSelectOption value={MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN}>
              {TEXTO_MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN}
            </SunmiSelectOption>
            <SunmiSelectOption value={MODO_PRECIO_VENTA.MANTENER_VENTA}>
              {TEXTO_MODO_PRECIO_VENTA.MANTENER_VENTA}
            </SunmiSelectOption>
          </SunmiSelectAdv>
          <p className="text-[10.5px] sunmi-text-muted leading-snug">
            Recalcular usa el margen configurado de cada producto. Los que no tienen
            margen quedan con su precio actual: sin margen el precio es manual.
          </p>
        </div>
        <SunmiButton
          color="cyan"
          onClick={() => {
            setConfirmadoLeido(false);
            setConfirmando(true);
            onPedirPrevio?.();
          }}
          disabled={!puedeAplicar}
          className="py-3 px-4 font-bold !text-xs inline-flex items-center justify-center gap-1"
        >
          <PlayCircle size={14} aria-hidden="true" />
          Aplicar cambios
        </SunmiButton>
      </div>

      {/* ── Confirmación ───────────────────────────────────────────────── */}
      {confirmando && !trabajando && (
        <div className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
          <div className="text-[12.5px] font-semibold sunmi-text-strong inline-flex items-center gap-1">
            <AlertTriangle size={14} aria-hidden="true" />
            Confirmá antes de aplicar
          </div>
          <ul className="text-[11.5px] sunmi-text-muted space-y-0.5">
            <li>
              Proveedor: <span className="sunmi-text-strong">{importacion?.proveedor?.nombre ?? "—"}</span>
            </li>
            <li>
              Archivo: <span className="sunmi-text-strong break-all">{importacion?.archivoNombre ?? "—"}</span>
            </li>
            <li>
              Filas seleccionadas: <span className="sunmi-text-strong">{seleccionadas}</span>
            </li>
            <li>
              Precio de venta: <span className="sunmi-text-strong">{TEXTO_MODO_PRECIO_VENTA[modo]}</span>
            </li>
          </ul>

          {/* ── El resumen final ─────────────────────────────────────────
              Los totales los calcula el SERVIDOR sobre todas las
              seleccionadas. Sumarlos en la pantalla daría el total de la
              página que se está mirando, que con 25 filas por página sería
              un número equivocado presentado como si fuera el definitivo. */}
          {cargandoPrevio && (
            <p className="text-[11.5px] sunmi-text-muted">Calculando el total…</p>
          )}
          {previo && !cargandoPrevio && (
            <div className="sunmi-border border rounded-lg p-2.5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide sunmi-text-muted">
                Resumen final
              </div>
              <div className="flex justify-between gap-2 text-[12px]">
                <span className="sunmi-text-muted">Productos a actualizar</span>
                <span className="font-semibold sunmi-text-strong tabular-nums">{previo.cantidad}</span>
              </div>
              <div className="flex justify-between gap-2 text-[12px]">
                <span className="sunmi-text-muted">Costo total actual</span>
                <span className="tabular-nums sunmi-text-strong">{money(previo.costoTotalAnterior)}</span>
              </div>
              <div className="flex justify-between gap-2 text-[12px]">
                <span className="sunmi-text-muted">Costo total nuevo</span>
                <span className="tabular-nums font-semibold sunmi-text-strong">{money(previo.costoTotalNuevo)}</span>
              </div>
              <div className="flex justify-between gap-2 text-[12px]">
                <span className="sunmi-text-muted">Variación</span>
                <span
                  className={`tabular-nums font-semibold ${
                    previo.variacionPct > 0 ? "sunmi-text-danger" : "sunmi-text-success"
                  }`}
                >
                  {previo.variacionPct > 0 ? "+" : ""}
                  {previo.variacionPct?.toFixed(1)} %
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[12px]">
                <span className="sunmi-text-muted">Filas con alerta</span>
                <span
                  className={`tabular-nums font-semibold ${
                    previo.conAlerta > 0 ? "sunmi-text-warning" : "sunmi-text-muted"
                  }`}
                >
                  {previo.conAlerta}
                </span>
              </div>
              {previo.conAlerta > 0 && (
                <p className="text-[11px] sunmi-text-warning leading-snug">
                  Hay {previo.conAlerta} {previo.conAlerta === 1 ? "fila" : "filas"} con alerta de
                  gramaje, factor o variación alta. Podés revisarlas con el filtro &quot;Con alerta&quot;
                  antes de seguir.
                </p>
              )}
            </div>
          )}

          <p className="text-[11.5px] sunmi-text-warning leading-snug">
            Se van a modificar costos reales de productos. Los precios de venta que dependen
            del margen se recalculan. Esto no se deshace desde esta pantalla.
          </p>

          {/* Confirmación explícita: hay que tildar antes de poder aplicar. Un
              botón solo se aprieta sin leer; una casilla obliga a un acto
              deliberado sobre la frase que dice qué va a pasar. */}
          <label className="flex items-start gap-2 text-[11.5px] sunmi-text-strong cursor-pointer">
            <input
              type="checkbox"
              checked={confirmadoLeido}
              onChange={(e) => setConfirmadoLeido(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Revisé la lista y confirmo que se actualicen los costos de{" "}
              <span className="font-semibold">{previo?.cantidad ?? seleccionadas}</span>{" "}
              {(previo?.cantidad ?? seleccionadas) === 1 ? "producto" : "productos"}.
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2">
            <SunmiButton
              color="slate"
              onClick={() => setConfirmando(false)}
              className="py-2 !text-xs order-2 sm:order-1"
            >
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="cyan"
              onClick={() => {
                setConfirmando(false);
                onAplicar?.(modo);
              }}
              disabled={!confirmadoLeido || cargandoPrevio}
              className="py-2 font-bold !text-xs order-1 sm:order-2"
            >
              Sí, aplicar {seleccionadas} {seleccionadas === 1 ? "fila" : "filas"}
            </SunmiButton>
          </div>
        </div>
      )}

      {trabajando && (
        <p className="text-[12px] sunmi-text-accent">
          Aplicando… no cierres la pantalla. Puede tardar en listas grandes.
        </p>
      )}

      {error && <p className="text-[12px] sunmi-text-danger leading-snug">{error}</p>}

      {resultado && <ResultadoAplicacion resultado={resultado} />}
    </SunmiCard>
  );
}

/** Lo que pasó: cuántas entraron, cuántas no y por qué. */
export function ResultadoAplicacion({ resultado }) {
  const [verDetalle, setVerDetalle] = useState(false);
  const resumen = resultado?.resumen ?? { aplicadas: 0, omitidas: 0, motivos: [] };
  const detalle = resultado?.detalle ?? [];
  const aplicadas = detalle.filter((d) => d.resultado === "APLICADA");

  return (
    <div className="sunmi-border border rounded-lg p-3 space-y-2">
      <div className="text-[12.5px] font-semibold sunmi-text-strong">
        {resultado?.yaAplicada ? "Esta lista ya estaba aplicada" : "Resultado"}
      </div>
      <div className="flex flex-wrap gap-3 text-[12px]">
        <span className="sunmi-text-success font-semibold">{resumen.aplicadas} actualizados</span>
        <span className="sunmi-text-muted">{resumen.omitidas} omitidos</span>
      </div>

      {resumen.motivos?.length > 0 && (
        <ul className="text-[11.5px] sunmi-text-muted space-y-0.5">
          {resumen.motivos.map((m) => (
            <li key={m.motivo}>
              {m.cantidad} · {m.texto}
            </li>
          ))}
        </ul>
      )}

      {aplicadas.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setVerDetalle((v) => !v)}
            className="text-[11.5px] sunmi-text-accent underline"
          >
            {verDetalle ? "Ocultar el detalle" : `Ver los ${aplicadas.length} productos actualizados`}
          </button>
          {verDetalle && (
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {aplicadas.map((d) => (
                <div key={d.filaId} className="text-[11.5px] sunmi-border border rounded px-2 py-1.5">
                  <div className="sunmi-text-strong break-words">{d.producto}</div>
                  <div className="tabular-nums sunmi-text-muted">
                    Costo {money(d.costoAnterior)} → {money(d.costoNuevo)}
                    {d.ventaNueva !== null && d.ventaNueva !== undefined && (
                      <> · Venta {money(d.ventaAnterior)} → {money(d.ventaNueva)}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
