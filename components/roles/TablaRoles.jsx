"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function TablaRoles({
  rows,
  columns,
  page,
  totalPages,
  onNext,
  onPrev,
  onEditar,
  onEliminar,
}) {
  return (
    <SunmiTable
      page={page}
      totalPages={totalPages}
      onNext={onNext}
      onPrev={onPrev}
    >
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
          <th>Acciones</th>
        </tr>
      </thead>

      <tbody>
        {rows.length === 0 && (
          <SunmiTableEmpty message="Sin roles cargados" />
        )}

        {rows.map((r) => (
          <SunmiTableRow key={r.id}>
            {columns.map((c) => (
              <td key={c.key}>
                {Array.isArray(r[c.key]) ? r[c.key].join(", ") : r[c.key]}
              </td>
            ))}
            <td className="flex gap-2">
              <SunmiButton
                size="sm"
                color="cyan"
                label="Editar"
                onClick={() => onEditar(r.id)}
              />
              <SunmiButton
                size="sm"
                color="red"
                label="Eliminar"
                onClick={() => onEliminar(r.id)}
              />
            </td>
          </SunmiTableRow>
        ))}
      </tbody>
    </SunmiTable>
  );
}
