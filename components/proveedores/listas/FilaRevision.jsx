"use client";

// LA FILA DE REVISIÓN: el archivo del proveedor contra el producto del ERP.
//
// ── POR QUÉ NO ES UNA TABLA ─────────────────────────────────────────────────
//
// Decidir si un costo se aplica exige comparar quince datos de dos orígenes
// distintos. En una tabla eso son quince columnas, ilegibles en un monitor e
// imposibles en un teléfono, y sobre todo pierden lo único que importa: qué dato
// del archivo se corresponde con qué dato del ERP.
//
// Por eso cada fila es una tarjeta con dos lados enfrentados —ARCHIVO a la
// izquierda, ERP a la derecha— que en pantalla chica se apilan. Los números que
// cambian se muestran como "antes → después" en la misma línea, que es como se
// leen, y no en columnas separadas que hay que ir cruzando con la vista.

import { useState } from "react";
import { AlertTriangle, Ban, ChevronDown, ChevronUp, Link2, RotateCcw } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { money, porcentaje } from "@/lib/proveedores/listas/presentacion";
import { BadgeEstado, Motivo } from "@/components/proveedores/listas/PiezasListas";

/** Cómo se llama cada tipo de macheo en criollo. */
const TEXTO_MACHEO = {
  CODIGO_INTERNO: "exacto",
  CODIGO_INTERNO_SIN_CEROS: "sin ceros",
  SUFIJO_8: "sufijo 8",
  SUFIJO_7: "sufijo 7",
  SUFIJO_6: "sufijo 6",
  SUFIJO_5: "sufijo 5",
  SUFIJO_4: "sufijo 4",
  CODIGO_BARRA: "código de barras",
  AMBIGUA: "ambiguo",
  NINGUNA: "sin vincular",
};

/** El sufijo de 4 y lo ambiguo se marcan: son los macheos que hay que mirar. */
const TONO_MACHEO = {
  CODIGO_INTERNO: "sunmi-text-success",
  SUFIJO_5: "sunmi-text-accent",
  SUFIJO_4: "sunmi-text-warning",
  CODIGO_BARRA: "sunmi-text-accent",
  AMBIGUA: "sunmi-text-danger",
  NINGUNA: "sunmi-text-muted",
};

export function EtiquetaMacheo({ fila }) {
  const t = fila.vinculadoPorUsuarioId ? "manual" : TEXTO_MACHEO[fila.tipoCoincidencia] ?? fila.tipoCoincidencia;
  const tono = fila.vinculadoPorUsuarioId ? "sunmi-text-success" : TONO_MACHEO[fila.tipoCoincidencia] ?? "sunmi-text-muted";
  return (
    <span className={`text-[11px] font-semibold ${tono}`}>
      {t}
      {fila.sufijoDigitos ? ` · ${fila.sufijoDigitos} díg.` : ""}
    </span>
  );
}

/** Un dato con su etiqueta, en una línea. */
function D({ etiqueta, children, fuerte = false, mono = false }) {
  return (
    <div className="flex justify-between gap-2 items-baseline">
      <span className="text-[10.5px] sunmi-text-muted shrink-0">{etiqueta}</span>
      <span
        className={`text-[12px] text-right break-words ${fuerte ? "font-semibold sunmi-text-strong" : "sunmi-text-strong"} ${mono ? "tabular-nums" : ""}`}
      >
        {children ?? "—"}
      </span>
    </div>
  );
}

/** "antes → después", que es como se lee un cambio. */
function Cambio({ etiqueta, antes, despues, cambia = true }) {
  return (
    <div className="flex justify-between gap-2 items-baseline">
      <span className="text-[10.5px] sunmi-text-muted shrink-0">{etiqueta}</span>
      <span className="text-[12px] tabular-nums text-right">
        <span className="sunmi-text-muted">{money(antes)}</span>
        {cambia ? (
          <>
            <span className="sunmi-text-muted"> → </span>
            <span className="font-semibold sunmi-text-strong">{money(despues)}</span>
          </>
        ) : (
          <span className="text-[10.5px] sunmi-text-muted"> · sin cambio</span>
        )}
      </span>
    </div>
  );
}

export function Alertas({ alertas = [] }) {
  if (!alertas.length) return null;
  return (
    <div className="space-y-1">
      {alertas.map((a) => (
        <div
          key={a.tipo}
          className="flex items-start gap-1.5 sunmi-surface-soft rounded px-2 py-1"
        >
          <AlertTriangle size={13} className="sunmi-text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[11px] sunmi-text-warning leading-snug">{a.texto}</div>
            {a.detalle && <div className="text-[10.5px] sunmi-text-muted">{a.detalle}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FilaRevision({
  fila,
  seleccion,
  onVincular,
  onExcluir,
  onIncluir,
  trabajando,
}) {
  const [abierta, setAbierta] = useState(false);
  const erp = fila.erp;
  const excluida = fila.excluidaManual === true;

  const codigosBarra = erp
    ? [erp.codigoBarra, erp.codigoBarraSecundario, erp.codigoBarraPropio].filter(Boolean)
    : [];

  return (
    <SunmiCard
      className={`p-3 space-y-2.5 ${excluida ? "opacity-60" : ""} ${
        fila.tieneAlerta ? "sunmi-border-warning border" : ""
      }`}
    >
      {/* ── Encabezado: selección, macheo, estado ───────────────────────── */}
      <div className="flex items-start gap-2">
        {seleccion?.puede ? (
          <input
            type="checkbox"
            checked={seleccion.marcada === true}
            onChange={(e) => seleccion.onCambiar?.(fila, e.target.checked)}
            disabled={trabajando}
            aria-label={`Seleccionar la fila ${fila.filaExcel}`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
          />
        ) : (
          <input
            type="checkbox"
            checked={false}
            disabled
            aria-label={`La fila ${fila.filaExcel} no se puede aplicar`}
            title={seleccion?.motivo || "No se puede aplicar."}
            className="mt-1 h-4 w-4 shrink-0 opacity-30"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] sunmi-text-muted tabular-nums">fila {fila.filaExcel}</span>
            <EtiquetaMacheo fila={fila} />
            <BadgeEstado estado={fila.estado} />
            {excluida && (
              <span className="text-[10.5px] font-semibold sunmi-text-danger">excluida</span>
            )}
            {fila.diferenciaPct !== null && fila.diferenciaPct !== undefined && (
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  Number(fila.diferenciaPct) > 0 ? "sunmi-text-danger" : "sunmi-text-success"
                }`}
              >
                {porcentaje(fila.diferenciaPct, { conSigno: true })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Los dos lados ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {/* ARCHIVO */}
        <div className="sunmi-surface-soft rounded-lg p-2.5 space-y-1">
          <div className="text-[10px] font-bold tracking-wide sunmi-text-muted uppercase">
            Archivo del proveedor
          </div>
          <div className="text-[12.5px] font-semibold sunmi-text-strong break-words">
            {fila.descripcionProveedor}
          </div>
          <D etiqueta="Código" mono>{fila.codigoCrudo}</D>
          <D etiqueta="Unidad">{fila.unidadProveedor}</D>
          <D etiqueta="UxBU" mono>{fila.unidadesPorBulto ?? "—"}</D>
          <D etiqueta="Precio c/IVA" mono>{money(fila.precioConIva)}</D>
          <D etiqueta={`Recargo ${porcentaje(fila.recargoPct)}`} mono>
            {money(fila.montoRecargo)}
          </D>
          <D etiqueta="Costo propuesto" mono fuerte>{money(fila.costoMaestroPropuesto)}</D>
        </div>

        {/* ERP */}
        <div className="sunmi-surface-soft rounded-lg p-2.5 space-y-1">
          <div className="text-[10px] font-bold tracking-wide sunmi-text-muted uppercase">
            Producto en el ERP
          </div>
          {erp ? (
            <>
              <div className="text-[12.5px] font-semibold sunmi-text-strong break-words">
                {erp.nombre}
              </div>
              <D etiqueta="Código Arcor" mono>
                {erp.codigosArcor.length ? erp.codigosArcor.join(" / ") : "sin código"}
              </D>
              <D etiqueta="Código de barras" mono>
                {codigosBarra.length ? codigosBarra.join(" / ") : "—"}
              </D>
              <D etiqueta="Presentación">{erp.presentacion}</D>
              <D etiqueta="Factor de bulto" mono>{erp.factorPack ?? "—"}</D>
              <Cambio etiqueta="Costo" antes={erp.costoActual} despues={fila.costoNuevo} />
              <Cambio
                etiqueta="Venta"
                antes={erp.ventaActual}
                despues={fila.ventaNuevaProyectada}
                cambia={fila.ventaSeRecalcula}
              />
            </>
          ) : (
            <div className="text-[12px] sunmi-text-muted py-2">
              Sin producto vinculado.
              {fila.sugerenciaProductoBaseId && (
                <div className="text-[11px] mt-1">Hay una sugerencia para revisar.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Comparación de códigos y alertas ────────────────────────────── */}
      {erp && (
        <div className="text-[11px] sunmi-text-muted tabular-nums">
          Código: archivo <span className="sunmi-text-strong">{fila.codigoCrudo}</span> · ERP{" "}
          <span className="sunmi-text-strong">
            {erp.codigosArcor.length ? erp.codigosArcor.join(" / ") : "—"}
          </span>
        </div>
      )}

      <Alertas alertas={fila.alertas} />
      <Motivo motivo={fila.motivo} />

      {/* ── Acciones ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {onVincular && (
          <SunmiButton
            color="slate"
            onClick={() => onVincular(fila)}
            disabled={trabajando}
            className="py-1.5 px-2.5 !text-[11px] inline-flex items-center gap-1"
          >
            <Link2 size={12} aria-hidden="true" />
            {fila.productoBaseId ? "Vincular a otro" : "Vincular"}
          </SunmiButton>
        )}
        {excluida ? (
          <SunmiButton
            color="slate"
            onClick={() => onIncluir?.(fila)}
            disabled={trabajando}
            className="py-1.5 px-2.5 !text-[11px] inline-flex items-center gap-1"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Volver a incluir
          </SunmiButton>
        ) : (
          <SunmiButton
            color="slate"
            onClick={() => onExcluir?.(fila)}
            disabled={trabajando}
            className="py-1.5 px-2.5 !text-[11px] inline-flex items-center gap-1"
          >
            <Ban size={12} aria-hidden="true" />
            Excluir
          </SunmiButton>
        )}
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          className="py-1.5 px-2.5 text-[11px] sunmi-text-accent inline-flex items-center gap-1"
          aria-expanded={abierta}
        >
          {abierta ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          {abierta ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {/* ── Detalle ─────────────────────────────────────────────────────── */}
      {abierta && (
        <div className="sunmi-border border rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <D etiqueta="Hoja del archivo">{fila.hojaNombre}</D>
          <D etiqueta="Código normalizado" mono>{fila.codigoNormalizado}</D>
          <D etiqueta="Categoría del archivo">{fila.categoriaCruda ?? "—"}</D>
          <D etiqueta="Precio s/IVA" mono>{money(fila.precioSinIva)}</D>
          <D etiqueta="Precio con recargo" mono>{money(fila.precioConRecargo)}</D>
          <D etiqueta="Costo unitario calculado" mono>{money(fila.costoUnitarioCalculado)}</D>
          <D etiqueta="Factor usado al conciliar" mono>{fila.factorErp ?? "—"}</D>
          <D etiqueta="Diferencia" mono>{money(fila.diferencia)}</D>
          <D etiqueta="Código de barras del archivo" mono>{fila.codigoBarraProveedor ?? "—"}</D>
          {erp && <D etiqueta="Margen configurado">{erp.margen === null ? "sin margen" : porcentaje(erp.margen)}</D>}
          {erp && <D etiqueta="Redondeo a 100">{erp.redondeo100 ? "sí" : "no"}</D>}
          {fila.vinculadoEn && <D etiqueta="Vinculada a mano">{fila.origenVinculo}</D>}
        </div>
      )}
    </SunmiCard>
  );
}
