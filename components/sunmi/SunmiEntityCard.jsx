"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

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
  const { slide } = useSunmiAnimation();

  return (
    <SunmiCard className={className}>
      <div
        className="flex items-start justify-between"
        style={{
          gap: ui.gap,
          transform: `translateY(${ui.animations.slideOffsetY}px)`,
          animation: `entitySlide ${ui.animations.slideDuration}ms ${ui.animations.easing} forwards`,
        }}
      >
        <style>{`
          @keyframes entitySlide {
            from {
              opacity: ${ui.animations.fadeFrom};
              transform: translateY(${ui.animations.slideOffsetY}px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>

        <div
          className="flex items-start"
          style={{ gap: ui.gap }}
        >
          {icon && (
            <div style={{ marginTop: ui.gap }}>{icon}</div>
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
