import { ChevronDown } from "lucide-react";

export default function SunmiSelect({ className = "", children, ...props }) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={`
          w-full px-3 py-2 rounded-xl
          bg-slate-950/60 
          border border-slate-700 
          text-slate-100 text-sm
          shadow-inner
          appearance-none
          focus:outline-none
          focus:ring-2 focus:ring-amber-400
          focus:border-amber-400
          transition-all
          ${className}
        `}
      >
        {children}
      </select>

      {/* Icono Sunmi flecha */}
      <ChevronDown
        size={16}
        className="
          absolute right-3 top-1/2 -translate-y-1/2 
          text-amber-400 opacity-70 pointer-events-none
        "
      />
    </div>
  );
}
