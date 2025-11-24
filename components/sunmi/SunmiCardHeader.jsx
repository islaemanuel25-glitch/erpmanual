"use client";

export default function SunmiCardHeader({
  title = "",
  children, // botones opcionales
}) {
  return (
    <div
      className="
        flex items-center justify-between
        mb-3 px-1
      "
    >
      <h2 className="text-[15px] font-semibold text-slate-200 tracking-wide">
        {title}
      </h2>

      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}
