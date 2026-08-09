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
  /**
   * Una acción que escribe y no se puede deshacer sola. Con esto en true, tocar
   * el velo NO cierra: cerrar sin querer un modal de lectura no cuesta nada,
   * pero perder de vista una confirmación destructiva a mitad de camino sí.
   */
  destructivo = false,
}) {
  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
        p-3
      "
    >
      {/* EL VELO. Oscurece lo de atrás para que el modal se lea como una
          decisión y no como un bloque más de la pantalla.
          El color sale del FONDO DEL TEMA con transparencia, no de un negro
          fijo: en un tema claro un velo negro se ve como un apagón, y el token
          ya cambia con el tema. */}
      <div
        aria-hidden="true"
        onClick={destructivo ? undefined : onClose}
        style={{ background: "color-mix(in srgb, var(--app-bg) 78%, transparent)" }}
        className="absolute inset-0"
      />

      <div className={`relative w-full ${maxWidth}`}>
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
