"use client";

export default function SunmiBadgeEstado({ estado }) {
  // ACEPTA CUALQUIER FORMA — lo normalizamos acá
  const activo =
    estado === true ||
    estado === 1 ||
    estado === "1" ||
    estado === "activo" ||
    estado === "Activo";

  const label = activo ? "Activo" : "Inactivo";

  return (
    <span
      className={`
        px-2 py-0.5 
        rounded-full 
        text-[11px] 
        font-semibold
        ${activo ? "bg-green-400 text-slate-900" : "bg-red-400 text-slate-900"}
      `}
    >
      {label}
    </span>
  );
}
