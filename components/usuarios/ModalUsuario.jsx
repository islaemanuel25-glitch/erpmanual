"use client";

import { useEffect, useRef, useState } from "react";

export default function ModalUsuario({
  open,
  onClose,
  onSubmit,
  initialData = null,
  roles = [],
  locales = [],
}) {
  const visibleClass = open
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none";

  const modalRef = useRef(null);

  const inputClass =
    "h-[36px] w-full px-3 rounded-md border border-gray-300 bg-white text-[13px] text-gray-800 focus:border-blue-500 focus:outline-none";

  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rolId: "",
    localId: "",
    activo: true,
  });

  // ✅ Reset al abrir
  useEffect(() => {
    if (!open) return;

    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 50);

    if (initialData) {
      setForm({
        nombre: initialData.nombre || "",
        email: initialData.email || "",
        password: "",
        rolId: initialData.rolId || "",
        localId: initialData.localId || "",
        activo: Boolean(initialData.activo),
      });
    } else {
      setForm({
        nombre: "",
        email: "",
        password: "",
        rolId: "",
        localId: "",
        activo: true,
      });
    }
  }, [open, initialData]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validar = () => {
    if (!String(form.nombre).trim()) return "Completá el nombre.";
    if (!String(form.email).trim()) return "Completá el email.";
    if (!editMode && !String(form.password).trim())
      return "La contraseña es obligatoria en nuevo usuario.";
    if (!String(form.rolId).trim()) return "Seleccioná un rol.";
    return null;
  };

  const handleSubmit = () => {
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

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-3 transition-opacity duration-150 ${visibleClass}`}
    >
      <div className="w-[95%] max-w-xl bg-white rounded-xl shadow-xl overflow-hidden">
        {/* HEADER */}
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editMode ? "Editar usuario" : "Nuevo usuario"}
          </h2>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-md border bg-gray-50 hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>

        {/* BODY */}
        <div
          ref={modalRef}
          className="p-5 max-h-[70vh] overflow-y-auto space-y-4"
        >
          <Field label="Nombre *">
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setField("nombre", e.target.value)}
            />
          </Field>

          <Field label="Email *">
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </Field>

          <Field label={editMode ? "Nueva contraseña (opcional)" : "Contraseña *"}>
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
            />
          </Field>

          <Field label="Rol *">
            <select
              className={inputClass}
              value={form.rolId}
              onChange={(e) => setField("rolId", e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Local">
            <select
              className={inputClass}
              value={form.localId}
              onChange={(e) => setField("localId", e.target.value)}
            >
              <option value="">Sin local asignado</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Activo">
            <select
              className={inputClass}
              value={form.activo ? "true" : "false"}
              onChange={(e) => setField("activo", e.target.value === "true")}
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Field>
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border bg-white hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            {editMode ? "Guardar cambios" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-gray-600">{label}</label>
      {children}
    </div>
  );
}
