"use client";

export default function SunmiListCardItem({
  children,
  className = "",
}) {
  return (
    <div
      className={`
        flex items-center justify-between
        py-2
        relative
        ${className}
      `}
    >
      {/* Separador soft Sunmi → super leve, theme-friendly */}
      <div className="
        absolute -bottom-[1px] left-0 right-0
        h-[1px]
        shadow-[0_1px_0_rgba(255,255,255,0.04)]
      " />

      {/* Contenido */}
      <div className="flex-1 truncate">
        {children}
      </div>
    </div>
  );
}
