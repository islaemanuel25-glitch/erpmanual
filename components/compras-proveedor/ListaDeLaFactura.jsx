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
  /** Qué líneas marcó la persona como controladas. `{ pedidoDetalleId: true }` */
  revisadas = {},
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

  // ── QUÉ SE PIERDE CON ESTE PAPEL, EN UNA LÍNEA ────────────────────────
  //
  // Un comprobante SIN_TOTAL se concilia igual, pero hay algo que no se pudo
  // hacer y quien controla tiene que saberlo antes de empezar: no hubo total
  // impreso contra el cual verificar la lectura. Va en una línea y no en un
  // párrafo, porque es un dato y no una explicación.
  const avisoDelComprobante =
    comprobante?.estado === "SIN_TOTAL"
      ? "Sin total impreso: controlá el papel renglón por renglón."
      : comprobante?.estado === "CARGADO"
        ? "Lectura verificada contra el total del papel."
        : comprobante?.estado || "—";

  // ── EL CONTADOR CUENTA LO MISMO QUE MUESTRAN LAS TARJETAS ──────────────
  //
  // Cuenta REVISADAS: las que la persona marcó. Antes contaba las que el
  // cálculo decía que coincidían, mientras las tarjetas se ponían en verde por
  // otra cosa — y la pantalla se contradecía sola, con tarjetas en "Coincide"
  // y el contador diciendo "0 / 15 sin diferencias · 15 para revisar".
  //
  // Un número de arriba que no es el que se ve abajo es peor que no tenerlo:
  // obliga a decidir a cuál de los dos creerle.
  const yaRevisada = (f) => !!revisadas?.[f?.pedidoDetalleId];
  const resumen = useMemo(
    () => ({
      revisadas: (filas || []).filter(yaRevisada).length,
      pendientes: (filas || []).filter((f) => !yaRevisada(f)).length,
    }),
    [filas, revisadas]
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
              {comprobante?.identidad || `Factura #${comprobante?.id}`}
            </span>
            <SunmiPill color={comprobante?.estado === "SIN_TOTAL" ? "amber" : "slate"}>
              {comprobante?.estado === "SIN_TOTAL" ? "Sin total" : "Leída"}
            </SunmiPill>
          </div>

          {/* El estado del papel en criollo, que es lo que hay que saber antes
              de empezar a controlar. */}
          <p className="text-sm2 sunmi-text-muted truncate">{avisoDelComprobante}</p>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">
                {resumen.revisadas} / {filas.length}
              </span>{" "}
              revisadas
            </span>
            <span
              className={`text-sm2 ${
                resumen.pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"
              }`}
            >
              {resumen.pendientes > 0
                ? `${resumen.pendientes} sin revisar`
                : "Todo revisado"}
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
              revisada={yaRevisada(f)}
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
