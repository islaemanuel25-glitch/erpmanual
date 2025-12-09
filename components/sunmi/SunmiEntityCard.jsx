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
          gap: ui.helpers.spacing("md"),
        }}
      >
        <div
          className="flex items-start"
          style={{
            gap: ui.helpers.spacing("md"),
          }}
        >
          {icon && (
            <div style={{ marginTop: "2px" }}>
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
              gap: ui.helpers.spacing("sm"),
            }}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        className="flex flex-col"
        style={{
          marginTop: ui.helpers.spacing("md"),
          gap: ui.helpers.spacing("lg"),
        }}
      >
        {children}
      </div>
    </SunmiCard>
  );
}
