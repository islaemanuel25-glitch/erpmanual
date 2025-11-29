"use client";

export default function SunmiPill({ children }) {
  return (
    <span
      className="
        inline-block px-2 py-[2px]
        rounded-lg text-[10px] font-semibold
        bg-amber-400 text-slate-900
        whitespace-nowrap
      "
    >
      {children}
    </span>
  );
}
