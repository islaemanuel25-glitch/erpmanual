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
  const modalRef = useRef(null);
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    permisos: [],
  });

  useEffect(() => {
    if (!open) return;

    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 30);

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

  const togglePermiso = (p) => {
    setForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(p)
        ? prev.permisos.filter((x) => x !== p)
        : [...prev.permisos, p],
    }));
  };

  const setAdmin = () =>
    setForm((prev) => ({ ...prev, permisos: ["*"] }));

  const validar = () => {
    if (!form.nombre.trim()) return "Completá el nombre del rol.";
    return null;
  };

  const submit = () => {
    const err = validar();
    if (err) return alert(err);

    const payload = {
      nombre: form.nombre,
      permisos: form.permisos,
    };

    onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-[9999]
        backdrop-blur-sm
        flex items-center justify-center
        p-3
      "
    >
      <div className="w-[95%] max-w-xl rounded-2xl overflow-hidden">
        <SunmiCard>
          <SunmiCardHeader
            title={editMode ? "Editar rol" : "Nuevo rol"}
            subtitle="Configurá nombre y permisos del rol"
            color="amber"
          />

          <div
            ref={modalRef}
            className="max-h-[65vh] overflow-y-auto px-2 pb-4 mt-2 space-y-4"
          >
            <SunmiSeparator label="Datos" color="amber" />

            {/* NOMBRE */}
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

            {/* PERMISOS */}
            {Object.entries(PERMISOS).map(([grupo, lista]) => (
              <div key={grupo} className="rounded-xl p-3">
                <h3 className="text-[13px] font-semibold mb-2 capitalize">
                  {grupo}
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  {lista.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 text-[12px] cursor-pointer"
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
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>
            <SunmiButton color="amber" onClick={submit}>
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
      <label className="text-[11px]">{label}</label>
      {children}
    </div>
  );
}
