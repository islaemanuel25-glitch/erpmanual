"use client";

import { useEffect, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";

export default function ModalOperador({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    pin: "",
    activo: true,
  });

  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      setForm({ nombre: "", pin: "", activo: true });
      return;
    }

    setForm({
      nombre: initialData.nombre || "",
      pin: "",
      activo: Boolean(initialData.activo),
    });
  }, [open, initialData]);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validar = () => {
    if (!form.nombre.trim()) return "Completá el nombre.";
    if (!editMode && (!form.pin || form.pin.length < 4))
      return "El PIN debe tener al menos 4 dígitos.";
    if (editMode && form.pin && form.pin.length < 4)
      return "El PIN debe tener al menos 4 dígitos.";
    return null;
  };

  // El local no viaja: el operador es del local activo.
  const handleSubmit = () => {
    const err = validar();
    if (err) return alert(err);

    onSubmit({
      nombre: form.nombre.trim(),
      pin: form.pin || undefined,
      activo: Boolean(form.activo),
    });
  };

  if (!open) return null;

  return (
    <SunmiModalLayout
      open={open}
      title={editMode ? "Editar operador" : "Nuevo operador"}
      onClose={onClose}
      // El valor efectivo que esta pantalla ya tenía, MEDIDO en el navegador.
      z={9999}
      // Es un formulario: un toque al costado con media pantalla escrita tiraría
      // lo escrito, y en el teléfono ese toque pasa solo.
      destructivo
      // El espaciado interior queda como estaba: emparejar es la capa y la
      // estructura, no repintar el cuerpo.
      espacioCuerpo=""
      espacioPie=""
      footer={
        <>
          <SunmiButton color="slate" onClick={onClose}>
            Cancelar
          </SunmiButton>

          <SunmiButton onClick={handleSubmit}>
            {editMode ? "Guardar cambios" : "Crear operador"}
          </SunmiButton>
        </>
      }
    >
      {/* El cuerpo va directo: el `flex flex-col max-h-[65vh] overflow-y-auto`
          que estaba acá ahora lo pone la pieza, con el mismo valor. */}
      <>
            <SunmiSeparator label="Datos" />

            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Nombre del operador…"
                autoComplete="off"
              />
            </Field>

            <Field label={editMode ? "Nuevo PIN (opcional)" : "PIN *"}>
              <SunmiInput
                type="password"
                value={form.pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setField("pin", v);
                }}
                placeholder="4-6 dígitos"
                maxLength={6}
                inputMode="numeric"
                autoComplete="new-password"
              />
            </Field>

            <Field label="Estado">
              <SunmiToggleEstado
                value={form.activo}
                onChange={(v) => setField("activo", v)}
              />
            </Field>
      </>
    </SunmiModalLayout>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span>{label}</span>
      {children}
    </div>
  );
}
