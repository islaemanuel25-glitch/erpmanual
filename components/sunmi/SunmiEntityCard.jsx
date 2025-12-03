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
        style={{
          gap: ui.spacing.sm,
          transform: `scale(${ui.scale})`,
        }}
      >
        <div
          className="flex items-start"
          style={{
            gap: ui.spacing.sm,
          }}
        >
          {icon && (
            <div
              style={{
                marginTop: ui.spacing.xs,
              }}
            >
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
            style={{
              gap: ui.spacing.xs,
            }}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: ui.spacing.sm,
          marginTop: ui.spacing.sm,
        }}
      >
        {children}
      </div>
    </SunmiCard>
  );
}
