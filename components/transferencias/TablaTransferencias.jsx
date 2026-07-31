"use client";

// Tabla desktop del listado (se monta solo desde 1024 px; debajo la página usa
// CardTransferencia). No fuerza `min-w-[1000px]`: el ancho lo resuelven las
// columnas, y la página envuelve en overflow-x-auto por si un nombre de local
// muy largo empuja de más.
//
// Las filas ya no se despliegan: el detalle es una página propia y el único
// acceso es el botón "Ver" de cada fila.

import SunmiTable from "@/components/sunmi/SunmiTable";
import FilaTransferencia from "./FilaTransferencia";

export default function TablaTransferencias({
  items,
  columns,
  onVer,
  fechaHoraAR,
  formatCantidad,
  money,
}) {
  // Orden fijo, alineado con el de la fila. Las columnas ocultas por
  // configuración se sacan del header y de la fila en el mismo orden.
  const headers = [
    columns.fecha && "Fecha / hora",
    columns.numero && "Nº",
    columns.ruta && "Origen → destino",
    columns.items && { label: "Ítems", className: "text-center" },
    columns.enviada && { label: "Enviada", className: "text-right" },
    columns.recibida && { label: "Recibida", className: "text-right" },
    columns.estado && "Estado",
    columns.importe && { label: "Importe", className: "text-right" },
    columns.acciones && { label: "", className: "text-right" },
  ].filter(Boolean);

  return (
    <SunmiTable headers={headers}>
      {items.map((t) => (
        <FilaTransferencia
          key={t.id}
          t={t}
          columns={columns}
          onVer={onVer}
          fechaHoraAR={fechaHoraAR}
          formatCantidad={formatCantidad}
          money={money}
        />
      ))}
    </SunmiTable>
  );
}
