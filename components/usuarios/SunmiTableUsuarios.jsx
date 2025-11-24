"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function SunmiTableUsuarios({
  columnas = [],
  datos = [],
  page,
  totalPages,
  onPrev,
  onNext,
  accionesPersonalizadas,
}) {
  return (
    <div className="sunmi-card border border-slate-800 rounded-2xl shadow-md p-0 overflow-hidden bg-slate-950">

      {/* HEADER SUNMI */}
      <SunmiHeader title="Usuarios" color="amber" />

      <SunmiSeparator label="Listado" color="amber" />

      {/* TABLA SUNMI */}
      <div className="overflow-x-auto">
        <SunmiTable>
          <thead>
            <tr className="bg-slate-900">
              {columnas.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-3 py-2 text-[12px] font-semibold uppercase tracking-wide"
                >
                  {col.titulo}
                </th>
              ))}

              {accionesPersonalizadas && (
                <th className="text-left px-3 py-2 text-[12px] font-semibold uppercase tracking-wide">
                  Acciones
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && <SunmiTableEmpty message="No hay usuarios para mostrar" />}

            {datos.map((row, idx) => (
              <SunmiTableRow key={idx}>
                {columnas.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-[12px]">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}

                {accionesPersonalizadas && (
                  <td className="px-3 py-2 text-[12px]">
                    {accionesPersonalizadas(row)}
                  </td>
                )}
              </SunmiTableRow>
            ))}
          </tbody>
        </SunmiTable>
      </div>

      {/* PAGINACIÓN SUNMI */}
      <div className="flex justify-between items-center px-4 py-2 border-t border-slate-800 bg-slate-900">
        <SunmiButton
          color="slate"
          size="sm"
          disabled={page <= 1}
          onClick={onPrev}
        >
          ◀ Anterior
        </SunmiButton>

        <span className="text-[12px] text-slate-300">
          Página {page} / {totalPages}
        </span>

        <SunmiButton
          color="slate"
          size="sm"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Siguiente ▶
        </SunmiButton>
      </div>
    </div>
  );
}
