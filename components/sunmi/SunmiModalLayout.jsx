"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";

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
  const { modal, fade } = useSunmiAnimation();

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
        backdrop-blur-sm
      "
      style={{
        padding: ui.gap,
        transform: `scale(${ui.scale})`,
        animation: `
          modalFade ${modal.duration}ms ease,
          modalZoom ${modal.duration}ms ease
        `,
      }}
    >
      <style>
        {`
        @keyframes modalFade {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
        @keyframes modalZoom {
          from { transform: scale(${modal.scale}); }
          to { transform: scale(1); }
        }
      `}
      </style>

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
              maxHeight: ui.density.modalMaxHeight ?? "65vh",
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
