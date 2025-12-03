"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiEntityCard({
  title,
  subtitle,
  color = "amber",
  icon = null,
  actions = null,
  children,
  className = "",
}) {
  const { ui } = useUIConfig();

  return (
    <SunmiCard className={className}>
      <div
        className="flex items-start justify-between"
        style={{ gap: ui.gap }}
      >
        <div
          className="flex items-start"
          style={{ gap: ui.gap }}
        >
          {icon && (
            <div style={{ marginTop: ui.gap }}>
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
          <div
            className="flex items-center"
            style={{ gap: ui.gap }}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: ui.gap,
          marginTop: ui.gap,
        }}
      >
        {children}
      </div>
    </SunmiCard>
  );
}
