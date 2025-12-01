import { ChevronDown } from "lucide-react";

export default function SunmiSelect({ className = "", children, ...props }) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={`
          w-full 
          px-2.5 py-1.5              /* antes px-3 py-2 */
          rounded-md                 /* antes rounded-xl */
          bg-slate-950/60 
          border border-slate-700 
          text-slate-100 
          text-[13px]                /* más compacto */
          appearance-none
          focus:outline-none
          focus:border-amber-400     /* sin ring gigante */
          transition
          ${className}
        `}
      >
        {children}
      </select>

      {/* Flecha compacta */}
      <ChevronDown
        size={14}                    /* antes 16 */
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          text-amber-400 opacity-70 
          pointer-events-none
        "
      />
    </div>
  );
}
