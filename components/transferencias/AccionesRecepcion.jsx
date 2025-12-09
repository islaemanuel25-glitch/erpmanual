"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function AccionesRecepcion({
  puedeRecibir,
  guardando,
  confirmarRecepcion,
  confirmando,
  guardarCambios,
}) {
  const { ui } = useUIConfig();
  
  if (!puedeRecibir) return null;

  return (
    <div
      className="flex justify-end"
      style={{
        gap: ui.helpers.spacing("md"),
        paddingLeft: ui.helpers.spacing("sm"),
        paddingRight: ui.helpers.spacing("sm"),
        paddingBottom: ui.helpers.spacing("md"),
      }}
    >
      <SunmiButton
        variant="outline"
        size="sm"
        disabled={guardando}
        onClick={guardarCambios}
      >
        {guardando ? "Guardando..." : "Guardar cambios"}
      </SunmiButton>

      <SunmiButton
        size="sm"
        disabled={confirmando}
        onClick={confirmarRecepcion}
      >
        {confirmando ? "Confirmando..." : "Confirmar recepción"}
      </SunmiButton>
    </div>
  );
}
