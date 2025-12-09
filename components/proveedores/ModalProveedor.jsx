"use client";

import { useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ModalProveedor({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const { ui } = useUIConfig();
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
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      style={{
        padding: ui.helpers.spacing("md"),
      }}
    >
      <div
        className="overflow-hidden"
        style={{
          width: "95%",
          maxWidth: parseInt(ui.helpers.controlHeight()) * 10,
          borderRadius: ui.helpers.radius("xl"),
        }}
      >
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
            className="overflow-y-auto"
            className="flex flex-col"
            style={{
              maxHeight: ui.helpers.modalMaxHeight,
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              paddingBottom: ui.helpers.spacing("lg"),
              marginTop: ui.helpers.spacing("sm"),
              gap: ui.helpers.spacing("lg"),
            }}
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
          <div
            className="flex justify-end"
            style={{
              gap: ui.helpers.spacing("sm"),
              paddingTop: ui.helpers.spacing("sm"),
            }}
          >
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
  const { ui } = useUIConfig();
  return (
    <div
      className="flex flex-col"
      style={{
        gap: ui.helpers.spacing("xs"),
        paddingLeft: ui.helpers.spacing("xs"),
        paddingRight: ui.helpers.spacing("xs"),
        marginBottom: ui.helpers.spacing("lg"),
      }}
    >
      <label
        className="text-slate-400"
        style={{
          fontSize: ui.helpers.font("xs"),
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
