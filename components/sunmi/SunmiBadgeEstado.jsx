"use client";

export default function SunmiBadgeEstado({ value }) {
  // Normalizar cualquier valor recibido:
  // true, "activo", 1 → activo
  // false, "inactivo", 0 → inactivo
  const normalized =
    typeof value === "boolean"
      ? (value ? "activo" : "inactivo")
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

  const data = map[normalized] || map["inactivo"];

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
