"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className={`w-full ${maxWidth}`}>
        <SunmiCard>
          <div
            className="flex items-start justify-between"
            style={{
              gap: ui.helpers.spacing("sm"),
            }}
          >
            <SunmiCardHeader
              title={title}
              subtitle={subtitle}
              color={color}
            />

            {showCloseButton && onClose && (
              <SunmiButton
                color="slate"
                size="sm"
                onClick={onClose}
              >
                Cerrar
              </SunmiButton>
            )}
          </div>

          <div
            className="flex flex-col overflow-y-auto"
            style={{
              marginTop: ui.helpers.spacing("sm"),
              maxHeight: "65vh",
              gap: ui.helpers.spacing("md"),
            }}
          >
            {children}
          </div>

          {footer && (
            <div
              className="flex justify-end"
              style={{
                marginTop: ui.helpers.spacing("md"),
                gap: ui.helpers.spacing("sm"),
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
