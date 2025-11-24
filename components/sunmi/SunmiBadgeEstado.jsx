"use client";

export default function SunmiBadgeEstado({ estado = "" }) {
  const map = {
    activo:   { label: "Activo", color: "bg-green-400 text-slate-900" },
    inactivo: { label: "Inactivo", color: "bg-red-500 text-white" },
    enviado:  { label: "Enviado", color: "bg-amber-400 text-slate-900" },
    pendiente:{ label: "Pendiente", color: "bg-cyan-400 text-slate-900" },
    recibido: { label: "Recibido", color: "bg-green-400 text-slate-900" },
    error:    { label: "Error", color: "bg-red-500 text-white" },
  };

  const badge = map[estado?.toLowerCase()] || {
    label: estado || "—",
    color: "bg-slate-600 text-white"
  };

  return (
    <span
      className={`px-2 py-[2px] text-[11px] rounded-md font-semibold tracking-wide ${badge.color}`}
    >
      {badge.label}
    </span>
  );
}
