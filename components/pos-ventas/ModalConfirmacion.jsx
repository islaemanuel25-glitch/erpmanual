"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalConfirmacion({ open, mensaje, onConfirmar, onCancelar }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] sunmi-overlay backdrop-blur-sm flex items-center justify-center p-4">
      <div className="sunmi-surface sunmi-border rounded-lg p-4 w-full max-w-md shadow-xl">
        <div className="mb-4">
          <p className="text-sm sunmi-text-strong">{mensaje}</p>
        </div>
        <div className="flex justify-end gap-2">
          <SunmiButton color="slate" onClick={onCancelar}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="amber" onClick={onConfirmar}>
            Confirmar
          </SunmiButton>
        </div>
      </div>
    </div>
  );
}



