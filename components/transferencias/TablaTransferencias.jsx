"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import FilaTransferencia from "./FilaTransferencia";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

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
  const { ui } = useUIConfig();
  
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
    <div
      className="w-full overflow-x-auto border border-slate-700"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        marginLeft: ui.helpers.spacing("xs"),
        marginRight: ui.helpers.spacing("xs"),
        marginBottom: ui.helpers.spacing("sm"),
      }}
    >
      <SunmiTable
        headers={headers}
        style={{
          minWidth: parseInt(ui.helpers.controlHeight()) * 30,
        }}
      >
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
