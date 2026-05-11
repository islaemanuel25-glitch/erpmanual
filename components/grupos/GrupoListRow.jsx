"use client";

import { Pencil, Trash2, ChevronRight } from "lucide-react";
import GrupoAvatar from "@/components/grupos/GrupoAvatar";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

export default function GrupoListRow({
  grupo,
  onAdministrar,
  onEditar,
  onEliminar,
}) {
  const cantidadLocales = Array.isArray(grupo.localesGrupo)
    ? grupo.localesGrupo.length
    : 0;
  const cantidadDepositos = Array.isArray(grupo.locales)
    ? grupo.locales.length
    : 0;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn?.(grupo);
  };

  return (
    <div
      onClick={() => onAdministrar?.(grupo)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdministrar?.(grupo);
        }
      }}
      className="
        group relative flex items-center gap-3 px-3 py-2.5
        rounded-lg border sunmi-divider sunmi-card
        hover:bg-[var(--table-row-hover)]
        transition cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-amber-500/40
      "
    >
      <GrupoAvatar nombre={grupo.nombre} size={42} />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold sunmi-text-strong truncate">
          {grupo.nombre}
        </div>
        <div className="text-[11px] sunmi-text-muted mt-0.5">
          {cantidadLocales} {cantidadLocales === 1 ? "local" : "locales"}
          <span className="mx-1.5 opacity-60">·</span>
          {cantidadDepositos}{" "}
          {cantidadDepositos === 1 ? "depósito" : "depósitos"}
        </div>
      </div>

      <div
        className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition"
        onClick={(e) => e.stopPropagation()}
      >
        <SunmiButtonIcon
          icon={Pencil}
          size={15}
          onClick={stop(onEditar)}
          aria-label="Editar grupo"
        />
        <SunmiButtonIcon
          icon={Trash2}
          color="red"
          size={15}
          onClick={stop(onEliminar)}
          aria-label="Eliminar grupo"
        />
      </div>

      <ChevronRight
        size={16}
        className="sunmi-text-muted shrink-0 opacity-50 group-hover:opacity-100 transition"
      />
    </div>
  );
}
