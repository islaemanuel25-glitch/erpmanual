"use client";

import { useEffect, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggle from "@/components/sunmi/SunmiToggle";

import { PERMISOS } from "@/lib/permisos";

export default function ModalRol({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const [form, setForm] = useState({
    nombre: "",
    permisos: [],
  });

  const editMode = Boolean(initialData);

  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      setForm({
        nombre: "",
        permisos: [],
      });
      return;
    }

    setForm({
      nombre: initialData.nombre || "",
      permisos: Array.isArray(initialData.permisos)
        ? initialData.permisos
        : [],
    });
  }, [open, initialData]);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const togglePermiso = (p) =>
    setForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(p)
        ? prev.permisos.filter((x) => x !== p)
        : [...prev.permisos, p],
    }));

  const setAdmin = () =>
    setForm((prev) => ({ ...prev, permisos: ["*"] }));

  const validar = () => {
    if (!form.nombre.trim()) return "Completá el nombre del rol.";
    return null;
  };

  const handleSubmit = () => {
    const err = validar();
    if (err) return alert(err);

    onSubmit({
      nombre: form.nombre,
      permisos: form.permisos,
    });
  };

  return (
    <SunmiModalLayout
      open={open}
      title={editMode ? "Editar rol" : "Nuevo rol"}
      onClose={onClose}
      // El valor efectivo que esta pantalla ya tenía, MEDIDO en el navegador.
      z={9999}
      // Es un formulario: un toque al costado con los permisos ya tildados
      // tiraría lo hecho, y en el teléfono ese toque pasa solo.
      destructivo
      // El espaciado interior queda como estaba: emparejar es la capa y la
      // estructura, no repintar el cuerpo. Con el `gap-3` del kit, este modal
      // separaría los quince toggles de permisos entre sí.
      espacioCuerpo=""
      espacioPie=""
      footer={
        <>
          <SunmiButton color="slate" onClick={onClose}>
            Cancelar
          </SunmiButton>

          <SunmiButton onClick={handleSubmit}>
            {editMode ? "Guardar cambios" : "Crear rol"}
          </SunmiButton>
        </>
      }
    >
      {/* El cuerpo va directo: el `flex flex-col max-h-[65vh] overflow-y-auto`
          que estaba acá ahora lo pone la pieza, con el mismo valor. */}
      <>

            <SunmiSeparator label="Datos" />

            {/* Nombre */}
            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Ingresá el nombre del rol…"
              />
            </Field>

            <SunmiSeparator label="Permisos" />

            <div className="flex justify-end">
              <SunmiButton onClick={setAdmin}>
                Set Admin (*)
              </SunmiButton>
            </div>

            {/* Permisos */}
            <div className="flex flex-col gap-2">
              {Object.entries(PERMISOS).map(([grupo, lista]) => (
                <div key={grupo}>
                  <div className="flex flex-col gap-1">
                    <span>{grupo}</span>

                    <div className="flex flex-col gap-1">
                      {lista.map((p) => (
                        <label
                          key={p}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <SunmiToggle
                            value={form.permisos.includes(p)}
                            onChange={() => togglePermiso(p)}
                          />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
