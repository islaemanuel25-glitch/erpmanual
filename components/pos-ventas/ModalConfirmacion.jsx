"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalConfirmacion({ open, mensaje, onConfirmar, onCancelar }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-full max-w-md shadow-xl">
        <div className="mb-4">
          <p className="text-sm text-slate-200">{mensaje}</p>
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



