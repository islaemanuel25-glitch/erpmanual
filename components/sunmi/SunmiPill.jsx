"use client";

export default function SunmiPill({ children }) {
  return (
    <span
      className="
        inline-block 
        px-1.5 py-[1px]            /* reducido */
        rounded-md                 /* antes rounded-lg */
        text-[10.5px]              /* fino, uniforme con badges */
        font-semibold
        bg-amber-400 text-slate-900
        leading-none               /* elimina altura fantasma */
        whitespace-nowrap
      "
    >
      {children}
    </span>
  );
}
