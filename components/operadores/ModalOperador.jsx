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
  locales = [],
}) {
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    pin: "",
    activo: true,
    localIds: [],
  });

  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      setForm({ nombre: "", pin: "", activo: true, localIds: [] });
      return;
    }

    setForm({
      nombre: initialData.nombre || "",
      pin: "",
      activo: Boolean(initialData.activo),
      localIds: (initialData.locales || []).map((l) => l.id),
    });
  }, [open, initialData]);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleLocal = (localId) => {
    setForm((prev) => {
      const has = prev.localIds.includes(localId);
      return {
        ...prev,
        localIds: has
          ? prev.localIds.filter((id) => id !== localId)
          : [...prev.localIds, localId],
      };
    });
  };

  const validar = () => {
    if (!form.nombre.trim()) return "Completá el nombre.";
    if (!editMode && (!form.pin || form.pin.length < 4))
      return "El PIN debe tener al menos 4 dígitos.";
    if (editMode && form.pin && form.pin.length < 4)
      return "El PIN debe tener al menos 4 dígitos.";
    if (form.localIds.length === 0) return "Seleccioná al menos un local.";
    return null;
  };

  const handleSubmit = () => {
    const err = validar();
    if (err) return alert(err);

    onSubmit({
      nombre: form.nombre.trim(),
      pin: form.pin || undefined,
      activo: Boolean(form.activo),
      localIds: form.localIds.map(Number),
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

            <Field label="Locales asignados *">
              <div className="flex flex-wrap gap-2">
                {locales.map((l) => {
                  const checked = form.localIds.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer
                        text-[13px] transition-all select-none border
                        ${checked
                          ? "sunmi-badge-success border-emerald-500/50"
                          : "sunmi-surface border-transparent hover:border-slate-500/30"
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLocal(l.id)}
                        className="accent-emerald-500 w-3.5 h-3.5"
                      />
                      {l.nombre}
                    </label>
                  );
                })}
              </div>
              {form.localIds.length === 0 && (
                <p className="text-[10px] sunmi-text-muted mt-1">
                  Seleccioná al menos un local.
                </p>
              )}
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
