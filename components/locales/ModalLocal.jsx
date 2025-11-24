"use client";

import { useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
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
  const modalRef = useRef(null);

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

  const setField = (k, v) =>
    setForm((prev) => ({
      ...prev,
      [k]: v,
    }));

  useEffect(() => {
    if (!open) return;

    // Reset scroll
    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 30);

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

  const validar = () => {
    if (!String(form.nombre).trim()) return "Completá el nombre.";
    if (!String(form.tipo).trim()) return "Seleccioná el tipo.";
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
              title={editMode ? "Editar local" : "Nuevo local"}
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

            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Nombre del local…"
              />
            </Field>

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

            <Field label="Dirección">
              <SunmiInput
                value={form.direccion}
                onChange={(e) => setField("direccion", e.target.value)}
                placeholder="Dirección…"
              />
            </Field>

            <Field label="Teléfono">
              <SunmiInput
                value={form.telefono}
                onChange={(e) => setField("telefono", e.target.value)}
                placeholder="Teléfono…"
              />
            </Field>

            <Field label="Email">
              <SunmiInput
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="Email…"
              />
            </Field>

            <Field label="CUIL">
              <SunmiInput
                value={form.cuil}
                onChange={(e) => setField("cuil", e.target.value)}
                placeholder="CUIL…"
              />
            </Field>

            <Field label="Ciudad">
              <SunmiInput
                value={form.ciudad}
                onChange={(e) => setField("ciudad", e.target.value)}
                placeholder="Ciudad…"
              />
            </Field>

            <Field label="Provincia">
              <SunmiInput
                value={form.provincia}
                onChange={(e) => setField("provincia", e.target.value)}
                placeholder="Provincia…"
              />
            </Field>

            <Field label="Código Postal">
              <SunmiInput
                value={form.codigoPostal}
                onChange={(e) => setField("codigoPostal", e.target.value)}
                placeholder="Código Postal…"
              />
            </Field>

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
    <div className="flex flex-col gap-1 px-1">
      <label className="text-[11px] text-slate-400">{label}</label>
      {children}
    </div>
  );
}
