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
import TarjetaLineaFactura from "./TarjetaLineaFactura";
import TarjetaContextoDelPedido from "./TarjetaContextoDelPedido";
import {
  FILTRO,
  opcionesDeFiltro,
  pasaFiltro,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

export default function ListaDeLaFactura({
  comprobante,
  filas = [],
  onCorregir,
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

  return (
    <div className="flex flex-col gap-3">
      {/* La misma tarjeta de contexto que el resto de la pantalla, con lo que
          identifica al PAPEL: de quién es, qué número y cuánto suma. */}
      <TarjetaContextoDelPedido
        proveedorNombre={comprobante?.proveedorNombre || "Factura"}
        pedidoId={comprobante?.numero || comprobante?.id}
        cantItems={filas?.length || 0}
        totalEstimado={total}
        estado={comprobante?.estado === "CARGADO" ? "Leída" : comprobante?.estado}
      />

      <SunmiFiltroEstado
        opciones={opciones}
        valor={filtro}
        onCambiar={setFiltro}
        ariaLabel="Filtrar líneas de la factura"
      />

      <div className="flex flex-col gap-3">
        {visibles.length === 0 ? (
          <p className="text-center py-6 sunmi-text-muted text-sm2">
            No hay líneas que coincidan con este filtro.
          </p>
        ) : (
          visibles.map((f) => (
            <TarjetaLineaFactura key={f.lineaId} fila={f} onCorregir={onCorregir} />
          ))
        )}
      </div>
    </div>
  );
}
