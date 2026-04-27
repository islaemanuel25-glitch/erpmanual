"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";

export default function AccionesRecepcion({
  puedeRecibir,
  guardando,
  confirmarRecepcion,
  confirmando,
  guardarCambios,
  puedeCancelar,
  cancelando,
  cancelarTransferencia,
}) {
  if (!puedeRecibir && !puedeCancelar) return null;

  return (
    <div className="flex justify-end gap-3 px-2 pb-3">
      {puedeCancelar && (
        <SunmiButton
          color="red"
          disabled={cancelando}
          onClick={cancelarTransferencia}
        >
          {cancelando ? "Cancelando..." : "Cancelar transferencia"}
        </SunmiButton>
      )}

      {puedeRecibir && (
        <>
          <SunmiButton
            color="slate"
            disabled={guardando}
            onClick={guardarCambios}
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </SunmiButton>

          <SunmiButton
            disabled={confirmando}
            onClick={confirmarRecepcion}
          >
            {confirmando ? "Confirmando..." : "Confirmar recepción"}
          </SunmiButton>
        </>
      )}
    </div>
  );
}
