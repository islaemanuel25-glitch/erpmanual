"use client";

// LAS LÍNEAS DE LA FACTURA, EN EL ORDEN DEL PAPEL.
//
// ── EL ORDEN LO MANDA LA FACTURA Y NO EL PEDIDO ───────────────────────────
//
// El renglón 1 del papel es el primero de la pantalla. Parece un detalle y es
// lo que hace usable la pantalla: se controla con la factura en la mano, y si
// la pantalla ordena por otra cosa —el pedido, el nombre, el código— hay que
// buscar cada renglón en vez de bajar con el dedo.
//
// Las líneas ya llegan en ese orden: `ComprobanteLinea` se guarda en el orden
// en que el lector las transcribió, y la conciliación no las reordena. Acá no
// se ordena nada, y eso es deliberado — hay un candado en transferencias que
// dice lo mismo sobre su lista.
//
// ── LOS CUATRO FILTROS SON LA PIEZA DEL KIT ───────────────────────────────
//
// `SunmiFiltroEstado`, la misma de la recepción de una transferencia y la del
// pedido. Lo que cambia son las opciones, que salen de
// `estadoDeLineaFacturada` y se calculan sobre las mismas filas que después se
// muestran: el número del filtro y lo que el filtro muestra no pueden separarse.

import { useMemo, useState } from "react";

import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiPill from "@/components/sunmi/SunmiPill";
import TarjetaLineaFactura from "./TarjetaLineaFactura";
import { formatearMoneda } from "@/lib/moneda";
import {
  FILTRO,
  opcionesDeFiltro,
  pasaFiltro,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

export default function ListaDeLaFactura({
  comprobante,
  filas = [],
  onCorregir,
  onCoincide,
  /** La acción del pie. Se llama así y no `pie` porque `pie={` ya es el pie de
   *  `SunmiTabla`, con otro contrato y su propio candado: dos props con el
   *  mismo nombre y distinto significado es cómo un candado empieza a mirar el
   *  archivo equivocado. */
  accionDelPie = null,
}) {
  const [filtro, setFiltro] = useState(FILTRO.TODOS);

  const opciones = useMemo(() => opcionesDeFiltro(filas), [filas]);
  const visibles = useMemo(
    () => (filas || []).filter((f) => pasaFiltro(f, filtro)),
    [filas, filtro]
  );

  const total = useMemo(
    () => (filas || []).reduce((acc, f) => acc + (Number(f?.subtotal) || 0), 0),
    [filas]
  );

  // Los dos números del encabezado salen de los MISMOS predicados que los
  // filtros: el que dice cuántas hay para revisar y el filtro que las muestra
  // no pueden separarse.
  const resumen = useMemo(
    () => ({
      coinciden: (filas || []).filter((f) => pasaFiltro(f, FILTRO.COINCIDEN)).length,
      revisar: (filas || []).filter((f) => !pasaFiltro(f, FILTRO.COINCIDEN)).length,
    }),
    [filas]
  );

  // ── LO MISMO QUE DIBUJA LA RECEPCIÓN DE UNA TRANSFERENCIA ─────────────
  //
  // Mismas ranuras de `SunmiPantallaDeTrabajo` y en el mismo orden: dónde
  // estoy, filtrar, la lista. El armado —gutter, separación entre bloques,
  // contenedor de la lista y pie— lo pone la pieza, que salió de allá.
  //
  // No hay buscador ni desplegable de categoría: una factura tiene los
  // renglones que tiene y se controla con el papel al lado, así que buscar
  // entre ellos es resolver un problema que no existe. Las ranuras que no se
  // usan van vacías y la pieza no les reserva separación.
  return (
    <SunmiPantallaDeTrabajo
      contexto={
        <>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold sunmi-text-strong truncate">
              Factura {comprobante?.numero ? `#${comprobante.numero}` : `#${comprobante?.id}`}
            </span>
            <SunmiPill color={resumen.revisar > 0 ? "amber" : "slate"}>
              {comprobante?.estado === "CARGADO" ? "Leída" : comprobante?.estado || "—"}
            </SunmiPill>
          </div>

          <p className="text-sm2 sunmi-text-muted truncate">
            {comprobante?.proveedorNombre || "—"}
          </p>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">
                {resumen.coinciden} / {filas.length}
              </span>{" "}
              sin diferencias
            </span>
            <span
              className={`text-sm2 ${
                resumen.revisar > 0 ? "sunmi-text-accent" : "sunmi-text-success"
              }`}
            >
              {resumen.revisar > 0
                ? `${resumen.revisar} ${resumen.revisar === 1 ? "para revisar" : "para revisar"}`
                : "Sin diferencias"}
            </span>
          </div>
        </>
      }
      filtros={
        <SunmiFiltroEstado
          opciones={opciones}
          valor={filtro}
          onCambiar={setFiltro}
          ariaLabel="Filtrar líneas de la factura"
        />
      }
      lista={
        <>
          {visibles.length === 0 && (
            <p className="text-center py-6 sunmi-text-muted text-sm2">
              No hay líneas que coincidan con este filtro.
            </p>
          )}
          {visibles.map((f) => (
            <TarjetaLineaFactura
              key={f.lineaId}
              fila={f}
              onCorregir={onCorregir}
              onCoincide={onCoincide}
            />
          ))}
        </>
      }
      pieDePantalla={
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm2 sunmi-text-muted">Total de la factura</span>
            <span className="block tabular-nums text-lg2 font-semibold sunmi-text-strong">
              {formatearMoneda(total)}
            </span>
          </span>
          {accionDelPie}
        </div>
      }
    />
  );
}
