"use client";

// LA TABLA DE SUNMI.
//
// ── DOS MODOS, Y EL VIEJO NO SE TOCA ────────────────────────────────────────
//
// MODO CLÁSICO: `headers` + los `<tr>` como hijos. Es como funcionó siempre y
// es lo que usan las pantallas que ya existen. Ninguna cambia.
//
// MODO POR COLUMNAS: `columnas` + `filas`. La tabla arma las celdas ella misma
// y con eso puede hacer lo que antes cada pantalla resolvía a mano: alinear
// números a la derecha, ordenar por encabezado, teñir una fila según su estado,
// colgarle un detalle debajo, y mostrar el cargando y el vacío.
//
// El modo se elige solo: si viene `columnas`, manda el modo por columnas.
//
// Y el modo por columnas puede además cerrar la tabla con una FILA DE TOTALES,
// que es lo último que le faltaba para que las tablas que hoy la escriben a mano
// puedan migrar. Va en `pie`, en un `<tfoot>` de verdad, y sin `colSpan`.
//
// ── TODO LO NUEVO ENTRA APAGADO ─────────────────────────────────────────────
//
// Cada agregado tiene un default que reproduce el comportamiento actual:
// `densidad="normal"` da el mismo padding de siempre, `align` por defecto es
// izquierda, y sin `ordenable`, `tonoFila` ni `filaExpandible` no se dibuja
// nada extra. Es la misma regla con la que se sumó `stickyHeader` sin que se
// moviera una sola pantalla.
//
// ── LO QUE A PROPÓSITO NO ESTÁ ──────────────────────────────────────────────
//
// No hay prop `className`. Tres pantallas se lo pasan hoy y se ignora en
// silencio; implementarlo les cambiaría el aspecto solo por existir.
// `headers[].label` sigue aceptando cualquier nodo React: hay pantallas que
// meten ahí su propio control y romperlas no aporta nada.

import { Fragment } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { useSunmiTheme } from "./SunmiThemeProvider";
import SunmiTableRow from "./SunmiTableRow";
import SunmiTableEmpty from "./SunmiTableEmpty";
import { celdasDelPie } from "@/lib/sunmi/pieDeTabla";

/** El padding de cada densidad. "normal" es exactamente el de siempre. */
const DENSIDAD = {
  compacta: { th: "px-2 py-1", td: "px-2 py-1" },
  normal: { th: "px-2 py-1.5", td: "px-2 py-1.5" },
  comoda: { th: "px-3 py-2.5", td: "px-3 py-2.5" },
};

const ALINEACION = { izq: "text-left", der: "text-right", centro: "text-center" };

/**
 * El encabezado de una columna ordenable.
 *
 * La flecha dice tres cosas distintas: hacia arriba que se está ordenando
 * ascendente por acá, hacia abajo que descendente, y la doble apagada que esta
 * columna se puede ordenar pero no es la que manda. Sin ese tercer estado no se
 * sabe qué columnas son clickeables hasta probarlas.
 */
function TituloOrdenable({ columna, ordenClave, ordenDir, onSort }) {
  const activa = ordenClave === columna.clave;
  const siguiente = activa && ordenDir === "asc" ? "desc" : "asc";
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => onSort?.(columna.clave, siguiente)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSort?.(columna.clave, siguiente);
      }}
      aria-label={`Ordenar por ${columna.titulo}`}
      className="cursor-pointer select-none hover:text-[var(--pos-accent)] transition-colors"
    >
      {columna.titulo}
      {activa ? (
        ordenDir === "asc"
          ? <ArrowUp size={11} className="inline ml-0.5" />
          : <ArrowDown size={11} className="inline ml-0.5" />
      ) : (
        <ArrowUpDown size={11} className="inline ml-0.5 opacity-30" />
      )}
    </span>
  );
}

export default function SunmiTable({
  headers = [],
  children,
  // Header fijo: el contenedor se vuelve scrolleable (vertical + horizontal) con
  // altura máxima y el thead queda sticky. Default off → no afecta a otras tablas.
  stickyHeader = false,
  maxHeightClass = "max-h-[70dvh]",
  scrollId,

  // ── Modo por columnas. Todo opcional. ────────────────────────────────────
  /** [{ clave, titulo, align, render, ordenable, thClassName, tdClassName, title }] */
  columnas,
  filas,
  claveFila,
  densidad = "normal",
  cargando = false,
  vacio,
  onSort,
  ordenClave,
  ordenDir,
  /** (fila) => "ok" | "alerta" | "atencion" | "apagado" | null */
  tonoFila,
  /** (fila) => ReactNode | null. Devolver null es "esta fila no está abierta". */
  filaExpandible,
  onClickFila,
  filaSeleccionada,
  /**
   * La fila de totales al pie: `{ etiqueta, valores, alineacion }`.
   *
   * `valores` dice qué número va en qué columna, POR LA CLAVE DE LA COLUMNA, y
   * el span de la etiqueta se calcula solo. Nunca se pasa un `colSpan`: el
   * porqué está en `lib/sunmi/pieDeTabla.js`, y en una frase es que hoy ese
   * número se escribe a mano y nada avisa cuando deja de seguir a las columnas.
   *
   * Sin `pie` no se dibuja nada, como todo lo nuevo de este archivo.
   */
  pie,
}) {
  const { theme } = useSunmiTheme();
  const theadBase = theme.table?.headerClass || "sunmi-thead";
  const d = DENSIDAD[densidad] ?? DENSIDAD.normal;

  // `columnas` declara los ENCABEZADOS. Quién dibuja el CUERPO lo decide
  // `filas`: con filas lo dibuja la tabla, sin filas siguen mandando los hijos.
  //
  // Esa separación es la que permite migrar de a poco. Una pantalla con una
  // columna de acciones complicada puede declarar sus columnas —y con eso
  // ganar el ordenamiento y la alineación— sin tener que reescribir sus celdas
  // el mismo día.
  const porColumnas = Array.isArray(columnas) && columnas.length > 0;
  const cuerpoPropio = porColumnas && Array.isArray(filas);

  // Los encabezados. En modo clásico se respeta la firma vieja al pie de la
  // letra, incluido que `label` pueda ser JSX.
  const encabezados = porColumnas
    ? columnas.map((c) => ({
        label: c.ordenable ? (
          <TituloOrdenable columna={c} ordenClave={ordenClave} ordenDir={ordenDir} onSort={onSort} />
        ) : (
          c.titulo
        ),
        className: `${ALINEACION[c.align] ?? ALINEACION.izq} ${c.thClassName || ""}`.trim(),
      }))
    : headers;

  const columnasTotales = porColumnas ? columnas.length : headers.length || 50;

  const cuerpo = () => {
    if (!cuerpoPropio) return children;
    if (cargando) return <SunmiTableEmpty message="Cargando…" colSpan={columnasTotales} />;
    if (!filas || filas.length === 0) {
      return vacio !== undefined && typeof vacio !== "string" ? (
        <tr>
          <td colSpan={columnasTotales} className="text-center py-3 sunmi-text-muted text-[12px] italic">
            {vacio}
          </td>
        </tr>
      ) : (
        <SunmiTableEmpty message={vacio ?? undefined} colSpan={columnasTotales} />
      );
    }

    return filas.map((fila, i) => {
      const clave = claveFila ? claveFila(fila, i) : (fila?.id ?? i);
      const detalle = filaExpandible ? filaExpandible(fila) : null;
      return (
        <Fragment key={clave}>
          <SunmiTableRow
            tono={tonoFila ? tonoFila(fila) : null}
            selected={filaSeleccionada ? filaSeleccionada(fila) : false}
            onClick={onClickFila ? () => onClickFila(fila) : undefined}
          >
            {columnas.map((c) => (
              <td
                key={c.clave}
                className={`${d.td} ${ALINEACION[c.align] ?? ALINEACION.izq} ${c.tdClassName || ""}`.trim()}
                title={c.title ? c.title(fila) : undefined}
              >
                {c.render ? c.render(fila) : (fila?.[c.clave] ?? "—")}
              </td>
            ))}
          </SunmiTableRow>

          {/* El detalle cuelga de la fila y ocupa el ancho entero. Que la
              pantalla devuelva null es lo que dice "esta fila está cerrada":
              así el estado de apertura vive donde vive el dato, no acá. */}
          {detalle ? (
            <tr>
              <td colSpan={columnasTotales} className="p-0">
                {detalle}
              </td>
            </tr>
          ) : null}
        </Fragment>
      );
    });
  };

  // EL PIE VA EN UN `<tfoot>` DE VERDAD.
  //
  // No es adorno: el navegador lo mantiene abajo del cuerpo pase lo que pase, y
  // los lectores de pantalla lo anuncian como el resumen de la tabla y no como
  // una fila más de datos. Dos de las tres filas de totales que existen hoy son
  // el último `<tr>` del cuerpo, así que se leen como un producto más llamado
  // "TOTAL ESTIMADO".
  //
  // Solo en modo por columnas: en el clásico la tabla no sabe cuáles son las
  // columnas, que es justamente lo que hace falta para calcular el span.
  const pieDibujado = () => {
    if (!cuerpoPropio || !pie) return null;
    const { span, celdas } = celdasDelPie(columnas, pie.valores);
    return (
      <tfoot>
        <tr className="border-t sunmi-divider">
          {span > 0 ? (
            <td
              colSpan={span}
              className={`${d.td} ${ALINEACION[pie.alineacion] ?? ALINEACION.der} font-semibold sunmi-text-strong`}
            >
              {pie.etiqueta}
            </td>
          ) : null}
          {celdas.map((c) => (
            <td key={c.clave} className={`${d.td} ${ALINEACION[c.align] ?? ALINEACION.izq}`.trim()}>
              {c.valor}
            </td>
          ))}
        </tr>
      </tfoot>
    );
  };

  return (
    <div
      id={scrollId}
      className={stickyHeader ? `overflow-auto ${maxHeightClass}` : "overflow-x-auto"}
    >
      <table
        className="
          w-full
          text-[12px]
          table-auto
        "
      >
        {/* ===== HEADER ===== */}
        {encabezados.length > 0 && (
          <thead className={stickyHeader ? `${theadBase} sticky top-0 z-20` : theadBase}>
            <tr>
              {encabezados.map((h, i) => {
                const label = typeof h === "string" ? h : h.label;
                const extra = typeof h === "string" ? "" : (h.className || "");
                // `text-left` va primero para que un `text-right` de la columna
                // lo pise; si fuera al revés ninguna alineación funcionaría.
                return (
                  <th
                    key={i}
                    className={`${d.th} text-left font-semibold whitespace-nowrap ${extra}`}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}

        {/* ===== BODY ===== */}
        <tbody
          className="divide-y sunmi-divide"
        >
          {cuerpo()}
        </tbody>
        {pieDibujado()}
      </table>
    </div>
  );
}

