"use client";

import { useEffect, useRef, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
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

  const dias = [
    { value: "Lunes", label: "Lunes" },
    { value: "Martes", label: "Martes" },
    { value: "Miercoles", label: "Miércoles" },
    { value: "Jueves", label: "Jueves" },
    { value: "Viernes", label: "Viernes" },
    { value: "Sabado", label: "Sábado" },
    { value: "Domingo", label: "Domingo" },
  ];

  return (
    <SunmiModalLayout
      open
      title={editMode ? "Editar proveedor" : "Nuevo proveedor"}
      // Conserva su cinta de título: el kit por defecto dibuja texto normal.
      encabezado="cinta"
      onClose={onClose}
      // Es un formulario: un toque al costado con media pantalla escrita tiraría
      // lo escrito, y en el teléfono ese toque pasa solo.
      destructivo
      // La referencia manda el scroll arriba cuando el modal se reabre. Sin
      // ella, abrirlo para editar otro proveedor lo deja donde quedó el anterior.
      refCuerpo={modalRef}
      // El espaciado del cuerpo queda como estaba: el `space-y-4` separa todos
      // los campos del formulario y no es del kit ponerlo.
      espacioCuerpo="px-2 pb-4 mt-2 space-y-4"
      // El pie tenía `pt-2`, no el `mt-3` del kit. Es espaciado interior y se
      // conserva: si no, el par de botones se separaría del formulario.
      espacioPie="pt-2"
      footer={
        <>
          <SunmiButton color="slate" onClick={onClose}>
            Cancelar
          </SunmiButton>

          <SunmiButton onClick={handleSubmitInternal}>
            {editMode ? "Guardar cambios" : "Crear proveedor"}
          </SunmiButton>
        </>
      }
    >
      <>
            <SunmiSeparator label="Datos" />

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
                placeholder="Seleccionar días…"
              >
                {dias.map((d) => (
                  <SunmiSelectOption key={d.value} value={d.value}>
                    {d.label}
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
      </>
    </SunmiModalLayout>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <label className="text-[11px] sunmi-label mb-1 block">{label}</label>
      {children}
    </div>
  );
}
