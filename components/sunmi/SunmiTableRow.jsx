"use client";

export default function SunmiTableRow({
  children,
  onClick,
  selected = false,
}) {
  return (
    <tr
      onClick={onClick}
      className={`
        transition-all text-[12px]
        ${onClick ? "cursor-pointer" : ""}
        ${selected ? "bg-slate-800" : "hover:bg-slate-800/60"}
      `}
    >
      {children}
    </tr>
  );
}
