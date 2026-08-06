"use client";

// CONFIRMAR EL ARMADO de una fila que quedó por revisar.
//
// El producto ya está bien; lo que falta es cuántas unidades del ERP cubre el
// precio del proveedor. El archivo dice un armado y el producto dice otro, o el
// proveedor cotiza por display y el ERP no sabe qué es eso.
//
// ── POR QUÉ SE MUESTRA EL COSTO DE CADA OPCIÓN ──────────────────────────────
//
// Elegir "12" o "18" no significa nada leído así. Lo que significa algo es que
// uno deja el costo en $1.260 y el otro en $1.890. Por eso cada opción se
// muestra con el número que produce: la decisión se toma mirando plata, no
// mirando un factor.
//
// Ninguna opción viene elegida de antemano. El motor no eligió justamente
// porque no podía, y preseleccionar una sería tomar por el usuario la decisión
// que se le está pidiendo.

import { useState } from "react";
import { CheckCircle2, Link2, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { money, porcentaje } from "@/lib/proveedores/listas/presentacion";
import {
  opcionesDeFactor,
  costoConFactor,
  factorConfirmadoValido,
  FACTOR_MAX,
} from "@/lib/proveedores/listas/confirmarArmado";

const TEXTO_ORIGEN = {
  ARCHIVO: "Como dice el archivo",
  ERP: "Como está en el producto",
  SIN_CONVERSION: "Sin conversión",
};

/** El motivo por el que quedó dudosa, en criollo. */
const TEXTO_MOTIVO = {
  FACTOR_DIFIERE:
    "El archivo y el producto declaran armados distintos. Elegí cuál vale para esta lista.",
  FACTOR_AUSENTE:
    "El producto no tiene cargado un factor de bulto. Indicá cuántas unidades trae.",
  DISPLAY_SIN_EQUIVALENCIA:
    "El proveedor cotiza por display y el ERP no maneja displays. Indicá cuántas unidades del producto cubre ese precio.",
  BULTO_SOBRE_UNIDAD_SUELTA:
    "El proveedor cotiza por bulto y el producto se guarda por unidad suelta. Indicá cuántas unidades trae el bulto.",
};

export default function PanelConfirmarArmado({ fila, onConfirmada, onCerrar, onVincularOtro }) {
  const erp = fila.erp;
  const baseParaCalculo = erp
    ? {
        unidad_medida: erp.unidadMedida,
        factor_pack: erp.factorPack,
        modoCompraProveedor: erp.modoCompraProveedor ?? null,
      }
    : null;

  const opciones = opcionesDeFactor(fila, {
    factor_pack: erp?.factorPack ?? null,
  });

  const [factor, setFactor] = useState("");
  const [otro, setOtro] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const elegido = otro !== "" ? Number(otro) : factor === "" ? null : Number(factor);
  const valido = factorConfirmadoValido(elegido);

  const costoDe = (f) =>
    costoConFactor({
      precioConIva: fila.precioConIva,
      recargoPct: fila.recargoPct,
      factor: f,
      base: baseParaCalculo,
    });

  const costoElegido = valido ? costoDe(elegido) : null;
  const costoActual = erp?.costoActual ?? null;

  const confirmar = async () => {
    if (!valido || trabajando) return;
    setTrabajando(true);
    setError("");
    try {
      const r = await fetch(
        `/api/proveedores/listas/${fila.importacionId}/filas/${fila.id}/confirmar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ factorConfirmado: elegido }),
        }
      );
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo confirmar el armado.");
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
    <div
      data-panel="confirmar-armado"
      data-fila={fila.id}
      className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold sunmi-text-strong inline-flex items-center gap-1">
            <CheckCircle2 size={14} aria-hidden="true" />
            Confirmar producto y armado
          </h3>
          <p className="text-[11px] sunmi-text-muted leading-snug">
            {TEXTO_MOTIVO[fila.motivo] ??
              "Indicá cuántas unidades del producto cubre el precio del proveedor."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la confirmación de armado"
          className="shrink-0 sunmi-text-muted"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* ── El producto que se está confirmando ──────────────────────────── */}
      <div className="sunmi-border border rounded-lg p-2.5 space-y-0.5">
        <div className="text-[10px] font-bold uppercase tracking-wide sunmi-text-muted">
          Producto que se va a conservar
        </div>
        <div className="text-[12.5px] font-semibold sunmi-text-strong break-words">
          {erp?.nombre ?? "—"}
        </div>
        <div className="text-[11px] sunmi-text-muted">
          {erp?.presentacion ?? "—"}
          {erp?.codigosArcor?.length ? ` · código ${erp.codigosArcor.join(" / ")}` : ""}
          {costoActual !== null ? ` · costo actual ${money(costoActual)}` : ""}
        </div>
        <div className="text-[11px] sunmi-text-muted">
          El archivo lo llama <span className="sunmi-text-strong">{fila.descripcionProveedor}</span>{" "}
          · {fila.unidadProveedor}
          {fila.unidadesPorBulto ? ` · UxBU ${fila.unidadesPorBulto}` : ""} ·{" "}
          {money(fila.precioConIva)} +{porcentaje(fila.recargoPct)}
        </div>
      </div>

      {/* ── Las opciones, con el costo que produce cada una ──────────────── */}
      <div className="space-y-1.5">
        <div className="text-[11.5px] font-semibold sunmi-text-strong">
          ¿Cuántas unidades cubre el precio del proveedor?
        </div>
        {opciones.map((o) => {
          const c = costoDe(o.factor);
          const activa = otro === "" && String(factor) === String(o.factor);
          return (
            <button
              key={o.factor}
              type="button"
              onClick={() => {
                setFactor(String(o.factor));
                setOtro("");
                setError("");
              }}
              className={`w-full text-left rounded-lg border p-2.5 ${
                activa ? "sunmi-border-accent border-2" : "sunmi-border"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold sunmi-text-strong">
                  {o.factor} {o.factor === 1 ? "unidad" : "unidades"}
                  <span className="font-normal sunmi-text-muted"> · {TEXTO_ORIGEN[o.origen]}</span>
                </span>
                <span className="text-[13px] font-bold tabular-nums sunmi-text-strong shrink-0">
                  {money(c)}
                </span>
              </div>
              <div className="text-[10.5px] sunmi-text-muted leading-snug">{o.detalle}</div>
            </button>
          );
        })}

        {/* Otro valor: los displays casi nunca coinciden con ninguna de las dos. */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-0.5">
            <label htmlFor={`otro-${fila.id}`} className="text-[11px] sunmi-text-muted block">
              Otro armado
            </label>
            <SunmiInput
              id={`otro-${fila.id}`}
              value={otro}
              onChange={(e) => {
                setOtro(e.target.value.replace(/[^\d]/g, ""));
                setFactor("");
                setError("");
              }}
              inputMode="numeric"
              placeholder={`1 a ${FACTOR_MAX}`}
              autoComplete="off"
            />
          </div>
          {otro !== "" && (
            <div className="text-[13px] font-bold tabular-nums sunmi-text-strong pb-2">
              {valido ? money(costoDe(elegido)) : "—"}
            </div>
          )}
        </div>
      </div>

      {/* ── El efecto ────────────────────────────────────────────────────── */}
      {valido && costoElegido !== null && (
        <div className="sunmi-border border rounded-lg p-2.5">
          <div className="text-[11px] sunmi-text-muted">Con ese armado, el costo quedaría</div>
          <div className="text-[13px] tabular-nums sunmi-text-strong">
            {money(costoActual)} <span className="sunmi-text-muted">→</span>{" "}
            <span className="font-bold">{money(costoElegido)}</span>
          </div>
          <p className="text-[10.5px] sunmi-text-muted leading-snug mt-0.5">
            Confirmar no aplica el costo: deja la fila lista para que la apliques con el resto.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] sunmi-text-danger leading-snug">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <SunmiButton
          color="cyan"
          onClick={confirmar}
          disabled={!valido || trabajando}
          className="py-2 font-bold !text-xs"
        >
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
