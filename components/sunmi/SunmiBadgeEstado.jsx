"use client";

export default function SunmiBadgeEstado({ value }) {
  const isActive =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo" ||
    value === "Activo";

  return (
    <span
      className={`
        px-1.5 py-[1px]
        rounded-md
        text-[10.5px]
        font-semibold
        leading-none
        ${isActive ? "sunmi-badge-success" : "sunmi-badge-muted"}
      `}
    >
      {isActive ? "Activo" : "Inactivo"}
    </span>
  );
}
