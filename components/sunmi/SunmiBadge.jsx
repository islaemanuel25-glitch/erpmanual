"use client";

export default function SunmiBadgeEstado({ estado }) {
  const activo =
    estado === true ||
    estado === 1 ||
    estado === "1" ||
    estado === "activo" ||
    estado === "Activo";

  return (
    <span
      className={`
        px-2 py-0.5
        rounded-full
        text-[11px]
        font-semibold
        ${activo ? "sunmi-badge-success" : "sunmi-badge-muted"}
      `}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}
