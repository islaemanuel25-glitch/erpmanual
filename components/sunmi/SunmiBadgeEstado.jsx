"use client";

export default function SunmiBadgeEstado({ estado = "" }) {

  // convertir boolean -> string estándar
  const valor = typeof estado === "boolean"
    ? (estado ? "activo" : "inactivo")
    : (estado?.toString().toLowerCase() || "");

  const map = {
    activo: {
      label: "Activo",
      class: "bg-green-400 text-slate-900",
    },
    inactivo: {
      label: "Inactivo",
      class: "bg-red-400 text-slate-900",
    },
  };

  const data = map[valor] || map["inactivo"];

  return (
    <span
      className={`
        px-2 py-[2px] rounded-full text-[11px] font-semibold
        ${data.class}
      `}
    >
      {data.label}
    </span>
  );
}
