"use client";

// CONFIRMAR LA INTERPRETACIÓN de una fila que quedó por revisar.
//
// ── POR QUÉ TRES BLOQUES SEPARADOS ──────────────────────────────────────────
//
// Porque son tres preguntas distintas y mezclarlas fue lo que rompió el cálculo.
//
//   PRESENTACIÓN  cuántas unidades trae el envase. Dato del producto.
//   PRECIO        de qué es el precio informado, y cuánto costaría cada lectura.
//   AUMENTO       cómo se compara el costo propuesto contra el que ya existe.
//
// El UxBU vive en el primer bloque, apagado y con su leyenda: es un nivel
// logístico del proveedor que ERP Azul no maneja. No entra en ningún cálculo.
//
// ── LO QUE LA PANTALLA NO HACE ──────────────────────────────────────────────
//
// No preselecciona. La hipótesis recomendada se marca y se explica, pero hay que
// elegirla. Estar dentro del rango no confirma nada: lo único que cambia es que
// no lleva advertencia. Las hipótesis absurdas se muestran con su costo y su
// motivo, y no se pueden elegir.

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { money, porcentaje } from "@/lib/proveedores/listas/presentacion";
import {
  TEXTO_BASE_PRECIO,
  LEYENDA_UXBU,
  CANTIDAD_MAX,
  basePrecioDeFila,
  analizarFila,
  cantidadValida,
} from "@/lib/proveedores/listas/confirmarPresentacion";
import {
  TEXTO_ESTADO_VARIACION,
  TONO_ESTADO_VARIACION,
  esAlertaFuerte,
  exigeConfirmacionExplicita,
  textoRecomendacion,
} from "@/lib/proveedores/listas/rangoAumento";

const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`);

const TEXTO_COMPATIBILIDAD = {
  COINCIDEN: "La cantidad del archivo coincide con la del producto.",
  DIFIEREN: "La cantidad del archivo no coincide con la del producto. Se guarda en esta importación; la ficha del producto no se toca.",
  SIN_DATO: "No se pudo leer una cantidad de la descripción.",
};

function Bloque({ titulo, children }) {
  return (
    <div className="sunmi-border border rounded-lg p-2.5 space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wide sunmi-text-muted">{titulo}</div>
      {children}
    </div>
  );
}

function Dato({ label, children, tono }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
      <span className="sunmi-text-muted">{label}</span>
      <span className={`tabular-nums font-semibold ${tono ?? "sunmi-text-strong"}`}>{children}</span>
    </div>
  );
}

export default function PanelConfirmarArmado({ fila, importacion, onConfirmada, onCerrar, onVincularOtro }) {
  const erp = fila.erp;
  const baseParaCalculo = erp
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
  const analisis = analizarFila({
    fila, base: baseParaCalculo, recargoPct: fila.recargoPct, rango,
  });
  const { presentacion, evaluadas, recomendada, resultado } = analisis;

  const [clave, setClave] = useState("");
  const [cantidad, setCantidad] = useState(
    presentacion.cantidadDescripcion ? String(presentacion.cantidadDescripcion) : ""
  );
  const [aceptoAlerta, setAceptoAlerta] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const elegida = evaluadas.find((h) => h.clave === clave) ?? null;
  const cantidadNum = cantidad === "" ? null : Number(cantidad);
  const cantidadOk = cantidad === "" || cantidadValida(cantidadNum);
  const necesitaAceptar = elegida ? exigeConfirmacionExplicita(elegida.estado) : false;
  const listo = elegida !== null && !elegida.absurda && cantidadOk && (!necesitaAceptar || aceptoAlerta);

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
          body: JSON.stringify({ clave, cantidadPresentacion: cantidadValida(cantidadNum) ? cantidadNum : null }),
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
      <div data-panel="confirmar-armado" data-fila={fila.id} className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
        <div className="text-[13px] font-semibold sunmi-text-strong">No se puede confirmar</div>
        <p className="text-[11.5px] sunmi-text-muted leading-snug">
          El archivo no dice de qué presentación es este precio, así que no hay forma de saber a qué
          corresponde. Sin ese dato no se propone ningún costo.
        </p>
        <SunmiButton color="slate" onClick={onCerrar} className="py-2 !text-xs">Cerrar</SunmiButton>
      </div>
    );
  }

  return (
    <div data-panel="confirmar-armado" data-fila={fila.id} className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold sunmi-text-strong inline-flex items-center gap-1">
          <CheckCircle2 size={14} aria-hidden="true" />
          Confirmar producto e interpretación
        </h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar la confirmación" className="shrink-0 sunmi-text-muted">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* ── La recomendación, explicada ──────────────────────────────────── */}
      <p data-rol="recomendacion" className="text-[11.5px] sunmi-text-strong leading-snug">
        {textoRecomendacion({
          evaluadas, recomendada, resultado,
          baseTexto: TEXTO_BASE_PRECIO[basePrecio],
          money, pct,
        })}
      </p>

      {/* ── 1. PRESENTACIÓN DEL PRODUCTO ─────────────────────────────────── */}
      <Bloque titulo="1 · Presentación del producto">
        <div className="text-[12px] sunmi-text-strong break-words">{fila.descripcionProveedor}</div>
        <Dato label="Cantidad que dice la descripción">
          {presentacion.cantidadDescripcion ?? "—"}
        </Dato>
        <Dato label="Cantidad cargada en el producto (factor_pack)">
          {presentacion.factorPackErp ?? "—"}
        </Dato>
        {presentacion.pesoTexto && <Dato label="Peso o volumen">{presentacion.pesoTexto}</Dato>}
        {presentacion.contenidoInterno !== null && (
          <Dato label="Contenido interno del envase">{presentacion.contenidoInterno} piezas</Dato>
        )}
        <p className={`text-[10.5px] leading-snug ${presentacion.compatibilidad === "DIFIEREN" ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
          {TEXTO_COMPATIBILIDAD[presentacion.compatibilidad]}
        </p>
        <div className="flex items-end gap-2 pt-1">
          <div className="w-24">
            <label htmlFor={`cant-${fila.id}`} className="text-[10.5px] sunmi-text-muted block">
              Cantidad conciliada
            </label>
            <SunmiInput
              id={`cant-${fila.id}`}
              value={cantidad}
              onChange={(e) => { setCantidad(e.target.value.replace(/[^\d]/g, "")); setError(""); }}
              inputMode="numeric"
              placeholder={`1 a ${CANTIDAD_MAX}`}
              autoComplete="off"
            />
          </div>
          <p className="text-[10.5px] sunmi-text-muted leading-snug flex-1 pb-1.5">
            Se guarda en esta importación. No modifica la ficha del producto ni el costo.
          </p>
        </div>
        <div className="pt-1 border-t sunmi-border">
          <Dato label={`UxBU del archivo`} tono="sunmi-text-muted">
            {presentacion.unidadesPorBultoArchivo ?? "—"}
          </Dato>
          <p className="text-[10px] sunmi-text-muted leading-snug">{LEYENDA_UXBU}</p>
        </div>
      </Bloque>

      {/* ── 2. PRECIO ────────────────────────────────────────────────────── */}
      <Bloque titulo="2 · Precio">
        <Dato label="U.M. del archivo">{fila.unidadProveedor}</Dato>
        <Dato label="Qué está cotizando">{TEXTO_BASE_PRECIO[basePrecio]}</Dato>
        <Dato label="Precio informado">{money(fila.precioConIva)}</Dato>
        <Dato label="Recargo aplicado">{porcentaje(fila.recargoPct)}</Dato>

        <div className="space-y-1.5 pt-1.5">
          {evaluadas.map((h) => {
            const activa = clave === h.clave;
            const esRec = h.clave === recomendada;
            return (
              <button
                key={h.clave}
                type="button"
                disabled={h.absurda}
                onClick={() => { setClave(h.clave); setAceptoAlerta(false); setError(""); }}
                className={`w-full text-left rounded-lg border p-2 ${
                  activa ? "sunmi-border-accent border-2" : "sunmi-border"
                } ${h.absurda ? "opacity-60" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold sunmi-text-strong">
                    {h.multiplicador === 1 ? "Sin multiplicar" : `Por ${h.multiplicador}`}
                    {h.origenCantidad ? <span className="font-normal sunmi-text-muted"> · {h.origenCantidad}</span> : null}
                    {esRec && <span className="sunmi-text-success font-normal"> · recomendada</span>}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums sunmi-text-strong shrink-0">
                    {money(h.costoNuevo)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] sunmi-text-muted leading-snug">{h.detalle}</span>
                  <span className={`text-[11px] tabular-nums shrink-0 ${TONO_ESTADO_VARIACION[h.estado]}`}>
                    {pct(h.variacionPct)}
                  </span>
                </div>
                {h.absurda && (
                  <div className="text-[10.5px] sunmi-text-danger leading-snug">
                    Cambia el costo de orden de magnitud: no puede ser esta. Queda a la vista para
                    que se entienda por qué se descartó.
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Bloque>

      {/* ── 3. CONTROL DE AUMENTO ────────────────────────────────────────── */}
      <Bloque titulo="3 · Control de aumento">
        <Dato label="Costo actual">{money(analisis.costoActual)}</Dato>
        <Dato label="Costo propuesto">{elegida ? money(elegida.costoNuevo) : "—"}</Dato>
        <Dato label="Variación" tono={elegida ? TONO_ESTADO_VARIACION[elegida.estado] : undefined}>
          {elegida ? pct(elegida.variacionPct) : "—"}
        </Dato>
        <Dato label="Rango esperado configurado">{rango.minPct} % a {rango.maxPct} %</Dato>
        <Dato label="Estado" tono={elegida ? TONO_ESTADO_VARIACION[elegida.estado] : undefined}>
          {elegida ? TEXTO_ESTADO_VARIACION[elegida.estado] : "—"}
        </Dato>

        {elegida && esAlertaFuerte(elegida.estado) && (
          <div data-rol="alerta-fuerte" className="sunmi-text-danger text-[11.5px] leading-snug inline-flex items-start gap-1 pt-1">
            <AlertTriangle size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
            <span>
              {elegida.estado === "DISMINUCION"
                ? "Con esta interpretación el costo BAJA. Una lista nueva que baja el costo casi siempre significa que la interpretación o el producto vinculado están mal."
                : "Con esta interpretación el costo queda igual que hoy. Revisá que sea lo que corresponde antes de confirmar."}
            </span>
          </div>
        )}

        {elegida && necesitaAceptar && (
          <label className="flex items-start gap-2 text-[11.5px] sunmi-text-strong cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={aceptoAlerta}
              onChange={(e) => setAceptoAlerta(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-label="Confirmar una variación fuera del rango esperado"
            />
            <span>
              Revisé esta fila: la variación es {TEXTO_ESTADO_VARIACION[elegida.estado].toLowerCase()} y
              aun así corresponde.
            </span>
          </label>
        )}
      </Bloque>

      {error && <p className="text-[12px] sunmi-text-danger leading-snug">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <SunmiButton color="cyan" onClick={confirmar} disabled={!listo || trabajando} className="py-2 font-bold !text-xs">
          {trabajando ? "Confirmando…" : "Confirmar producto"}
        </SunmiButton>
        <SunmiButton
          color="slate"
          onClick={onVincularOtro}
          disabled={trabajando}
          className="py-2 !text-xs inline-flex items-center justify-center gap-1"
        >
          <Link2 size={12} aria-hidden="true" />
          El producto no es este
        </SunmiButton>
      </div>
    </div>
  );
}
