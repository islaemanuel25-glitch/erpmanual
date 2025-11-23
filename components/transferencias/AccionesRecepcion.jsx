"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";

export default function AccionesRecepcion({
  puedeRecibir,
  guardando,
  confirmarRecepcion,
  confirmando,
  guardarCambios,
}) {
  if (!puedeRecibir) return null;

  return (
    <div className="flex justify-end gap-3 px-2 pb-3">
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
