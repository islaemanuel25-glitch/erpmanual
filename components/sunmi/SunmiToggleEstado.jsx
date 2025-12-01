"use client";

export default function SunmiCardHeader({
  title = "",
  children, // botones opcionales
}) {
  return (
    <div
      className="
        flex items-center justify-between
        mb-2               /* antes mb-3 */
        px-1               /* compacto */
      "
    >
      <h2
        className="
          text-[14px]      /* antes 15px */
          font-semibold
          text-slate-200
          leading-none      /* sin aire vertical */
        "
      >
        {title}
      </h2>

      <div className="flex items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}
