"use client";

export default function Separador({ label, icon = "◆" }) {
  const text = label.toLowerCase();

  const esSugeridos = text.includes("suger");

  // Sugeridos → accent, Preparados/default → link
  const cssColor = esSugeridos
    ? "var(--pos-accent)"
    : "var(--pos-link)";

  return (
    <div className="my-4 select-none">

      {/* LABEL + ICONO */}
      <div className="flex items-center gap-2 mb-1 px-1">
        <span
          className="text-[10px] font-bold drop-shadow"
          style={{ color: cssColor }}
        >
          {icon}
        </span>

        <span
          className="
            text-[11px] uppercase tracking-wider font-semibold
            drop-shadow
          "
          style={{ color: cssColor }}
        >
          {label}
        </span>
      </div>

      {/* LINEA */}
      <div className="relative h-[3px] w-full">
        <div
          className="absolute inset-0 rounded-full shadow"
          style={{
            backgroundColor: `color-mix(in srgb, ${cssColor} 60%, transparent)`,
            boxShadow: `0 0 6px color-mix(in srgb, ${cssColor} 40%, transparent)`,
          }}
        />

        <div
          className="absolute inset-x-6 top-[1px] h-[1px]"
          style={{
            backgroundColor: `color-mix(in srgb, ${cssColor} 33%, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
