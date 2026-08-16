"use client";

// Piezas visuales compartidas por las tres pantallas de listas de proveedor.
//
// Todo el color sale de tokens semánticos del sistema de temas. Ninguna clase de
// color literal: el ERP tiene ocho temas y un `text-red-500` que se lee en uno
// puede ser ilegible en otro.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import {
  presentarEstado,
  textoDeMotivo,
  textoDeCoincidencia,
  money,
  moneyConSigno,
  porcentaje,
  tonoDiferencia,
} from "@/lib/proveedores/listas/presentacion";

/**
 * El estado de una fila.
 *
 * Lleva SÍMBOLO además de color. Ocho estados distinguidos solo por color son
 * ocho estados indistinguibles para quien no distingue colores.
 */
export function BadgeEstado({ estado, className = "" }) {
  const p = presentarEstado(estado);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[10.5px] font-semibold leading-none ${p.tono} ${className}`}
      title={p.detalle}
    >
      <span aria-hidden="true">{p.simbolo}</span>
      {p.etiqueta}
    </span>
  );
}

/** Aviso de variación alta. Advierte, no bloquea. */
export function AvisoVariacion({ diferenciaPct }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold sunmi-text-warning">
      <span aria-hidden="true">△</span>
      Variación alta {porcentaje(diferenciaPct, { conSigno: true })}
    </span>
  );
}

/**
 * El motivo por el que una fila no se aplicó.
 *
 * Se muestra SIEMPRE que exista. Esconderlo deja al usuario sin lo único que
 * puede hacer con esa fila, que es corregir el dato que falta.
 */
export function Motivo({ motivo }) {
  if (!motivo) return null;
  return (
    <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">{textoDeMotivo(motivo)}</p>
  );
}

/**
 * Sugerencia por código de barras.
 *
 * Se muestra como lo que es: una pista sin confirmar. La fila sigue figurando
 * como no vinculada y no hay ningún botón para aceptarla todavía.
 */
export function Sugerencia({ fila }) {
  if (!fila?.sugerenciaProductoBaseId) return null;
  return (
    <div className="mt-1 px-2 py-1 rounded-md sunmi-surface-soft sunmi-border border text-[11px] leading-snug">
      <span className="font-semibold sunmi-text-accent">Posible coincidencia por código de barras</span>
      <span className="sunmi-text-muted">
        {" "}— producto #{fila.sugerenciaProductoBaseId}
        {fila.sugerenciaCodigoBarra ? ` · ${fila.sugerenciaCodigoBarra}` : ""}
      </span>
      <p className="sunmi-text-muted mt-0.5">
        Es solo una sugerencia: hay que confirmar el vínculo antes de poder aplicarla.
      </p>
    </div>
  );
}

/** Una métrica del resumen. */
export function Metrica({ etiqueta, valor, tono = "sunmi-text-strong" }) {
  return (
    <div className="sunmi-surface-soft sunmi-border border rounded-lg px-2.5 py-2 min-w-0">
      <div className="text-[10.5px] sunmi-text-muted leading-tight truncate">{etiqueta}</div>
      <div className={`text-base font-bold tabular-nums leading-tight ${tono}`}>{valor}</div>
    </div>
  );
}

/** La grilla de métricas de una importación. */
export function ResumenMetricas({ metricas = [] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
      {metricas.map((m) => (
        <Metrica key={m.clave} etiqueta={m.etiqueta} valor={m.valor} tono={m.tono} />
      ))}
    </div>
  );
}

/** Un dato con su etiqueta, para las cabeceras. */
export function Dato({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10.5px] sunmi-text-muted leading-tight">{label}</div>
      <div className="text-[12.5px] sunmi-text-strong leading-snug break-words">{children ?? "—"}</div>
    </div>
  );
}

/** Estado vacío, con un mensaje que dice qué hacer. */
export function Vacio({ titulo, detalle, accion = null }) {
  return (
    <SunmiCard className="p-6 text-center space-y-2">
      <p className="text-sm font-semibold sunmi-text-strong">{titulo}</p>
      {detalle && <p className="text-[12px] sunmi-text-muted">{detalle}</p>}
      {accion}
    </SunmiCard>
  );
}

/** Error recuperable: dice qué pasó y ofrece reintentar. */
export function ErrorRecuperable({ mensaje, onReintentar }) {
  return (
    <SunmiCard className="p-6 text-center space-y-3">
      <p className="text-sm sunmi-text-danger">{mensaje}</p>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="sunmi-btn-base sunmi-btn-slate px-4 py-2 !text-xs"
        >
          Reintentar
        </button>
      )}
    </SunmiCard>
  );
}

/** Paginación real: no carga todo y lo pagina en memoria. */
export function Paginacion({ page, paginas, total, onPage, cargando = false }) {
  if (!paginas || paginas <= 1) {
    return (
      <p className="text-[11px] sunmi-text-muted text-center py-2">
        {total ?? 0} {total === 1 ? "registro" : "registros"}
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={cargando || page <= 1}
        className="sunmi-btn-base sunmi-btn-slate px-3 py-1.5 !text-xs disabled:opacity-40"
      >
        Anterior
      </button>
      <span className="text-[11px] sunmi-text-muted tabular-nums">
        Página {page} de {paginas} · {total} registros
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={cargando || page >= paginas}
        className="sunmi-btn-base sunmi-btn-slate px-3 py-1.5 !text-xs disabled:opacity-40"
      >
        Siguiente
      </button>
    </div>
  );
}

// ── Una fila de conciliación ────────────────────────────────────────────────

/**
 * La fila en ESCRITORIO.
 *
 * Ocho columnas, no veinte. Lo secundario —unidad, armado, precio del proveedor,
 * motivo, sugerencia— va en una segunda línea dentro de la celda que le
 * corresponde, en vez de estirar la tabla hasta obligar a scrollear de costado.
 */
/**
 * Casilla de selección de una fila.
 *
 * Cuando la fila NO se puede seleccionar no se dibuja un checkbox deshabilitado
 * sin más: se pone el motivo en el `title`. Un cuadrito gris sin explicación
 * deja al usuario probando clicks sin entender por qué no pasa nada.
 */
export function CasillaFila({ seleccion, fila }) {
  if (!seleccion) return null;
  const { puede, marcada, motivo, onCambiar } = seleccion;
  return (
    <input
      type="checkbox"
      checked={puede ? marcada === true : false}
      disabled={!puede}
      onChange={(e) => onCambiar?.(fila, e.target.checked)}
      aria-label={
        puede
          ? `Seleccionar la fila ${fila.filaExcel} para aplicar`
          : `La fila ${fila.filaExcel} no se puede aplicar`
      }
      title={puede ? "" : motivo || "No se puede aplicar."}
      className="mt-0.5 h-4 w-4 accent-current cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

/** Lo que pasó con la fila al aplicar. Solo aparece después de una corrida. */
export function ResultadoFila({ fila }) {
  if (!fila?.resultadoAplicacion) return null;
  const aplicada = fila.resultadoAplicacion === "APLICADA";
  return (
    <div className="mt-1 space-y-0.5">
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          aplicada ? "sunmi-text-success" : "sunmi-text-warning"
        }`}
      >
        {aplicada ? "Aplicada" : "Omitida"}
      </span>
      {!aplicada && fila.motivoAplicacion && (
        <div className="text-[10px] sunmi-text-muted leading-snug">{fila.textoMotivoAplicacion}</div>
      )}
      {aplicada && (
        <div className="text-[10px] tabular-nums sunmi-text-muted">
          {money(fila.costoPrevioAplicacion)} → {money(fila.costoAplicado)}
          {fila.ventaNueva !== null && fila.ventaNueva !== undefined && (
            <> · venta {money(fila.ventaAnterior)} → {money(fila.ventaNueva)}</>
          )}
        </div>
      )}
    </div>
  );
}

export function FilaTabla({ fila, onVincular = null, seleccion = null }) {
  return (
    <tr className="sunmi-border border-b align-top">
      <td className="px-2 py-2">
        <CasillaFila seleccion={seleccion} fila={fila} />
      </td>
      <td className="px-2 py-2 text-[11px] tabular-nums sunmi-text-muted">{fila.filaExcel}</td>
      <td className="px-2 py-2">
        <div className="text-[12px] font-semibold sunmi-text-strong break-all">{fila.codigoCrudo}</div>
        <div className="text-[10.5px] sunmi-text-muted">
          {fila.unidadProveedor}
          {fila.unidadesPorBulto ? ` · UxBU ${fila.unidadesPorBulto}` : ""}
          {fila.factorErp ? ` · factor ERP ${fila.factorErp}` : ""}
        </div>
      </td>
      <td className="px-2 py-2 max-w-[22ch]">
        <div className="text-[12px] sunmi-text-strong break-words">{fila.descripcionProveedor}</div>
        {fila.categoriaCruda && (
          <div className="text-[10px] sunmi-text-muted truncate" title={fila.categoriaCruda}>
            {fila.categoriaCruda}
          </div>
        )}
      </td>
      <td className="px-2 py-2 max-w-[24ch]">
        {fila.productoBase ? (
          <>
            <div className="text-[12px] sunmi-text-strong break-words">{fila.productoBase.nombre}</div>
            <div className="text-[10.5px] sunmi-text-muted">{textoDeCoincidencia(fila.tipoCoincidencia)}</div>
          </>
        ) : (
          <>
            <div className="text-[12px] sunmi-text-muted">Sin producto</div>
            <Sugerencia fila={fila} />
          </>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        <div className="text-[12px] tabular-nums sunmi-text-muted">{money(fila.precioConIva)}</div>
        <div className="text-[10.5px] tabular-nums sunmi-text-muted">
          +{porcentaje(fila.recargoPct)} → {money(fila.precioConRecargo)}
        </div>
      </td>
      <td className="px-2 py-2 text-right text-[12px] tabular-nums sunmi-text-muted">
        {money(fila.costoAnterior)}
      </td>
      <td className="px-2 py-2 text-right text-[12px] tabular-nums font-semibold sunmi-text-strong">
        {money(fila.costoMaestroPropuesto)}
      </td>
      <td className="px-2 py-2 text-right">
        <div className={`text-[12px] tabular-nums font-semibold ${tonoDiferencia(fila.diferencia)}`}>
          {moneyConSigno(fila.diferencia)}
        </div>
        <div className="text-[10.5px] tabular-nums sunmi-text-muted">
          {porcentaje(fila.diferenciaPct, { conSigno: true })}
        </div>
      </td>
      <td className="px-2 py-2">
        <BadgeEstado estado={fila.estado} />
        {fila.variacionAlta && (
          <div className="mt-0.5">
            <AvisoVariacion diferenciaPct={fila.diferenciaPct} />
          </div>
        )}
        <Motivo motivo={fila.motivo} />
        <ResultadoFila fila={fila} />
        {onVincular && (
          <button
            type="button"
            onClick={() => onVincular(fila)}
            className="mt-1 sunmi-btn-base sunmi-btn-cyan px-2 py-1 !text-[10.5px]"
          >
            {fila.sugerenciaProductoBaseId ? "Vincular sugerido" : "Vincular"}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * La fila en MÓVIL.
 *
 * Card completa, sin tabla de costado. Muestra todo lo que la tabla muestra:
 * esconder el motivo o el producto en móvil dejaría la pantalla inservible justo
 * donde más se usa.
 */
export function FilaCard({ fila, onVincular = null, seleccion = null }) {
  return (
    <SunmiCard className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <CasillaFila seleccion={seleccion} fila={fila} />
          <div className="min-w-0">
          <div className="text-[13px] font-semibold sunmi-text-strong break-words">
            {fila.descripcionProveedor}
          </div>
          <div className="text-[11px] sunmi-text-muted break-all">
            {fila.codigoCrudo} · fila {fila.filaExcel}
          </div>
          </div>
        </div>
        <BadgeEstado estado={fila.estado} className="shrink-0" />
      </div>

      <div className="text-[11.5px] sunmi-text-muted">
        {fila.productoBase ? (
          <>
            <span className="sunmi-text-strong">{fila.productoBase.nombre}</span>
            <span> · {textoDeCoincidencia(fila.tipoCoincidencia)}</span>
          </>
        ) : (
          <span>Sin producto vinculado</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
        <div className="flex justify-between gap-2">
          <span className="sunmi-text-muted">Costo actual</span>
          <span className="tabular-nums sunmi-text-strong">{money(fila.costoAnterior)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="sunmi-text-muted">Propuesto</span>
          <span className="tabular-nums font-semibold sunmi-text-strong">
            {money(fila.costoMaestroPropuesto)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="sunmi-text-muted">Diferencia</span>
          <span className={`tabular-nums font-semibold ${tonoDiferencia(fila.diferencia)}`}>
            {moneyConSigno(fila.diferencia)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="sunmi-text-muted">Variación</span>
          <span className="tabular-nums sunmi-text-muted">
            {porcentaje(fila.diferenciaPct, { conSigno: true })}
          </span>
        </div>
      </div>

      <div className="text-[11px] sunmi-text-muted">
        Proveedor: {money(fila.precioConIva)} +{porcentaje(fila.recargoPct)} ={" "}
        {money(fila.precioConRecargo)} · {fila.unidadProveedor}
        {fila.unidadesPorBulto ? ` · UxBU ${fila.unidadesPorBulto}` : ""}
        {fila.factorErp ? ` · factor ERP ${fila.factorErp}` : ""}
      </div>

      {fila.variacionAlta && <AvisoVariacion diferenciaPct={fila.diferenciaPct} />}
      <Motivo motivo={fila.motivo} />
      <ResultadoFila fila={fila} />
      {!fila.productoBase && <Sugerencia fila={fila} />}

      {onVincular && (
        <SunmiButton
          color="cyan"
          onClick={() => onVincular(fila)}
          className="w-full py-2 text-xs"
        >
          {fila.sugerenciaProductoBaseId ? "Vincular sugerido" : "Vincular producto"}
        </SunmiButton>
      )}
    </SunmiCard>
  );
}
