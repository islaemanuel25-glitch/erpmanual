"use client";

export default function Separador({ label, icon = "◆" }) {
  const text = label.toLowerCase();

  const esSugeridos = text.includes("suger");
  const esPreparados = text.includes("prepar");

  const color = esSugeridos
    ? "#FACC15" // AMARILLO
    : esPreparados
    ? "#22D3EE" // CELESTE
    : "#22D3EE"; // default

  return (
    <div className="my-4 select-none">

      {/* LABEL + ICONO */}
      <div className="flex items-center gap-2 mb-1 px-1">
        <span
          className="text-[10px] font-bold drop-shadow"
          style={{ color }}
        >
          {icon}
        </span>

        <span
          className="
            text-[11px] uppercase tracking-wider font-semibold
            drop-shadow
          "
          style={{ color }}
        >
          {label}
        </span>
      </div>

      {/* LINEA */}
      <div className="relative h-[3px] w-full">
        <div
          className="absolute inset-0 rounded-full shadow"
          style={{
            backgroundColor: color + "99",
            boxShadow: `0 0 6px ${color}66`,
          }}
        />

        <div
          className="absolute inset-x-6 top-[1px] h-[1px]"
          style={{
            backgroundColor: color + "55",
          }}
        />
      </div>
    </div>
  );
}
