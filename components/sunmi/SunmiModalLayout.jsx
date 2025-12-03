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
        padding: ui.spacing.md,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div className={`w-full ${maxWidth}`}>
        <SunmiCard>
          {/* HEADER */}
          <div
            className="flex items-start justify-between"
            style={{
              gap: ui.spacing.sm,
            }}
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
                style={{
                  paddingLeft: ui.spacing.sm,
                  paddingRight: ui.spacing.sm,
                }}
              >
                Cerrar
              </SunmiButton>
            )}
          </div>

          {/* BODY */}
          <div
            className="flex flex-col overflow-y-auto"
            style={{
              marginTop: ui.spacing.md,
              maxHeight: "65vh",
              gap: ui.spacing.sm,
            }}
          >
            {children}
          </div>

          {/* FOOTER */}
          {footer && (
            <div
              className="flex justify-end"
              style={{
                marginTop: ui.spacing.md,
                gap: ui.spacing.sm,
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
