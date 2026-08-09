"use client";

// LA VISTA DE PRODUCTOS DEL ERP, en el área principal.
//
// ── POR QUÉ NO ES UNA CAJA DENTRO DEL ENCABEZADO ────────────────────────────
//
// Porque estos productos no son consulta: son trabajo. Un producto que Arcor no
// informó puede necesitar que le revises el costo; uno sin código de Arcor
// necesita que se lo cargues para que la próxima lista lo reconozca. Meterlos en
// una lista de lectura adentro del encabezado los convierte en un dato, y lo que
// hacen falta son acciones.
//
// Así que ocupa el mismo lugar que la grilla, con su título y su vuelta atrás.
//
// ── QUÉ NO OFRECE ───────────────────────────────────────────────────────────
//
// Confirmar ni aplicar. Estos productos no tienen precio nuevo en esta lista:
// ofrecer una acción de precio sería prometer algo que no se puede cumplir.

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Tag } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { money } from "@/lib/proveedores/listas/presentacion";
import { TITULO_SITUACION, AYUDA_SITUACION } from "@/lib/proveedores/listas/detalleSistema";

const fecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/**
 * La ficha del producto.
 *
 * Es la MISMA ruta que usa el módulo de productos desde su propio listado
 * (`?editar=id`), y no `/productos/editar/[id]`: esa segunda ruta existe pero
 * no llega a montar el formulario sin el contexto del listado, así que abrirla
 * desde acá dejaba al usuario en una página vacía.
 *
 * En este ERP ver y editar son la misma pantalla, por eso hay un solo botón
 * para las dos cosas en vez de dos que hacen lo mismo.
 */
const rutaFicha = (id) => `/modulos/productos?editar=${id}`;
/** La misma ficha, anclada en la sección de códigos del proveedor. */
const rutaCodigos = (id) => `/modulos/productos?editar=${id}#codigos-proveedor`;

const MOTIVO = {
  AUSENTES: "Arcor no informó este producto en esta lista.",
  SIN_CODIGO:
    "Sin código interno de Arcor. No puede reconocerse automáticamente por código en futuras listas.",
};

function Acciones({ item, situacion, compacto }) {
  const clase = compacto ? "py-1.5 px-2.5 !text-[11px]" : "py-1 px-2 !text-[10.5px]";
  const sinCodigo = !item.codigosProveedor?.length;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compacto ? "" : "justify-end"}`}>
      <SunmiButton
        color="slate"
        onClick={() => window.open(rutaFicha(item.id), "_blank", "noopener")}
        className={`${clase} inline-flex items-center gap-1`}
      >
        <ExternalLink size={11} aria-hidden="true" />
        Abrir ficha
      </SunmiButton>
      {(sinCodigo || situacion === "SIN_CODIGO") && (
        <SunmiButton
          color="cyan"
          onClick={() => window.open(rutaCodigos(item.id), "_blank", "noopener")}
          className={`${clase} inline-flex items-center gap-1`}
        >
          <Tag size={11} aria-hidden="true" />
          Agregar código Arcor
        </SunmiButton>
      )}
      {!sinCodigo && situacion !== "SIN_CODIGO" && (
        <SunmiButton
          color="slate"
          onClick={() => window.open(rutaCodigos(item.id), "_blank", "noopener")}
          className={clase}
        >
          Corregir código
        </SunmiButton>
      )}
    </div>
  );
}

export default function VistaProductosSistema({ importacionId, situacion, onVolver }) {
  const [page, setPage] = useState(1);
  const [respuesta, setRespuesta] = useState(null);

  const clave = `${situacion}|${page}`;
  const cargando = respuesta?.clave !== clave;
  const datos = respuesta?.clave === clave && respuesta.ok ? respuesta : null;
  const error = respuesta?.clave === clave && !respuesta.ok ? respuesta.error : "";

  useEffect(() => {
    let vivo = true;
    fetch(`/api/proveedores/listas/${importacionId}/sistema?situacion=${situacion}&page=${page}`, {
      credentials: "include",
    })
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
    <div data-vista-productos={situacion} className="space-y-2">
      {/* ── Título y vuelta ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold sunmi-text-strong">
            {TITULO_SITUACION[situacion]}
            {pag ? <span className="sunmi-text-muted font-normal"> · {pag.total} productos</span> : null}
          </h2>
          <p className="text-[11px] sunmi-text-muted leading-tight">{AYUDA_SITUACION[situacion]}</p>
        </div>
        <SunmiButton
          color="slate"
          onClick={onVolver}
          className="py-1.5 px-3 !text-[11.5px] inline-flex items-center gap-1 shrink-0"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Volver a la conciliación
        </SunmiButton>
      </div>

      {cargando && <p className="text-[12px] sunmi-text-muted py-3">Cargando…</p>}
      {error && <p className="text-[12px] sunmi-text-danger py-3">{error}</p>}

      {!cargando && !error && (
        <>
          {/* ── DESKTOP: tabla ──────────────────────────────────────────── */}
          <div className="hidden lg:block overflow-x-auto sunmi-border border rounded-lg">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sunmi-surface-soft">
                <tr className="sunmi-text-muted text-left">
                  <th className="font-medium px-1.5 py-1.5">Producto ERP</th>
                  <th className="font-medium px-1.5 py-1.5">Código Arcor guardado</th>
                  {situacion === "SIN_CODIGO" && (
                    <th className="font-medium px-1.5 py-1.5">Proveedores</th>
                  )}
                  <th className="font-medium px-1.5 py-1.5 text-right">Costo actual</th>
                  <th className="font-medium px-1.5 py-1.5">Últ. cambio</th>
                  <th className="font-medium px-1.5 py-1.5">Motivo</th>
                  <th className="font-medium px-1.5 py-1.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} data-producto={item.id} className="border-t sunmi-border align-middle">
                    <td className="px-1.5 py-1.5 max-w-[20rem]">
                      <div className="truncate sunmi-text-strong font-medium" title={item.nombre}>
                        {item.nombre}
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5 tabular-nums">
                      {item.codigosProveedor?.length ? (
                        <span className="sunmi-text-strong">{item.codigosProveedor.join(" / ")}</span>
                      ) : (
                        <span className="text-[10px] sunmi-text-warning">Sin código Arcor</span>
                      )}
                    </td>
                    {situacion === "SIN_CODIGO" && (
                      <td className="px-1.5 py-1.5 sunmi-text-muted truncate max-w-[12rem]">
                        {item.proveedores?.length ? item.proveedores.join(", ") : "—"}
                      </td>
                    )}
                    <td className="px-1.5 py-1.5 text-right tabular-nums sunmi-text-strong whitespace-nowrap">
                      {money(item.costoActual)}
                    </td>
                    <td className="px-1.5 py-1.5 tabular-nums sunmi-text-muted whitespace-nowrap">
                      {fecha(item.actualizadoEn)}
                    </td>
                    <td className="px-1.5 py-1.5 sunmi-text-muted max-w-[18rem]">
                      <span className="line-clamp-2">{MOTIVO[situacion]}</span>
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Acciones item={item} situacion={situacion} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── MÓVIL: tarjetas tocables ────────────────────────────────── */}
          <div className="lg:hidden space-y-1.5">
            {items.map((item) => (
              <div key={item.id} data-producto={item.id} className="sunmi-border border rounded-lg p-2 space-y-1.5">
                <div>
                  <div className="text-[12px] font-semibold sunmi-text-strong leading-tight break-words">
                    {item.nombre}
                  </div>
                  <div className="text-[10px] sunmi-text-muted tabular-nums">
                    {item.codigosProveedor?.length ? (
                      <>Arcor {item.codigosProveedor.join(" / ")}</>
                    ) : (
                      <span className="sunmi-text-warning">Sin código Arcor</span>
                    )}
                    {" · "}
                    {money(item.costoActual)} · últ. cambio {fecha(item.actualizadoEn)}
                    {situacion === "SIN_CODIGO" && item.proveedores?.length
                      ? ` · ${item.proveedores.join(", ")}`
                      : ""}
                  </div>
                </div>
                <div className="text-[10.5px] sunmi-text-muted leading-tight">{MOTIVO[situacion]}</div>
                <Acciones item={item} situacion={situacion} compacto />
              </div>
            ))}
          </div>

          {items.length === 0 && (
            <div className="sunmi-border border rounded-lg p-6 text-center text-[12px] sunmi-text-muted">
              No hay productos en esta situación.
            </div>
          )}
        </>
      )}

      {pag && pag.paginas > 1 && (
        <div className="flex items-center justify-between gap-2">
          <SunmiButton
            color="slate"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || cargando}
            className="py-1 px-2 !text-[11px]"
          >
            Anterior
          </SunmiButton>
          <span className="text-[11px] sunmi-text-muted tabular-nums">
            Página {pag.page} de {pag.paginas} · {pag.total} productos
          </span>
          <SunmiButton
            color="slate"
            onClick={() => setPage((p) => Math.min(pag.paginas, p + 1))}
            disabled={page >= pag.paginas || cargando}
            className="py-1 px-2 !text-[11px]"
          >
            Siguiente
          </SunmiButton>
        </div>
      )}
    </div>
  );
}
