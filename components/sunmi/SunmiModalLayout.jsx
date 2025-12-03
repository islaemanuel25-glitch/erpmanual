"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function SunmiModalLayout({
  open,
  title,
  subtitle,
  color = "amber",
  onClose,
  children,
  footer = null,
  maxWidth = "max-w-xl",
  showCloseButton = true,
}) {
  const { ui } = useUIConfig();

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
      "
      style={{
        padding: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div className={`w-full ${maxWidth}`}>
        <SunmiCard>
          <div
            className="flex items-start justify-between"
            style={{ gap: ui.gap }}
          >
            <SunmiCardHeader
              title={title}
              subtitle={subtitle}
              color={color}
            />

            {showCloseButton && onClose && (
              <SunmiButton
                variant="ghost"
                onClick={onClose}
                style={{ padding: ui.gap }}
              >
                Cerrar
              </SunmiButton>
            )}
          </div>

          <div
            className="flex flex-col overflow-y-auto"
            style={{
              marginTop: ui.gap,
              maxHeight: "65vh",
              gap: ui.gap,
            }}
          >
            {children}
          </div>

          {footer && (
            <div
              className="flex justify-end"
              style={{
                marginTop: ui.gap,
                gap: ui.gap,
              }}
            >
              {footer}
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
