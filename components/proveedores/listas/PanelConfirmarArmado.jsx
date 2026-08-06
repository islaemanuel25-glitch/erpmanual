"use client";

// CONFIRMAR LA PRESENTACIÓN de una fila que quedó por revisar.
//
// ── LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO ──────────────────────────────
//
// Que la CANTIDAD y el PRECIO son dos cosas distintas. El proveedor cotiza una
// presentación —una unidad, un display, un bulto— y ese precio es el total de
// esa presentación. Cuántas unidades trae adentro es un dato del producto y no
// cambia ese total: un display de $5.678 cuesta $5.962 con recargo, traiga 12 o
// traiga 18 sobres.
//
// Por eso el panel muestra el precio informado arriba de todo, con la
// presentación que está cotizando al lado, y el costo propuesto ES ese precio
// salvo que el archivo diga que el precio es por unidad suelta. El costo
// unitario aparece dividido, gris y marcado como informativo, para que nunca se
// confunda con lo que se va a guardar.
//
// La pregunta que se hace no es "por cuánto multiplico" sino "qué es tu
// producto": el display que te cotizan, o una unidad de las que ese producto
// agrupa. Son dos respuestas posibles, no un número libre.

import { useState } from "react";
import { CheckCircle2, Link2, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { money, porcentaje } from "@/lib/proveedores/listas/presentacion";
import {
  RELACION,
  BASE_PRECIO,
  TEXTO_BASE_PRECIO,
  UNIDADES_MAX,
  basePrecioDeFila,
  relacionesPosibles,
  relacionImplicita,
  costoDeRelacion,
  costoUnitarioInformativo,
  unidadesValidas,
  respaldoDeRelacion,
} from "@/lib/proveedores/listas/confirmarPresentacion";

const TITULO_RELACION = {
  MISMA_PRESENTACION: "Mi producto es lo que me están cotizando",
  POR_UNIDAD_SUELTA: "Mi producto agrupa varias de esas unidades",
};

/** Por qué quedó por revisar, en criollo. */
const TEXTO_MOTIVO = {
  FACTOR_DIFIERE:
    "El archivo declara un armado distinto del que tiene el producto. Decidí qué es tu producto: el precio no cambia por eso.",
  FACTOR_AUSENTE:
    "El producto no tiene cargado cuántas unidades agrupa. Decidí qué es tu producto respecto de lo que te cotizan.",
  DISPLAY_SIN_EQUIVALENCIA:
    "El proveedor cotiza por display. El precio informado es el del display entero, no el de cada unidad.",
  BULTO_SOBRE_UNIDAD_SUELTA:
    "El proveedor cotiza por bulto y el producto guarda por unidad suelta. Decidí cuál de los dos es tu producto.",
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

  const basePrecio = basePrecioDeFila(fila);
  const opciones = relacionesPosibles(fila, baseParaCalculo);
  const implicita = relacionImplicita({
    costoActual: erp?.costoActual,
    precioConIva: fila.precioConIva,
    recargoPct: fila.recargoPct,
  });

  // La cantidad arranca con la del producto: es lo que el ERP cree hoy, y la
  // persona la corrige si el archivo la contradice.
  const [relacion, setRelacion] = useState("");
  const [unidades, setUnidades] = useState(erp?.factorPack ? String(erp.factorPack) : "");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const cantidad = unidades === "" ? null : Number(unidades);
  const cantidadOk = unidadesValidas(cantidad);
  const multiplica = relacion === RELACION.POR_UNIDAD_SUELTA;
  const listo = relacion !== "" && (!multiplica || cantidadOk);

  const costoDe = (rel) =>
    costoDeRelacion({
      precioConIva: fila.precioConIva,
      recargoPct: fila.recargoPct,
      relacion: rel,
      unidades: cantidad,
    });

  const costoElegido = listo ? costoDe(relacion) : null;
  const costoActual = erp?.costoActual ?? null;
  const unitario = costoUnitarioInformativo({ costoTotal: costoElegido, unidades: cantidad });

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
          body: JSON.stringify({ relacion, unidades: cantidadOk ? cantidad : null }),
        }
      );
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo confirmar la presentación.");
        return;
      }
      onConfirmada?.(json);
    } catch {
      setError("Error de conexión.");
    } finally {
      setTrabajando(false);
    }
  };

  // Sin base no hay nada que decidir: el archivo no dice de qué es el precio.
  if (basePrecio === null) {
    return (
      <div
        data-panel="confirmar-armado"
        data-fila={fila.id}
        className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2"
      >
        <div className="text-[13px] font-semibold sunmi-text-strong">No se puede confirmar</div>
        <p className="text-[11.5px] sunmi-text-muted leading-snug">
          El archivo no dice de qué presentación es este precio, así que no hay forma de saber a
          qué corresponde. Sin ese dato no se propone ningún costo.
        </p>
        <SunmiButton color="slate" onClick={onCerrar} className="py-2 !text-xs">
          Cerrar
        </SunmiButton>
      </div>
    );
  }

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
            Confirmar producto y presentación
          </h3>
          <p className="text-[11px] sunmi-text-muted leading-snug">
            {TEXTO_MOTIVO[fila.motivo] ??
              "Decidí qué es tu producto respecto de lo que cotiza el proveedor."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la confirmación de presentación"
          className="shrink-0 sunmi-text-muted"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* ── Lo que informa el proveedor ──────────────────────────────────── */}
      <div className="sunmi-border border rounded-lg p-2.5 space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wide sunmi-text-muted">
          Lo que informa el proveedor
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] sunmi-text-strong break-words">
            {fila.descripcionProveedor}
          </span>
          <span className="text-[15px] font-bold tabular-nums sunmi-text-strong shrink-0">
            {money(fila.precioConIva)}
          </span>
        </div>
        <div className="text-[11px] sunmi-text-muted">
          Ese precio es el de{" "}
          <span className="sunmi-text-strong">{TEXTO_BASE_PRECIO[basePrecio]}</span>, más{" "}
          {porcentaje(fila.recargoPct)} de recargo.
          {basePrecio !== BASE_PRECIO.UNIDAD && " No es el precio de cada unidad."}
        </div>
      </div>

      {/* ── El producto que se conserva ──────────────────────────────────── */}
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
        {implicita !== null && (
          <div className="text-[10.5px] sunmi-text-muted leading-snug">
            Como referencia: el costo que tenés hoy equivale a{" "}
            <span className="sunmi-text-strong">
              {implicita < 1.6 ? "una" : implicita.toFixed(1)}
            </span>{" "}
            {implicita < 1.6
              ? `sola ${TEXTO_BASE_PRECIO[basePrecio].replace("una ", "").replace("un ", "")}`
              : `de esas presentaciones`}
            . Es lo que valía la última vez que el costo estuvo bien.
          </div>
        )}
      </div>

      {/* ── Cantidad contenida: un dato, no un factor ────────────────────── */}
      <div className="space-y-1">
        <label htmlFor={`unidades-${fila.id}`} className="text-[11.5px] font-semibold sunmi-text-strong block">
          ¿Cuántas unidades contiene?
        </label>
        <div className="flex items-center gap-2">
          <div className="w-28">
            <SunmiInput
              id={`unidades-${fila.id}`}
              value={unidades}
              onChange={(e) => {
                setUnidades(e.target.value.replace(/[^\d]/g, ""));
                setError("");
              }}
              inputMode="numeric"
              placeholder={`1 a ${UNIDADES_MAX}`}
              autoComplete="off"
            />
          </div>
          <p className="text-[10.5px] sunmi-text-muted leading-snug flex-1">
            {fila.unidadesPorBulto
              ? `El archivo trae ${fila.unidadesPorBulto} como unidades por bulto. `
              : ""}
            {multiplica
              ? "Con la opción de abajo, esta cantidad multiplica el precio."
              : "Es un dato de la presentación: no cambia el costo."}
          </p>
        </div>
      </div>

      {/* ── Qué es el producto ───────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="text-[11.5px] font-semibold sunmi-text-strong">
          ¿Qué es tu producto respecto de lo que te cotizan?
        </div>
        {opciones.map((o) => {
          const c = costoDe(o.relacion);
          const activa = relacion === o.relacion;
          const respaldo = respaldoDeRelacion({
            relacion: o.relacion,
            implicita,
            unidades: cantidad,
          });
          return (
            <button
              key={o.relacion}
              type="button"
              onClick={() => {
                setRelacion(o.relacion);
                setError("");
              }}
              className={`w-full text-left rounded-lg border p-2.5 ${
                activa ? "sunmi-border-accent border-2" : "sunmi-border"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold sunmi-text-strong">
                  {TITULO_RELACION[o.relacion]}
                </span>
                <span className="text-[13px] font-bold tabular-nums sunmi-text-strong shrink-0">
                  {c === null ? "—" : money(c)}
                </span>
              </div>
              <div className="text-[10.5px] sunmi-text-muted leading-snug">{o.detalle}</div>
              {respaldo === "NO_RESPALDA" && (
                <div className="text-[10.5px] sunmi-text-warning leading-snug mt-0.5">
                  Ojo: el costo que tenés hoy no se parece a este. Puede ser que el producto sea
                  otra presentación, o que el costo viejo esté mal. Revisalo antes de confirmar.
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── El efecto ────────────────────────────────────────────────────── */}
      {listo && costoElegido !== null && (
        <div className="sunmi-border border rounded-lg p-2.5 space-y-0.5">
          <div className="text-[11px] sunmi-text-muted">Costo total de la presentación</div>
          <div className="text-[13px] tabular-nums sunmi-text-strong">
            {money(costoActual)} <span className="sunmi-text-muted">→</span>{" "}
            <span className="font-bold">{money(costoElegido)}</span>
          </div>
          {unitario !== null && (
            <div className="text-[10.5px] sunmi-text-muted">
              Costo por unidad, solo como referencia: {money(unitario)} ({cantidad} unidades). No se
              guarda.
            </div>
          )}
          <p className="text-[10.5px] sunmi-text-muted leading-snug">
            Confirmar no aplica el costo: deja la fila lista para que la apliques con el resto. La
            cantidad no modifica la ficha del producto.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] sunmi-text-danger leading-snug">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <SunmiButton
          color="cyan"
          onClick={confirmar}
          disabled={!listo || trabajando}
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
