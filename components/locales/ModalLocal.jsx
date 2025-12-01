"use client";

import { useEffect, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";

export default function ModalLocal({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    tipo: "",
    direccion: "",
    telefono: "",
    email: "",
    cuil: "",
    ciudad: "",
    provincia: "",
    codigoPostal: "",
    activo: true,
  });

  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      setForm({
        nombre: "",
        tipo: "",
        direccion: "",
        telefono: "",
        email: "",
        cuil: "",
        ciudad: "",
        provincia: "",
        codigoPostal: "",
        activo: true,
      });
      return;
    }

    setForm({
      nombre: initialData.nombre || "",
      tipo: initialData.tipo || "",
      direccion: initialData.direccion || "",
      telefono: initialData.telefono || "",
      email: initialData.email || "",
      cuil: initialData.cuil || "",
      ciudad: initialData.ciudad || "",
      provincia: initialData.provincia || "",
      codigoPostal: initialData.codigoPostal || "",
      activo: Boolean(initialData.activo),
    });
  }, [open, initialData]);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validar = () => {
    if (!form.nombre.trim()) return "Completá el nombre.";
    if (!form.tipo.trim()) return "Seleccioná el tipo.";
    return null;
  };

  const handleSubmit = () => {
    const err = validar();
    if (err) return alert(err);

    onSubmit(form);
  };

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
      "
    >
      <div className="w-full max-w-xl">
        <SunmiCard>
          <SunmiCardHeader
            title={editMode ? "Editar local" : "Nuevo local"}
            subtitle="Configurá los datos del local"
            color="amber"
          />

          {/* CONTENIDO CON SCROLL */}
          <div className="flex flex-col max-h-[65vh] overflow-y-auto">
            <SunmiSeparator label="Datos" color="amber" />

            {/* Nombre */}
            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Nombre del local…"
              />
            </Field>

            {/* Tipo */}
            <Field label="Tipo *">
              <SunmiSelectAdv
                value={form.tipo}
                onChange={(v) => setField("tipo", v)}
              >
                <SunmiSelectOption value="">
                  Seleccionar tipo…
                </SunmiSelectOption>
                <SunmiSelectOption value="local">
                  Local
                </SunmiSelectOption>
                <SunmiSelectOption value="deposito">
                  Depósito
                </SunmiSelectOption>
              </SunmiSelectAdv>
            </Field>

            {/* Dirección */}
            <Field label="Dirección">
              <SunmiInput
                value={form.direccion}
                onChange={(e) => setField("direccion", e.target.value)}
                placeholder="Dirección…"
              />
            </Field>

            {/* Teléfono */}
            <Field label="Teléfono">
              <SunmiInput
                value={form.telefono}
                onChange={(e) => setField("telefono", e.target.value)}
                placeholder="Teléfono…"
              />
            </Field>

            {/* Email */}
            <Field label="Email">
              <SunmiInput
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="Email…"
              />
            </Field>

            {/* CUIL */}
            <Field label="CUIL">
              <SunmiInput
                value={form.cuil}
                onChange={(e) => setField("cuil", e.target.value)}
                placeholder="CUIL…"
              />
            </Field>

            {/* Ciudad */}
            <Field label="Ciudad">
              <SunmiInput
                value={form.ciudad}
                onChange={(e) => setField("ciudad", e.target.value)}
                placeholder="Ciudad…"
              />
            </Field>

            {/* Provincia */}
            <Field label="Provincia">
              <SunmiInput
                value={form.provincia}
                onChange={(e) => setField("provincia", e.target.value)}
                placeholder="Provincia…"
              />
            </Field>

            {/* Código Postal */}
            <Field label="Código Postal">
              <SunmiInput
                value={form.codigoPostal}
                onChange={(e) => setField("codigoPostal", e.target.value)}
                placeholder="Código Postal…"
              />
            </Field>

            <SunmiSeparator label="Estado" color="amber" />

            {/* Estado */}
            <Field label="Estado">
              <SunmiToggleEstado
                value={form.activo}
                onChange={(v) => setField("activo", v)}
              />
            </Field>
          </div>

          {/* ACCIONES */}
          <div className="flex justify-end gap-2">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton color="amber" onClick={handleSubmit}>
              {editMode ? "Guardar cambios" : "Crear local"}
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
