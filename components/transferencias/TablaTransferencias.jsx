"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import FilaTransferencia from "./FilaTransferencia";

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR");
};

export default function TablaTransferencias({
  items,
  columns,
  filaAbierta,
  setFilaAbierta,
}) {
  // Armar headers dinámicos:
  const headers = [
    columns.id && "ID",
    columns.origen && "Origen",
    columns.destino && "Destino",
    columns.estado && "Estado",
    columns.recepcion && "Recepción",
    columns.items && "Ítems",
    columns.importe && "Importe",
    columns.fechaEnvio && "Fecha envío",
    columns.fechaRecepcion && "Fecha recepción",
    columns.acciones && "",
  ].filter(Boolean);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-700 mx-1 mb-2">
      <SunmiTable headers={headers} className="min-w-[1000px]">
        {items.map((t) => (
          <SunmiTableRow key={t.id}>
            <FilaTransferencia
              t={t}
              columns={columns}
              filaAbierta={filaAbierta}
              setFilaAbierta={setFilaAbierta}
              formatDate={formatDate}
            />
          </SunmiTableRow>
        ))}
      </SunmiTable>
    </div>
  );
}
