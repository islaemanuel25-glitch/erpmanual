"use client";

import SunmiTable from "./SunmiTable";
import SunmiTableRow from "./SunmiTableRow";
import SunmiTableEmpty from "./SunmiTableEmpty";
import SunmiSeparator from "./SunmiSeparator";
import SunmiSelectAdv, { SunmiSelectOption } from "./SunmiSelectAdv";
import SunmiButton from "./SunmiButton";

import SunmiButtonIcon from "./SunmiButtonIcon";
import { Pencil, Trash2 } from "lucide-react";

export default function SunmiTableMaster({
  columns = [],
  rows = [],
  actions = [],

  page = 1,
  totalPages = 1,
  onPrev = () => {},
  onNext = () => {},

  pageSize = 25,
  pageSizeOptions = [25, 50, 100, 200],
  onChangePageSize = () => {},

  loading = false,
  emptyMessage = "No hay datos para mostrar",
}) {
  const noRows = !rows || rows.length === 0;

  return (
    <div className="w-full flex flex-col gap-4">

      {/* TABLA */}
      <SunmiTable
        headers={[
          ...columns.map((c) => c.label),
          ...(actions.length > 0 ? ["Acciones"] : []),
        ]}
      >
        {/* LOADER */}
        {loading && <SunmiTableEmpty message="Cargando..." />}

        {/* SIN FILAS */}
        {!loading && noRows && (
          <SunmiTableEmpty message={emptyMessage} />
        )}

        {/* FILAS */}
        {!loading && !noRows &&
          rows.map((row, idx) => (
            <SunmiTableRow key={row.id ?? idx}>
              {/* COLUMNAS */}
              {columns.map((col) => (
                <td key={col.id} className="px-2 py-1.5">
                  {row[col.id] ?? "—"}
                </td>
              ))}

              {/* ACCIONES */}
              {actions.length > 0 && (
                <td className="px-2 py-1.5 text-right">
                  <div className="flex justify-end gap-1">
                    {actions.map((act, i) => (
                      <SunmiButtonIcon
                        key={i}
                        icon={
                          act.icon === "edit"
                            ? Pencil
                            : act.icon === "delete"
                            ? Trash2
                            : Pencil
                        }
                        color={act.icon === "delete" ? "red" : "amber"}
                        size={16}
                        onClick={() => act.onClick(row)}
                      />
                    ))}
                  </div>
                </td>
              )}
            </SunmiTableRow>
          ))}
      </SunmiTable>

      {/* PAGINACIÓN + SELECTOR */}
      <SunmiSeparator />

      <div className="w-full flex flex-col md:flex-row items-center justify-between gap-3">

        {/* SELECTOR FILAS */}
        <div className="flex items-center gap-2 text-sm">
          <span>Filas:</span>

          <SunmiSelectAdv
            value={pageSize}
            onChange={(v) => onChangePageSize(Number(v))}
          >
            {pageSizeOptions.map((opt) => (
              <SunmiSelectOption key={opt} value={opt}>
                {opt}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {/* INDICADOR */}
        <div className="text-sm">
          Página <strong>{page}</strong> de <strong>{totalPages}</strong>
        </div>

        {/* BOTONES PAGINACIÓN */}
        <div className="flex items-center gap-2">
          <SunmiButton
            variant="ghost"
            disabled={page <= 1}
            onClick={onPrev}
          >
            Anterior
          </SunmiButton>

          <SunmiButton
            variant="ghost"
            disabled={page >= totalPages}
            onClick={onNext}
          >
            Siguiente
          </SunmiButton>
        </div>

      </div>
    </div>
  );
}
