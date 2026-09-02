"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";
// El pie de paginación se mudó acá: `useState`, `SunmiButton`, `SunmiInput` y
// `SunmiPageSizer` se usaban SOLO para él, así que se fueron con la pieza.
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";

import { Pencil, Trash2, Warehouse, Eye, Power, PowerOff } from "lucide-react";

import {
  claveDeAncla,
  identidadDeFila,
  TEXTO_ULTIMO_EDITADO,
} from "@/lib/productos/estadoDeRetorno";

/** En qué columna se dibuja la marca de "Último editado". */
const COLUMNA_DE_LA_MARCA = "nombre";

// Campos que se pueden ordenar desde el backend
const SORTABLE_KEYS = [
  "nombre", "codigoBarra", "precioCosto", "precioVenta",
  "margen", "categoriaId", "proveedorId", "activo",
];

export default function SunmiTablaProductos({
  rows,
  columns,
  page,
  pageSize = 25,
  totalPages,
  totalItems = 0,
  onNext,
  onPrev,
  onGoToPage,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSort,
  onEditar,
  onEliminar,
  onSubirDeposito,
  onEditarCombo,
  onVerComposicion,
  onToggleEstadoCombo,
  localId,
  esDeposito,
  catalogos,
  selectedProductId = null,
  onSelectProducto,
  // La identidad del último producto editado —`{ tipo, id }`— o `null`. La marca
  // visual y `aria-current` salen de acá, y NO de `selectedProductId`: aquél es
  // la fila que alguien tocó, que es otra cosa y sigue funcionando igual.
  ultimoEditado = null,
}) {
  const CAT = Object.fromEntries(
    (catalogos?.CATEGORIAS ?? []).map((c) => [String(c.id), c.nombre])
  );
  const PROV = Object.fromEntries(
    (catalogos?.PROVEEDORES ?? []).map((p) => [String(p.id), p.nombre])
  );
  const AREA = Object.fromEntries(
    (catalogos?.AREAS ?? []).map((a) => [String(a.id), a.nombre])
  );

  const money = (v) => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (isNaN(n)) return "-";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(n);
  };

  const DEFINICIONES = {
    imagenUrl: {
      titulo: "Img",
      thClass: "w-[56px]",
      render: (_, row) =>
        row.imagenUrl ? (
          <img
            src={row.imagenUrl}
            className="w-12 h-12 rounded-md object-cover border sunmi-border"
            alt=""
          />
        ) : (
          <div className="w-12 h-12 sunmi-control border sunmi-border rounded-md flex items-center justify-center text-xs sunmi-text-muted">
            -
          </div>
        ),
    },

    codigoBarra: { titulo: "Código", thClass: "w-[140px]", tdClass: "truncate overflow-hidden sunmi-text-muted", titleKey: "codigoBarra" },
    codigoInterno: { titulo: "Cód. interno", thClass: "w-[120px]", tdClass: "truncate overflow-hidden sunmi-text-muted", titleKey: "codigoInterno" },
    sku: { titulo: "SKU", thClass: "w-[90px]" },
    nombre: {
      titulo: "Nombre",
      thClass: "min-w-[220px]",
      tdClass: "whitespace-normal leading-tight",
      titleKey: "nombre",
      render: (v, row) => (
        <span>
          {v}
          {row.esCombo && (
            <span className="ml-1.5 inline-block px-1.5 py-[2px] text-[9px] font-bold uppercase rounded sunmi-badge-accent leading-none align-middle">
              Combo
            </span>
          )}
          {row.modoCompraProveedor === "UNIDAD" && (
            <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-red-600 text-white leading-none align-middle">
              Fiambre
            </span>
          )}
        </span>
      ),
    },

    categoriaId: {
      titulo: "Categoría",
      thClass: "w-[100px]",
      render: (v) =>
        CAT[String(v)] ? (
          <SunmiPill color="amber">{CAT[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    proveedorId: {
      titulo: "Proveedor",
      thClass: "w-[100px]",
      render: (v) =>
        PROV[String(v)] ? (
          <SunmiPill color="cyan">{PROV[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    areaFisicaId: {
      titulo: "Área",
      thClass: "w-[100px]",
      render: (v) =>
        AREA[String(v)] ? (
          <SunmiPill color="slate">{AREA[String(v)]}</SunmiPill>
        ) : (
          "-"
        ),
    },

    unidadMedida: {
      titulo: "Unidad",
      thClass: "w-[80px]",
      render: (v) => <SunmiPill color="amber">{v}</SunmiPill>,
    },

    factorPack: { titulo: "Pack", thClass: "w-[56px]", tdClass: "text-center" },
    pesoKg: { titulo: "Peso", thClass: "w-[56px]", tdClass: "text-center" },
    volumenMl: { titulo: "Vol", thClass: "w-[56px]", tdClass: "text-center" },

    precioCosto: {
      titulo: "Costo",
      thClass: "w-[90px]",
      tdClass: "text-right",
      render: money,
    },

    margen: {
      titulo: "Margen",
      thClass: "w-[70px]",
      tdClass: "text-right",
      render: (v) => (v != null ? `${Number(v).toFixed(1)}%` : "-"),
    },

    precioVenta: {
      titulo: "Venta",
      thClass: "w-[90px]",
      tdClass: "text-right",
      render: money,
    },

    ivaPorcentaje: {
      titulo: "IVA %",
      thClass: "w-[80px]",
      render: (v) => (v != null ? `${v}%` : "-"),
    },

    fechaVencimiento: {
      titulo: "Vencimiento",
      thClass: "w-[100px]",
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "-"),
    },

    esCombo: {
      titulo: "Combo",
      thClass: "w-[70px]",
      render: (v) =>
        v ? (
          <SunmiPill color="cyan">Sí</SunmiPill>
        ) : (
          <SunmiPill color="slate">No</SunmiPill>
        ),
    },

    activo: {
      titulo: "Estado",
      thClass: "w-[90px]",
      // Combo ACTIVO pero estructuralmente roto → "No disponible" (con motivo en el
      // tooltip). En cualquier otro caso, el badge Activo/Inactivo estándar.
      render: (v, row) =>
        row?.esCombo && row?.noDisponible ? (
          <span
            title={row.motivoNoDisponible || "Composición inválida"}
            className="px-1.5 py-[1px] rounded-md text-[10.5px] font-semibold leading-none sunmi-badge-danger"
          >
            No disponible
          </span>
        ) : (
          <SunmiBadgeEstado value={v} />
        ),
    },
  };

  const columnas = columns
    .map((c) => {
      if (!DEFINICIONES[c.key]) return null;
      return {
        key: c.key,
        titulo: DEFINICIONES[c.key].titulo,
        thClass: DEFINICIONES[c.key].thClass,
        tdClass: DEFINICIONES[c.key].tdClass,
        titleKey: DEFINICIONES[c.key].titleKey,
        render: DEFINICIONES[c.key].render,
      };
    })
    .filter(Boolean);

  // El ordenamiento ya no se contrabandea dentro de `headers[].label`: se
  // declara. `ordenable` le dice a SunmiTable que dibuje el control y avise por
  // `onSort`; la flecha, el estado activo y el hover los pone la tabla.
  //
  // `onSort` sigue recibiendo la clave como primer argumento, que es lo único
  // que mira la pantalla de productos: la dirección la decide ella al alternar.
  const columnasTabla = [
    ...columnas.map((c) => ({
      clave: c.key,
      titulo: c.titulo,
      ordenable: SORTABLE_KEYS.includes(c.key),
      thClassName: c.thClass || "",
    })),
    { clave: "__acciones", titulo: "Acciones", thClassName: "w-[80px]" },
  ];
  const colSpan = columnasTabla.length;

  return (
    <div className="rounded-xl border sunmi-border overflow-hidden">
      <SunmiTable
        columnas={columnasTabla}
        ordenClave={sortKey}
        ordenDir={sortDir}
        onSort={(clave) => onSort?.(clave)}
        stickyHeader
        scrollId="productos-scroll"
      >
        {rows.length === 0 ? (
          <SunmiTableEmpty message="No hay productos disponibles" colSpan={colSpan} />
        ) : (
          rows.map((row) => {
            const isSelected =
              selectedProductId != null && row.id === selectedProductId;
            // ── LA IDENTIDAD SALE DEL DOMINIO, NO DE `row.id` ────────────────
            //
            // `row.id` es `ProductoBase.id` también para un combo, y un combo se
            // identifica por su `ProductoLocal.id`. Usarlo acá haría que volver
            // de editar un combo marcara el producto que tenga ese número.
            const ancla = claveDeAncla(identidadDeFila(row));
            const esUltimoEditado =
              ancla !== null && ultimoEditado !== null && ancla === claveDeAncla(ultimoEditado);
            return (
            <SunmiTableRow
              key={row.id}
              ancla={ancla ?? undefined}
              destacada={esUltimoEditado}
              onClick={onSelectProducto ? () => onSelectProducto(row.id) : undefined}
              // El tinte de la fila elegida sale del acento del theme y el hover
              // se compone encima. Antes era `!bg-amber-400/30`: un color fijo
              // fuera del sistema de themes y un `!important` que además le
              // apagaba el hover a la fila seleccionada.
              tono={isSelected ? "atencion" : null}
              intensidad="fuerte"
              className="transition-colors"
            >
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 text-[12px] ${c.tdClass || "whitespace-nowrap"}`}
                  title={c.titleKey ? String(row[c.titleKey] ?? "") : undefined}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "-"}
                  {/* ── LA MARCA VA AL LADO DEL NOMBRE, Y NO EN OTRA COLUMNA ──
                      Una columna nueva correría las once que ya hay y le
                      cambiaría el ancho a la tabla entera. Al lado del nombre
                      entra en la caja de línea que la celda ya reserva: la
                      píldora mide menos que el renglón de 12 px, así que la fila
                      no crece. Hay un candado que compara el alto con y sin. */}
                  {esUltimoEditado && c.key === COLUMNA_DE_LA_MARCA && (
                    <span className="ml-1.5 align-middle">
                      <SunmiPill color="amber">{TEXTO_ULTIMO_EDITADO}</SunmiPill>
                    </span>
                  )}
                </td>
              ))}

              <td className="px-3 py-1.5 w-[80px] text-right flex gap-1 justify-end">
                {row.esCombo ? (
                  <>
                    {/* Combo: solo editar combo + ver composición. Sin stock,
                        límites, transferencia, compra ni promoción. */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onVerComposicion) onVerComposicion(row);
                      }}
                      className="w-[26px] h-[26px] flex items-center justify-center rounded-md sunmi-btn-secondary transition cursor-pointer"
                      type="button"
                      aria-label="Ver composición"
                      title="Ver composición"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onEditarCombo && row.localProductoId) onEditarCombo(row.localProductoId);
                      }}
                      className="w-[26px] h-[26px] flex items-center justify-center rounded-md sunmi-btn-secondary transition cursor-pointer"
                      type="button"
                      aria-label="Editar combo"
                      title="Editar combo"
                    >
                      <Pencil size={14} />
                    </button>
                    {/* Acción rápida: Activar (si está inactivo) / Desactivar (si está activo). */}
                    {onToggleEstadoCombo && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleEstadoCombo(row);
                        }}
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-md sunmi-btn-secondary transition cursor-pointer"
                        type="button"
                        aria-label={row.activo ? "Desactivar combo" : "Activar combo"}
                        title={row.activo ? "Desactivar combo" : "Activar combo"}
                      >
                        {row.activo ? <PowerOff size={14} /> : <Power size={14} />}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {/* Regla A: "subir al depósito" solo para un producto propio del
                        local (no desde el depósito, no sobre productos del depósito). */}
                    {onSubirDeposito && !esDeposito && row.creadoEnLocalId &&
                      Number(row.creadoEnLocalId) === Number(localId) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSubirDeposito(row.id);
                        }}
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-md sunmi-btn-secondary transition cursor-pointer"
                        type="button"
                        aria-label="Subir al depósito"
                        title="Subir al catálogo del depósito"
                      >
                        <Warehouse size={14} />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onEditar && row.id) onEditar(row.id);
                      }}
                      className="w-[26px] h-[26px] flex items-center justify-center rounded-md sunmi-btn-secondary transition cursor-pointer"
                      type="button"
                      aria-label="Editar"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEliminar(row.id);
                      }}
                      className="w-[26px] h-[26px] flex items-center justify-center rounded-md sunmi-btn-red transition"
                      type="button"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </td>
            </SunmiTableRow>
            );
          })
        )}
      </SunmiTable>

      {/* El pie de paginación se fue a `SunmiPaginador`, sin cambiarle un nodo:
          la lista de tarjetas del catálogo necesitaba el mismo y no había
          ninguno. Comprobado que la tabla quedó idéntica midiendo la caja de los
          catorce nodos del bloque antes y después. */}
      <SunmiPaginador
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        totalItems={totalItems}
        onNext={onNext}
        onPrev={onPrev}
        onGoToPage={onGoToPage}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
