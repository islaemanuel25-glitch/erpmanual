"use client";

export default function SunmiTableRow({ children, selected = false, onClick, className = "" }) {
  return (
    <tr
      onClick={onClick}
      className={`
        text-[12px]
        ${onClick ? "cursor-pointer" : ""}
        ${selected ? "bg-[var(--table-row-hover)]" : "hover:bg-[var(--table-row-hover)]"}
        ${className}
      `}
    >
      {children}
    </tr>
  );
}
