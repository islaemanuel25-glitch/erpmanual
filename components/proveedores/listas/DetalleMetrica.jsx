"use client";

// EL DETALLE DE UNA MÉTRICA, POR PRODUCTO DEL ERP.
//
// ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
//
// Un número sin detrás no sirve para trabajar. "7 pendientes" no dice cuáles ni
// por qué, y "279 actualizados" no dice de cuánto a cuánto fue cada uno. Acá se
// entra al número y se ve exactamente qué productos lo componen.
//
// ── POR QUÉ UNA LÍNEA POR PRODUCTO ──────────────────────────────────────────
//
// Porque la métrica cuenta productos. Cuando dos filas del Excel tocaron el
// mismo producto, se muestra el producto UNA vez y las dos filas cuelgan debajo:
// si no, la lista de "279 actualizados" tendría 281 renglones y el número de
// arriba parecería un error.

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { money } from "@/lib/proveedores/listas/presentacion";
import { analizarFila } from "@/lib/proveedores/listas/confirmarPresentacion";
import { TONO_ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";
import {
  TITULO_SITUACION,
  AYUDA_SITUACION,
  TEXTO_MOTIVO_PENDIENTE,
  TONO_MOTIVO_PENDIENTE,
  TEXTO_ACCION,
  ACCION,
  motivoDePendiente,
  resumenDeActualizado,
} from "@/lib/proveedores/listas/detalleSistema";

const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`);
const fecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/** El código del proveedor guardado, o el aviso de que no hay. */
function CodigoArcor({ codigos }) {
  if (!codigos?.length) {
    return <span className="text-[10px] sunmi-text-warning">Sin código Arcor</span>;
  }
  return <span className="tabular-nums sunmi-text-strong">{codigos.join(" / ")}</span>;
}

/** Las filas del Excel que tocaron este producto. Nunca reemplazan al producto:
 *  cuelgan debajo, para que el conteo de arriba siga siendo de productos. */
function FilasDelArchivo({ filas, mostrarCosto }) {
  if (!filas?.length) return null;
  return (
    <div className="pl-3 border-l-2 sunmi-border space-y-0.5">
      {filas.map((f) => (
        <div key={f.id} className="text-[10px] sunmi-text-muted leading-tight">
          <span className="tabular-nums sunmi-text-strong">Fila {f.filaExcel}</span> ·{" "}
          {f.descripcionProveedor} · cód. {f.codigoCrudo ?? "—"} · {f.unidadProveedor}
          {mostrarCosto && f.costoAplicado !== null ? ` · aplicó ${money(f.costoAplicado)}` : ""}
        </div>
      ))}
    </div>
  );
}

function ItemActualizado({ item }) {
  const r = resumenDeActualizado(item.filas);
  return (
    <div className="py-1.5 space-y-1">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold sunmi-text-strong break-words">{item.nombre}</div>
          <div className="text-[10px] sunmi-text-muted">
            <CodigoArcor codigos={item.codigosArcor} />
          </div>
        </div>
        <div className="text-[11px] tabular-nums text-right shrink-0">
          <div className="sunmi-text-strong">
            {money(r?.costoAnterior)} <span className="sunmi-text-muted">→</span>{" "}
            <span className="font-bold">{money(r?.costoAplicado)}</span>
          </div>
          <div className="text-[10px] sunmi-text-muted">
            {pct(r?.variacionPct)} · aplicado {fecha(r?.aplicadaEn)}
          </div>
        </div>
      </div>
      {r?.variasFilas && (
        <div className="text-[10px] sunmi-text-warning inline-flex items-center gap-1">
          <AlertTriangle size={11} aria-hidden="true" />
          Lo actualizaron {r.cantidadFilas} filas del archivo. El costo final es el de la última.
        </div>
      )}
      <FilasDelArchivo filas={item.filas} mostrarCosto />
    </div>
  );
}

function ItemPendiente({ item, rango, onAccion }) {
  // La fila principal es la primera que no está aplicada: es la que define el
  // motivo. Las demás se muestran igual, debajo.
  const principal = item.filas.find((f) => !f.aplicada) ?? item.filas[0] ?? null;
  const base = {
    unidad_medida: item.unidadMedida,
    factor_pack: item.factorPack,
    modoCompraProveedor: item.modoCompraProveedor,
    precio_costo: item.costoActual,
  };
  const analisis =
    principal && principal.estado === "FACTOR_DUDOSO" && item.factorPack !== undefined
      ? analizarFila({ fila: principal, base, recargoPct: principal.recargoPct, rango })
      : null;
  const { motivo, acciones } = motivoDePendiente({ fila: principal, analisis });
  const elegida = analisis?.evaluadas?.find((h) => h.clave === analisis.recomendada) ?? null;

  return (
    <div className="py-1.5 space-y-1">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold sunmi-text-strong break-words">{item.nombre}</div>
          <div className="text-[10px] sunmi-text-muted">
            <CodigoArcor codigos={item.codigosArcor} /> · costo actual {money(item.costoActual)}
          </div>
        </div>
        <div className="text-[11px] tabular-nums text-right shrink-0">
          {elegida ? (
            <>
              <div className="sunmi-text-strong">
                propuesto <span className="font-bold">{money(elegida.costoNuevo)}</span>
              </div>
              <div className={`text-[10px] ${TONO_ESTADO_VARIACION[elegida.estado]}`}>
                {pct(elegida.variacionPct)}
              </div>
            </>
          ) : (
            <span className="text-[10px] sunmi-text-muted">sin costo propuesto</span>
          )}
        </div>
      </div>

      <div className={`text-[10.5px] ${TONO_MOTIVO_PENDIENTE[motivo]}`}>
        {TEXTO_MOTIVO_PENDIENTE[motivo]}
      </div>

      <FilasDelArchivo filas={item.filas} />

      {acciones.length > 0 && principal && (
        <div className="flex flex-wrap gap-1.5">
          {acciones.map((a) => (
            <SunmiButton
              key={a}
              color={a === ACCION.CAMBIAR ? "slate" : "cyan"}
              onClick={() => onAccion?.(a, principal, item)}
              className="py-1 px-2 !text-[10.5px]"
            >
              {TEXTO_ACCION[a]}
            </SunmiButton>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemAusente({ item }) {
  return (
    <div className="py-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold sunmi-text-strong break-words">{item.nombre}</div>
          <div className="text-[10px] sunmi-text-muted">
            <CodigoArcor codigos={item.codigosArcor} />
          </div>
        </div>
        <div className="text-[11px] tabular-nums text-right shrink-0 sunmi-text-strong">
          {money(item.costoActual)}
          <div className="text-[10px] sunmi-text-muted">últ. cambio {fecha(item.actualizadoEn)}</div>
        </div>
      </div>
      <div className="text-[10.5px] sunmi-text-muted">
        Arcor no informó este producto en esta lista.
      </div>
    </div>
  );
}

function ItemSinCodigo({ item }) {
  return (
    <div className="py-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold sunmi-text-strong break-words">{item.nombre}</div>
          <div className="text-[10px] sunmi-text-muted">
            Proveedores: {item.proveedores?.length ? item.proveedores.join(", ") : "—"}
          </div>
        </div>
        <div className="text-[11px] tabular-nums text-right shrink-0 sunmi-text-strong">
          {money(item.costoActual)}
        </div>
      </div>
      <div className="text-[10.5px] sunmi-text-warning">
        Sin código interno de Arcor. No puede reconocerse automáticamente por código en futuras
        listas.
      </div>
    </div>
  );
}

export default function DetalleMetrica({ importacionId, situacion, onCerrar, onAccion }) {
  const [page, setPage] = useState(1);
  // Se guarda la respuesta CON la clave de su pedido. Así "cargando" se deduce
  // —lo que hay no corresponde a lo que se está pidiendo— en vez de ser otro
  // estado que hay que encender y apagar a mano dentro del efecto.
  const [respuesta, setRespuesta] = useState(null);

  const clave = `${situacion}|${page}`;
  const cargando = respuesta?.clave !== clave;
  const datos = respuesta?.clave === clave && respuesta.ok ? respuesta : null;
  const error = respuesta?.clave === clave && !respuesta.ok ? respuesta.error : "";

  useEffect(() => {
    let vivo = true;
    fetch(
      `/api/proveedores/listas/${importacionId}/sistema?situacion=${situacion}&page=${page}`,
      { credentials: "include" }
    )
      .then((r) => r.json())
      .then((j) => vivo && setRespuesta({ ...j, clave }))
      .catch(() => vivo && setRespuesta({ ok: false, error: "Error de conexión.", clave }));
    return () => {
      vivo = false;
    };
  }, [importacionId, situacion, page, clave]);

  const items = datos?.items ?? [];
  const pag = datos?.paginacion;

  return (
    <div
      data-panel="detalle-metrica"
      data-situacion={situacion}
      className="sunmi-surface-soft sunmi-border border rounded-lg p-2.5 space-y-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-bold sunmi-text-strong">
            {TITULO_SITUACION[situacion]}
            {pag ? <span className="sunmi-text-muted font-normal"> · {pag.total} productos</span> : null}
          </h3>
          <p className="text-[10.5px] sunmi-text-muted leading-tight">{AYUDA_SITUACION[situacion]}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el detalle" className="shrink-0 sunmi-text-muted">
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {cargando && <p className="text-[11px] sunmi-text-muted py-2">Cargando…</p>}
      {error && <p className="text-[11px] sunmi-text-danger py-2">{error}</p>}

      {!cargando && !error && (
        <div className="divide-y sunmi-border max-h-[26rem] overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} data-producto={item.id}>
              {situacion === "ACTUALIZADOS" && <ItemActualizado item={item} />}
              {situacion === "PENDIENTES" && (
                <ItemPendiente item={item} rango={datos.rango} onAccion={onAccion} />
              )}
              {situacion === "AUSENTES" && <ItemAusente item={item} />}
              {situacion === "SIN_CODIGO" && <ItemSinCodigo item={item} />}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-[11px] sunmi-text-muted py-3 text-center">No hay productos en esta situación.</p>
          )}
        </div>
      )}

      {pag && pag.paginas > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <SunmiButton
            color="slate"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || cargando}
            className="py-1 px-2 !text-[10.5px]"
          >
            Anterior
          </SunmiButton>
          <span className="text-[10.5px] sunmi-text-muted tabular-nums">
            Página {pag.page} de {pag.paginas} · {pag.total} productos
          </span>
          <SunmiButton
            color="slate"
            onClick={() => setPage((p) => Math.min(pag.paginas, p + 1))}
            disabled={page >= pag.paginas || cargando}
            className="py-1 px-2 !text-[10.5px]"
          >
            Siguiente
          </SunmiButton>
        </div>
      )}
    </div>
  );
}
