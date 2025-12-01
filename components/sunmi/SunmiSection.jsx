"use client";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

export default function SunmiSection({
  title,
  description,
  children,
  footer = null,
  noSeparator = false,
  className = "",
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {title && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-slate-100">
              {title}
            </h3>
          </div>
          {description && (
            <p className="text-[11px] text-slate-400">{description}</p>
          )}
        </div>
      )}

      {!noSeparator && <SunmiSeparator />}

      <div className="flex flex-col gap-2">
        {children}
      </div>

      {footer && (
        <div className="mt-1">
          {footer}
        </div>
      )}
    </section>
  );
}
