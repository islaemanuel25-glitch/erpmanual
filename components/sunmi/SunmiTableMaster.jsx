"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

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
  const { ui } = useUIConfig();

  return (
    <div
      className="flex flex-col"
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      <SunmiTable
        headers={[
          ...columns.map((c) => c.label),
          ...(actions.length > 0 ? ["Acciones"] : []),
        ]}
      >
        {loading && <SunmiTableEmpty message="Cargando..." />}

        {!loading && noRows && <SunmiTableEmpty message={emptyMessage} />}

        {!loading &&
          !noRows &&
          rows.map((row, idx) => (
            <SunmiTableRow key={row.id ?? idx}>
              {columns.map((col) => (
                <td
                  key={col.id}
                  style={{
                    paddingLeft: ui.spacingScale.sm,
                    paddingRight: ui.spacingScale.sm,
                    paddingTop: ui.spacingScale.xs,
                    paddingBottom: ui.spacingScale.xs,
                    fontSize: ui.fontSizeSm || ui.fontSize,
                    lineHeight: `${ui.fontLineHeight}px`,
                  }}
                >
                  {row[col.id] ?? "—"}
                </td>
              ))}

              {actions.length > 0 && (
                <td
                  style={{
                    paddingLeft: ui.spacingScale.sm,
                    paddingRight: ui.spacingScale.sm,
                    textAlign: "right",
                  }}
                >
                  <div
                    className="flex justify-end"
                    style={{ gap: ui.spacingScale.xs }}
                  >
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
                        onClick={() => act.onClick(row)}
                      />
                    ))}
                  </div>
                </td>
              )}
            </SunmiTableRow>
          ))}
      </SunmiTable>

      <SunmiSeparator />

      {/* FOOTER */}
      <div
        className="flex flex-col md:flex-row items-center justify-between"
        style={{
          gap: ui.gap,
        }}
      >
        {/* FILAS POR PÁGINA */}
        <div
          className="flex items-center"
          style={{
            gap: ui.gap,
            fontSize: ui.fontSizeSm || ui.fontSize,
          }}
        >
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

        {/* PAGINADOR TEXTO */}
        <div
          style={{
            fontSize: ui.fontSize,
            lineHeight: `${ui.fontLineHeight}px`,
          }}
        >
          Página <strong>{page}</strong> de <strong>{totalPages}</strong>
        </div>

        {/* BOTONES PAGINADOR */}
        <div className="flex items-center" style={{ gap: ui.gap }}>
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
