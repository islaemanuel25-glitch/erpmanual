"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";

export default function SunmiEntityCard({
  title,
  subtitle,
  color = "amber",
  icon = null,
  actions = null,
  children,
  className = "",
}) {
  return (
    <SunmiCard className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon && (
            <div className="mt-[2px]">
              {icon}
            </div>
          )}

          <SunmiCardHeader
            title={title}
            subtitle={subtitle}
            color={color}
          />
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {children}
      </div>
    </SunmiCard>
  );
}
