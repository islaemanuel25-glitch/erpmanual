"use client";

import { useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
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

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        flex items-center justify-center
      "
    >
      <div className="w-full max-w-xl">
        <SunmiCard>
          <SunmiCardHeader
            title={editMode ? 'Editar rol' : 'Nuevo rol'}
            subtitle="Configurá nombre y permisos"
            color="amber"
          />

          {/* CONTENIDO */}
          <div className="flex flex-col">

            <SunmiSeparator label="Datos" color="amber" />

            {/* Nombre */}
            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Ingresá el nombre del rol…"
              />
            </Field>

            <SunmiSeparator label="Permisos" color="amber" />

            <div className="flex justify-end">
              <SunmiButton color="amber" size="sm" onClick={setAdmin}>
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

          </div>

          {/* ACCIONES */}
          <div className="flex justify-end gap-2">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton color="amber" onClick={handleSubmit}>
              {editMode ? "Guardar cambios" : "Crear rol"}
            </SunmiButton>
          </div>

        </SunmiCard>
      </div>
    </div>
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
