"use client";

// EL DETALLE DE UNA FILA, expandido DEBAJO de su propia fila.
//
// ── POR QUÉ INLINE Y NO UN PANEL ────────────────────────────────────────────
//
// Quien revisa 190 productos no está mirando una ficha: está barriendo una
// lista. Un modal o un panel lateral saca de contexto y obliga a cerrar para
// seguir. Acá el detalle se abre en el lugar donde estaba la fila, se lee, se
// decide y se cierra sin perder de vista lo que venía antes ni lo que sigue.
//
// Por eso también tiene TECHO de altura: cuatro tarjetas en una grilla y la
// tabla de hipótesis. Todo lo que no entra —el paso a paso del cálculo— vive
// dentro del acordeón "Ver cálculo completo", cerrado por defecto.
//
// No calcula nada propio: usa `analizarFila`, el mismo módulo que valida el
// servidor. Lo que se ve acá es exactamente lo que se va a guardar.

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, Link2 } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { money, porcentaje } from "@/lib/proveedores/listas/presentacion";
import {
  TEXTO_BASE_PRECIO,
  LEYENDA_UXBU,
  basePrecioDeFila,
  analizarFila,
} from "@/lib/proveedores/listas/confirmarPresentacion";
import {
  TEXTO_ESTADO_VARIACION,
  TONO_ESTADO_VARIACION,
  esAlertaFuerte,
  exigeConfirmacionExplicita,
} from "@/lib/proveedores/listas/rangoAumento";

const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`);

const TEXTO_COMPAT = {
  COINCIDEN: "Coincide",
  DIFIEREN: "No coincide",
  SIN_DATO: "Sin dato",
};

const TONO_COMPAT = {
  COINCIDEN: "sunmi-text-success",
  DIFIEREN: "sunmi-text-warning",
  SIN_DATO: "sunmi-text-muted",
};

const TEXTO_RESULTADO = {
  RECOMENDADA: "Única interpretación coherente",
  AMBIGUA: "Ambigua: más de una interpretación posible",
  REVISAR: "Sin interpretación razonable",
};

/** Tarjeta del detalle. Título chico arriba, pares etiqueta/valor abajo. */
function Tarjeta({ titulo, children }) {
  return (
    <div className="sunmi-border border rounded-md p-1.5 space-y-0 min-w-0">
      <div className="text-[9.5px] font-bold uppercase tracking-wide sunmi-text-muted">{titulo}</div>
      {children}
    </div>
  );
}

function Par({ etiqueta, children, tono, fuerte }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10.5px] leading-tight">
      <span className="sunmi-text-muted shrink-0">{etiqueta}</span>
      <span className={`tabular-nums text-right ${fuerte ? "font-bold" : "font-medium"} ${tono ?? "sunmi-text-strong"}`}>
        {children}
      </span>
    </div>
  );
}

export default function DetalleConciliacion({
  fila,
  importacion,
  onConfirmada,
  onVincularOtro,
  onCerrar,
}) {
  const erp = fila.erp;
  const base = erp
    ? {
        unidad_medida: erp.unidadMedida,
        factor_pack: erp.factorPack,
        modoCompraProveedor: erp.modoCompraProveedor ?? null,
        precio_costo: erp.costoActual,
      }
    : null;

  const rango = {
    minPct: importacion?.aumentoEsperadoMinPct ?? 10,
    maxPct: importacion?.aumentoEsperadoMaxPct ?? 20,
  };
  const basePrecio = basePrecioDeFila(fila);
  const analisis = analizarFila({ fila, base, recargoPct: fila.recargoPct, rango });
  const { presentacion, evaluadas, recomendada, resultado } = analisis;

  // La recomendada viene marcada, pero confirmar sigue siendo un acto explícito.
  const [clave, setClave] = useState(recomendada ?? "");
  const [aceptoAlerta, setAceptoAlerta] = useState(false);
  const [verCalculo, setVerCalculo] = useState(false);
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
          body: JSON.stringify({ clave, cantidadPresentacion: presentacion.cantidadDescripcion ?? null }),
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

  if (basePrecio === null) {
    return (
      <div data-panel="detalle-conciliacion" data-fila={fila.id} className="sunmi-surface-soft p-2.5 text-[11.5px] sunmi-text-muted">
        El archivo no dice de qué presentación es este precio. Sin ese dato no se propone ningún
        costo.
      </div>
    );
  }

  return (
    <div
      data-panel="detalle-conciliacion"
      data-fila={fila.id}
      className="sunmi-surface-soft border-t sunmi-border p-2 space-y-1.5"
    >
      {/* ── Encabezado ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el detalle"
          className="sunmi-text-muted text-[11px] order-last ml-auto"
        >
          Cerrar
        </button>
        <span className="text-[11.5px] font-semibold sunmi-text-strong">
          Fila {fila.filaExcel} · {fila.descripcionProveedor}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            resultado === "RECOMENDADA" ? "sunmi-text-success" : "sunmi-text-warning"
          } sunmi-border border`}
        >
          {TEXTO_RESULTADO[resultado]}
        </span>
      </div>

      {/* ── Las cuatro tarjetas ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5">
        <Tarjeta titulo="Resumen de la decisión">
          <Par etiqueta="El proveedor cotiza">{TEXTO_BASE_PRECIO[basePrecio]}</Par>
          <Par etiqueta="El ERP representa">{erp?.presentacion ?? "—"}</Par>
          <Par etiqueta="Interpretación">
            {recomendada
              ? evaluadas.find((h) => h.clave === recomendada)?.multiplicador === 1
                ? "Sin multiplicar"
                : `Por ${evaluadas.find((h) => h.clave === recomendada)?.multiplicador}`
              : "a definir"}
          </Par>
          <p className="text-[10px] sunmi-text-muted leading-tight pt-0.5">
            {resultado === "RECOMENDADA"
              ? `U.M. = ${fila.unidadProveedor} → el precio es de ${TEXTO_BASE_PRECIO[basePrecio]}.`
              : resultado === "AMBIGUA"
                ? "Más de una interpretación da un resultado posible. Elegí cuál corresponde."
                : "Ninguna interpretación da un costo creíble. Revisá el producto vinculado."}
          </p>
        </Tarjeta>

        <Tarjeta titulo="Cálculo recomendado">
          <Par etiqueta="Precio informado">{money(fila.precioConIva)}</Par>
          <Par etiqueta={`Recargo (${porcentaje(fila.recargoPct)})`}>{money(fila.montoRecargo)}</Par>
          <Par etiqueta="Multiplicador">× {elegida?.multiplicador ?? "—"}</Par>
          <Par etiqueta="Costo propuesto" fuerte>{elegida ? money(elegida.costoNuevo) : "—"}</Par>
          <Par etiqueta="Costo actual">{money(analisis.costoActual)}</Par>
          <Par etiqueta="Variación" fuerte tono={elegida ? TONO_ESTADO_VARIACION[elegida.estado] : undefined}>
            {elegida ? pct(elegida.variacionPct) : "—"}
          </Par>
        </Tarjeta>

        <Tarjeta titulo="Presentación del producto">
          <Par etiqueta="Cantidad del archivo">{presentacion.cantidadDescripcion ?? "—"}</Par>
          <Par etiqueta="Factor pack del ERP">{presentacion.factorPackErp ?? "—"}</Par>
          {presentacion.pesoTexto && <Par etiqueta="Peso o volumen">{presentacion.pesoTexto}</Par>}
          {presentacion.contenidoInterno !== null && (
            <Par etiqueta="Contenido interno">{presentacion.contenidoInterno} piezas</Par>
          )}
          <Par etiqueta="Compatibilidad" tono={TONO_COMPAT[presentacion.compatibilidad]}>
            {TEXTO_COMPAT[presentacion.compatibilidad]}
          </Par>
          <p className="text-[10px] sunmi-text-muted leading-tight pt-0.5">
            La cantidad se guarda en esta importación. No modifica la ficha del producto.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Datos informativos">
          <Par etiqueta="Código archivo">{fila.codigoCrudo ?? "—"}</Par>
          <Par
            etiqueta="Código Arcor guardado"
            tono={erp?.codigosArcor?.length ? undefined : "sunmi-text-warning"}
          >
            {erp?.codigosArcor?.length ? erp.codigosArcor.join(" / ") : "Sin código Arcor"}
          </Par>
          <Par etiqueta="U.M. del archivo">{fila.unidadProveedor}</Par>
          <Par etiqueta="UxBU (logístico)" tono="sunmi-text-muted">
            {presentacion.unidadesPorBultoArchivo ?? "—"}
          </Par>
          <p className="text-[10px] sunmi-text-muted leading-tight inline-flex items-start gap-1">
            <Info size={11} aria-hidden="true" className="shrink-0 mt-0.5" />
            <span>{LEYENDA_UXBU}</span>
          </p>
        </Tarjeta>
      </div>

      {/* ── Hipótesis evaluadas ──────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="text-[9.5px] font-bold uppercase tracking-wide sunmi-text-muted">
          Hipótesis evaluadas
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] sm:text-[10.5px] tabular-nums min-w-[30rem]">
            <thead>
              <tr className="sunmi-text-muted text-left">
                <th className="font-medium pr-2 py-0.5 w-6" />
                <th className="font-medium pr-2 py-0.5">Interpretación</th>
                <th className="font-medium pr-2 py-0.5">Mult.</th>
                <th className="font-medium pr-2 py-0.5">Origen cantidad</th>
                <th className="font-medium pr-2 py-0.5 text-right">Costo propuesto</th>
                <th className="font-medium pr-2 py-0.5 text-right">Variación</th>
                <th className="font-medium py-0.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {evaluadas.map((h) => (
                <tr key={h.clave} className={h.absurda ? "opacity-60" : ""}>
                  <td className="pr-2 py-0.5">
                    <input
                      type="radio"
                      name={`hip-${fila.id}`}
                      checked={clave === h.clave}
                      disabled={h.absurda}
                      onChange={() => { setClave(h.clave); setAceptoAlerta(false); setError(""); }}
                      aria-label={`Interpretación ${h.multiplicador === 1 ? "sin multiplicar" : `por ${h.multiplicador}`}`}
                      className="h-3.5 w-3.5"
                    />
                  </td>
                  <td className="pr-2 py-0.5 sunmi-text-strong">
                    {h.multiplicador === 1 ? "Sin multiplicar" : `Por ${h.multiplicador}`}
                    {h.clave === recomendada && (
                      <span className="sunmi-text-success"> · recomendada</span>
                    )}
                  </td>
                  <td className="pr-2 py-0.5">× {h.multiplicador}</td>
                  <td className="pr-2 py-0.5 sunmi-text-muted">{h.origenCantidad ?? `U.M. = ${fila.unidadProveedor}`}</td>
                  <td className="pr-2 py-0.5 text-right font-semibold sunmi-text-strong">{money(h.costoNuevo)}</td>
                  <td className={`pr-2 py-0.5 text-right ${TONO_ESTADO_VARIACION[h.estado]}`}>{pct(h.variacionPct)}</td>
                  <td className={`py-0.5 ${TONO_ESTADO_VARIACION[h.estado]}`}>
                    {h.absurda ? "Descartada: cambia el orden de magnitud" : TEXTO_ESTADO_VARIACION[h.estado]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── El cálculo completo, cerrado ─────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setVerCalculo((v) => !v)}
          aria-expanded={verCalculo}
          className="text-[10.5px] sunmi-text-muted inline-flex items-center gap-1"
        >
          <ChevronDown size={12} aria-hidden="true" className={verCalculo ? "rotate-180" : ""} />
          Ver cálculo completo
        </button>
        {verCalculo && (
          <div className="text-[10.5px] sunmi-text-muted leading-snug pt-1 space-y-0.5">
            <div>
              Precio informado {money(fila.precioConIva)} × (1 + {porcentaje(fila.recargoPct)}) ={" "}
              {money(fila.precioConRecargo)} por {TEXTO_BASE_PRECIO[basePrecio]}.
            </div>
            <div>
              × multiplicador {elegida?.multiplicador ?? "—"} ={" "}
              <span className="sunmi-text-strong">{elegida ? money(elegida.costoNuevo) : "—"}</span>{" "}
              de costo propuesto.
            </div>
            <div>
              Contra el costo actual de {money(analisis.costoActual)}
              {erp?.actualizadoEn ? `, actualizado el ${new Date(erp.actualizadoEn).toLocaleDateString("es-AR")}` : ""}
              , da {elegida ? pct(elegida.variacionPct) : "—"}. Rango esperado configurado:{" "}
              {rango.minPct} % a {rango.maxPct} %.
            </div>
            <div>
              El UxBU del archivo ({presentacion.unidadesPorBultoArchivo ?? "—"}) no participa de
              ninguno de estos pasos.
            </div>
          </div>
        )}
      </div>

      {/* ── Alerta y acciones ────────────────────────────────────────────── */}
      {elegida && esAlertaFuerte(elegida.estado) && (
        <div data-rol="alerta-fuerte" className="sunmi-text-danger text-[11px] leading-snug inline-flex items-start gap-1">
          <AlertTriangle size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
          <span>
            {elegida.estado === "DISMINUCION"
              ? "Con esta interpretación el costo BAJA. En una lista nueva eso casi siempre significa que la interpretación o el producto vinculado están mal."
              : "Con esta interpretación el costo queda igual que hoy. Revisá que sea lo que corresponde."}
          </span>
        </div>
      )}

      {error && <p className="text-[11px] sunmi-text-danger leading-snug">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {elegida && necesitaAceptar && (
          <label className="flex items-center gap-1.5 text-[11px] sunmi-text-strong cursor-pointer">
            <input
              type="checkbox"
              checked={aceptoAlerta}
              onChange={(e) => setAceptoAlerta(e.target.checked)}
              className="h-3.5 w-3.5"
              aria-label="Confirmar una variación riesgosa"
            />
            Revisé esta fila y aun así corresponde
          </label>
        )}
        <div className="flex-1" />
        <SunmiButton
          color="cyan"
          onClick={confirmar}
          disabled={!listo || trabajando}
          className="py-1.5 px-3 font-bold !text-[11.5px] inline-flex items-center gap-1"
        >
          <Check size={13} aria-hidden="true" />
          {trabajando ? "Confirmando…" : "Confirmar producto"}
        </SunmiButton>
        <SunmiButton
          color="slate"
          onClick={onVincularOtro}
          disabled={trabajando}
          className="py-1.5 px-3 !text-[11.5px] inline-flex items-center gap-1"
        >
          <Link2 size={12} aria-hidden="true" />
          El producto no es este
        </SunmiButton>
      </div>

      {elegida && !esAlertaFuerte(elegida.estado) && exigeConfirmacionExplicita(elegida.estado) && (
        <p className="text-[10px] sunmi-text-warning leading-snug">
          La variación queda fuera del rango esperado. Se puede confirmar igual, pero conviene
          mirarla.
        </p>
      )}
    </div>
  );
}
