"use client";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
}) {
  // Normalizar valor del backend / formulario
  const normalized =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo";

  const toggle = () => {
    onChange(!normalized);
  };

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* Switch */}
      <div
        className={`w-10 h-5 rounded-full transition-all ${
          normalized ? "bg-green-400" : "bg-slate-600"
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transform transition-all ${
            normalized ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>

      {/* Texto */}
      <span className="text-[12px] text-slate-300">
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
