"use client";

// LA TABLA, DADA VUELTA: lista PRODUCTOS del proveedor, no filas del archivo.
//
// Cada fila es un producto del sistema y, al lado, lo que el archivo trajo para
// él —nada, una fila o varias—. Pagina desde el servidor con el endpoint del
// catálogo.
//
// ── COLUMNAS: ENTRAR A LO ANCHO SIN ACHICAR LA LETRA ────────────────────────
//
// Son seis y no más. La regla al agregar una es sacar otra: achicar la
// tipografía para que entre una columna más deja una tabla que entra y no se
// lee, que es peor que una tabla con menos datos. Lo que no entra vive en el
// panel, a un clic.
//
// El código del proveedor y la descripción del archivo NO son columnas: se
// muestran debajo del nombre del producto cuando existen, que es donde tienen
// sentido —al lado de a qué producto corresponden—.

import { useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import SunmiTable from "@/components/sunmi/SunmiTable";
import { money, fechaHora } from "@/lib/proveedores/listas/presentacion";
import { GRUPO_PRODUCTO, TEXTO_GRUPO, TONO_GRUPO } from "@/lib/proveedores/listas/gruposProducto";

const pct = (n) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)} %`;

/** Qué pasó con este producto, en dos palabras. */
function estadoDe(p) {
  const aplicada = p.filas?.find((f) => f.aplicada);
  if (aplicada) {
    const de = aplicada.costoAnterior ?? null;
    const a = aplicada.costoAplicado ?? null;
    const v = de && a ? ((a - de) / de) * 100 : null;
    return { texto: money(a), detalle: `desde ${money(de)} · ${pct(v)}` };
  }
  const conPropuesta = p.filas?.find((f) => f.costoMaestroPropuesto !== null);
  if (conPropuesta) {
    return { texto: money(conPropuesta.costoMaestroPropuesto), detalle: "propuesto" };
  }
  return { texto: "—", detalle: null };
}

export default function TablaCatalogo({
  productos = [],
  cargando = false,
  abierta,
  onAbrir,
  renderPanel,
}) {
  const columnas = useMemo(
    () => [
      {
        clave: "abrir",
        titulo: "",
        thClassName: "w-6",
        render: (p) => (
          <ChevronRight
            size={12}
            aria-hidden="true"
            className={`transition-transform ${abierta === p.id ? "rotate-90 sunmi-text-accent" : "sunmi-text-muted"}`}
          />
        ),
      },
      {
        clave: "producto",
        titulo: "Producto",
        render: (p) => (
          <>
            <div className="truncate max-w-[9rem] md:max-w-[22rem] sunmi-text-strong font-medium" title={p.nombre}>
              {p.nombre}
            </div>
            {/* Lo del archivo va acá abajo y no en una columna propia: solo tiene
                sentido al lado de a qué producto corresponde. */}
            {p.filas?.[0]?.descripcionProveedor ? (
              <div className="text-[9.5px] sunmi-text-muted truncate max-w-[9rem] md:max-w-[22rem]">
                {p.filas[0].descripcionProveedor}
                {p.filas.length > 1 ? ` · ${p.filas.length} filas` : ""}
              </div>
            ) : null}
          </>
        ),
      },
      {
        clave: "codigo",
        titulo: "Código",
        // En el Sunmi no entra: 360 px no dan para cinco columnas de datos. Se
        // saca la columna, no se achica la letra — el código sigue estando en el
        // panel, a un toque.
        thClassName: "hidden md:table-cell",
        tdClassName: "tabular-nums hidden md:table-cell",
        render: (p) => {
          const activos = (p.codigosProveedor ?? []).filter((c) => c.activo);
          const bajas = (p.codigosProveedor ?? []).filter((c) => !c.activo);
          return (
            <>
              <div className="sunmi-text-strong">
                {activos.length ? activos.map((c) => c.codigo).join(" / ") : "—"}
              </div>
              {bajas.length ? (
                <div className="text-[9.5px] sunmi-text-muted">
                  {bajas.map((c) => c.codigo).join(" / ")} dado de baja
                </div>
              ) : null}
            </>
          );
        },
      },
      {
        clave: "costoActual",
        titulo: "Costo actual",
        align: "der",
        tdClassName: "tabular-nums",
        render: (p) => (
          <>
            <div>{money(p.costoActual)}</div>
            <div className="text-[9.5px] sunmi-text-muted">{fechaHora(p.actualizadoEn)}</div>
          </>
        ),
      },
      {
        clave: "resultado",
        titulo: "Costo nuevo",
        align: "der",
        tdClassName: "tabular-nums",
        render: (p) => {
          const e = estadoDe(p);
          return (
            <>
              <div className="font-semibold">{e.texto}</div>
              {e.detalle ? <div className="text-[9.5px] sunmi-text-muted">{e.detalle}</div> : null}
            </>
          );
        },
      },
      {
        clave: "situacion",
        titulo: "Situación",
        // Redundante en pantalla chica: se está mirando un filtro por situación.
        thClassName: "hidden md:table-cell",
        tdClassName: "hidden md:table-cell",
        render: (p) => (
          <span className={`text-[10px] ${TONO_GRUPO[p.grupo] ?? "sunmi-text-muted"}`}>
            {TEXTO_GRUPO[p.grupo] ?? "—"}
          </span>
        ),
      },
    ],
    [abierta]
  );

  const alternar = useCallback((p) => onAbrir?.(abierta === p.id ? null : p.id), [abierta, onAbrir]);

  return (
    <div className="sunmi-border border rounded-lg overflow-hidden">
      <SunmiTable
        densidad="compacta"
        stickyHeader
        columnas={columnas}
        filas={productos}
        claveFila={(p) => p.id}
        cargando={cargando}
        vacio="No hay productos en esta situación."
        onClickFila={alternar}
        filaSeleccionada={(p) => abierta === p.id}
        tonoFila={(p) => (p.grupo === GRUPO_PRODUCTO.DISCONTINUADO ? "apagado" : null)}
        filaExpandible={(p) => (abierta === p.id ? renderPanel?.(p) : null)}
      />
    </div>
  );
}
