"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
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
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-700 mx-1 mb-2">
      <SunmiTable className="min-w-[1000px]">
        <thead>
          <tr>
            {columns.id && <th>ID</th>}
            {columns.origen && <th>Origen</th>}
            {columns.destino && <th>Destino</th>}
            {columns.estado && <th>Estado</th>}
            {columns.recepcion && <th>Recepción</th>}
            {columns.items && <th>Ítems</th>}
            {columns.importe && <th>Importe</th>}
            {columns.fechaEnvio && <th>Fecha envío</th>}
            {columns.fechaRecepcion && <th>Fecha recepción</th>}
            {columns.acciones && <th></th>}
          </tr>
        </thead>

        <tbody>
          {items.map((t) => (
            <FilaTransferencia
              key={t.id}
              t={t}
              columns={columns}
              filaAbierta={filaAbierta}
              setFilaAbierta={setFilaAbierta}
              formatDate={formatDate}
            />
          ))}
        </tbody>
      </SunmiTable>
    </div>
  );
}
