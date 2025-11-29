"use client";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
}) {
  const toggle = () => {
    onChange(!value);
  };

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* Switch */}
      <div
        className={`w-10 h-5 rounded-full transition-all ${
          value ? "bg-green-400" : "bg-slate-600"
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transform transition-all ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>

      {/* Texto */}
      <span className="text-[12px] text-slate-300">
        {value ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
