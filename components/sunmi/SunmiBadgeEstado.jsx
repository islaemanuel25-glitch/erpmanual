"use client";

export default function SunmiBadgeEstado({ value }) {
  // Normalizar valor para detectar estado activo
  const isActive =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo" ||
    value === "Activo";

  const data = isActive
    ? { label: "Activo", class: "bg-green-400 text-slate-900" }
    : { label: "Inactivo", class: "bg-red-400 text-slate-900" };

  return (
    <span
      className={`
        px-1.5 py-[1px]
        rounded-md
        text-[10.5px]
        font-semibold
        leading-none
        ${data.class}
      `}
    >
      {data.label}
    </span>
  );
}
