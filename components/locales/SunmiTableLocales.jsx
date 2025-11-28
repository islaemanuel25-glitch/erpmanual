"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function SunmiTableLocales({
  columnas = [],
  datos = [],
  page,
  totalPages,
  onPrev,
  onNext,
  accionesPersonalizadas,
}) {
  
  // ==========================
  // ARMAR HEADERS SUNMI
  // ==========================
  const headers = [
    ...columnas.map((c) => c.titulo),
    accionesPersonalizadas ? "Acciones" : null,
  ].filter(Boolean);

  return (
    <div className="sunmi-card border border-slate-800 rounded-2xl shadow-md p-0 overflow-hidden bg-slate-950">

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
                <td key={col.key} className="px-3 py-2 text-[12px]">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}

              {/* ACCIONES PERSONALIZADAS */}
              {accionesPersonalizadas && (
                <td className="px-3 py-2 text-right text-[13px]">
                  {accionesPersonalizadas(row)}
                </td>
              )}
            </SunmiTableRow>
          ))}
        </SunmiTable>
      </div>

      {/* PAGINACIÓN */}
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
