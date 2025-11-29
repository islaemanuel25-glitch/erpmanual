"use client";

import { useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";

export default function ModalProveedor({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const modalRef = useRef(null);
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    cuit: "",
    telefono: "",
    email: "",
    direccion: "",
    dias_pedido: [],
    activo: true,
  });

  useEffect(() => {
    if (!open) return;

    // scroll top igual al de usuarios
    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 30);

    // reset igual al de usuarios
    if (!initialData) {
      setForm({
        nombre: "",
        cuit: "",
        telefono: "",
        email: "",
        direccion: "",
        dias_pedido: [],
        activo: true,
      });
      return;
    }

    // cargar datos
    setForm({
      nombre: initialData.nombre || "",
      cuit: initialData.cuit || "",
      telefono: initialData.telefono || "",
      email: initialData.email || "",
      direccion: initialData.direccion || "",
      dias_pedido: initialData.dias_pedido || [],
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
    return null;
  };

  const handleSubmitInternal = () => {
    const err = validar();
    if (err) return alert(err);

    onSubmit({ ...form });
  };

  if (!open) return null;

  const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

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
              title={editMode ? "Editar proveedor" : "Nuevo proveedor"}
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

            {/* CUIT */}
            <Field label="CUIT">
              <SunmiInput
                value={form.cuit}
                onChange={(e) => setField("cuit", e.target.value)}
                placeholder="Ingresá el CUIT…"
              />
            </Field>

            {/* Teléfono */}
            <Field label="Teléfono">
              <SunmiInput
                value={form.telefono}
                onChange={(e) => setField("telefono", e.target.value)}
                placeholder="Ingresá el teléfono…"
              />
            </Field>

            {/* Email */}
            <Field label="Email">
              <SunmiInput
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="Ingresá el email…"
              />
            </Field>

            {/* Dirección */}
            <Field label="Dirección">
              <SunmiInput
                value={form.direccion}
                onChange={(e) => setField("direccion", e.target.value)}
                placeholder="Ingresá la dirección…"
              />
            </Field>

            {/* Días de pedido */}
            <Field label="Días de pedido">
              <SunmiSelectAdv
                multiple
                value={form.dias_pedido}
                onChange={(v) => setField("dias_pedido", v)}
              >
                <SunmiSelectOption value="">
                  Seleccionar días…
                </SunmiSelectOption>

                {dias.map((d) => (
                  <SunmiSelectOption key={d} value={d}>
                    {d}
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
              {editMode ? "Guardar cambios" : "Crear proveedor"}
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
