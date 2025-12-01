"use client";

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
  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
      "
    >
      <div className={`w-full ${maxWidth}`}>
        <SunmiCard>
          <div className="flex items-start justify-between gap-2">
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

          <div className="mt-2 flex flex-col max-h-[65vh] overflow-y-auto gap-3">
            {children}
          </div>

          {footer && (
            <div className="mt-3 flex justify-end gap-2">
              {footer}
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
