"use client";

import { useRef } from "react";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";
// El pie de paginación se mudó acá: `useState`, `SunmiButton`, `SunmiInput` y
// `SunmiPageSizer` se usaban SOLO para él, así que se fueron con la pieza.
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";

// Las cuatro reglas de las flechas viven en el dominio y se ejercen sin
// navegador. Acá queda el cableado: quién tiene el foco y qué se desplaza.
import {
  esTeclaDeNavegacion,
  esControlQueUsaLasFlechas,
  indiceDeLaSeleccion,
  siguienteSeleccion,
} from "@/lib/productos/navegacionPorFilas";

import { Pencil, Trash2, Warehouse, Eye, Power, PowerOff } from "lucide-react";

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
}) {
  // ── EL CURSOR DE LA TABLA ────────────────────────────────────────────────
  //
  // La fila que ya se teñía al tocarla pasa a ser también el cursor de las
  // flechas. No hay color nuevo ni marca nueva: es el MISMO `selectedProductId`
  // y el mismo tono. Lo único que se agrega es de dónde puede venir el cambio.
  const contenedorRef = useRef(null);
  const idsDeLasFilas = rows.map((r) => r.id);

  /**
   * Tocar una fila la selecciona y DEJA EL FOCO EN LA TABLA.
   *
   * Sin esto el foco se queda donde estuviera —el buscador, o el `<body>`— y la
   * primera flecha después del clic no llega hasta acá: el usuario tocaría una
   * fila, apretaría abajo y no pasaría nada.
   *
   * `preventScroll` porque enfocar desplaza al elemento enfocado por defecto, y
   * el elemento enfocado es la tabla ENTERA: el navegador la traería a la vista
   * y la lista saltaría sola justo cuando el usuario acaba de elegir dónde
   * estaba mirando.
   */
  const seleccionarFila = (id) => {
    onSelectProducto?.(id);
    contenedorRef.current?.focus?.({ preventScroll: true });
  };

  /**
   * Las flechas mueven el cursor una fila, y nada más.
   *
   * Tres decisiones que no se leen solas:
   *
   * · **La tabla solo se queda con la tecla si TIENE cursor.** Sin selección la
   *   flecha es del navegador y la página se desplaza como siempre; robarla ahí
   *   dejaría una pantalla donde la flecha no hace nada y tampoco scrollea.
   * · **`preventDefault` va también en los bordes.** Es el caso que más se nota:
   *   en la última fila, sin esto, la flecha no mueve el cursor pero SÍ desplaza
   *   la página, así que la lista se va sola y el cursor queda atrás.
   * · **La fila se trae a la vista con `block: "nearest"`**, que no mueve nada si
   *   ya se ve entera. Recentrar en cada pulsación haría saltar la lista en
   *   veinte filas de las veinticinco.
   */
  const manejarTecla = (e) => {
    if (!esTeclaDeNavegacion(e.key)) return;
    // El buscador, los botones de acción de la fila y el salto de página del pie
    // necesitan las flechas para lo suyo.
    if (esControlQueUsaLasFlechas(e.target)) return;
    if (indiceDeLaSeleccion(idsDeLasFilas, selectedProductId) < 0) return;

    e.preventDefault();

    const destino = siguienteSeleccion(idsDeLasFilas, selectedProductId, e.key);
    if (destino === null) return;

    onSelectProducto?.(destino);

    // La fila se busca por POSICIÓN dentro del cuerpo, que acá es exacta: esta
    // tabla dibuja un `<tr>` por elemento de `rows`, en el mismo orden y sin
    // filas de detalle intercaladas. No es el índice como identidad —eso sería
    // guardar "la fila 10" y volver a ella después de un filtro—: es el índice
    // de la lista que se está viendo en este mismo render.
    const indice = indiceDeLaSeleccion(idsDeLasFilas, destino);
    const filas = contenedorRef.current?.querySelectorAll?.("tbody [data-sunmi-row]");
    filas?.[indice]?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  };

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
    <div
      ref={contenedorRef}
      // ── POR QUÉ `-1` Y NO `0` ──────────────────────────────────────────────
      //
      // `-1` es "se puede enfocar por código pero no con Tab". Con `0` la tabla
      // entera se volvería una parada más del tabulador, delante de los botones
      // de cada fila: una pantalla que hoy se recorre con Tab pasaría a tener un
      // salto nuevo que nadie pidió. El foco lo da el clic en una fila, que es
      // como el pedido dice que arranca el cursor.
      //
      // `outline-none` porque el anillo de foco de un div que ocupa la tabla
      // entera es un borde nuevo alrededor de todo, y esta tanda no agrega
      // marcas visuales.
      tabIndex={-1}
      onKeyDown={manejarTecla}
      className="rounded-xl border sunmi-border overflow-hidden focus:outline-none"
    >
      <SunmiTable
        columnas={columnasTabla}
        ordenClave={sortKey}
        ordenDir={sortDir}
        onSort={(clave) => onSort?.(clave)}
        stickyHeader
        // ── UN SOLO SCROLL VERTICAL EN LA PANTALLA: EL DE LA PÁGINA ──────────
        //
        // La tabla crece con sus 25 filas y el `<main>` del layout se queda con
        // todo el desplazamiento vertical. El envoltorio sigue existiendo —y
        // sigue llamándose `productos-scroll`— porque conserva el horizontal:
        // medido a 1366, las columnas se pasan 203 px del ancho disponible.
        //
        // Lo que se pierde está escrito en la prop: el encabezado deja de quedar
        // fijo, y no hay forma de conservarlo sin que el desplazamiento lateral
        // se lo lleve la página entera junto con el buscador y los filtros.
        altoLibre
        scrollId="productos-scroll"
      >
        {rows.length === 0 ? (
          <SunmiTableEmpty message="No hay productos disponibles" colSpan={colSpan} />
        ) : (
          rows.map((row) => {
            const isSelected =
              selectedProductId != null && row.id === selectedProductId;
            return (
            <SunmiTableRow
              key={row.id}
              onClick={onSelectProducto ? () => seleccionarFila(row.id) : undefined}
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
