"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTableLocales({
  columnas = [],
  datos = [],
  page,
  totalPages,
  onPrev,
  onNext,
  accionesPersonalizadas,
}) {
  const { ui } = useUIConfig();
  
  // ==========================
  // ARMAR HEADERS SUNMI
  // ==========================
  const headers = [
    ...columnas.map((c) => c.titulo),
    accionesPersonalizadas ? "Acciones" : null,
  ].filter(Boolean);

  return (
    <div
      className="sunmi-card border border-slate-800 shadow-md overflow-hidden bg-slate-950"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        padding: 0,
      }}
    >

      <SunmiHeader title="Locales" color="amber" />

      <SunmiSeparator label="Listado" color="amber" />

      <div className="overflow-x-auto">
        {/* 
          ⛔ YA NO USAMOS <thead> / <tbody> manuales 
          ✔ SunmiTable genera la estructura.
        */}
        <SunmiTable headers={headers}>

          {/* NO HAY DATOS */}
          {datos.length === 0 && (
            <SunmiTableEmpty message="No hay locales para mostrar" />
          )}

          {/* FILAS */}
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

              {/* ACCIONES PERSONALIZADAS */}
              {accionesPersonalizadas && (
                <td
                  className="text-right"
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("sm"),
                  }}
                >
                  {accionesPersonalizadas(row)}
                </td>
              )}
            </SunmiTableRow>
          ))}
        </SunmiTable>
      </div>

      {/* PAGINACIÓN */}
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
