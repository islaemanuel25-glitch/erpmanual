"use client";

import { useEffect, useState, useRef } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalLocal({
  open = false,
  initialData = null,
  onClose,
  onSubmit,
}) {
  // ===============================
  // 🔥 FIX FUNDAMENTAL
  // ===============================
  if (!open) return null;

  const modalRef = useRef(null);

  const safe = (v) => (v === null || v === undefined ? "" : v);

  const editMode = Boolean(initialData);

  // ===============================
  // FORM CON TODOS TUS CAMPOS
  // ===============================
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

  const update = (c, v) => setForm((f) => ({ ...f, [c]: v }));

  // ===============================
  // CARGAR DATOS SI ESTAMOS EDITANDO
  // ===============================
  useEffect(() => {
    if (!editMode) return;

    setForm({
      nombre: safe(initialData.nombre),
      tipo: safe(initialData.tipo),
      direccion: safe(initialData.direccion),
      telefono: safe(initialData.telefono),
      email: safe(initialData.email),
      cuil: safe(initialData.cuil),
      ciudad: safe(initialData.ciudad),
      provincia: safe(initialData.provincia),
      codigoPostal: safe(initialData.codigoPostal),
      activo: initialData.activo ?? true,
    });
  }, [editMode, initialData]);

  // ===============================
  // GUARDAR (Respeta tu lógica exacta)
  // ===============================
  const handleGuardar = () => {
    if (!form.nombre.trim() || !form.tipo.trim()) {
      alert("Completá nombre y tipo.");
      return;
    }

    onSubmit(form);
  };

  // ===============================
  // CERRAR HACIENDO CLICK AFUERA
  // ===============================
  useEffect(() => {
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);

    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
      <div
        ref={modalRef}
        className="sunmi-card max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        {/* HEADER */}
        <SunmiHeader
          title={editMode ? "Editar Local" : "Nuevo Local"}
          color="amber"
        />

        <SunmiSeparator color="amber" />

        <div className="flex flex-col gap-3 p-3 text-[13px]">
          <SunmiInput
            label="Nombre"
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
          />

          <SunmiSelectAdv
            label="Tipo"
            value={form.tipo}
            onChange={(v) => update("tipo", v)}
            options={[
              { value: "local", label: "Local" },
              { value: "deposito", label: "Depósito" },
            ]}
          />

          <SunmiInput
            label="Dirección"
            value={form.direccion}
            onChange={(e) => update("direccion", e.target.value)}
          />

          <SunmiInput
            label="Teléfono"
            value={form.telefono}
            onChange={(e) => update("telefono", e.target.value)}
          />

          <SunmiInput
            label="Email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />

          <SunmiInput
            label="CUIL"
            value={form.cuil}
            onChange={(e) => update("cuil", e.target.value)}
          />

          <SunmiInput
            label="Ciudad"
            value={form.ciudad}
            onChange={(e) => update("ciudad", e.target.value)}
          />

          <SunmiInput
            label="Provincia"
            value={form.provincia}
            onChange={(e) => update("provincia", e.target.value)}
          />

          <SunmiInput
            label="Código Postal"
            value={form.codigoPostal}
            onChange={(e) => update("codigoPostal", e.target.value)}
          />

          <SunmiToggleEstado
            label="Estado"
            value={form.activo}
            onChange={(v) => update("activo", v)}
          />

          <div className="flex justify-end gap-2 mt-4">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton color="amber" onClick={handleGuardar}>
              {editMode ? "Guardar cambios" : "Crear Local"}
            </SunmiButton>
          </div>
        </div>
      </div>
    </div>
  );
}
