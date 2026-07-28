"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import FormProducto from "@/components/productos/FormProducto";

export default function ModalProducto({
  open,
  onClose,
  onSubmit,
  catalogos,
  initialData = null,
  editandoOverrideLocal = false,
  // Propiedad resuelta por el BACKEND (no inferir en el front). Defaults true para
  // el alta y productos propios. El backend revalida en la edición.
  puedeEditarCosto = true,
  puedeEditarBase = true,
}) {
  return (
    <div
      className={`fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-3 ${
        open ? "block" : "hidden"
      }`}
    >
      <SunmiCard className="w-[95%] max-w-4xl">
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title={initialData ? "Editar producto" : "Nuevo producto"} />
          <SunmiButton color="cyan" onClick={onClose}>
            Cerrar
          </SunmiButton>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-1">
          {open && (
            <FormProducto
              initialData={initialData}
              catalogos={catalogos}
              onSubmit={onSubmit}
              onCancel={onClose}
              submitLabel={initialData ? "Guardar cambios" : "Crear producto"}
              editandoOverrideLocal={editandoOverrideLocal}
              puedeEditarCosto={puedeEditarCosto}
              puedeEditarBase={puedeEditarBase}
            />
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
