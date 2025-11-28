"use client";

import { useEffect, useRef, useState } from "react";

import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
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
    if (initialData) {
      setForm({
        nombre: initialData.nombre || "",
        cuit: initialData.cuit || "",
        telefono: initialData.telefono || "",
        email: initialData.email || "",
        direccion: initialData.direccion || "",
        dias_pedido: initialData.dias_pedido || [],
        activo: initialData.activo ?? true,
      });
    } else {
      setForm({
        nombre: "",
        cuit: "",
        telefono: "",
        email: "",
        direccion: "",
        dias_pedido: [],
        activo: true,
      });
    }
  }, [initialData, open]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const diasOptions = [
    "Lunes",
    "Martes",
    "Miercoles",
    "Jueves",
    "Viernes",
    "Sabado",
    "Domingo",
  ].map((d) => ({ label: d, value: d }));

  const handleSubmit = () => {
    if (!form.nombre.trim()) return alert("El nombre es obligatorio.");
    onSubmit(form);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex justify-center items-center p-2">
      {/* CONTENEDOR MODAL */}
      <div
        ref={modalRef}
        className="
          bg-slate-900 border border-slate-800 rounded-2xl shadow-xl 
          w-full max-w-xl 
          flex flex-col 
          max-h-[90vh]
        "
      >
        {/* HEADER */}
        <div className="p-4 border-b border-slate-800">
          <SunmiHeader title={editMode ? "Editar proveedor" : "Nuevo proveedor"} />
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="p-4 overflow-y-auto flex flex-col gap-4">
          {/* Nombre */}
          <Field>
            <SunmiInput
              label="Nombre *"
              value={form.nombre}
              onChange={(e) => handleChange("nombre", e.target.value)}
            />
            <Help>Nombre comercial del proveedor.</Help>
          </Field>

          {/* CUIT */}
          <Field>
            <SunmiInput
              label="CUIT"
              value={form.cuit}
              onChange={(e) => handleChange("cuit", e.target.value)}
            />
            <Help>CUIT opcional del proveedor.</Help>
          </Field>

          {/* Teléfono */}
          <Field>
            <SunmiInput
              label="Teléfono"
              value={form.telefono}
              onChange={(e) => handleChange("telefono", e.target.value)}
            />
            <Help>Número de contacto para pedidos o consultas.</Help>
          </Field>

          {/* Email */}
          <Field>
            <SunmiInput
              label="Email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
            <Help>Email del proveedor.</Help>
          </Field>

          {/* Dirección */}
          <Field>
            <SunmiInput
              label="Dirección"
              value={form.direccion}
              onChange={(e) => handleChange("direccion", e.target.value)}
            />
            <Help>Domicilio del proveedor.</Help>
          </Field>

          {/* DÍAS DE PEDIDO */}
          <Field>
            <SunmiSelectAdv
              label="Días de pedido"
              multiple
              value={form.dias_pedido}
              options={diasOptions}
              onChange={(v) => handleChange("dias_pedido", v)}
            />
            <Help>
              Seleccioná los días donde este proveedor recibe pedidos.
            </Help>
          </Field>

          {/* ACTIVO */}
          <Field>
            <SunmiToggleEstado
              label="Activo"
              checked={form.activo}
              onChange={(v) => handleChange("activo", v)}
            />
            <Help>Si está desactivado, no aparecerá en los listados.</Help>
          </Field>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3">
          <SunmiButton variant="secondary" onClick={onClose}>
            Cancelar
          </SunmiButton>
          <SunmiButton onClick={handleSubmit}>Guardar</SunmiButton>
        </div>
      </div>
    </div>
  );
}

/* SUBCOMPONENTES */
function Field({ children }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function Help({ children }) {
  return <p className="text-[11px] text-slate-400">{children}</p>;
}
