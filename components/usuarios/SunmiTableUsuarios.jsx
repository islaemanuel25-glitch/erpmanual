"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTableUsuarios({
  columnas = [],
  datos = [],
  page,
  totalPages,
  onPrev,
  onNext,
  accionesPersonalizadas,
}) {
  const { ui } = useUIConfig();

  return (
    <div
      className="sunmi-card border border-slate-800 shadow-md overflow-hidden bg-slate-950"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        padding: 0,
      }}
    >

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
                  className="text-left font-semibold uppercase tracking-wide"
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  {col.titulo}
                </th>
              ))}

              {accionesPersonalizadas && (
                <th
                  className="text-left font-semibold uppercase tracking-wide"
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
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
                  <td
                    key={col.key}
                    style={{
                      paddingLeft: ui.helpers.spacing("md"),
                      paddingRight: ui.helpers.spacing("md"),
                      paddingTop: ui.helpers.spacing("sm"),
                      paddingBottom: ui.helpers.spacing("sm"),
                      fontSize: ui.helpers.font("xs"),
                    }}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}

                {accionesPersonalizadas && (
                  <td
                    style={{
                      paddingLeft: ui.helpers.spacing("md"),
                      paddingRight: ui.helpers.spacing("md"),
                      paddingTop: ui.helpers.spacing("sm"),
                      paddingBottom: ui.helpers.spacing("sm"),
                      fontSize: ui.helpers.font("xs"),
                    }}
                  >
                    {accionesPersonalizadas(row)}
                  </td>
                )}
              </SunmiTableRow>
            ))}
          </tbody>
        </SunmiTable>
      </div>

      {/* PAGINACIÓN SUNMI */}
      <div
        className="flex justify-between items-center border-t border-slate-800 bg-slate-900"
        style={{
          paddingLeft: ui.helpers.spacing("lg"),
          paddingRight: ui.helpers.spacing("lg"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
        }}
      >
        <SunmiButton
          color="slate"
          size="sm"
          disabled={page <= 1}
          onClick={onPrev}
        >
          ◀ Anterior
        </SunmiButton>

        <span
          className="text-slate-300"
          style={{
            fontSize: ui.helpers.font("xs"),
          }}
        >
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
