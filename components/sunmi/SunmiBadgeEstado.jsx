"use client";

export default function SunmiBadgeEstado({ value }) {
  // Normalizar valor
  const normalized =
    typeof value === "boolean"
      ? value
        ? "activo"
        : "inactivo"
      : value?.toString().toLowerCase() === "true"
      ? "activo"
      : value?.toString().toLowerCase();

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

  const data = map[normalized] || map.inactivo;

  return (
    <span
      className={`
        px-1.5 py-[1px]              /* antes px-2 py-[2px] */
        rounded-md                   /* antes rounded-full */
        text-[10.5px]                /* antes text-[11px] */
        font-semibold 
        leading-none                 /* elimina salto vertical extra */
        ${data.class}
      `}
    >
      {data.label}
    </span>
  );
}
