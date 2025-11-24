"use client";

import { useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";

export default function ModalUsuario({
  open,
  onClose,
  onSubmit,
  initialData = null,
  roles = [],
  locales = [],
}) {
  const modalRef = useRef(null);

  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rolId: "",
    localId: "",
    activo: true,
  });

  useEffect(() => {
    if (!open) return;

    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 30);

    if (!initialData) {
      setForm({
        nombre: "",
        email: "",
        password: "",
        rolId: "",
        localId: "",
        activo: true,
      });
      return;
    }

    setForm({
      nombre: initialData.nombre || "",
      email: initialData.email || "",
      password: "",
      rolId: initialData.rolId || "",
      localId: initialData.localId || "",
      activo: Boolean(initialData.activo),
    });
  }, [open, initialData]);

  const setField = (k, v) =>
    setForm((prev) => ({
      ...prev,
      [k]: v,
    }));

  const validar = () => {
    if (!String(form.nombre).trim()) return "Completá el nombre.";
    if (!String(form.email).trim()) return "Completá el email.";
    if (!editMode && !String(form.password).trim())
      return "La contraseña es obligatoria en nuevo usuario.";
    if (!String(form.rolId).trim()) return "Seleccioná un rol.";
    return null;
  };

  const handleSubmitInternal = () => {
    const err = validar();
    if (err) return alert(err);

    const payload = {
      nombre: form.nombre,
      email: form.email,
      password: form.password || undefined,
      rolId: Number(form.rolId),
      localId: form.localId ? Number(form.localId) : null,
      activo: Boolean(form.activo),
    };

    onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-[9999]
        bg-black/60 backdrop-blur-sm
        flex items-center justify-center
        p-3
      "
    >
      <div className="w-[95%] max-w-xl rounded-2xl overflow-hidden">
        <SunmiCard>
          {/* HEADER */}
          <div className="flex items-center justify-between">
            <SunmiHeader
              title={editMode ? "Editar usuario" : "Nuevo usuario"}
              color="amber"
            />

            <SunmiButton color="slate" onClick={onClose} size="sm">
              Cerrar
            </SunmiButton>
          </div>

          {/* CONTENIDO */}
          <div
            ref={modalRef}
            className="
              max-h-[65vh]
              overflow-y-auto 
              px-2 pb-4 mt-2 
              space-y-4
            "
          >
            <SunmiSeparator label="Datos" color="amber" />

            {/* Nombre */}
            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Ingresá el nombre…"
              />
            </Field>

            {/* Email */}
            <Field label="Email *">
              <SunmiInput
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="Ingresá el email…"
              />
            </Field>

            {/* Contraseña */}
            <Field
              label={
                editMode
                  ? "Nueva contraseña (opcional)"
                  : "Contraseña *"
              }
            >
              <SunmiInput
                type="password"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                placeholder="Ingresá una contraseña…"
              />
            </Field>

            {/* Rol */}
            <Field label="Rol *">
              <SunmiSelectAdv
                value={form.rolId}
                onChange={(v) => setField("rolId", v)}
              >
                <SunmiSelectOption value="">
                  Seleccionar rol…
                </SunmiSelectOption>
                {roles.map((r) => (
                  <SunmiSelectOption key={r.id} value={r.id}>
                    {r.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>

            {/* Local */}
            <Field label="Local">
              <SunmiSelectAdv
                value={form.localId}
                onChange={(v) => setField("localId", v)}
              >
                <SunmiSelectOption value="">
                  Sin local asignado
                </SunmiSelectOption>
                {locales.map((l) => (
                  <SunmiSelectOption key={l.id} value={l.id}>
                    {l.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>

            {/* Estado */}
            <Field label="Estado">
              <SunmiToggleEstado
                value={form.activo}
                onChange={(v) => setField("activo", v)}
              />
            </Field>
          </div>

          {/* FOOTER */}
          <div className="flex justify-end gap-2 pt-2">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton color="amber" onClick={handleSubmitInternal}>
              {editMode ? "Guardar cambios" : "Crear usuario"}
            </SunmiButton>
          </div>
        </SunmiCard>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <label className="text-[11px] text-slate-400">{label}</label>
      {children}
    </div>
  );
}
